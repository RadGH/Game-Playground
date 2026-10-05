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

**Steps** (each has player-facing `text`):

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
