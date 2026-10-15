# Quests (stream E)

One file per zone (`<zone>.json`). M1: `test.json`, the 12 quests of the Torbor Fields around
Torborhold. M2: one file for each of the other 15 zones of Torbor Downs, plus `province.json` (the
10-step story chain across 10 zones, ending at the world boss), `jobs.json` (radiant job frames),
`treasure.json` (a hidden treasure chain starting in every zone). Story quests carry `story: n`. Short, funny, and each one walks you somewhere you have not been.

```json
{ "zone": "test",
  "npcs": { "<npcId>": { "name", "role", "at": "<settlement name | vignette id>", "greeting" } },
  "quests": [ { "id", "name", "level", "giver": "<npcId>", "group"?, "startsFrom"?: {vignette, object},
                "offer", "steps": [ … ], "done", "reward": { "xp", "gold", "item"?: { "tier", "slot" } }, "next"? } ] }
```

**Steps** (each has player-facing `text` — an objective, verb first — and `where` — a location hint for the tracker,
journal and map; P17):

| kind | Fields | Done when |
|---|---|---|
| `kill` | `type`, `count`, `where` | you (or your party, shared credit) kill `count` of that type |
| `killOne` | `encounter`, `credit`? | that scripted elite/rare/boss dies with your credit (`credit: 'event'` = event enrolment counts) |
| `killRare` | `zone`, `slot` (0 \| 1) | that zone's rare in that slot dies with your credit (the id is resolved from `data/provinces/rares.json`, so quests do not hard-code rare ids) |
| `collect` | `item`, `count`, `from`, `chance` | quest item drops from `from` at `chance` per kill (personal, quest-only, not tradeable) |
| `visit` | `vignette` \| `site` | you walk into it (`site` = a bake site name or an encounter id = its event site) |
| `use` | `vignette`, `object` | you use that vignette object |
| `talk` / `deliver` | `npc` (+ `item`) | you talk to / hand the item to that NPC |
| `clear` | `dungeon: 'door'`, `floor`? / `boss`? | you reach that floor / kill the boss of the zone's dungeon |

**Rewards** are not fixed numbers: `xp` is a share of the XP for the quest's level, `gold` a multiple of
one kill's gold at that level, so they track Farhold's curve (PLAN §6.5); `item.tier` rolls at the
player's level. Nothing here locks a place (PLAN §0.2 "go anywhere").

Tests: `tests/E/content.test.js` resolves every giver, type, encounter, vignette, NPC and chain link,
and checks every wilds monster family has a quest.

## Events (`events.json`) — the event director (PLAN §5.2)

`director`: one realm event at a time, announced 10 minutes ahead (reminders at 5 and 1), waystone travel to it free
while it runs, sized by the players who enrol (health per player, an extra add per N players). `realm[]`: the big
events — **Grimtallow** (`world_grimtallow`, the province world boss) on a fixed schedule (every 3 h at :30, plus on
demand when 12+ in band are online), a raider attack on Torborhold (the first-hour scene, public), a warband siege of
Halsbridge, a drake flyover across four zones. `zone[]`: one event per zone, run on its own in every zone copy at stream
B's arena `event_<zone>` (Torbor Fields: `event_grandmother_skein`): two waves from the zone's camp mix, then a boss
(an encounter script id). Everyone within `autoEnrolMetres` joins a temporary event group.

### Event info (play-test 5 T12) — `info` on EVERY event

Every `realm[]` and `zone[]` record here, and every chest / deliver / escort / rescue variant in
`data/provinces/road-events.json` (plus `coded.ambush`, the one kind the server starts from code), carries:

```json
"info": { "name": "The Stone in the Snow",
          "what": "An avalanche above the pass has uncovered something chained in the snow.",
          "objective": { "kind": "waves_boss", "text": "Clear the three waves from the slope, then defeat the Chained Saint", "count": 4, "unit": "stages" },
          "durationSec": 600,
          "onSuccess": "The thing in the snow lies still, and the pass is quiet.",
          "onFail": "The snow slides again and buries it all, for now.",
          "rewardText": "A rare item or better for everyone who takes part, gold and a good share of experience" }
```

`what` is exactly one sentence. `objective.count` is what the server counts (`stages` = every wave + the boss; 1 chest;
1 delivery; 1 arrival; a rescue's 2 steps). `durationSec` is the hard limit — at 0 the event fails with `onFail`.
Road-event text uses the record's own slots (`{name}` `{town}` `{npc}` `{guards}`).
**Never edit `info` by hand.** The words live in `tools/content-events.mjs` (`TEXT`, keyed by event id); the numbers and
`rewardText` are derived from the record. After adding or changing an event: `node tools/content-events.mjs` (it exits 1
when an event has no words). `tests/E/playtest5-events.test.js` fails when any event lacks a field or the files are stale.

## Radiant jobs (`jobs.json`)

Frames fill slots from what exists in the zone copy: `monster`, `vignette`, `settlement`, `fort`, **`farm`** (with
`from: 'farm.pests'`), **`cave`**, `rare`, `dungeon` — all from the zone's placement file (data/vignettes/placements/).

## Where things are

Quest NPCs, quest vignettes and treasure steps get coordinates in `data/vignettes/placements/<world zone>.json`
(`tools/place-vignettes.mjs`). A quest NPC whose `at` is a settlement name stands near that town's square; the names
are the sheet's, imposed on stream B's settlements via `data/provinces/torbor_downs-places.json`.

## Map marks (`marks/torbor_downs.json`)

Made by `tools/place-vignettes.mjs` (P17): per story quest, `giver` and `steps[i]` = `{ zone, x, z, r }` in WORLD metres
(an area for kill/collect steps: the nearest camp of that type to the giver). `missing` lists steps with no fixed place
(kept empty by tests/E/living.test.js). Events (`events.json`) carry `blurb` (what happens), `where` (generated words:
"Delvers' Hill: in the woods, about 200 m north of Ashhaven") and `map: [{zone, x, z}]`; a zone event's level is capped at
the level ramp + 2 (`levelAuthored` keeps the written number).

## Play-test 2 (2026-10-05): the starting chain, class quests, set-piece quests

Three part files that `test.json` pulls in with `include` (stream A's js/sim/content.js and tools/content-lib.mjs merge them):
- **`start.json`** (Q27) — "The South Road", the one chain every new character gets. `start_two_good_legs` has `auto: true` (in the
  log from the first login). Elder Maud -> the south road -> Marra at the Pail and Plough (set piece `sp_pail_and_plough`, on
  the Torborhold-Orrinsford road) -> two branches at once, either order: **A** `start_road_to_orrinsford` (brigands on the road,
  the letter to Prior Wendel in Orrinsford, the next town) -> `start_the_priors_favour` (Saint Hulda's Yard); **B**
  `start_signs_of_the_beast` (Greyfletch Camp) -> `start_old_gristle` (the mini boss, `mb_old_gristle`, level 4, at Gristle's
  Hollow). `start_home_with_news` **`requires`** both ends, then leads on to the province story (`next: toll_at_fitockpi`).
  Levels 1 -> 4 over ~1.7 km; the chain's purses (~550 g) buy the first horse three times over.
- **`classes.json`** (Q28) — one quest per class (`classes: [id]`), levels 2-4, from 12 trainers (`role: 'trainer'`, `trains: [classes]`): four
  keep a house in Torborhold (`office`), eight stand at set pieces. Rewards: a named rare (`item: {tier: 'rare', slot, base,
  name}`) plus `unlock: 'companion'` (the 13 companion classes: the companion comes now, not at 10) or `perks: 1` (the other
  17: one extra perk-forest point). `rewardText` = one line for the window.
- **`setpieces.json`** (Q18) — 16 quests from 12 NPCs who live at the set pieces (data/vignettes/setpieces.json).

New fields: zone file `include`; quest `auto`, `classes` (A also reads `cls`), **`requires: [ids]`** (offered only when every one is done), `rewardText`;
reward `unlock` / `perks` / `item.base` + `item.name`. Tests: `tests/E/playtest2.test.js`.

## Hunting areas (play-test 4 S14)
Kill / collect steps point at where their monster really spawns: `js/sim/hunts.js` groups the server's camps per type into
areas and `js/sim/quests.js` sets each step's marker + `areas` from them at load. After `tools/place-vignettes.mjs`, run
`node tools/content-hunts.mjs`: it tops up thin quest areas (`data/vignettes/placements/<zone>.quest.json`), writes
`marks/torbor_downs-hunts.json` and re-points `marks/torbor_downs.json` (tests/E/playtest4-hunts.test.js fails until it is run).

**Round 11 (owner #30 / #35 / #31).** A step's circle holds `needFor(count) = max(count + 4, 2 x count)` of its monster (two
players at once; tools/content-hunts.mjs, several passes, copies spread 12-24 m apart, pairs only near the start town) and
quest camps respawn in 1-1.5 minutes. A `collect` step may carry `near` like a `kill` step. Every class quest keeps each
step within 150 m of the one before (tests/E/round11-world.test.js). After editing steps by hand: set the quest's mark
steps to null, run content-hunts, then `node tools/fill-quest-marks.mjs [--province=<id>]`.

## Play-test 5 (2026-10-06): crates, angling quests, roadside champions

**Crates (T9).** `reward.crates: [{ slot, min }]` — a gear crate per entry: a random item of that slot (`weapon` / `offhand` = something your class
uses; `head` `chest` `legs` `hands` `feet` `ring` `neck`; `armor` = any armour slot; `any`) at `min` rarity or better (`common` `uncommon` `rare` `epic`),
rolled at the opener's level. Written by `node tools/content-crates.mjs` (safe to re-run; `--check` for tests): the start chain by hand (nine
different slots over its seven quests), every quest of the Torbor Fields and the set pieces (slots dealt in turn), every class quest (an armour crate
beside its named rare), the first two quests of every other zone (weapon + armour, uncommon). A loose random `reward.item` on those quests became the
crate; a NAMED `item` (base + name) stays. 97 crates on 19 files. Tests: `tests/E/playtest5-crates.test.js`.

**Angling quests (T25)** — `angling.json`, a part of zone `test` (in `test.json` `include`). Tam Sedgeley (`angler_torborhold`) stands on the river
bank by Torborhold; four quests: `angle_first_cast` (the rod, the first pool, three catches) -> `angle_supper` (cook one) -> `angle_silver_lining`
(three Silver Perch) -> `angle_the_patient` (an uncommon fish; points at the zone's legend). New fields: quest `grant: [{good, count}]` (goods handed
over on accept), `reward.goods: [{id, count}]`, step kinds `catch {count, pool?, fish?, rarity?}` and `cook {count, meal?}`, `startPool: true` on a
visit step (tools/content-pools.mjs writes its `at`). The anglers of the other 15 towns are `npcs` of their zone's file with `placedBy:
'content-pools'` — the placer skips them, `tools/content-hunts.mjs` writes them (and the angling quests' map marks). `jobs.json` has five angler frames
(slot type `fish`, `goal.kind: 'catch'`, `giverRole: 'angler'`). The fish, meals, rods, legends and angler names live in
`data/provinces/angling.json`; the pools in `data/provinces/angling-pools.json` (see data/provinces/README.md).

**Roadside champions (T10).** `tools/content-hunts.mjs` step 1b adds fixed champions to `<zone>.quest.json`: a copy of an ordinary roadside camp,
one body, `rank: 'champion'`, one named modifier (`affixes`), back in 4-8 minutes; one every ~600 m along the start chain's own walk first, then
260 m apart beside the routes, never under level 2 or within 60 m of a town. 62 in the province, 9 in the Torbor Fields. `node
tools/content-rares.mjs` prints what a newcomer's first half hour meets (before this round: 0.9 special monsters; 5.9 with the placed champions alone; 22.5 with stream C's new roll, 0.14 / 0.06 from level 2).

**Order of the tools after a re-placement:** `place-vignettes.mjs` -> `content-pools.mjs` -> `content-hunts.mjs`; `content-crates.mjs`,
`content-events.mjs` and `content-gear.mjs` only touch their own fields and can run at any time. NOTE (2026-10-06): a full `place-vignettes.mjs` run
no longer reproduces the committed placement files (every zone moves — the vignette recipes were edited this round and B's wall bake came after the last
placement), so it needs B's confirming re-bake after it. This round did NOT re-place: pools, anglers and champions all go into `.quest.json`, which
B's bake never reads.

## Owner feedback 8 (2026-10-08)

- **Quest givers (W12)** — `marks/givers.json` (made by `tools/content-givers.mjs`): per quest NPC `gives`, `takes`, `mustTake` (`needsGiver`), `talks`, `jobs`, `titled`. The server decides the ! / ? per player from it.
- **`titled`** on every `npcs` entry (W27): written by the same tool; do not set it by hand.
- **Ox carts (W5)** — every carter is an NPC of its zone file (`role: 'carter'`, `cart: <stop id>`, `placedBy: 'content-towns'`). New step kind `ride` `{ from?, to }` (stop ids of data/provinces/carts.json), quest `tip` (a how-to paragraph), good `cart_token`. `start.json` `start_wheels_for_hire` teaches it (a side step from the carter outside Orrinsford).
- **Events (W1, W24)** — `director.newcomer`, `director.raid`, `director.chest`; `startOn.clearOfNewcomersM` and `raid.gates` are written by `tools/content-towns.mjs` (not by hand).
- **Experience (W4)** — a hand-in pays `reward.xp` x the level span x stream C's `questMult` x `data/provinces/economy.json` `quest.xpMult` (1.5). `node tools/sim-economy.mjs --curve`.

## Vharlen (Expansion 1, stream C)

Nine zone files (`blackstrand`, `steamwood`, `sulphur_bight`, `fumarole_fen`, `glasswind_strand`, `pumice_wastes`, `ashfall_hollow`, `kiln_ridge`,
`the_caldera`), 6 quests and 3 givers each, levels inside the zone band; every zone has a dungeon quest and a rare quest, most an elite or zone-event
quest. No vignette steps (Vharlen has none). `vharlen-province.json` is the island's story index in province.json's shape — "The Burning Isle", 5
steps from Port Vharl to the Caldera, ending at Ossathra (`world_ossathra`, a realm event in events.json). The content tools skip any
`<province>-province.json` when they list zone files. Events: `event_<zone>` for each island zone and `world_ossathra` in events.json carry their words
on the record (`words`), tools/content-events.mjs --province=vharlen builds `info`.
