# Professions (round 8, W9) — how it works and how to change it

Ten trades, skill 1-100 each, every character can learn all of them.

| Gathering | where | mini-game | Making | station | mini-game |
|---|---|---|---|---|---|
| Mining | ore boulders | `strike` — 3 timed strikes | Smithing | smith / armourer | `forge` — hammer while it glows, re-heat |
| Logging | marked trees | `rhythm` — left, right, on the beat | Outfitting | tailor / bowyer | `stitch` — tap as each hole passes |
| Foraging | herb, mushroom, fibre patches | `pick` — the ripe ones only | Alchemy | apothecary | `pour` — stop the pour, then the stir |
| Skinning | a beast you killed | `trace` — follow the cut line | Cooking | any fire / inn | `pour`, one stage |
| Angling | water (last round's system) | its own tug | Tempering | smith / armourer / jeweller | `gauge` — stop it in the narrowing band |

## Where things live
| What | File | Who edits it |
|---|---|---|
| Every number (skill curve, tiers, quality, yields, game timings, which NPC role teaches / is a station, tempering costs) | `data/rules/professions.json` | by hand |
| Rules (pure) | `js/rules/professions.js`, `professions-games.js` (the eight games: make + score + cheat checks), `professions-temper.js` | code |
| Materials, node kinds, tools, recipes, skins, trainers, job frames | `data/provinces/professions.json` | **made** by `tools/content-professions.mjs` — edit the tables at the top of the tool, then run it |
| Where every node stands | `data/provinces/professions-nodes.json` | made by the same tool from the current bake |
| The first-meeting quests | `data/quests/professions.json` | made by the same tool (the text is in `buildQuests`) |
| Server | `js/sim/professions.js` (hooks in province.js etc. are marked `// W9 (P-core)`) | code |
| Gold per hour | `tools/sim-professions.mjs` (also printed by `tools/sim-economy.mjs`) | — |
| Wire format | `docs/protocol.md` §25 | — |

## Things worth knowing
- **Re-run `node tools/content-professions.mjs` after any zone re-bake or gear-catalog change.** `tests/P/core-content.test.js` fails while the made files are stale.
- **Nodes are per player.** One room object for everyone; "spent" is `char.opened['node:<id>']` (the table the per-character chests already use, so it is saved and sent on join).
- **No client can fake a result.** The server hands out a seeded pattern, gets back raw input times, checks they could have been played in the time that really passed, and scores them itself.
- **Prices** are the `RAW_PRICE` table in the tool (one raw piece, by tier). A refined good sells for its inputs x 1.15. The rule — an hour of gathering, or of
  gather-then-refine, earns 70-100% of an hour of questing — is pinned by `tests/P/core-content.test.js`; move a price and run `node tools/sim-economy.mjs` to see the table.
- **Crafted gear** goes through stream C's own item maker (`rules.makeItem`): item level = min(your level - 1, the material tier's top level); rarity normal / magic / rare
  from how well you played and how far your skill is past the recipe. A same-level dungeon rare is always at least as good (a test samples it).
- **Tempering** (ideas from Farhold's upgrade bench, none of its code): quality one step up (capped by skill: high at 25, elite at 60, exotic at 90), promote
  plain -> uncommon -> rare with a new property, reweave one property, brand a weapon with an element. A missed gauge costs the materials and the fee; the item is never changed.
- **Adding a province / higher zones:** tiers 4 and 5 are already in the data (skill 75 / 90, level bands 28-40 / 38-50); `tierMix()` in the tool decides which tiers a zone gets from its level band.
