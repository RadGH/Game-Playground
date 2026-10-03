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
  the Keep at field-local x = +15, z = 126 (mirror of the Armory). B draws a placeholder in
  `js/view/terrain.js` (`musterHall()`); please export `buildMusterHall({ team }) -> THREE.Object3D`
  from `js/view/structures.js` (about 7 m wide x 5 m deep, entrance facing −z toward the field, a
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
| 8 | **Gate preview** — the defender sees the wave 10 s ahead (§3.1, §17) | Now only covers the 0.5 s window. **Flag:** keep the icons as an "incoming" flash, or drop it |
| 9 | **Engage limit**: at most 6 units fight one hero, the rest walk past (stream A, from the econ model) | **Flag (recommend keep):** without it one hero body-blocks an entire field and nothing ever leaks; the old maps behaved the same way (creeps walk past a busy hero) |
| 10 | **Item step time locks** (Plain 0:00 … Legendary 21:00, §7.2) | **Flag (recommend remove):** same reasoning as #3: gold already gates a 4,500 g item. Not a send limit, so left as is until the owner says |
| 11 | **Requisition delay** 4 s when buying away from the Armory, lost on death (§3.1, §7.1) | **Flag (recommend keep or cut to 2 s):** it lets you shop from the field at all; the old maps made you walk to the shop |
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
