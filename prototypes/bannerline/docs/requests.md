# Bannerline — cross-stream requests

Append only. Format: `- [ ] (from X -> to Y) request — status/answer`. The owner ticks the box and
writes where it landed.

## Stream A (sim) — notes and requests to others

- [x] (A -> B) FYI: the sim API, commands, events and state are in `docs/interfaces.md`. Additions
  since the first draft: command `upgrade {slot?}` (gear steps, the M1 gold sink — B already uses it),
  events `gear`, `champion`, `revive`, status id `taunt`, `player.gear`, `query.gearInfo`,
  `GEAR_SLOTS` / `GEAR_STEPS`.
- [ ] (A -> lead) add `prototypes/bannerline/tests/*.test.js` to the playground `npm run test:unit`
  list in `package.json` (A does not own it). They run in about 7 s.
- [ ] (A -> B) the sim rejects commands for AI slots (event `reject`, reason `bad`); a local seat
  should only ever send its own `p`.

## Stream C (art) — notes and requests

- [ ] (C -> B) Real bodies: `createBodyFactory(looks)` in `js/view/unit-looks.js` gives the
  `makeBody` your `createActors` takes; call `await bodies.preload()` before the match so heights are
  right on the first frame (actors.js reads `body.height` once). Usage in `docs/interfaces.md` §10.1.
  Note `play(act, t)` advances the animation clock from `t`, so call it every frame (you already do).
- [ ] (C -> B) Portrait: `createPortrait({ gfx, slot: bar.portraitSlot, looks })` + `bar.onSelect(id =>
  portrait.showEnt(ent))` + `portrait.react('hit')` on `damage` events to the selected entity. §10.2.
- [ ] (C -> B) Icons for the command card / shop / deck: `createIconLibrary()` → `icons.url(kind, id)`;
  71 baked PNGs in `assets/icons/`. §10.3.
- [ ] (C -> B) Camera note from the bench: at the middle zoom (50 m, pitch 56°) a Chibi 2 unit at
  scale 1.6 reads mostly as the top of its head. Consider pitch ~48–50° or a closer middle zoom; the
  icons and portrait carry the faces either way.
- [x] (C -> all) FYI file ownership C added beyond PLAN §21: `data/looks.json` (art only, the sim never
  reads it), `js/view/unit-looks.js`, `js/bench/bench.js`, `js/tools/icons-page.js`, `css/bench.css`,
  `css/icons.css`, `assets/icons/catalog.json`, `docs/bench/`.
- [x] (C -> lead) Farhold now imports `compactCreature` from `avatar-3d/js/mesh-merge.js`
  (`prototypes/farhold/js/actors.js` one import line; `farhold/js/mesh-merge.js` re-exports). Farhold
  node tests green.
- [ ] (A -> B) M4 sim side is in (see interfaces.md): commands `upgrade` (now real items; same slot
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
- [ ] (B -> A) The send panel reads `query.roster()` and groups by `tier`, so 12 units per race appear
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

- [ ] (A -> B) Stocks and tier locks are gone: drop the stock pips / restock timers / unlock
  countdowns from the send panel; `sendInfo` lost `stock/max/restockIn/unlocked/unlockIn` and gained
  `role, roleText, paybackSeconds, traitsText, counters, vsRival` (interfaces.md §7). `roster()` is
  the Muster Hall list (12 per race). `clock()` lost `unlocked/nextUnlock`; the `unlock` event is gone.
- [ ] (A -> B) Gate queue: `teamInfo().waiting` / `gateQueue(state, field)` = "+N waiting" for the HUD.
- [ ] (A -> B) Sends fire repeatedly on a held / mashed key: no client-side cooldown, please.
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
- [ ] (B -> A) R2.10/R2.11: the lobby's first screen lists modes. B reads `data/modes.json` (or a `MODES`
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
- [ ] (I -> B) UI contract in interfaces.md §11: buildings (`query.buildingsInfo`), Outfitter (`shopInfo`, `itemCard`,
  `inventoryInfo`), Drill Yard (`upgradesInfo`), Sanctum (`powersInfo`, `powerTargetCheck` for the cast cursor).
  Shop needs the hero in range (`reason: 'notAtShop'`); the other three work from anywhere. Every item / upgrade /
  power row has `name`, `desc`, `stats` (lines) for tooltips. The B/G "buy cheapest" button has no command any more.
  Call sites that now break at runtime and need the new contract: `js/ui/controlbar.js` (Q.gearInfo, `potion`,
  `upgrade`, `drink`, `me.belt`), `js/ui/shop.js` (whole Armory panel: gearInfo / upgrade / potion / oil),
  `js/input/commands.js` (`drink` on belt1/belt2 -> `use {slot}`; the `upgrade` binding; `oil`), `js/main.js`
  (`oil` event + case). Inventory hotkeys 1-6 -> `use {slot}` is the natural mapping.
- [ ] (I -> C) Building models: Outfitter, Barracks, Drill Yard, Sanctum (data/buildings.json `size`, `door`).

## Stream A round-2 notes (2026-10-03)

- [ ] (A -> B) Removed from the core: commands `deck`, `auto`, `muster`; queries `deckInfo`, `musterInfo`;
  player fields `deck`, `auto`, `muster`; events `muster`. Z X C V and the Muster button need removing
  (owner R2.1/R2.9). `rivalInfo` lost `deck`.
- [ ] (A -> B) Mode framework (R2.10): `createSim({ mode: 'linewar', format: '1v1', ... })`; the old
  `mode: '1v1'` still works. Lobby first screen: `modeList(data)` from js/sim/modes/index.js (R2.11).
  `state.game` / `state.format` are the new names; `state.mode` stays as the format for now.
- [ ] (A -> B) Knockback is a slide now (R2.5): the `knock` event carries `vx, vz, metres` (no from/to);
  positions move every tick, so normal interpolation draws it.
- [ ] (A -> B/C) New hero `engineer` (R2.8) and the Druid's Wolf form (R2.7, skill `wolf_shape` on E;
  form body `{ creature: 'wolf' }`): hero look, skill icons, turret look (`kind: 'turret'`, type
  `bolt_turret`, radius 0.7). heroInfo has `turrets` and `form`.
- [x] (A -> I) Drilled Muster is now **Drilled Ranks** (`races.json traits.drilled_ranks.upgradeCost`
  0.7); A added a 3-line hook in upgrades.js `upgradeCost` that applies it (commented "stream A").
  economy.js `buyPotion`, the `oil` read in combat.js, `econ.muster`, `econ.items.oil` are removed.
- [ ] (A -> B) R2.9 leftovers in B's files: `data/bindings.json` actions `muster` / `musterHall` (+ its _doc).
- [ ] (A -> C) R2.9 leftover in C's `data/identity.json` _doc ("Muster Halls").
