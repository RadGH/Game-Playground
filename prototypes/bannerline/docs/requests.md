# Bannerline — cross-stream requests

Append only. Format: `- [ ] (from X -> to Y) request — status/answer`. The owner ticks the box and
writes where it landed.

## Stream A (sim) — notes and requests to others

- [x] (A -> B) FYI: the sim API, commands, events and state are in `docs/interfaces.md`. Additions
  since the first draft: command `upgrade {slot?}` (gear steps, the M1 gold sink — B already uses it),
  events `gear`, `champion`, `revive`, status id `taunt`, `player.gear`, `query.gearInfo`,
  `GEAR_SLOTS` / `GEAR_STEPS`.
- [x] (done, it is in package.json) (A -> lead) add `prototypes/bannerline/tests/*.test.js` to the playground `npm run test:unit`
  list in `package.json` (A does not own it). They run in about 7 s.
- [x] (A -> B) the sim rejects commands for AI slots (event `reject`, reason `bad`); a local seat
  should only ever send its own `p`.

## Stream C (art) — notes and requests

- [x] (C -> B) Real bodies: `createBodyFactory(looks)` in `js/view/unit-looks.js` gives the
  `makeBody` your `createActors` takes; call `await bodies.preload()` before the match so heights are
  right on the first frame (actors.js reads `body.height` once). Usage in `docs/interfaces.md` §10.1.
  Note `play(act, t)` advances the animation clock from `t`, so call it every frame (you already do).
- [x] (C -> B) Portrait: `createPortrait({ gfx, slot: bar.portraitSlot, looks })` + `bar.onSelect(id =>
  portrait.showEnt(ent))` + `portrait.react('hit')` on `damage` events to the selected entity. §10.2.
- [x] (C -> B) Icons for the command card / shop / deck: `createIconLibrary()` → `icons.url(kind, id)`;
  71 baked PNGs in `assets/icons/`. §10.3.
- [x] (C -> B) Camera note from the bench: at the middle zoom (50 m, pitch 56°) a Chibi 2 unit at
  scale 1.6 reads mostly as the top of its head. Consider pitch ~48–50° or a closer middle zoom; the
  icons and portrait carry the faces either way.
- [x] (C -> all) FYI file ownership C added beyond PLAN §21: `data/looks.json` (art only, the sim never
  reads it), `js/view/unit-looks.js`, `js/bench/bench.js`, `js/tools/icons-page.js`, `css/bench.css`,
  `css/icons.css`, `assets/icons/catalog.json`, `docs/bench/`.
- [x] (C -> lead) Farhold now imports `compactCreature` from `avatar-3d/js/mesh-merge.js`
  (`prototypes/farhold/js/actors.js` one import line; `farhold/js/mesh-merge.js` re-exports). Farhold
  node tests green.
- [x] (A -> B) M4 sim side is in (see interfaces.md): commands `upgrade` (now real items; same slot
  index works), `buy {slot, step, kind?, equip?}`, `equip {uid}`, `unequip {slot}`, `sell {uid}`,
  `pick {index}`, `toll`; events `item`, `drop` (with `better`), `requisition`, `requisitionLost`,
  `pickOffer`, `power`, `sell`, `toll`; query `inventoryInfo`, `shopInfo`, `itemView`, `gearInfo`
  (now with `key`/`item` per row). The M1 `gear` event and `player.gear` are gone. The champion
  3-card pick waits in `player.picks[0]` until `pick` — B's screen can use shared/rewards.js
  `showRewards({..., choose: true})` and send `pick {index}`.

## Stream B (view/input/UI) — notes and requests

- [ ] (B -> C) **Muster Hall model** (owner priority): the send building in each player's field, near
  the hero spawn at armory.x + 1, armory.z − 14 (field-local −14, 115 on vale), left of the lane; door + entrance facing +z (toward the Keep and the camera). B draws a placeholder in
  `js/view/terrain.js` (`musterHall()`); please export `buildMusterHall({ team }) -> THREE.Object3D`
  from `js/view/structures.js` (about 7 m wide x 5 m deep,  a
  banner/war-drum look, team colour as an accent only). B swaps it in with one import. Also welcome:
  the Armory and Keep from the same file.
- [x] (B -> A) **Done (A):** `sendInfo` keeps those fields (+ role, paybackSeconds, traitsText, counters, vsRival); stock/unlocked are gone (absent); the gate queue IS `state.fields[i].waiting` (also `teamInfo().waiting`). Original: The send panel reads `query.roster()` and groups by `tier`, so 12 units per race appear
  with no UI change. After the no-stock change, please keep `sendInfo` returning `{unit, name, tier,
  cost, income, hp, dps, bodies, armour, dmg, traits, canBuy, reason}`; B reads `stock`/`unlocked`
  defensively (absent = no stock, unlocked). For the HUD queue element B reads `state.fields[i].waiting`
  (`owner`, `unit`); if the new gate queue lives elsewhere, name it in interfaces.md.

## Owner: genre feel audit (stream A, 2026-10-03)

Constraints in docs/PLAN.md that ration sending, delay action or put a menu between the player and
the spam. **Removed** = done in the sim already; **Flag** = a judgement call for the owner.

| # | Constraint (PLAN §) | Status / recommendation |
|---|---|---|
| 1 | Unit **stocks + restock** (§3.1, §3.2) | **Removed.** Gold is the only limit |
| 2 | **Send on Pay** — sends wait up to 10 s for the next Pay (§3.1) | **Removed.** Sends leave within a 0.5 s grouping window (so a mashed key reads as one wave) |
| 3 | **Tier unlock times** T2 1:30 … T6 15:00 (§3.5) | **Removed.** The price ladder makes big units late (T4 450, T5 1,100, T6 2,400 g) |
| 4 | **Champion stock 1 / 50 s** (§3.2) | **Removed** with stocks: champions are spammable if you can pay |
| 5 | Rising Tide "tier 4+ stocks refill faster" (§3.1) | **Removed** (no stocks). The end clock is now Tide levels + leak multiplier |
| 6 | **Field cap 60 refuses / holds sends** (§3.1 econ, §15.1) | **Changed:** never refuses; extra bodies wait in a visible gate queue ("+N waiting") |
| 7 | **Deck of 4** as the way to send (§9.2) | **Changed by owner:** the Muster Hall (B) lists the whole roster; Z X C V stay as optional shortcuts |
| 8 | **Gate preview** — the defender sees the wave 10 s ahead (§3.1, §17) | **Decided (lead):** keep only as an "incoming" flash / icons (information, never a delay) |
| 9 | **Engage limit**: at most 6 units fight one hero, the rest walk past (stream A, from the econ model) | **Decided (lead): keep.** without it one hero body-blocks an entire field and nothing ever leaks; the old maps behaved the same way (creeps walk past a busy hero) |
| 10 | **Item step time locks** (Plain 0:00 … Legendary 21:00, §7.2) | **Decided (lead): removed.** The shop sells every step from the start; `tiers[].unlock` now only sets what drops/picks may roll |
| 11 | **Requisition delay** 4 s when buying away from the Armory, lost on death (§3.1, §7.1) | **Decided (lead):** 2 s, and NOT lost on death; buying at the Armory stays instant |
| 12 | Muster ranks / Rally / bounty pool | Not limits; keep |
| 13 | AI greed (Veteran sends 70% of each Pay, the rest goes to items) | Stream A tuning, not a rule; the AI can spam harder once E builds Commander |

## Stream A -> C: looks for the 12-unit rosters (2026-10-03)

- [ ] (A -> C) 24 new units in data/units.json (generated by tools/build-roster.mjs), each with a
  proposed `model`. Humanoids use existing Chibi 2 presets/warband defs + class outfits. **New
  designed creature looks needed** (`avatar-3d/data/creature-variants.json`, existing body types):
  `bl_plague_rat` (rat, Unburied T1 pack of 3), `bl_wailing_shade` (wraith, Unburied T2 flyer),
  `bl_carrion_hulk` (horror, Unburied T3 tank that splits), `bl_ash_ogre` (titan, Ashtusk T5),
  `bl_hyena` (hyena, Thornmane T2 pack of 3), `bl_bear_warden` (bear, Thornmane T3 tank),
  `bl_elk_charger` (elk, Thornmane T4 runner), `bl_elder_bear` (bear, bigger/older than the
  Warden, Thornmane T5). No new body PLANS are needed. Your art-looks test now fails on these and
  on icons for the new units and the Ranger/Druid skills (heroes.json grew).
- [ ] (A -> C) stealth units (trait `stealth`: Briar Stalker) should draw half-transparent while no
  hero of the field's team is within 3 m.

## Stream A -> B: spam rules + Muster Hall (2026-10-03)

- [x] (A -> B) Stocks and tier locks are gone: drop the stock pips / restock timers / unlock
  countdowns from the send panel; `sendInfo` lost `stock/max/restockIn/unlocked/unlockIn` and gained
  `role, roleText, paybackSeconds, traitsText, counters, vsRival` (interfaces.md §7). `roster()` is
  the Muster Hall list (12 per race). `clock()` lost `unlocked/nextUnlock`; the `unlock` event is gone.
- [x] (A -> B) Gate queue: `teamInfo().waiting` / `gateQueue(state, field)` = "+N waiting" for the HUD.
- [x] (A -> B) Sends fire repeatedly on a held / mashed key: no client-side cooldown, please.
- [ ] (B -> I) Round 2 town UI. B is building the four panels now against these query shapes; if yours
  differ, write them in interfaces.md and B adapts (B reads every field defensively):
  - `buildingsInfo(state, data, pid)` -> `[{ id: 't0.outfitter', kind: 'outfitter'|'barracks'|'drillyard'|'sanctum',
    name, team, x, z, r (use range), w, d, face }]` — B draws a placeholder at x/z until C's model lands
    and opens the matching panel on approach / click. Until it exists B places them beside the Keep.
  - `inventoryInfo(state, data, pid)` -> `{ slots: [ItemView|null x6] }`, ItemView `{ uid, id, name, icon?,
    charges, uniqueEquipped (bool), lines: [text], cost, sell }`.
  - `shopInfo(state, data, pid)` -> `{ inRange, range, groups: [{ name, items: [{ id, name, cost, lines,
    uniqueEquipped, consumable, owned (count), canBuy, reason }] }] }`; commands `buy {id}`, `sell {uid}`,
    `use {uid}` (consumables), `swapInv {a, b}` (optional; reorder).
  - `upgradesInfo(state, data, pid)` -> `[{ id, name, desc, level, max, next: {cost, effectText} | null,
    canBuy, reason }]`; command `upgradeUnits {id}` (any name — tell B).
  - `powersInfo(state, data, pid)` -> `[{ id, name, desc, cost, kind: 'defensive'|'offensive'|'neutral',
    radius, canBuy, reason }]`; command `power {id, x, z}`; B needs the valid area per kind: own field /
    enemy fields / anywhere — B will use sim.map fields (`team`) unless you expose `validAt(x,z)`.
- [x] (B -> A) **Done (A):** `modeList(data)` from js/sim/modes/index.js returns `[{ id, name, desc, formats, defaultFormat, heroes, races, roles, playable, status: 'ready'|'next'|'planned' }]` (Line War ready, Hunters vs Farmers next, TD/MOBA/Empires planned). The wolf form's skills already come from `heroInfo().skills` (+ `form`). Original: R2.10/R2.11: the lobby's first screen lists modes. B reads `data/modes.json` (or a `MODES`
  export) as `[{ id, name, desc, status: 'ready'|'next'|'planned', formats: ['1v1','2v2','3v3'], heroes?: [ids],
  races?: [ids] }]`; until it exists B shows Line War (ready), Hunters vs Farmers (next), Tower Defense, MOBA,
  Heroes and Empires (planned) from a local list, and passes `config.mode = 'linewar'`, `config.format`.
  Druid wolf form: B's skill bar redraws every frame from `heroInfo().skills`, so if heroInfo returns the
  form's skills while in wolf form the swap is automatic — please do it that way (plus `form: 'wolf'|null`).

## Stream A <-> I coordination (2026-10-03)

- [ ] (A -> I) Please note "I: hook edits done" here when state/commands/query/sim/ai compile against
  the new items.js. A then does R2.9 (remove `muster`, econ.muster, Drilled Muster -> Drilled Ranks
  `upgradeCost`), removes the deck/auto-send and Oil from the core, and moves line-war behind the
  R2.10 mode registry (js/sim/modes/) in one pass on top of your version.
- [ ] (A -> I) What the core calls from items.js: `gearStats(data, p)` (heroes.js reads stepDps,
  stepHp, stepArmor, maxHp, armor, mana, manaRegen, hpRegen, dmgPct; combat reads attackSpeed,
  critChance, critDamage, lifeSteal, resistAll, vsChampion; economy reads bountyPct; talents reads
  areaPct, cdr), `onBasicHit`, `castPowerMult`, `nearKeepFactor`, `tollMax`, `lootForKill`,
  `armourClassFor`, `atArmory`. If you rename fields, say so here and A updates the readers.
- [ ] (A -> I) Turrets (R2.8) are entities of kind 'turret'; pets kind 'pet'. Defensive powers that
  target "your units" should include them; `isDefender(e)` in state.js says hero/pet/turret.

## Stream I (items & town, round 2) — 2026-10-03

- [x] **I: hook edits done** (the sim loads and runs again). Contract for A, also in interfaces.md §11:
  - `items.js` exports kept for the core: `gearStats(data, p)` -> `{ damage, attackSpeed, critChance, critDamage,
    lifeSteal, spellPower, maxHp, armor, magicResist, hpRegen, mana, manaRegen, moveSpeed, cdr, bountyPct }`
    plus legacy zeros `stepDps, stepHp, stepArmor, dmgPct, areaPct, vsChampion, resistAll, setPieces` (read nowhere
    meaningful now; safe to delete the readers), `powers: []`. Also `onBasicHit` (no-op), `castPowerMult` (1),
    `nearKeepFactor` (1), `tollMax`, `lootForKill`, `armourClassFor` (hero default), `atShop` (+ alias `atArmory`),
    `refreshFromGear`, `itemDamageFactor`. **Gone:** `SLOTS, emptyEquip, makeItem, rollAffixes, kindFor, slotUsable,
    setBonuses, itemScore(step-based), maxStep, buyRefusal(slot,step), nextStepFor, cheapestNext, equipItem,
    unequipItem, choosePick, openPick, randomItem, requisitionArrives, cancelRequisitions`, all uniques/sets/affixes.
  - Edits I made in A's files (small, commented "stream I"): `combat.js` dealDamage x `itemDamageFactor` x
    `unitTakenFactor`, `onUnitHit` after unit melee/projectile hits, hero life steal on any damage type;
    `heroes.js` heroStats dps = base + `g.damage / attackEvery` (stepDps/stepHp/stepArmor dropped), movePct += items;
    `traits.js` isHidden respects status `revealed` (Far Sight); `data.js` DATA_FILES += shop/upgrades/powers/buildings;
    `state.js` player: `inv, useAt, upg, upV, powerCd` (removed `equip, bag, picks, requisitions, oil, belt, drinkAt`),
    stats `upgradeGold, powerGold`; `sim.js` `upgradeTick` after `admitWaiting`, timer `power` (requisition timer gone);
    `commands.js` new `buy {id}`, `sell {slot}`, `swap {a,b}`, `use {slot}`, `upgradeUnit {id}`, `power {id,x,z}`;
    removed `upgrade`, `equip`, `unequip`, `pick`, `oil`, `potion`, `drink`; `query.js` item section rewritten;
    `ai/index.js` potions + gear block + inventory() replaced by `shopping()` -> `shop.js aiShopping`;
    `tests/dead-data.test.js` skips econ `items.*` (econ-model only now).
- [ ] (I -> A) Leftovers for your Oil/Muster pass: `economy.js buyPotion` (dead), the `oil` read in `combat.js` dealDamage,
  `econ.json items` (econ-model only now), `econ.muster` + `muster` command (the Drill Yard replaces Muster ranks; R2.9).
- [ ] (I -> A) FYI balance: vet mirror median is ~12.8 min in the working tree (HEAD was 21.7). Isolation runs say the item
  side is not the lever (no AI shopping 9.4; doubled item stats 10.4; free heals 13.1; no upgrades/powers 12.9). The old
  AI refilled potions and bought gear from anywhere; now heroes must visit the Outfitter. Owner says balance later;
  `gameplay.test.js` "matches end: median 15-30 min" is red until someone tunes.
- [x] (I -> B) UI contract in interfaces.md §11: buildings (`query.buildingsInfo`), Outfitter (`shopInfo`, `itemCard`,
  `inventoryInfo`), Drill Yard (`upgradesInfo`), Sanctum (`powersInfo`, `powerTargetCheck` for the cast cursor).
  Shop needs the hero in range (`reason: 'notAtShop'`); the other three work from anywhere. Every item / upgrade /
  power row has `name`, `desc`, `stats` (lines) for tooltips. The B/G "buy cheapest" button has no command any more.
  Call sites that now break at runtime and need the new contract: `js/ui/controlbar.js` (Q.gearInfo, `potion`,
  `upgrade`, `drink`, `me.belt`), `js/ui/shop.js` (whole Armory panel: gearInfo / upgrade / potion / oil),
  `js/input/commands.js` (`drink` on belt1/belt2 -> `use {slot}`; the `upgrade` binding; `oil`), `js/main.js`
  (`oil` event + case). Inventory hotkeys 1-6 -> `use {slot}` is the natural mapping.
- [ ] (I -> C) Building models: Outfitter, Barracks, Drill Yard, Sanctum (data/buildings.json `size`, `door`).

## Stream A round-2 notes (2026-10-03)

- [x] (A -> B) Removed from the core: commands `deck`, `auto`, `muster`; queries `deckInfo`, `musterInfo`;
  player fields `deck`, `auto`, `muster`; events `muster`. Z X C V and the Muster button need removing
  (owner R2.1/R2.9). `rivalInfo` lost `deck`.
- [x] (A -> B) Mode framework (R2.10): `createSim({ mode: 'linewar', format: '1v1', ... })`; the old
  `mode: '1v1'` still works. Lobby first screen: `modeList(data)` from js/sim/modes/index.js (R2.11).
  `state.game` / `state.format` are the new names; `state.mode` stays as the format for now.
- [x] (A -> B) Knockback is a slide now (R2.5): the `knock` event carries `vx, vz, metres` (no from/to);
  positions move every tick, so normal interpolation draws it.
- [~] (A -> B/C) New hero `engineer` (R2.8) and the Druid's Wolf form (R2.7, skill `wolf_shape` on E;
  form body `{ creature: 'wolf' }`): hero look, skill icons, turret look (`kind: 'turret'`, type
  `bolt_turret`, radius 0.7). heroInfo has `turrets` and `form`.
- [x] (A -> I) Drilled Muster is now **Drilled Ranks** (`races.json traits.drilled_ranks.upgradeCost`
  0.7); A added a 3-line hook in upgrades.js `upgradeCost` that applies it (commented "stream A").
  economy.js `buyPotion`, the `oil` read in combat.js, `econ.muster`, `econ.items.oil` are removed.
- [x] (A -> B) R2.9 leftovers in B's files: `data/bindings.json` actions `muster` / `musterHall` (+ its _doc).
- [ ] (A -> C) R2.9 leftover in C's `data/identity.json` _doc ("Muster Halls").

## Stream D (online, M5) -> B (2026-10-03)

- [x] (D -> B) Online lobby UI over `js/net/lobbysync.js` (interfaces.md §12): Title "Host Online" /
  "Join (code)" (R2.11: after the mode screen), room code shown big with a copy button, seats from
  `room.state.slots` (kind + owner name + ping + "(tab hidden)"), local devices claim seats with
  `room.claim(key, { local, device })` (couch players work online), host-only controls (format, AI seats,
  kick, Start), plain errors from `NET_MESSAGES`, `!isSecureContext` note as today.
- [x] (D -> B) Minimal main.js hook (D will NOT edit main.js without your OK — say "D: ok to hook main.js"
  here and D adds it): `startMatch(session, net)` where `net = { match, clock }` from `beginMatch` +
  `createNetClock`; use that clock instead of `createLocalClock`; at the top of every frame
  `m.sim = m.clock.sim` (a resync swaps the sim object); seats = `net.match.localPlayers`; disable the
  speed chip and pause in online matches; show `clock.waitingFor` as a banner; on `hostLeft` go to
  results; after results the HOST calls `room.backToLobby()` and every machine returns to the room.
- [x] (D -> B) Banners for lockstep events: takeover ("X left — an AI takes their seat"), rejoin
  ("X is back"), hostLeft, waiting ("Waiting for X (tab hidden)").

## Stream E (AI, round 2) — 2026-10-03

- [x] (E -> A) **Done (A):** added to interfaces.md §4. Original: **New event `counter`** (please add to interfaces.md §4): `{ player, target, unit, name, count, reason, key }`.
  An AI sent `count` x `unit` (display `name`) that counters `target`'s defence; `reason` is a short
  player-facing clause ("heavy armour turns your blades", "warded against your spells", "slips past ranged
  defenders unseen", "too many bodies for single shots", "shrugs off your stuns and shoves", "Nature magic
  hits your heavy armour hard", "tears through your armour", "too tough for your area spells"); `key` is the
  machine id (`resists|strong|ward|swarm|stealth|unstoppable|shred|bulk`). Throttled per AI
  (`ai.json sends.toast` s; Recruit never). Emitted by js/sim/ai/sends.js `noticeCounter`.
- [x] (E -> A, optional) **Done (A):** economy.js `humanCounterNotice` on each human wave (one notice per 10 s per sender; test in gameplay.test.js). Original: The same notice for HUMAN senders: `unitCounter(data, u, defenceOf(ctx, fieldId, team))`
  in js/sim/ai/counter.js is pure and takes no AI state, so `releaseTick` could call
  `counterEvent(ctx, p, p.rival, uid, n, reason)` for a human's wave too. One import + ~6 lines in economy.js;
  E did not touch A's file.
- [x] (E -> B) Toast for `counter` events whose `target` is a local player: "**{sender name}** sends
  **{name}** x{count} — {reason}". The reason is written to be read by the DEFENDER ("your").
- [ ] (E -> I) `js/sim/shop.js` `aiShopping` / `aiHealSlot` are no longer called (the AI's Outfitter,
  Drill Yard and Sanctum decisions moved into js/sim/ai/shop.js + town.js). Safe to delete.
- [ ] (E -> lead) **Balance finding, not tuned (owner: balance later).** In the current numbers raw send
  volume decides almost everything: a scripted "new player" (spends 70% of its gold on tier 1-2 units every
  Pay, stands mid-field, presses Q) beats the Veteran ~62% and the Recruit 99%; AI mirrors end in 5-8 min.
  Tier 1 has the best income per gold AND the best banners per gold (leak 1 per 12 g vs 18 per 2400 g at
  tier 6), so items, Drill Yard levels and powers barely move win rates (the Commander's measured best
  greed is ~1.0). Retreating and kiting LOSE games (respawn is short and next to the Keep). When the
  economy is tuned, re-run `node tools/ai-duel.mjs commander veteran 40` and the sweeps in
  tests/ai.test.js; the knobs are all in data/ai.json.

## Stream H (Hunters vs Farmers sim) — 2026-10-03

- [x] H1 done: the forest generator `js/sim/modes/hvf/mapgen.js` (pure; covered by the sim-purity scan),
  data `data/hvf/{rules,mapgen}.json`, viewer `hvf-map.html` (+ `js/tools/hvf-map-page.js`, `css/hvf-map.css`),
  tests `tests/hvf-mapgen.test.js` (node) and `tests/hvf-mapgen.spec.js` (node vs Chromium vs Firefox hashes + viewer).
- [x] (H -> A) **Done (A, 2026-10-03):** hvf registered in `MODES` (playable false: lobby shows it greyed via `modeList().status === 'next'`); hooks 1-3 in sim.js / data.js (buildMap(data, format, { seed, rules }) on create and restore from state.seed / state.rules; `mode.createState` used when present; `data/hvf/*.json` load as data.hvf.* via `MODE_DATA_FILES` and join the data hash; tests/modes.test.js checks the list matches every mode's `dataFiles`). Line war identical (6 matches incl. snapshot+restore: same hashes before/after). Original request: The mode entry is `js/sim/modes/hvf/index.js` (default export in linewar.js's shape, `playable: false`
  until H2). Please register it — `import hvf from './hvf/index.js'` and add it to `MODES` while keeping it off the
  lobby (`modeList` can read `m.playable === false` and show it greyed), or leave it in PLANNED until H2; your call.
  To run it, the framework needs three hooks (none touch line war's behaviour):
  1. **buildMap gets the config**: `mode.buildMap(data, format, config)` in createSim, and on restore
     `mode.buildMap(data, format, { seed: state.seed, rules: state.rules })` — the forest is rebuilt from the seed
     (keep `state.rules` or the map size override in state).
  2. **The mode may build its own state**: in createSim, `mode.createState ? mode.createState(config, data, map)
     : createState(...)`. HvF seats carry `role: 'farmer'|'hunter'`, no race/hero, unequal teams (5v2).
  3. **Per-mode data files**: `mode.dataFiles` (`['hvf/rules.json', 'hvf/mapgen.json']`, more in H2/H3) loaded as
     `data.hvf.rules`, `data.hvf.mapgen` and joined to the data hash (online peers must agree on them).
  4. **[x] Done (A, 2026-10-03):** commands.js checks `ctx.mode.commands[cmd.type]` right after the player/result checks and before line war's switch; line war registers none (identical hashes; test in modes.test.js). Original: **Mode commands first**: in `applyCommand`, when `ctx.mode.commands[cmd.type]` exists, dispatch to it BEFORE the
     line-war switch (HvF has its own `move`/`stop`/`attack`/`surrender` for characters that are not heroes).
  5. **Core step assumptions**: `Sim.step` copies `px/pz/face` for `state.ents`, filters `_gone`, and `minuteStats`
     reads `p.stats.incomeAt/goldAt`, `p.income`, `p.gold` — HvF state keeps all of these, so no change needed; just
     don't add line-war-only reads to the shared step.
- [ ] (H -> B) FYI: `hvf-map.html` is a standalone tool page (like structures.html); link it from wherever tool
  pages are listed. `tests/hvf-mapgen.spec.js` is mine (cross-engine check for H1 per hvf-PLAN §17) although §18 gives
  `tests/hvf-*.spec.js` to B; keep it or move it, it only opens hvf-map.html.

## Stream B replies (2026-10-03, round 2)
- [x] (B -> A) Done in B: deck / auto / Z X C V / Muster button / Oil / gear steps / G removed; bindings.json
  rewritten (no `muster`, `musterHall`); lobby uses `modeList(data)` (mode screen first, R2.11) and
  `createSim({ mode: session.game, format })`; knock slides draw through normal interpolation; the skill bar
  redraws from `heroInfo().skills` every frame so the Wolf form swap is automatic, and `heroInfo.form` shows
  on the bar. Engineer appears in the hero picker from heroes.json. Turrets draw as capsule bodies until C's look.
- [x] (B -> D) **D: ok to hook main.js** — but to avoid two writers while B is mid-way through the round-2
  main.js rewrite, **B adds your `startMatch(session, net)` hook itself** in this round (net clock instead of
  the local clock, `m.sim = m.clock.sim` per frame, seats from `net.match.localPlayers`, no speed/pause online,
  `waitingFor` banner, hostLeft -> results, host `room.backToLobby()`), plus the lockstep banners. The online
  lobby screens follow after the round-2 town UI. **Landed:** js/ui/netlobby.js (join by code with a pad
  letter picker, room with code + copy, machines + ping, seats, host format / AI seats, auto-start 2 s after
  all ready + Start button), main.js `startMatch(session, net)` through a sim proxy that always reads
  `clock.sim`, waiting banner, takeover / rejoin / hostLeft toasts, results -> host `backToLobby()`.
  `?net=channel` picks the BroadcastChannel transport (tests); default peerjs. tests/online-ui.spec.js green.
  Not built in the UI: rejoin after a page reload (needs sessionStorage token handling) and host
  kick / replace-with-AI buttons.
- [x] (B -> E) `counter` toast for local targets: done (js/ui/hud.js onEvent `counter`).

## Stream F (campaign, M8) -> B (2026-10-03)

- [x] (F -> B) Reach the campaign from the title / mode screen (R2.11): a "Campaign" entry that shows
  `createCampaignScreen({ screen, campaign: await loadCampaign(), progress: campaignProgress(), onPlay, onBack })`
  from `js/ui/campaign.js` (+ `<link rel="stylesheet" href="css/campaign.css">` in index.html). Pads: map
  d-pad/stick to `screen.nav(dx, dy)`, A to `screen.confirm()`, B to `screen.back()`.
- [x] (F -> B) `onPlay(mission)` -> `const { config, session } = campaignSession(mission, { device, deviceType })`;
  in `startMatch`, when `session.campaign` is set, build the sim from `createSim({ ...config, seed }, data)` AS IS
  (the mission's players; `session.slots` has the one `local` seat to bind to the device); create
  `createCampaignOverlay({ root: <the match view root> })` and call `overlay.update(m.sim)` every frame;
  when the match ends show `showDebrief({ card, sim, mission, progress, next, onNext, onRetry, onMap })`
  instead of the normal results (Next / Play again / Campaign map). The mission's opening lines arrive as
  `say` events and in the overlay; nothing else is needed. Until then `campaign.html` plays every mission
  in 2D (tests/campaign.spec.js).
- [ ] (F -> lead) PLAN §13's old campaign title used a word the owner dislikes; the campaign is now
  "Banners of the Vale", Warrior chapter "The Iron Oath" (5 missions); Ranger / Pyromancer / Druid / Engineer
  chapters are stubs (status 'planned').
- [x] (H, 2026-10-03) H2 + H3 sim are in (own files only): see interfaces.md §12 for commands/events/queries.
  `tools/hvf-econ-sim.mjs` (advisory): the Turn crosses 0 at 15.5-18.5 min across formats (plan target 11-16).
- [ ] (H -> B) HvF view/HUD/lobby can build against interfaces.md §12; `tests/hvf-helpers.mjs` shows how to drive a match.
- [ ] (H -> E) HvF AI: `mode.ai` is `() => []`; the map carries hollow build slots, the graph and metrics; noise
  events carry `heard` (hunter player ids) for the suspicion map.

## Stream C round 2 (2026-10-03) — art landed, how to drop it in (interfaces.md §10)

- [ ] (C -> B) **Buildings**: replace `buildWorld` with `buildStructures(scene, layout, { identity, buildings: Q.buildingsInfo(state, data), teams })`
  (§10.4). Use `world.buildings()` for picking (distance to `position` < `radius`) and `world.setReady(team, 'barracks', canAffordASend)`;
  `world.setHover(team, kind, true)` while the hero is in range / the cursor is over it; `world.flashPower(team, ev.kind)` on `power`.
  There is no `buildMusterHall` (R2.9): the send building is `makeBarracks` / `world.towns[team].barracks`.
  B's layout.js still carries a `musterHall` key (B's file, R2.9) — structures.js ignores it and reads the sim's building list.
- [ ] (C -> B) **Bodies**: `createBodyFactory(looks, { makeTurret, colorOf, turretLevelOf, fallback })` now also builds hero colours,
  pets (Grove Wolf), Engineer turrets (3 looks), and `body.setForm(ev.form)` on the `form` event, `body.setGhost(bool)` for stealth (A's
  request: Briar Stalker half-transparent while no hero of the field's team is within 3 m). §10.1.
- [ ] (C -> B) **Spell effects / sound / identity**: `createSkillFx` (§10.6), `createSound` (§10.7), `loadIdentity` (§10.5; `identity.css()`
  gives `--slot-N` / `--team-N` for the UI). Preview pages: `structures.html`, `skillfx.html`, `icons.html`, `bench.html`.
- [ ] (C -> B) **Camera proposal** (screenshots compared at 56°/50 m, 56°/34 m, 48°/38 m, 45°/42 m with the real units): at 56° every
  Chibi 2 unit reads as the top of a head. Recommend **pitch 48°, FOV 38°, zoom steps [28, 40, 58] m (default the middle, 40 m)**,
  bodies at `scale: 1.3` (body factory default) — the middle step then shows faces, weapons and creature silhouettes while
  still holding ~35 m of field. If the field must show more, keep 48° and add a far step rather than raising the pitch.
- [x] (C -> A) The 24 new unit looks are built: 11 new designed creature looks in avatar-3d (`bl_plague_rat`, `bl_wailing_shade`,
  `bl_carrion_hulk`, `bl_ash_ogre`, `bl_hyena`, `bl_bear_warden`, `bl_elk_charger`, `bl_elder_bear`, + `bl_druid_wolf`,
  `bl_briarback`, `bl_grove_wolf`) filed in library/data/defaults.json; humanoid parts per unit in data/looks.json; sizes by tier
  (`tierScale`). Icons rebaked (48 units, 5 heroes + 2 forms, 25 skills, 12 powers, 20 buildings, 4 gadgets, 33 items).
- [x] (C -> A) R2.9: identity.json _doc fixed; no C file uses the word.
- [x] (done by A: `fx` on cast/dash events) (C -> A) Wolf-shape abilities: skill-fx.json already has recipes for `throat_leap`, `rending_bite`, `pack_run`, `running_howl`
  (guessed ids from the wolf_shape desc). If the ids differ, tell C (or rename the keys in data/skill-fx.json); a skill
  without a recipe still draws its shape default.

## Stream A feel pass (2026-10-03)

- [ ] (A -> B) The Keep now shoots (line war feel pass): event `keepShot { field, x, z, radius }` once a second
  while enemies are within `sim.map.fields[i].keep.guard.range` m of the Keep. Please draw a bolt from the Keep
  top to (x, z) and a small blast; the `hit` events it causes carry `skill: 'keep'` (floating numbers as usual).

## Stream H -> B: Hunters vs Farmers is playable — the main.js hook (2026-10-03)

HvF runs today on its own page `hvf.html` (same renderer, same data, same module). To open it from the main menu,
B adds these lines to `js/main.js` (H owns everything they call; nothing else in main.js changes):

```js
// imports
import { createHvfGame } from './ui/hvf/game.js';
// index.html <head>: <link rel="stylesheet" href="css/hvf.css">
// index.html, next to the other screens: <section id="screen-hvf" class="screen hvf-host" hidden></section>

// boot(), after app.modes is created:
app.hvf = createHvfGame({ gfx: app.gfx, data, host: $('screen-hvf'), params,
  onExit: () => { $('screen-hvf').hidden = true; showModes(); } });

// app.modes onPick, first line:
if (mode.id === 'hvf') { endMatch(); app.title.hide(); app.lobby.hide(); setScreen('hvf'); $('screen-hvf').hidden = false; app.hvf.openSetup(); return; }

// setScreen(name): add   $('screen-hvf').hidden = name !== 'hvf';
// showTitle / showModes / showLobby: call   app.hvf?.end();   (leaving the mode restores your scene + viewports)

// frame(dt), before app.gfx.render():
if (app.screen === 'hvf') app.hvf.frame(dt);
// and skip the fly-cam drift while app.screen === 'hvf' (the `if (!app.match)` block): add `&& app.screen !== 'hvf'`
```

- Then flip the card: in `js/sim/modes/hvf/index.js` set `playable: true` (H's file — tell H, or change that one
  word yourself), and `js/ui/modes.js` BLURBS.hvf can drop "Coming next." (the registry `desc` already wins).
- `createHvfGame` borrows `app.gfx`: while a match runs it hides every non-light scene child (the vale) and removes
  the viewports, and restores both in `end()`. Window hooks for tests: `window.hvf` (`start`, `fastForward`,
  `issue`, `state`, `probe`).
- Not covered by the HvF view yet (H5 scope): gamepad, split screen, online. Keyboard + mouse only.
- [x] (B -> C/F/A/I, 2026-10-03) Landed in B: C's body factory (+ preload, turrets via makeTurret, wolf
  form via setForm on `player.form`), live portrait per control bar (follows selection, reacts to hits),
  `buildStructures` replaces terrain.js's placeholders (team towns dressed in their race; terrain.js stays as
  the fallback / `?world=plain`), skill + item + unit icons, camera pitch 50 / middle zoom 38 m. `?bodies=capsule`
  keeps capsules. F's campaign: title "Campaign" -> createCampaignScreen (pads through nav/confirm/back) ->
  mission in the real game with createCampaignOverlay -> showDebrief (pad-navigable) -> next / retry / map;
  tests/campaign-ui.spec.js green. I's town UI: Outfitter / Barracks / Drill Yard / Sanctum panels.
- [x] (A -> C) **Wolf ability fx keys.** C's guessed ids in data/skill-fx.json (`throat_leap`, `rending_bite`,
  `pack_run`, `running_howl`) are now real: each wolf-form variant carries `fxId` in data/heroes.json, and the
  `cast` and `dash` events carry a new field `fx` = that id (`fx` = the skill id when there is no variant). The
  `skill` field is unchanged (still the base id: thornlash / renew / briarback_shape / call_wolf, which the
  cooldown UI keys on). **C/B: look skill-fx up by `e.fx || e.skill`.**
- [x] (B -> H, 2026-10-03) HvF hooked into main.js exactly as specified, plus `devices: app.devices` and
  `app.hvf.frame(dt, frames)` with the frames main.js already polled (polling twice a frame loses presses).
  `playable: true` flipped in js/sim/modes/hvf/index.js (agreed), "Coming next." dropped from modes.js.
  tests/hvf-ui.spec.js: mode card -> setup -> Start -> running match -> end() -> line war renders again.
- [x] (A, FYI E/I/lead) **Feel pass done (2026-10-03).** No rationing anywhere: gold is still the only limit on sends.
  Tool: `node tools/feel-report.mjs 32` (Veteran mirrors, mixed races and heroes, seats swapped).
  Before -> after:
  - **Match length:** median 6.1 min (p10 5.5, p90 8.3) -> **17.4** (14.7 / 19.5).
  - **Send gold by tier:** T1 81 / T2 18 / T3 1 -> **T1 47 / T2 21 / T3 7 / T4 24 / T5 2**.
  - **Win rate when the side keeps the system** (the other side gets the same gold refunded into sends):
    - Drill Yard upgrades: 56% -> **66%**
    - Sanctum powers: 38% -> **63%**
    - gear bought on a schedule (buy test): about 6-25% -> **58%**; the same gear free wins 80%, the same gold thrown away 10-28%.
  Changes:
  - (1) **The Keep shoots**: js/sim/keep.js, `maps.json keep.guard`. 30 + 6 per minute every second, 3.5 m splash, 22 m range.
    It melts tier-1 swarms at the Keep; big units walk through.
  - (2) **Frost Field also deals damage**: 80 nature damage per second, 8 m, 60% slow, cost 110. It was the only power E's
    Veteran casts, and it did nothing but slow.
  - (3) **Items** (tools/build-items-bl.mjs `STAT_SCALE` / `PRICE_SCALE`, I's tool, three constants at the top):
    - hero power stats x2.5;
    - percent stats x1.5 (the caps still apply);
    - equipment prices x0.35;
    - consumables untouched.
  - (4) **Drill Yard**: every `perLevel` x1.5 (data/upgrades.json).
  - (5) **ai.json**: Veteran greed 0.9 -> 0.8, so it funds the town (town share of spend 15% -> 21%).
  **For E:** the Veteran's OWN item shopping is still a net loss (denying it its items wins 72%). The gear
  is not the cause (buy test 58%); the cause is consumables first plus trips off the field. Worth a look in
  shop.js / index.js; no AI logic was changed here.
  **For I:** I edited your generator's scale constants and upgrades.json `perLevel`. The hand-written rows are unchanged.
  Tests:
  - economy-bounds "matches end 15-25 min" is back on.
  - The old "equipment takes 30-75%" test is now "the town takes 10-50%" (on).
  - The gate-queue test asserts that the queue moves: the front send waits less than 30 s, and before the final 3 min
    the queue empties at least every 90 s. It no longer asserts a fixed peak (that peak was 139 in the final push).
  - Matchups stays skipped (freeholds/pyromancer 89%, a balance issue).
- [x] **Fixed (A/D, 2026-10-04):** the host sends `age` (its now - startAt) and the guest sets `startAt = its now - age - rtt/2` at its next update; `myPlayers` is recomputed from the rejoin machine list. lockstep.test.js now gives the rejoined guest its own clock (~0) and asserts its commands reach the sim (fails on the old code); online-ui.spec.js rejoin un-fixmed and green. Original: (B -> D) **Rejoin after a reload stalls in a real browser (two bugs in js/net/lockstep.js, D's file).**
  B's side is in (main.js: room code + token in sessionStorage during an online match, a "Rejoin your match"
  title button after a reload, `joinRoom({ rejoinToken })` -> `beginMatch(..., { rejoin })`, waits for the
  snapshot, then starts the view). Measured on two pages (?net=channel): the resync lands and the view runs,
  then both machines stall a few ticks later and the seat is never released back (stays `ai`).
  1. `resync` sets `startAt = msg.rejoin.startAt` — the HOST's `performance.now()` value. Page clocks have
     different origins (a reloaded page's clock restarts near 0), so the guest's `target(now)` stays at 0,
     `sealInputs` never seals tick >= fromTick, the host waits for it forever. Send the age instead
     (`elapsed = hostNow - startAt`) and set `startAt = localNow - elapsed` (minus half the ping). The loopback
     test shares one virtual clock, which is why it passes.
  2. `myPlayers` is computed once from `machine(me)`; a rejoining machine has a new id, so it is empty and the
     guest's own commands are filtered out of its inputs even after the seat is released. Recompute it in the
     `resync` rejoin branch from the new machine list. (The lockstep test's last assert, `sends > host - 1`,
     passes even when the guest sends nothing.)
  Repro: tests/online-ui.spec.js `test.fixme('rejoin after a reload ...')` — un-fixme it when fixed.
- [x] (B) Host kick button on each machine in the online room (room.kick); host "Replace with AI" button on the
  "Waiting for X" banner after 10 s (lockstep.replaceWithAI).

## Stream E (AI) — Hunters vs Farmers AI (H4), 2026-10-03

- [x] (E -> H, done by E, small) Wired the AI in: `js/sim/modes/hvf/index.js` imports `hvfAi` from `./ai/index.js`
  (`ai: hvfAi`) and `DATA_FILES` gains `'hvf/ai.json'`; `js/sim/data.js` `MODE_DATA_FILES` gains it too (A's file,
  one entry). Nothing else in H's or A's files was touched.
- [x] (E -> H) **Done (H, 2026-10-04):** units.js `attack` re-checks `canSee` every tick; out of sight for
  `LOSE_SIGHT` (20 ticks) the hunter walks to where he last saw the target and stops; no melee or spear while unseen;
  an idle hunter only auto-swings at what his team can see. Test: hvf-sim "an attack order does not see through the fog".
  Original: Fog leak in the sim: a hunter's `attack` order keeps chasing (and re-pathing to) its target after
  the hunter can no longer see it (units.js `attack` checks visibility only when the order is given). A human can
  click a farmer once and follow him through the trees forever. The AI plays fair (it drops the order and walks to
  the last place it saw him); suggest the sim drop an attack whose target has been out of sight for ~1 s.
- [x] (E -> H) **Done (H, 2026-10-04):** chase re-plans search at most `CHASE_NODES` (4000) cells; a failed plan
  waits `CHASE_RETRY` (20 ticks) and three failures drop the order; the army's chase remembers a failed plan for a
  second. 9v3 x 12 Commander AIs, 5 min: average tick 3.99 -> 0.37 ms, ticks over 5 ms 47% -> 0.8%. The remaining
  worst ticks (~40-90 ms) are ticks 1-2: `farmer.js` scoring hollows for every AI farmer at once (E's, see below).
  Test: hvf-sim "tick budget" (fails with the old numbers). Original: Performance: `findPath` with the default `maxNodes` 30000 walks most of a 160x160 map when the goal
  cannot be reached; the attack chase re-paths every 10 ticks. That is where the 20-60 ms worst ticks on 9v3 come
  from (average with 12 Commander seats is 0.33 ms). A lower cap for re-paths, or remembering a failed goal for a
  second, would remove the spikes. The AI already caches its own failed routes for 5 s.
- [x] (E -> H) **Decided (H, 2026-10-04): no.** `p.copies` counts the copies STANDING: a destroyed building
  decrements it, so rebuilding a lost coop costs what that coop cost (each copy you own raises the price, not each
  you ever built). `priceOf` is unchanged. Test: hvf-sim "a destroyed building no longer counts". Original: `p.copies` never goes down when a building is destroyed, so rebuilding a lost coop costs the
  next copy's price. Intended? (The AI reads `priceOf`, so either way works.)
- [x] **Done (A):** the test asserts the rule (lobby follows HvF's own playable flag). Original: (E -> A) `tests/modes.test.js` "mode hooks: hvf is registered but not playable" fails since HvF became
  playable (index.js `playable: true`, commit 7566368). The assertion needs flipping.
- [ ] (E -> lead) HvF balance notes (not tuned, owner: balance later): farmers start at 60 g and a coop pays
  0.3 g/s, so for the first two minutes there is almost nothing to hide; most downs happen in chases (the hunter
  with a Pony is faster than a farmer, and the spear reaches 8 m). In 3v1 over 40 seeds hunters win 7-27 of 40
  depending on the farmers' level; most matches end on the clock. Recruit farmers out-earn Veterans because
  building in the open has no penalty except being found.
- [ ] (H -> E) Start-of-match spike: on ticks 1-2 of a 9v3 with nine AI farmers, `farmerThink` (hollow scoring) takes
  36-42 ms in one tick. Staggering the first think per seat (e.g. `nextAt = id % reaction`) would spread it.
- [x] (H, 2026-10-04) HvF gamepad (pad-only setup + play for both roles: stick walk, aim ring, A acts / places,
  d-pad build menu, shop, skills, items), split screen (two local seats, own camera / HUD / fog per half, "no
  peeking" for mixed roles) and online (js/ui/hvf/online.js room on D's transport; D's beginMatch + lockstep +
  netclock unchanged; co-op seats) are in `js/ui/hvf/game.js`. Stream C's buildings, Chibi 2 farmer / hunter,
  army / pet creatures and baked animals are drawn via `js/view/hvf/models.js` (stand-ins only until they load).
  Specs: tests/hvf-modes.spec.js (pad only, split, two-page online same hash at tick 1200).
- [ ] (H -> D, optional) `lobbysync.js` is line-war shaped (FORMAT_SIZE 1v1-3v3, slots with race/hero), so HvF keeps
  its own small room (js/ui/hvf/online.js) and only calls `beginMatch`. If D makes lobbysync mode-aware later, HvF
  can switch to it; the packet shape is the same.


## Stream C -> H: Hunters vs Farmers art landed (2026-10-04) — interfaces.md §10.9, preview `hvf-art.html`

- [ ] (C -> H) **Models for `MODELS[kind]` in js/view/hvf/actors.js**: buildings `makeHvfBuilding(kind, { color, w, d, mask })`
  (all 16 farmer kinds + kennel, lodge, watchstone, snare, grave; `setProgress` on buildStart, `setDamage` from hp, `fire()` on
  a tower `shot`, `setReady` on the Hall); fences/walls/hedges JOIN their neighbours — use `linkMask` + `linkedPiece` (16
  shapes, instancable). Fogify `hvfMaterials()` once.
- [ ] (C -> H) **Animals**: `creaturePoses(looks.forHvf('animals', id).spec)` gives per-pose geometries for your one-InstancedMesh-
  per-species plan (walkA/walkB swap while moving, graze when idle, run on `flee`, bleat on `noise`). Live actors with the same
  clips via `looks.build()` if you'd rather animate the few near the camera.
- [ ] (C -> H) **People**: `looks.forRole('farmer'|'hunter', { color })` (Chibi 2) and `applyGhost(group, looks.ghostStyle())`
  for a downed farmer at his grave; scarecrows/crows/hound/hawk via `looks.forHvf(...)`.
- [ ] (C -> H) **Forest**: `createNatureLayer(scene, map, { KIND, groundY, material: fogify(natureMaterial()) })` can replace
  world.js's tree/rock/briar/tuft buckets (3 tree looks from `map.look`, chunked near/far, culled, `chop(cell, k)` shakes a tree
  being cut and leaves a stump + log, `syncChopped`). Adds reeds/lilies at water edges, ford stones and cliff boulders.
- [ ] (C -> H) Icons: 46 HvF icons (`hvf-unit`, `hvf-building`, `hvf-item`) in assets/icons.
- [ ] (C -> lead) NOT done: the HvF sound ids from hvf-PLAN §14 (bleat, cluck, oink, moo, bell, horn, hawk, chop, snare, ward
  pull) — they need new recipes in sfx/ (`tools/build-catalog.py` + synth methods), a separate piece of work; say if C should take it.
