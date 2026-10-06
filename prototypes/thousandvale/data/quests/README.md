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
