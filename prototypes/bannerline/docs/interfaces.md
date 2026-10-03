# Bannerline — Interfaces (sim <-> view/input/net)

Owner: stream A (sim). Status: **M1 contract**, 2026-10-03. Stream B builds the view, input and UI
against this page; anything B needs that is not here goes in `docs/requests.md` addressed to A.
Fields marked *(M3+)*, *(M4)* etc. are reserved now so nobody invents a clashing name.

Rule of thumb: **the sim owns the truth, the view only reads it.** The view never writes into
`sim.state`; every change a player makes is a **command**. Everything the view needs to draw a
one-off effect (a swing, a number, a death) comes from the **event** queue.

---

## 1. Coordinates and time

- Units are **metres** and **ticks**. `TICK_HZ = 20` (one tick = 50 ms). Seconds in data files are
  converted to ticks by the sim; the view converts back with `ticks / TICK_HZ`.
- World axes: **+x** right, **+z** "down the field" (from the gate toward the Keep), **y** up. The
  ground is flat at y = 0 in M1.
- Each team owns one **field**. Inside a field the **gate** is at small z (top of the screen) and the
  **Keep** at large z (bottom of the screen): units walk +z. Fields sit side by side along x.
  A camera that puts the gate at the top of the screen sits at high z looking toward −z.
- **Facing** `face` is an angle in radians with direction vector `(sin face, cos face)`: `0` faces
  +z (down the screen, toward the Keep), `π` faces −z. This equals three.js `rotation.y` for a model
  whose front is +z.
- Stick directions (`moveDir`, §3) use 16 steps: `dir` d means angle `d * 2π / 16` in the same
  convention (d = 0 → +z/down, d = 8 → −z/up, d = 4 → +x/right, d = 12 → −x/left).

## 2. The sim API (`js/sim/sim.js`)

```js
import { createSim, restoreSim, TICK_HZ, TICK_MS } from './js/sim/sim.js';
import { loadData, DATA_FILES } from './js/sim/data.js';
import * as Q from './js/sim/query.js';          // read-only helpers for the UI (§7)

const data = await loadData(name => fetch(`data/${name}`).then(r => r.text()));   // browser
// node: loadData(name => readFileSync(join(dir, 'data', name), 'utf8'))
const sim  = createSim(config, data);   // config: §2.1

sim.step(commands);         // advance ONE tick. commands = array of §3 objects for THIS tick (any players).
                            //   AI slots generate their own commands inside step(); never send for them.
const evs = sim.drainEvents();   // events emitted since the last drain (§4), oldest first
sim.state                   // plain data, read-only for the view (§5)
sim.map                     // static geometry for this match (§6), derived from data + mode; never changes
sim.data                    // the frozen data bundle (names, costs, looks)
sim.tick                    // === sim.state.tick
sim.over                    // true once state.result is set
sim.hash()                  // uint32 FNV-1a over the canonical state (positions quantised to mm)
const snap = sim.snapshot() // plain JSON-safe object: { v, dataHash, state }
const sim2 = restoreSim(snap, data)   // same hash, same future given the same commands
```

`loadData(fetchText)` takes a function `name -> Promise<string> | string`, reads every file in
`DATA_FILES`, deep-freezes the bundle and computes `data.hash` (FNV-1a over canonical JSON, keys
sorted). Online peers compare `data.hash` before starting (§11.2 of PLAN). It returns a Promise when
the fetcher does; `loadDataSync(readText)` is the node twin.

### 2.1 Match config

```js
{
  seed: 12345,                  // uint32; every rng stream is derived from it
  mode: '1v1',                  // '1v1' | '2v2' | '3v3'  (M1 builds 1v1; the shape is the same)
  map: 'vale',
  players: [                    // player id = index in this array
    { team: 0, name: 'Radley', kind: 'human', race: 'freeholds', hero: 'warrior',
      deck: ['levy', 'hill_slinger', 'shieldbearer', 'hedge_priest'] },
    { team: 1, name: 'Recruit', kind: 'ai', ai: { difficulty: 'recruit' },
      race: 'freeholds', hero: 'warrior' }          // deck optional; defaults to the race's first 4 units
  ],
  rules: {                      // all optional; tests and debug only
    endless: false,             // no banner loss / no end (econ curves)
    banners: null,              // override banners per team
    startGold: null
  }
}
```

The config is validated: unknown race/hero/unit or a bad deck throws an `Error` whose message the
lobby can show.

### 2.2 Driving the clock (view side, M1)

The view owns a fixed-step accumulator on rAF (stream D moves it into a Worker in M5):

```js
acc += dtMs * speed;                         // speed = 1, or 8 for debug
while (acc >= TICK_MS) { sim.step(takeCommandsForTick()); acc -= TICK_MS; handle(sim.drainEvents()); }
const alpha = acc / TICK_MS;                 // 0..1 for interpolation (§5.3)
```

Offline input delay is 1 tick: commands built during a frame go into the next `step()`.

## 3. Commands

A command is a plain object `{ p, type, ...args }`. `p` is the issuing player id. Numbers may be
any finite JSON numbers; the sim quantises positions to 0.01 m on receipt. Illegal commands are
ignored and produce a `reject` event (§4) with a reason the UI can show. Several commands per player
per tick are fine; they apply in array order.

| type | args | effect |
|---|---|---|
| `move` | `x, z` | hero walks to the point (clamped to its field) and ignores enemies on the way |
| `amove` | `x, z` | attack-move: walk, but fight anything that comes within aggro range |
| `attack` | `target` (entity id) | chase and attack that entity |
| `stop` | — | stop moving, keep attacking whatever is in reach (hold position) |
| `moveDir` | `dir` 0..15, `speed` 0..3 | stick movement, sent only when it changes; `speed 0` = release (hero idles / auto-attacks nearby). §1 for `dir` |
| `cast` | `slot` `'Q'|'W'|'E'|'D'|'R'`, `x, z` (aim point), `target?` | cast the skill in that slot. `x,z` aims shaped skills (arc direction / ground point). Omit `x,z` to cast toward the current facing |
| `learn` | `slot` | spend one skill point on that slot (rank + 1) |
| `talent` | `choice` 0 or 1 | the level-6 talent pick (once) |
| `send` | `unit` (unit id) | buy one send. **Gold is the only limit** (owner, 2026-10-03): no stock, no cooldown, no time lock; any number per tick works (mash or hold the key). It leaves through the rival's gate within 0.5 s (`GROUP_TICKS` = 10). Refused only for `'gold'`, `'roster'` (not your race) or `'over'`. A full field never refuses: extra bodies wait in the gate queue |
| `deck` | `units` [4 unit ids] | set the 4 deck sends (any time) |
| `auto` | `index` 0..3, `on` bool | auto-send toggle for a deck slot: buys that send whenever your gold allows (it spends everything) |
| `muster` | — | buy the next Muster rank (I–III) |
| `upgrade` | `slot?` (name like `'chest'` or index 0..7), `kind?` (chest only: `'cloth'|'light'|'medium'|'heavy'`) | "Buy recommended": buy the next shop step item for that slot (omit `slot` = the cheapest unlocked step anywhere) and wear it when it arrives. The worn item is traded in if it is a plain shop step; anything special (unique, set piece, rolled or dropped item) goes back to the bag |
| `buy` | `slot`, `step` 0..6, `kind?`, `equip?` | buy one specific shop item into the bag (or worn with `equip: true`). Steps 0-4 are plain (Plain/Fine/Superior/Masterwork/Exquisite), 5 is a **rare roll** (3 affixes), 6 a **legendary roll** (5); each step unlocks by time (`econ.items.tiers[step].unlock`). Away from the Armory every purchase is a **Requisition** (arrives after `items-bl.shop.requisition` s; lost and refunded if the hero dies first) |
| `equip` | `uid` | wear a bag item; what it replaces goes into its bag slot. A two-handed weapon also moves the off-hand to the bag |
| `unequip` | `slot` | worn item to the bag |
| `sell` | `uid` | sell a bag item for `items-bl.shop.sellFactor` of its price |
| `pick` | `index` 0..2 | choose a card from the oldest waiting champion pick (`player.picks[0]`) into the bag |
| `oil` | `dmgType` `'blade'|'pierce'|'fire'|'nature'` | buy weapon Oil (`econ.items.oil.cost`): half of the hero's damage becomes that type (replaces any earlier oil) |
| `potion` | — | buy one belt potion (25 g) if the belt has room |
| `drink` | — | drink a belt potion (heals 40% max HP) |
| `surrender` | — | your team loses at once |
| `toll` | — | Toll of Iron: every enemy unit in your team's field is stunned (`items-bl.toll.stun` s). Team charges (`team.toll`), one back every `toll.cooldown` s |

`reject.reason` values: `'gold'` (not enough gold), `'maxGear'`, `'stunned'`, `'bag'` (bag full), `'twoHanded'` (off-hand beside a two-hander), `'hero'` (another hero's unique), `'locked'` (an item step not unlocked yet — sends have no locks),
`'roster'` (unit not in your race), `'dead'` (hero is dead), `'cooldown'`, `'mana'`, `'rank'` (skill
not learned), `'points'` (no skill point), `'maxRank'`, `'level'` (R before 6), `'belt'` (belt full /
empty), `'maxMuster'`, `'over'` (match over), `'bad'` (malformed).

## 4. Events

`sim.drainEvents()` returns `[{ tick, type, ... }]`. Events are **not** part of the state (not
hashed, not snapshotted): they are hints for drawing and sound. Never derive game truth from them.

| type | fields | when |
|---|---|---|
| `spawn` | `id, kind, unit, team, field` | an entity entered the world (sends, tides, heroes at match start) |
| `remove` | `id, why` (`'killed'|'leaked'|'expired'`) | entity left `state.ents` (heroes are never removed) |
| `attack` | `src, dst, ranged` | a basic attack starts (play the swing/shoot clip) |
| `shot` | `src, dst, dmgType, ticks` | a projectile leaves `src`; damage lands `ticks` later (draw it flying) |
| `hit` | `src, dst, amount, dmgType, crit, skill?` | damage applied (floating number; `amount` already rounded to 0.1) |
| `heal` | `src, dst, amount` | healing applied |
| `death` | `id, killer, x, z` | something died (heroes too) |
| `cast` | `id, slot, skill, shape, x, z, face, radius, arc, reach, range, delay, line` | a hero cast a skill. `shape` per PLAN §6.3. For `ground`, `x,z` is the landing point (already clamped to range); `delay` > 0 = it lands that many ticks later (draw a warning marker); `line` > 0 = a line that long across the aim (`face` + 90°), half-width `radius` |
| `bolt` | `id, skill, fromX, fromZ, toX, toZ, ticks, dst` | a skill bolt (Firebolt) flies for `ticks`; `dst` is the entity it will hit or −1 |
| `zone` | `zone, x, z, radius, length, face, ticks, skill, dmgType` | a burning patch appears (`length` > 0: a capsule of that length along `face`, half-width `radius`); lasts `ticks` |
| `zoneEnd` | `zone` | a zone went out |
| `pulse` | `id, skill, x, z, radius` | a repeat of a multi-hit skill (Iron Gyre spin, shockwave) |
| `knock` | `id, fromX, fromZ, toX, toZ` | an entity was shoved/pulled (view may tween) |
| `status` | `id, status, on` | a status started (`on: true`) or ended |
| `taunt` | `id, by, ticks` | a unit was taunted onto `by` |
| `levelUp` | `player, level` | hero levelled (a skill point is now available) |
| `heroDown` | `player, respawnTick` | hero died; respawns at `respawnTick` |
| `respawn` | `player, id` | hero is back at the Armory |
| `queued` | `player, unit, auto` | a send was bought (it leaves within 0.5 s) |
| `wave` | `player, field, units` | sends bought in the last 0.5 s left through the gate into `field` |
| `pay` | `player, amount, income` | gold paid on the Pay |
| `bounty` | `player, amount, src` | bounty share paid to a player for a kill |
| `tide` | `level, field` | a Tide wave entered a field |
| `leak` | `team, banners, src, unit` | `banners` (may be fractional) torn from `team` by entity `src` |
| `refund` | `player, amount` | Grave Tithe refund *(M6, Unburied)* |
| `rising` | `step` | Rising Tide step began (alert) |
| `muster` | `player, rank` | Muster rank bought |
| `item` | `player, uid, how, name, rarity` | an item reached the player (`how`: `'buy'` at the Armory, `'requisition'` delivered, `'pick'`) |
| `requisition` | `player, uid, atTick, name` | a purchase away from the Armory is on its way |
| `requisitionLost` | `player, uid, refund` | the hero died before it arrived |
| `drop` | `player, uid, x, z, rarity, name, better` | a kill dropped an item for this player at (x, z): show a rarity beacon, then fly it to the hero (it is already in the bag). `better` = score versus the worn item in that slot (> 0: "Equip (better by +X)") |
| `equip` / `unequip` | `player, uid, slot` / `player, slot` | worn gear changed |
| `sell` | `player, uid, gold, name` | an item was sold (also when a full bag auto-sells a drop) |
| `pickOffer` | `player, cards` | a champion died in this player's field: a 3-card pick waits (`player.picks`) |
| `power` | `player, unique` | a unique's power fired (Long Scythe sweep, Sootcrown overload...) |
| `toll` | `team, player, stunned` | Toll of Iron rang |
| `oil` | `player, dmgType` | Oil applied |
| `champion` | `player, unit, field` | a champion send is leaving through a gate ("Champion at the gate!") |
| `revive` | `id` | a `rise` unit came back at half HP |
| `talentReady` | `player` | level 6 reached, talent pick open |
| `reject` | `player, cmd, reason` | a command was refused (§3) |
| `result` | `winner, reason` | match over. `winner` = team id, or −1 for a draw. `reason`: `'banners'|'cap'|'surrender'` |

## 5. State (read-only for the view)

Plain serialisable data: no class instances, no closures, no Maps in M1 (arrays in id order).
Every field below is stable for M1; new fields may be added, none renamed without a request.

```js
state = {
  v: 1, tick, seed, mode, map,
  rng: { combat: [a,b,c,d], loot: [...], ai: [...], shop: [...] },   // sfc32 streams (do not touch)
  nextId,                        // next entity id
  rising: 0,                     // Rising Tide step (0 = not yet)
  tideLevel: 0,                  // level of the last Tide wave
  result: null,                  // { winner, reason, tick } once the match ends
  teams:   [Team],
  players: [Player],
  fields:  [Field],
  ents:    [Ent],                // ascending id
  timers:  [{ id, atTick, kind, args }]   // delayed effects: 'proj' (unit/hero shots), 'pulse' (skill repeats), 'bolt' (skill bolts), 'ground' (delayed ground strikes)
  zones:   [{ id, owner, team, field, x, z, radius, length, face, until, dmgType, skill, ... }]   // lingering ground effects (draw them; `until` is the end tick)
}
```

### 5.1 Team, Player, Field

```js
Team   = { id, banners, bannersMax, field, players: [ids], dealt, toll: { charges, readyAt } }   // dealt = banners torn from enemies (hard-cap tie-break)
Field  = { id, team, waiting: [WaitingSend], bodies }               // bodies = live bodies now (cap: econ.field.cap); waiting = the GATE QUEUE ("+N waiting" on the HUD), entering oldest first as space frees
Player = {
  id, team, name, kind: 'human'|'ai', ai: null | { difficulty },
  race, hero,                    // ids
  heroEnt,                       // entity id of this player's hero
  rival,                         // player id of the direct rival (whose field you send into)
  gold, income,
  deck: [4 unit ids], auto: [4 bools],
  queued: [unit ids],            // bought in the current 0.5 s grouping window
  muster,                        // 0..3
  equip: { weapon, offhand, head, chest, hands, feet, neck, ring },   // Item | null
  bag: [12 x Item | null],
  picks: [[Item, Item, Item], ...],  // champion picks waiting, oldest first
  requisitions: [{ item, atTick, equip, replace, cost }],
  atArmory,                      // hero is at the Armory now (purchases are instant)
  procs, gearV,                  // internal: unique power counters, gear cache version
  level, xp, skillPts,
  skills: [{ slot, id, rank, readyAt }],  // slots Q W E D R; readyAt = tick the cooldown ends
  talent: -1 | 0 | 1,
  belt,                          // potions carried (0..2)
  oil,                           // null or a damage type (half the hero's damage becomes it)
  surrendered,
  stats: { sendGold, sends, itemGold, potionGold, musterGold, kills, deaths, leaked, dealt, bounty,
           incomeAt: [income at each whole minute], goldAt: [...] }
}
WaitingSend = { owner, unit, group, body, bodies }   // held at the gate because the field is at its cap
```

### 5.2 Entities

```js
Ent = {
  id, kind: 'hero'|'unit'|'tide',
  type,                    // hero id ('warrior'), unit id ('levy') or 'tide'
  team,                    // the team it fights FOR (sends: the sender's team; tides: -1)
  owner,                   // player id (hero's player / sender), -1 for tides
  field,                   // field index it stands in
  x, z, px, pz,            // position now and at the start of this tick (interpolation, §5.3)
  face, pface,
  r,                       // body radius (m)
  hp, hpMax, mp, mpMax,    // mp/mpMax are 0 for non-heroes
  alive,                   // heroes stay in ents while dead (alive=false, respawnAt set)
  respawnAt,               // tick, heroes only (-1 otherwise)
  act, actTick,            // 'idle'|'walk'|'attack'|'cast'|'stun'|'dead' and the tick it began (animation hint)
  target,                  // entity id it is fighting / chasing, -1 if none
  level,                   // heroes: hero level; tides: tide level; units: 0
  armour, dmgType,         // 'light'|'heavy'|'spectral'|'hide'|'fortified', 'blade'|'pierce'|'fire'|'nature'
  statuses: [{ id, until, stacks, power, src, buff? }],   // 'burn','bleed','root','stun','slow','quarry','might','regen','haste','taunt', plus hero self-buffs by skill id (buff = the skill's selfBuff block)
  group,                   // purchase id (bodies bought together share it), -1 for heroes
  // internal fields (prefixed _) may exist; the view must not depend on them
}
```

### 5.3 Interpolation

At the start of every `step()` the sim copies `x,z,face` into `px,pz,pface` for every entity, then
moves things. To draw between ticks:

```js
const ix = e.px + (e.x - e.px) * alpha, iz = e.pz + (e.z - e.pz) * alpha;
const f  = lerpAngle(e.pface, e.face, alpha);      // shortest arc
```

A freshly spawned entity has `px = x`. A teleport (respawn, knock longer than 3 m) also sets
`px = x` — the view should not tween it (watch `knock` events if you want a tween).

Entity lifetime: keep an `id -> mesh` map; each frame create meshes for ids you have not seen and
drop meshes whose id is no longer in `state.ents` (or listen for `spawn`/`remove`).

## 6. Static map (`sim.map`)

Built once by `js/sim/map.js` from `data/maps.json` + the mode. World coordinates.

```js
sim.map = {
  id: 'vale', name, length: 140, width, gap,
  fields: [{
    id, team, cx,                  // field centre x
    x0, x1, z0, z1,                // bounds (z0 = gate end, z1 = Keep end)
    gates: [{ x, z }],             // spawn points (1 in 1v1)
    keep:  { x, z, w, d },         // Keep footprint centre + size
    leakZ,                         // a unit that reaches z >= leakZ is a leak
    armory: { x, z, r },           // shop + respawn
    spawn: { x, z },               // hero (re)spawn point
    ford:  { x0, x1, z0, z1, slow },
    walls: [{ x0, z0, x1, z1 }]    // axis-aligned blockers (none on M1 vale)
  }],
  grid: { cell: 1 }                // flow-field resolution (internal)
}
```

## 7. Read-only helpers (`js/sim/query.js`)

All pure, `(state, data, ...) -> value`; safe to call every frame.

| function | returns |
|---|---|
| `clock(state, data)` | `{ seconds, payIn, payEvery, payProgress, tideIn, tideLevel, rising, risingIn, capIn }` (all `...In` in ticks) |
| `sendInfo(state, data, pid, unitId)` | one row of the **Muster Hall**: `{ unit, name, tier, role, roleText, cost, income, paybackSeconds (null = adds no income), bodies, armour, dmg, hp, dps, speed, range, leak (banners per purchase), bounty (gold the defender earns), traits, traitsText: [sentences], counters: {strongVs: [armour], weakVs: [dmg], resists: [dmg], lines: ["Hits light armour hard", "Weak to nature", ...]}, vsRival: {dealt, taken} (percent vs the rival hero's current armour class / damage type: the green/amber/red pip), canBuy, reason }` — race traits already applied |
| `roster(state, data, pid)` | `sendInfo` for all 12 units of the player's race, tier order — the Muster Hall list |
| `gateQueue(state, fieldId)` | bodies waiting at that field's gate (the HUD's "+N waiting") |
| `deckInfo(state, data, pid)` | `sendInfo` for each of the 4 deck slots + `auto` flag |
| `heroInfo(state, data, pid)` | `{ ent, level, xp, xpNext, xpPrev, skillPts, dps, armor, armourClass, dmgType, respawnIn, skills: [{slot, id, name, rank, maxRank, readyIn, cooldown, mp, canCast, canLearn, desc}] , talent: {open, choices:[{id,name,desc}], picked} }` |
| `teamInfo(state, data, teamId)` | `{ banners, bannersMax, shown, rally, dealt, waiting (gate queue of the team's field), bodies, cap, toll: {charges, readyIn} }` |
| `rivalInfo(state, data, pid)` | rival's `{ player, hero, level, hpPct, dmgType, armourClass, deck: deckInfo }` |
| `gatePreview(state, data, fieldId)` | queued sends of every enemy player heading into that field: `[{ player, unit, count }]` |
| `gearInfo(state, data, pid)` | Armory summary, one row per slot in `SLOTS` order: `{ slots: [{ slot (index), key ('weapon'...), name, usable, step, stepName, item: ItemView|null, next: {step, stepName, cost, unlocked, unlockIn, canBuy} | null }], cheapest: {slot, key, cost, canBuy} | null, spent }` (kept from M1) |
| `inventoryInfo(state, data, pid)` | the character panel: `{ equip: {slot: ItemView|null}, bag: [ItemView|null], belt, beltMax, armourClass, oil, totals: {stat: value}, totalLines: [text], set: {pieces, active: [text]}, picks: [[ItemView x3]], requisitions: [{uid, name, inTicks}] }` |
| `shopInfo(state, data, pid)` | `{ atArmory, requisitionSeconds, topStep, topStepName, recommended: {slot, cost, canBuy} | null, slots: [{ slot, slotName, kind, kinds (chest: [{kind, armourClass, name}]), next: {step, stepName, cost, unlocked, unlockIn, reason} | null }], potion: {cost, belt, max}, oil: {cost, current, types} }` |
| `itemView(state, data, pid, item)` | ItemView = `{ uid, name, slot, slotName, rarity ('normal'|'magic'|'rare'|'legendary'|'unique'|'set'), step, stepName, ilvl, tier, kind, armourClass (chest), twoHanded, lines: [text], power (unique text), set: {name, pieces, bonuses}, lore, score, better, worn, sell, forHero }` |
| `affixLine(data, affix)` | `"+4.5% critical chance"` |
| `musterInfo(state, data, pid)` | `{ rank, next: {cost, canBuy, reason} | null }` |
| `entName(state, data, ent)` | display name |

## 8. Data files (schemas)

All files carry a `_doc` string. The sim reads them only through `sim.data` (frozen).

- `data/econ.json` — clock, start, banners, bounty, rally, field (cap, length), tide stats, muster,
  item steps, hero curve + `xpTable` + class multipliers. See the file's `_doc`.
- `data/units.json` — `traits{id:{desc, ehp}}`, `units{id:{race, name, tier, cost, income, hp, dps,
  bodies, armour, dmg, range, speed, leak, bounty, traits[], splitInto?, role, model}}` (GENERATED by `tools/build-roster.mjs`: 12 units per race, tiers 1-6; also `tiers` templates, `roles` words, `traits` with `desc`).
  `hp`/`dps` per body; `leak` per purchase (split over bodies). `model` is a look hint for the view.
- `data/races.json` — `traits{id:{name, desc, ...knobs}}`, `races{id:{name, armour[], trait, hpMult,
  units[]}}`.
- `data/damage.json` — `types[]`, `armours[]`, `pct[dmg][armour]` (percent), `heroDefault`,
  `chestArmour`.
- `data/maps.json` — `maps{id:{name, length, gap, modes{mode:{width, gates}}, gateZ, leakZ,
  keep{z,w,d}, armory{x,z,r}, spawn{x,z}, ford{z0,z1,slow}, walls[]}}` (field-local x: 0 = field centre).
- `data/heroes.json` — built by `tools/build-hero-skills.mjs` from Farhold rows + Bannerline numbers:
  `heroes{id:{name, dmgType, melee, range, attackEvery, moveSpeed, radius, hp/hpPerLevel, mp/mpPerLevel,
  mpRegen, armor, slots{Q,W,E,D,R: skill id}, talents[{skill, choices:[{id,name,desc,mod}]}]}}`,
  `skills{id:{name, desc, shape, element, mult, radius|reach|arc, cooldown, mp, ...effects}}`,
  `statuses{id:{...}}`, `ranks{max, ult, multPerRank, cdPerRank}`.
- `data/items-bl.json` — built by `tools/build-items-bl.mjs`: `slots`, `stepNames`, `stepIlvl`, `stepRarity`,
  `rarityAffixes`, `bases{slot:{kind:{id,name,twoHanded}}}`, `affixes[16]` `{id, name, kind (prefix/suffix), stat, min, max, unit, label, slots?}`,
  `caps`, `score`, `uniques{id:{name, lore, hero, slot, base, twoHanded, power, powerText}}`, `set`, `heroKind`, `shop`, `drops`, `toll`.

## 9. What the view may and may not do

- May: read `sim.state`, `sim.map`, `sim.data`, call `query.js`, drain events, build commands.
- May not: write into state, call internal sim modules, use `Math.random` to change game outcomes.
- Item = `{ uid, slot, base, baseName, name, rarity, step, ilvl, kind, twoHanded, affixes: [{id, stat, value}], unique, set, price }` (plain data; use `itemView` for display).
- Player-facing names for gear slots: `GEAR_SLOTS` exported by `query.js` (weapon, off-hand, head,
  chest, hands, feet, neck, ring) and step names `GEAR_STEPS` (Plain … Legendary roll).
- Display rounding: `shared/format.js` (`hp`, `fmt`). Banners are fractional internally — show
  `Math.ceil(banners)`.

## 10. Portrait + icons (stream C)

Art modules the view and UI use. All take the game's own renderer — none opens a second WebGL context.

### 10.1 Models: `js/view/unit-looks.js` + `data/looks.json`

```js
import { loadLooks, createBodyFactory } from './view/unit-looks.js';
const looks = await loadLooks();                  // data/looks.json + units.json + avatar-3d data + Farhold warbands (read-only)
looks.forUnit('tuskback')  // { kind: 'creature', spec, variant, scale, race, tier, name }
looks.forHero('druid')     // { kind: 'chibi2', avatar, scale, hero: true }
looks.forRef('unit:levy' | 'hero:warrior')
const actor = await looks.build(look)  // { group, height, setAnim(clip, fade?, restart?), update(dt,t), metrics(), dispose(), kind, parts? }

// stream B's actors.js:
const bodies = createBodyFactory(looks, { scale: 1.3, fallback: capsuleBody });
await bodies.preload();                           // one of each body: warms Chibi 2 templates, learns heights
createActors({ scene, data, makeBody: bodies.makeBody, localTeam });
```

- `makeBody(ent, look, data)` returns `{ object, height, play(act, t), dispose() }` synchronously; the
  model drops into `object` when its async build lands. Heroes are `ent.kind === 'hero'` (ent.type = hero
  id), units `kind === 'unit'`; anything else (tides) goes to `fallback`.
- `play(act, t)` maps the sim's `act` → clip: idle → ready, walk, attack, cast, stun → hit, dead.
- Models face +z. Creatures are folded by `avatar-3d/js/mesh-merge.js` (1–3 draw calls); a Chibi 2
  body is 2 draw calls (templates shared per identical look). Team identity stays a ground ring.
- `scale` (default 1.3) × each look's `scale` (T6 champions 1.5, heroes 1.35) gives world size; Chibi 2
  bodies are ~1.0–1.3 m before scale.

### 10.2 Live portrait: `js/view/portrait.js`

```js
import { createPortrait } from './view/portrait.js';
const portrait = createPortrait({ gfx: app.gfx, slot: bar.portraitSlot, looks });   // adds .live to the slot
bar.onSelect(id => portrait.showEnt(state.ents.find(e => e.id === id)));            // { kind, type } or null
portrait.react('hit');        // on damage to the shown entity; 'talk' | 'attack' | 'cast' too
portrait.dispose();           // on match end (removes its pass and canvas)
```

- Registers one `gfx.addPass` pass; renders ≤ 30 fps into the canvas square under the slot and copies it
  into a 2D canvas inside the slot (the bar is opaque, so a bare scissored viewport would be hidden).
- Split screen: one `createPortrait` per control bar. Each has its own little scene and actor.
- `showEnt` of the same `kind:type` again is free (no rebuild).

### 10.3 Icons: `js/view/icons.js`, `assets/icons/`

```js
import { createIconLibrary, createIconStudio } from './view/icons.js';
const icons = await createIconLibrary();          // reads assets/icons/index.json
icons.url('unit', 'levy')    // 'assets/icons/unit/levy.png' or null (synchronous; use in <img>)
icons.url('hero', 'druid'); icons.url('skill', 'firebolt'); icons.url('item', 'greatsword')
// optional runtime generation for anything not baked (previews only):
icons.attach(createIconStudio(app.gfx.renderer, { looks })); await icons.get('unit', 'newthing')
```

- Kinds and ids: `unit/<unit id>` (24), `hero/<hero id>` (4), `skill/<skill id>` (every skill in
  data/heroes.json), `item/<base>` (generic bases: sword, longsword, greatsword, axe, greataxe, mace,
  warhammer, spear, bow, staff, druid_staff, quarterstaff, wand, heater/kite/tower_shield, tome, quiver,
  plate_helm, leather_cap, hood, wizard_hat, plate_armour, chainmail, leather_armour, robe, boots,
  bracers, potion, oil, amulet, ring, scroll — `assets/icons/catalog.json`).
- 128×128 PNG, background and frame baked in (race tint for units, gold for heroes, element tint for
  skills). Scale down freely in CSS.
- Rebake after changing a look, a creature or the catalog: `flock /tmp/claude-1000/farhold-pw.lock node
  prototypes/bannerline/tools/bake-icons.mjs` (writes the PNGs + index.json). `icons.html` is the gallery
  and re-render tool for people.
