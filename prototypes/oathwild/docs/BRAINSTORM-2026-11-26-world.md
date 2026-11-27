# Oathwild — building kit, map editor, bigger world (brainstorm 2026-11-26)

The owner's three requests after the combat rebuild, what each means in practice, the design, and the calls Claude
would make (he can overrule any). Written BEFORE building (owner rule from the combat round). Status: **question** ·
**planned** · **in progress** · **done**.

> "oathwild is better but:
> 1. Can the modular building system be created and synced to an experiment page so that we can review and extend it
>    there? It's a good start but could use more decorations and textures
> 2. Can we create a map editor so i can add more trees or fix bridges, possibly give you realtime access to update
>    what i see
> 3. I will eventually want a much larger map. I think we should improve our generative systems first and build a
>    workflow that makes a detailed world"

## Where things stand today

- **Houses** are built in `js/client/render/town-draw.js` from Kenney Fantasy Town wall pieces (3 m cells): four wall
  "families" (timber, stone, plaster, wood), a gable roof made from the wall rectangle, plinths on slopes, steps to
  raised doors, chimneys, shop awnings + banners, fences/hedges/stone walls, a few yard props. Where they go is
  `js/world/town.js` (pure, server + browser agree). Colours come from Kenney's one flat palette picture, repainted.
  So: right shapes, but every wall is a flat colour, few decorations, and the only way to see a house is to walk to one.
- **The map** is `data/map.json` (hand-shaped heights, rivers, roads, crossings, areas), `data/placements.json`
  (written by `tools/place-world.mjs` from its LAYOUT), towns from `data/towns.json`, trees/decor scattered by
  `js/world/scatter.js` (rebuilt the same way everywhere, never stored). Bridges: `js/world/bridge-plan.js` +
  `render/bridge-draw.js`. To change any of it today you edit JSON or code and reload — no way to point at a spot.
- **Size:** 1.2 × 0.8 km, one 2 m height grid for the whole map, drawn in tiles but all loaded at once.
- **Generators we already own:** World Forge (`worldgen/` — continents, regions, rivers, biomes, roads, weather),
  Procedural Towns (`proctown/` — plots, cultures, a second, shape-built building kit), Oathwild's own town planner
  and scatter. None of them produce an Oathwild-ready map yet; Oathwild's map was shaped by hand.

---

## 1. The building kit on its own page

| # | What it means | Design / call | Status |
|---|---|---|---|
| 1a | One copy, two users | Move the house builder out of `town-draw.js` into a new experiment **`housekit/`** (pure description → three.js pieces). Oathwild imports it by path, like Farhold imports proctown's planner, so a house tuned on the page **is** the house in the game. No second copy to drift (a test imports both and compares). *Call: a new folder, not inside `proctown/` — proctown's kit builds houses from generated boxes, this one from modular wall pieces; mixing them would make one confusing page.* | planned |
| 1b | Styles as data | Wall families, roof kinds, trims and decorations move from code constants into `housekit/data/styles.json` (one row per style: wall pieces per storey, roof, colours, which decorations it may roll and how often). Adding a style = adding a row. | planned |
| 1c | The review page | `housekit/index.html`: a 3D view with orbit camera. Left panel: style, width × depth (cells), storeys, roof, seed, shop kind, slope under it, quality (low/medium/high). Modes: **One house** (every knob), **Gallery** (every style × 3 seeds in rows), **Street** (a short street of mixed houses on a slope, the way a town strings them), **Pieces** (every single wall/roof/decoration piece labelled). Triangle + draw-call counts shown, like the other kit pages. Phone layout per game-standards. | planned |
| 1d | More decorations | Window boxes with flowers, shutters in per-house colours, hanging shop signs that say what the shop is (anvil, bottle, loaf, bed, bow…), porches with posts, balconies on upper storeys, dormer windows in big roofs, overhanging jettied upper floors (`jetty` exists in the plan, barely drawn), corner beams + cross braces on timber houses, ivy/creepers on stone, lanterns by doors, rain barrels, firewood stacks against walls, chimney pots, roof ridge tiles + finials, door frames/steps/door canopies, wall-base stone courses, thatched roofs as a roof kind, a few landmark bases (inn with a sign and a wide door, tower, smithy with an open forge front, chapel). | planned |
| 1e | Textures | Replace flat palette colours with real tiling textures: plaster (2–3 tints), stone blocks, field stone, timber, planks, roof shingles, slate, thatch, cobbles. Rule 77 (no untextured model) is already law; this lifts houses from "coloured" to "textured". **Owner answer: Codex-painted, World of Warcraft style — big wood regions, borders, panels** (chunky hand-painted planks and beams, thick wooden trims framing plaster panels, big readable stone blocks; not fine photo detail). | planned |
| 1f | Cost | One material per texture set (a texture atlas so a whole town chunk is still one draw call per set), merged per chunk as today. The page shows draw calls so we see it before the game does. | planned |

## 2. Map editor with live access

| # | What it means | Design / call | Status |
|---|---|---|---|
| 2a | Where | `prototypes/oathwild/editor/` (a page of the game, not a general experiment — it edits Oathwild's files and draws with Oathwild's renderer, so what you see is what you'll walk through). Desktop first (mouse + keyboard); phone can view and drop notes. | done |
| 2b | Views | The real game renderer with a free fly camera (WASD + mouse, Q/E up/down), plus a top-down map view (the map-preview picture, live) to jump anywhere. Toggles: show colliders, level-band areas, road/river centre lines, tree ids. | done |
| 2c | Tools | **Trees & decor:** click to place (pick species + size), drag to move, delete, a brush that adds/removes trees in an area and a forest-density brush. **Bridges:** pick a bridge → handles for both ends, deck height, width, kind (wood/stone), ramps; snap ends to the road. **Roads & rivers:** drag their control points; add/remove points. **Ground:** raise / lower / flatten / smooth brushes. **Things:** move shrines, chests, camps, NPC spots, props. **Notes:** drop a pin with a message ("this bridge floats", "more trees here"). | done |
| 2d | How edits are stored | Generated things stay generated; your edits are a layer on top, saved in `data/edits.json`: trees removed (by a stable id from their position) and trees added, ground brush strokes as a height-change layer, moved/changed items by id. Roads, rivers and bridges edit `map.json` itself (they are already hand data). The world code applies the layer the same way on server and browser, so colliders always match what is drawn (rule 22). When the generator changes, an edit whose target no longer exists is listed, never silently lost. Undo/redo and a history log. | done |
| 2e | Saving | The editor talks to the **dev** world server (8661) over a WebSocket; the server checks each edit, writes the file, and tells every open editor and every connected dev game client to redraw the changed piece without a reload. Going live stays the normal publish (`tools/go-live.sh oathwild`). *Call: edit on the VM's dev copy, never on games.radgh.com directly — a bad brush stroke on the live world would hit every player at once, and the files belong in git.* | done |
| 2f | Realtime for Claude | Same channel, from Claude's side: `tools/map-edit.mjs` sends the same edits from the command line (`tree add`, `bridge set`, `ground raise`…), and you see them appear in your open editor within a second. Claude reads your note pins (`map-edit.mjs notes`), fixes each, marks it done (it turns green on your screen). Claude sees your view through game-eye (screenshot of the editor) and a "follow" switch shows where Claude's camera is looking, as a marker. | done |
| 2g | Bridges now | Look at the bridges myself before the editor exists and fix what's clearly wrong (gaps at the ends, decks floating or sunk, rails through the road), so the editor starts from a clean state. | done |
| 2h | Owner addition: "Can we add shaders or other effects to the map editor as well" — the full look | The editor draws with the game's whole look (mist, cloud shade, colour grade, bloom, light, ambient life, water, grass), with the game's quality switch and a time-of-day/weather slider, so a spot looks the way a player sees it. | planned |
| 2i | …and effects you can place | An Effects tool: zones of ground fog, fireflies, falling leaves, dust, light shafts, marsh glow, camp embers, each with an optional light tint / colour grade / fog that blends in as you walk in; plus a per-region look panel (grade, bloom, fog, sun colour). Saved in the edits layer, drawn in the real game too, sent live, and available from Claude's command line. Starter zones: mist over the Mire, fireflies at the Druid Circle, embers at the bandit camp. | planned |

## 3. A much larger world — generators + a workflow first

The owner's order: **build the system first, the big map later.** So this round builds the pipeline and proves it by
generating a big **test** world on an experiment page; Oathwild's live map does not change until he says.

| # | What it means | Design / call | Status |
|---|---|---|---|
| 3a | The pipeline (stages, each a pure step with its own preview) | **1. Brief** — a JSON file describing the world in plain terms: size, regions with themes + level bands + biome, rivers/mountain ranges wanted, towns, dungeons, landmarks. **2. Shape** — heights, mountain ranges, valleys, rivers that run downhill to lakes/sea, coast (World Forge's noise and river code, at metre scale). **3. Regions & biomes** — region borders on ridges/rivers, biomes from height + wetness + the brief, level bands from distance to the start. **4. Places** — towns, camps, dungeons, shrines, landmarks placed by rules (flat enough, near water for towns, level band, spacing). **5. Roads** — a road network that connects the places, follows the ground (cheapest path, graded to ≤ 14%), bridges/fords where it crosses water, switchbacks on hills. **6. Detail** — towns (town planner + housekit), forests by biome, fields round towns, ruins and set pieces, decor. **7. Checks** — every place reachable on foot, every road crossing has a bridge, nothing on a road, slopes, level flow; a report with pictures. **8. Hand fixes** — the editor (item 2), whose edits survive a re-run. | planned |
| 3b | Same input, same world | Seed + brief always give the same world, so the server never stores the ground — only edits. | planned |
| 3c | Big-world engine work | A big map can't load all at once: the ground, trees and towns stream in by tile around the player (server keeps the height data; the browser loads tiles within view range), with distant tiles at lower detail and a cheap far-mountain backdrop. Needed before the big map goes in the game; this round builds and measures it on the test world. | planned |
| 3d | The workflow page | `worldbuild/` experiment page: pick a brief + seed → each stage's picture side by side (heights, rivers, regions, places, roads, final), the check report, numbers (place counts, road km, bridges, tree count), a button to open any spot in a 3D fly view. Plus a Node command that runs the same pipeline for the game (`worldbuild/tools/build.mjs brief.json → map files`). | planned |
| 3e | How big | **Owner: leave the game's map as it is for now, but plan on 4 × 4 km.** The pipeline, streaming and the test world are built and measured at 4 × 4 km. | planned |
| 3f | The two hand-made regions | **Owner: keep them and grow around them.** The brief can pin a hand-made piece (map.json + placements + towns) at a spot; the pipeline generates around it, joins rivers and roads at its edges, and may only add detail inside (trees, decor), never move its places. | planned |

## 4. Look, weather, wind and trees (owner follow-up, same day)

> "I meant shaders like visual effects like used in minecraft with mods. But keep what you added. Can we have some
> shader options to adjust the look. Can we have weather from thousand vale, it has lightning and storm effects. Can
> our tree physics bend in the wind. Can we have a modular tree system as another experiment so we can edit and refine
> trees it would be cool if you could access it realtime and change what we see instead of checking in later"

| # | What it means | Design / call | Status |
|---|---|---|---|
| 4a | Shader-pack looks, like modded Minecraft | A **Look** setting with named presets plus sliders, in the game's ☰ Settings → Graphics AND in the editor: light shafts through trees and cloud gaps, soft shadows with longer range, water with reflections + shoreline foam + ripples, waving grass and leaves, warm/cool colour grade, glow, depth blur in the distance, contact shading, sky with real clouds and sun glow, wet look in rain. Presets (call): **Classic** (today), **Vivid**, **Cinematic**, **Moody**, **Custom**. Each effect has a phone cost shown and is cut on Low. *Call: players get it too, not just the editor — it's their screen.* No washed-out picture (rule 75), no shader rebuild mid-game (rule 29): switching presets changes numbers, effects that need a different shader load once on pick, behind a short fade. | planned |
| 4b | Weather with storms and lightning | Port the weather we already built: World Forge decides what the weather is (clear, cloudy, rain, storm, fog, snow in the high north later), Farhold's weather drawing does the rain around the camera, lightning that really lights the ground for a frame, thunder delayed by distance, darker fog under a heavy sky; Thousandvale's painted sky for each day's weather. Weather is the SERVER's (everyone in a world sees the same storm), changes every in-game few hours, per region. The editor gets a weather picker to preview. | planned |
| 4c | Trees bend in the wind | ONE wind for everything (direction + strength + gusts that roll across the forest as waves): trunks bend from the base (big trees slow and heavy, birches quick), branches sway, leaves flutter, grass and the rain lean the same way, storms bend hardest. Done in the tree shader (no cost per tree on the processor). Today's trees only have a small, direction-less wobble. | planned |
| 4d | Modular tree system — its own experiment | New **`treekit/`**: trees built from parts (trunk shape, roots, branch levels, leaf clumps, bark + leaf textures, colours, age/size, wind stiffness) as data, one copy used by Oathwild (like housekit). Page: one tree with every knob, a species gallery, a forest patch in the wind, a weather switch, size next to a person (rule 74: big trees, big leaves). | planned |
| 4e | Live tree editing with Claude | The tree page connects to a small live channel (like the map editor's): Claude changes a species from the command line (`treekit/tools/tree-edit.mjs`) and the open page redraws within a second; you can pin a note on a tree ("trunk too thin") that Claude reads and answers. A saved species goes into the data file the game reads. | planned |

Order: 4d/4e/4c start when the first helper finishes (max three at once); 4a/4b start after the map editor helper,
because both touch the same look code (post effects, mist).

## Owner answers (2026-11-26)

1. Textures: Codex-painted, World of Warcraft style — big wood regions, borders, panels.
2. Size: leave the map for now, plan on 4 × 4 km.
3. The two regions: keep them, grow the world around them.

## Order of work (all three this round)

1. Bridges fix (2g) — small, quick win.
2. `housekit/` extraction + page (1a–1c, 1f), Oathwild switched to it with a same-houses check; then decorations (1d),
   then textures (1e) once Question 1 is answered.
3. Map editor (2a–2f) on the dev server, Claude's command line + notes.
4. World pipeline + `worldbuild/` page + a generated test world + tile streaming measured (3a–3d).
5. Publish: housekit + worldbuild pages on stable/Pages, Oathwild with the new houses live, What's new entry.
