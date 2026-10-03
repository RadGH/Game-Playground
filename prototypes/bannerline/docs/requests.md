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
