# Lanternfall

A side-scrolling pixel action RPG in a drowned chasm-city, **Vessmere**. It has falling-sand physics (every cell
is simulated: water, wax, oil, fire, steam, sand, rubble), spells you build from parts, and six acts going *down*
through the city. Each act ends by relighting one of its Great Lamps. It is a playground prototype: plain ES
modules with no build step, rendered with WebGL2.

- **Play (stable):** `http://<LAN-IP>:8400/prototypes/lanternfall/`
- **Design docs:** `docs/00-OVERVIEW.md` is the canon (v2). Pages `01`–`10` hold the detail, `REVIEW.md` §d is the 39-milestone plan, and **`docs/HANDOFF.md` lists what is built, what is a stand-in, and what is left.**
- **Owner:** Radley Sustaire (independent). Sandbox.

## What it tests
- A falling-sand world (9 bytes a cell, 64×64 chunks, dirty rects, a simulation window) that stays under budget on a laptop. The sim averages 1.55 ms a frame; see `research/perf-log.md`.
- Spells as data. A **wick** is a Flame + a Shape + Charms (+ a Knot), compiled to a plan that the cell world reacts to. Ember boils water, Rime freezes it, Spark shocks wet cells, and so on.
- Rooms as data. ASCII block maps + ops + things + wires (`docs/10` §6). Six **room kits** generate the same JSON from a seed, and a **reachability bot** (`tools/room-check.mjs`) fails any room with an exit you cannot reach.
- One campaign flow: title → class → Guild Hall → act map → lamp-posts (rest/save) → boss → Great Lamp → next act → ending.

## How to run things
| What | Command (from `~/claude/playground`) |
|---|---|
| Unit tests (Lanternfall only) | `node --test prototypes/lanternfall/tests/unit/*.test.js` |
| Browser e2e (dev server on 8401) | `npx playwright test prototypes/lanternfall/tests/e2e/` |
| Whole-campaign walk (title → ending, every room) | `cd prototypes/lanternfall/dev && node flow.mjs` |
| Check a hand-made room / all rooms | `node prototypes/lanternfall/tools/room-check.mjs a1_n01_r0` / `--all` |
| Check every kit × act × seed | `node prototypes/lanternfall/tools/kit-check.mjs` |
| Cell-sim benchmark | `node prototypes/lanternfall/tools/bench.mjs` |
| Screenshot a room | `cd prototypes/lanternfall/dev && node shot.mjs "index.html?room=a1_n08_r1" out.png` |

**Dev URL parameters:** `?room=<id>` jumps straight into a room with a test hero that has 4 wicks and every mechanic.
Add `&spawn=wax_mite,dripling` to spawn monsters, `&dummies` for training dummies, and `&bench` for the perf recorder.
`window.lanternfall` exposes `game`, `step(n)`, `newGame(opts)`, `loadSlot(n)`, `takeExit(x)`, `interact(T)`, `save()`, `ctx` and `router`.

## Layout
```
js/core      tick order, state (rooms in/out), input + bindings, loop, rng, bus, data loader
js/world     cell grid + sim (cellsim, liquids, thermal, support/fragments), rooms (roomload), kits, reach bot,
             light grid, currents/floodlines, rain, decor
js/entities  player movement, actors, things (18 interactables, 10 traps, wiring), pickups, build mode (plank kit)
js/spells    wick compiler, casting, spell instances
js/ai        monster brain (one state machine, senses on the light grid, attack tokens, telegraphs), bosses
js/rpg       hero (levels, soft caps, derived stats), damage/status/void zones, melee, items/loot/shops, skill boards
js/modes     act maps (node graph, @next/@prev/@in exits, stand-in rooms), campaign (lamp-posts, death purse,
             Rekindle, Great Lamps, node gifts)
js/render    WebGL2 renderer (cells, lights, reflections, bloom, HUD pass), camera, sprites, 5×7 font
js/ui        HUD + every menu screen (title, class select, character, inventory, wick builder, test chamber,
             ledger, journal, map + minimap, shop, dialogue, pause, settings, death)
js/talk      Lingo bridge + barks; js/audio: sfx bridge (sfx/), voice bridge (voice-lab formant), score
data/        every tunable as JSON (manifest.json lists the files)
rooms/       hand-made rooms (index.json lists the ones the game may load)
```

## Stand-in rooms (important for whoever continues)
Every act node lists its rooms as **A** (hand-made) or **K** (kit). A hand-made room that is not in
`rooms/index.json` is **generated** by `standInRoom()` in `js/modes/actmap.js` and dressed for its node type:
- **hub:** a lamp-post, the act's shops and people
- **boss:** a quiet antechamber, then an arena with the act's boss and Great Lamp
- **flood:** a flooded hall
- **secret:** a rare chest

Each generated room carries `standIn: true`. That is why the whole campaign can be played end to end today. To
replace a stand-in, author `rooms/act<N>/<room id>.json`, add it to `rooms/index.json` and run `room-check`.

## What worked / what didn't
- **Worked:** the reach bot as an error, not a warning. It caught unreachable upper exits in 3 of 6 kits on day one. Prefab state persists across saves while raw cells don't, which keeps saves under 64 KB. And a boss framework that any act's boss plugs into.
- **Didn't (yet):** only Mother Tallow has her own boss script. The other five bosses borrow her script, scaled to their act and renamed; see `docs/HANDOFF.md`. 26 of the 30 monsters simplify some of their documented attacks; each simplification is noted in a `_note` field in `data/enemies.json`.
