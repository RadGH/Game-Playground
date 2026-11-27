# Oathwild

**Status:** 2026-11-27 gear round, published: gear upgrades like D2 (`js/rules/gear-power.js`: item level grows the base, rarity adds enhanced damage / armour, tier words, plate from item level 4, the hero's level no longer grows the weapon; plan `docs/BRAINSTORM-2026-11-27-gear.md`) and owner reports #139-145 (Take button, arena chests per hero, skills bubble, spear model, arena wall z-fighting). Before that the 2026-11-26 evening round: arena mode, weather + Look, swing trails, a fairer start, camera tuner, lag reports. Focus (owner): camera, combat, levelling.
**Play:** https://games.radgh.com/oathwild/ · LAN dev http://192.168.1.34:8401/prototypes/oathwild/ (start the world server first: `tools/game-servers.sh start oathwild-dev`; https for controllers: https://192.168.1.34:8441/prototypes/oathwild/). Stable 8400/8442 pairs with the `oathwild` unit (8660/8662) after publish-stable.
**Next:** the owner tunes the camera (☰ → Tune camera → Send to Claude) and sends a lag report when it stutters — Claude applies the camera numbers as defaults and fixes the stalls the report names; the parked swing trails (two-handed, spear, halberd, fists: trails drifted ~1 m after a weapon change in the test — find out whether it's the test or real); a new-player bot in the sim so balance is judged against a person; Rogue/Bard weak against three and in champion bouts, Mage/Rogue run out the clock at level 10; arena stone reads as brickwork, the crowd is simple; one shader still built mid-fight on the first mace hit (rule 29); real-phone frame rate with weather + Look + ×3 spell effects; the world builder's 4 km map is ready when the owner wants a bigger world (worldbuild README "Adopting it in Oathwild").
**Parked:** Smithing / Alchemy benches and the Tinker class (later round); Chronomancer, Oracle, Dragon Knight, Starcaller; charm/turn spells; Farhold's resource / afterimage / "consumes" spell rules; playing offline without the world server; chat box (the server relays chat, no UI yet); **placeholder art to replace later: `docs/PLACEHOLDERS.md`** (props, 8 monsters, horse, items — about $23 of models when there is budget).

## Arena (2026-11-26 — owner: "a new hosting option for waves mode … a massive arena … other heroes … somewhat like oblivion")

Brainstorm + owner answers: `docs/BRAINSTORM-2026-11-27-arena-camera.md` §2; rulings in PLAN §0 "Focus + arena".
**How to play:** world list → **New arena** (or join one by its code) → you stand in the **Arena Court** by the shrine
→ walk to the **Bracket Board** by the gate (or talk to the Arena Master) → pick a bracket → **Start**: everyone in the
arena walks onto the sand → five waves come out of four gates (the panel on the right says wave x/5, enemies left, the
breather's count-down and which gate the next pack comes from; gold arrows at the screen's edge point at that gate and at
enemies you cannot see) → win: a **reward chest** per hero waits by the board in the court. Between matches: the smith
(gear round YOUR level, repair), the provisioner, the class trainer (classes, paid respec — the shrine is beside him),
level-up windows. The board's **Champions** tab: ten made-up heroes, rank 10 Garran Ashcroft to rank 1 Aldis Merrow, the
Grand Champion; each opens after a bracket and the rank before; beat one for their unique item, a title shown with your
name (switch or hide it there) and the next rank.

| Part | What it is |
|---|---|
| `data/arena.json` | Brackets, the wave table, party scaling, rewards, champions (class plans, gear, hp/dmg, dodge, titles, lines) and their uniques; `_goal` = the tuning goal |
| `data/arena/*.json` + `js/world/arena-place.js` | The place: its own small map (terrain, woods of big trees, the court as a town planned by the town planner); the arena's walls, gates, seats, torches, banners and balcony laid out once — the walls are solid boxes `js/game/ground.js` reads (placements.boxes), so the server walks the drawn walls |
| `js/rules/arena.js` | Pure: brackets + board marks, rosters, `wavePlan`, `arenaScale` (the ONE party-size multiplier), `rewardShare`, `makeUnique`, champions, the hero's `char.arena` record (clears, firsts, beaten, titles, title) |
| `js/rules/arena-match.js` | Pure: one match on the combat sim (gather → waves / bout → breathers → won / lost); the SAME code in the server and the sim |
| `js/rules/hero-ai.js` | A hero played by the computer — the test bot grown up (tests/rules/bot.mjs now re-exports it): champions use `championInput` (a red mark before every big ability, rolls out of heroes' bolts and zones) |
| `server/arena.js` | The arena mode of a world room (hooks in server/world.js marked `arena`): board, ladder, start, match messages, reward chests (kept in the world save until opened), titles; dev `devArena` clears what is out |
| `js/client/place.js` | The page swaps the drawn place (world ↔ arena) when you enter, with the same refill the map editor uses |
| `js/client/render/arena-draw.js` | The arena drawn from the layout with the House Kit's painted atlas: podium wall, ten tiers, outer wall with buttresses and battlements, the Heroes' Gate passage, monster gates whose portcullises rise as a pack comes out, the champions' balcony, torches, swaying banners, a cheering crowd (instanced; 140 / 320 / 520 people by quality), painted sand |
| `js/client/arena-ui.js`, `ui/win-arena.js`, `ui/win-arena-chest.js`, `css/arena.css` | The match panel, edge markers, banners; the board (Brackets / Champions tabs); the reward chest (full item cards inline) |

**Balance** (`node prototypes/oathwild/tools/sim-arena.mjs`, 8 runs a row = one per base class, hero at the bracket's
LOW level, plain kit to level 3; 2026-11-26): alone at the new-player bar (rolls out of 25% of tells) brackets are won
50-100% (Novice 100%, Steel and Master 50%), at the average bar 63-100%; a party of three 88-100%; a match takes 3-4 min
alone, 5-6 with three. Champion bouts at the champion's level: 63-100% won at both bars, 17-42 s of fighting; the Bard
loses most bouts and the Rogue the boss waves (both already weak in tools/sim-fights.mjs). Tests:
`tests/rules/arena.test.mjs` (tables, scaling knob, rewards, uniques, champions, record, a short balance pin),
`tests/net/arena.test.mjs` (through the real hub: New arena, five waves, chest → bag, losing, a champion bout → unique +
title, save / reload of the record and an unopened chest, the same hero in the open world), `tests/ui/arena-shots.mjs
[--phone]` (the player's path in a real browser), walk.mjs lines `worlds-new-arena`, `arena-board`, `arena-ladder`,
`arena-chest`, `arena-hud`.

## Lag reports (2026-11-26)

Owner: "severe stalls/lag on desktop … How can we capture that info to investigate?" The lag recorder
(`js/client/lagmeter.js`) runs all the time in the world: the last two minutes of frame times and every stall (a frame
of 50 ms or more) with what was going on in it — the game's own work vs drawing, new shader programs compiled, new
models/pictures uploaded, the memory change (a big drop = a browser clean-up pause), draw calls and triangles, the spot
on the map, the graphics setting, and on Chrome the scripts that ran long. **☰ → Send a lag report** (`ui/win-lag.js`)
shows a frame graph + numbers and sends the whole record (kind `lag`, about 40 KB) to the report box; every bug report
also carries the short summary. Reading them: the admin page's Reports tab, or on the droplet
`ssh rgs` then `sudo -u postgres psql rgs -c "SELECT id, at, text, detail->'lag'->'summary' FROM playground.reports WHERE game='oathwild' AND kind='lag' ORDER BY at DESC LIMIT 5"`
(the full stall list is `detail->'lag'->'stalls'`). Browser check: `tests/ui/lag-check.mjs [--phone]`.

## Tools for building the world (2026-11-26 round)

All on the VM (dev copy, port 8401 — `http://192.168.1.34:8401/…`); stable copies on 8400 after publish. Also linked
from the Oathwild card on the playground home page (`http://192.168.1.34:8400/`).

| Tool | Where | What it's for |
|---|---|---|
| Map editor | `prototypes/oathwild/editor/` | Fly over the real world; place/move trees, fix bridges, roads, rivers, ground; effect zones and region looks; weather preview; note pins. Live with Claude (`tools/map-edit.mjs`). Needs the dev world server: `tools/game-servers.sh start oathwild-dev`. |
| House kit | `housekit/` | Every house style, piece and decoration Oathwild's towns use, with all settings; the game draws from the same files. |
| Tree kit | `treekit/` | Trees built from parts, species gallery, forest in the wind; live with Claude (`treekit/tools/tree-edit.mjs`). |
| World builder | `worldbuild/` | The generator for the planned 4 × 4 km world: each step's picture, the check report, a 3D fly view. Command line: `worldbuild/tools/build.mjs`. |
| Older map tools | `tools/map-preview.mjs`, `tools/kit-gallery.html`, `tools/tree-gallery.html`, `tools/town-preview.mjs` | Map picture, scenery kit gallery, story-tree gallery, town picture. |

A third-person open-world fantasy RPG for 1–10 players in one shared, saved world. The heart of it is levelling:
every level you pick a class (27 to choose from, unlimited per character), each class is a mastery tree of spells,
ranks, modifiers, passives and training, plus attributes, talents and non-combat skills. Independent project by
Radley Sustaire.

- Owner rulings and the plan: `docs/PLAN.md` (§0 first). Code map and contracts: `docs/ARCH.md`.
- The rules in plain words: `docs/RULES.md`. Every class, where it came from, and its tree: `docs/CLASSES.md`.

## Map editor (2026-11-26 — owner: "Can we create a map editor so i can add more trees or fix bridges, possibly give you realtime access to update what i see")

**Open it:** start the dev world server (`tools/game-servers.sh start oathwild-dev`), then
http://192.168.1.34:8401/prototypes/oathwild/editor/ (`?at=x,z` starts at a spot, `?quality=low|medium|high`). It draws
the world with the game's own renderer and its full look — sky, sun and shadows, the after-effects (grade, bloom, SMAA,
GTAO on High), atmos mist + cloud shade, water, grass, ambient life, effect zones — with a Quality switch (the game's
Low / Medium / High). The game has no time of day or weather yet, so there is no slider for them; the top bar keeps an
empty `data-slot="weather"` spot for the weather helper.

**Moving:** WASD fly, Q / E down / up, Shift faster, right-drag (or drag with the Look tool) to turn, wheel forward,
**M** the map from above (click to fly there). Phone: drag to turn, the stick to fly, ▲ ▼ up / down; Look, Trees,
Effects and Notes tools. Layers ▾: road / river lines, colliders (red circles and orange boxes = what stops a walker),
level areas, tree and rock names, effect zone rings, "fly to where Claude edits".

**Tools** (keys): Trees **T** (place any tree or rock kind + size, drag to move, click to remove, brush an area: set a
density, add more, or clear) · Bridges **B** (pick a crossing: drag its two end handles, snap them to the road, deck
height, width, level run onto each end, bridge or ford, wood or stone; "work it out again" forgets the hand values) ·
Roads **R** (drag a road's or river's points, add / remove points — roads are re-graded and crossings worked out again)
· Ground **G** (raise / lower / flatten / smooth brush; a drag is one undo step) · Things **H** (drag shrines, chests,
camps, roaming packs, people, props; turn them; put back) · Effects **F** (zones of ground fog, fireflies, falling
leaves, dust motes, light shafts, marsh glow, embers, or colour only — size, soft edge, amount, and the air inside:
mist, saturation, contrast, brightness, bloom, tint) · Looks **L** (per region: brightness, saturation, contrast,
warmth, bloom, mist, fog colour, sun colour — fading across the border) · Notes **N** (pin a message; orange = open,
green = done). Ctrl+Z / Ctrl+Y undo / redo (one list on the server, everyone's changes). The Look tool's panel lists
recent changes and any edit whose target is gone.

**How edits are kept** (`js/world/edits.js` explains every field):
- `data/edits.json` — the layer on top of generated things: trees removed (by an id from where they stand:
  `t<x·10>_<z·10>`), trees added, brushed areas, rock edits, ground strokes (applied to the raw ground before rivers,
  places and roads are cut in, so roads stay graded), moved things (`group:id`, props by where place-world put them),
  effect zones, region looks, notes. The world pipeline can regenerate the map: these keep applying; one whose target
  is gone is listed (editor + `map-edit.mjs report`), never dropped, until someone takes it out.
- `data/map.json` — roads, rivers and crossings are hand data: edited in place, keeping the file's hand layout (only
  the changed lines are rewritten). Crossings may carry `a`, `b` (ends), `deck`, `width`, `ramp` (level run, m).
- One code path everywhere: `js/world/boot.js` applies the layer, `js/world/live.js` `worldScene()` gives the trees and
  rocks, `rebuildWorld()` + `swapInto()` rebuild after an edit and put the new world into the same objects — used by the
  server (`server/main.mjs`), the game page (`js/client/live-edits.js`) and the editor. Colliders and drawing agree.

**Live:** the editor talks to the **dev** world server on `/ws/edit` (`server/editor.js`): each change is checked,
written, the server's world rebuilt (≈2 s), and sent to every open editor and every connected game page, which redraw
it without a reload (zones and looks without rebuilding anything). The line is **dev only**: stable and the live droplet
refuse it (HTTP 403) unless started with `--editor` — never do that on the droplet; edits reach players through the normal
publish (`tools/go-live.sh oathwild`). History: `saves/<build>/edit-log.jsonl`; undo / redo keep 200 steps in memory
(a server restart starts a fresh undo list).

**Claude's side — `tools/map-edit.mjs`** (same edits, from the command line; a blue marker shows where it last acted,
and editors with "fly to where Claude edits" follow it):

```
node prototypes/oathwild/tools/map-edit.mjs notes                      # open notes (--all for every note)
node prototypes/oathwild/tools/map-edit.mjs note done n12 "Added six oaks here"
node prototypes/oathwild/tools/map-edit.mjs tree add oak-b -150 60 1.2   # tree remove <id | x,z>, tree area x z r density [add|set] [kind]
node prototypes/oathwild/tools/map-edit.mjs bridge list                  # bridge set troll_bridge deck=14.9 ramp=2 a=337.5,-30.5 b=363.4,-29.2
node prototypes/oathwild/tools/map-edit.mjs ground raise 60 -120 10 2    # raise|lower|flatten|smooth x z r [amount] [y]
node prototypes/oathwild/tools/map-edit.mjs effect add fireflies 256 -246 r=30 amount=1.2   # effect list|set|move|remove
node prototypes/oathwild/tools/map-edit.mjs look set thornmere_wilds saturation=1.18 fogColour=#c8d4d0
node prototypes/oathwild/tools/map-edit.mjs probe 60 -120                # height, walk height, colliders, trees near a spot
node prototypes/oathwild/tools/map-edit.mjs undo | redo | history | report | state | marker x z [what]
```
To see what the owner sees, open the editor in game-eye (`?at=x,z`). Pictures: `tests/ui/editor-shots.mjs [--phone]
[--live]` (`--live` plants a tree through the CLI and waits for it to appear in the open page, then undoes it).
Tests: `tests/world/edits.test.mjs` (every edit kind, same layer server/browser, orphans, map.json layout),
`tests/net/editor.test.mjs` (real server: write, rebuild, broadcast to editors + game pages, undo, CLI, stable refuses).

**Starter effect zones** (data/edits.json): mist over the Thornmere Mire, fireflies at the Druid Circle, embers over
the bandits' fire.

### How the look is put together (for the next helper: look presets, weather)
Per frame `view.render()` (js/client/render/view.js) runs: **1.** `view.applyLook(view.tuning)` — the `?tune` Look group
(data/tuning.json) sets exposure, sky light, sun, fill, atmos mist + clouds, bloom and the grade uniforms; **2.**
`view.afterLook()` — set by `render/zones.js`: `lookAt()` (js/world/edits.js, pure) blends the region looks across the
border and adds every effect zone the player stands in (mist, saturation, contrast, exposure, bloom, tint), then writes
exposure, `ATMOS` mist, fog colour, sun colour and the grade uniforms (`post.grade` uSat / uCon / uWarm / uCool,
`post.bloom.strength`); **3.** post.js draws (Low has no post: there only exposure, mist, fog and sun change). All are
uniform / value sets — nothing recompiles (rule 29). The numbers are plain data (`edits.looks[region]` absolute values,
zone fields as additions), so a preset can multiply or offset them in ONE place: wrap or extend `applyLook` in
zones.js (the `base` it blends from is the game's numbers after step 1). Particles: two instanced quad meshes with a
fixed pool per quality (Low 240 / Medium 640 / High 1100), spent on zones within 70 m.

## Weather (world-tools round 2026-11-26)

Owner: "Can we have weather from thousand vale, it has lightning and storm effects." The weather is the **server's**,
per region, so everyone in a world sees the same storm.

- **What the weather is** — `js/world/weather.js` (pure; server, browser and tests) with its numbers in
  `js/world/weather-data.js`. World Forge (`worldgen/js/weather.js`) gives each region its odds from a climate
  (Brightwater Vale: mostly fair, the odd shower; Thornmere Wilds: wetter, foggier, more storms — `bias` leans each one).
  Kinds: Clear, Fair, Cloudy, Overcast, Drizzle, Rain, Thunderstorm, Fog (Snowfall / Blizzard kept for a high or
  northern region later: `snow: true` on its climate). A weather holds 10–26 real minutes (no day clock yet, so this
  stands in for "a few in-game hours") and rolls into the next over 50 s. Across the region border the two weathers
  blend over 45 m.
- **Saved and sent** — `ws.weather` rides in the world save; the world-state message carries `wx` (per region
  `[from, to, how far, seconds, held]`) and `wxs` (the seed lightning is timed by). The browser rolls a change on between
  messages from the world clock.
- **Lightning is the same for everyone** — one roll per second of world time from the world's seed
  (`strikesBetween`); each player hears the thunder after their own distance (343 m a second).
- **Drawing** — `js/client/render/weather.js`: Farhold's rain on the graphics card (`prototypes/farhold/js/rain.js`, used
  by path: streaks leaning with the wind, splashes and rings, grey sheets of rain in the distance, blown leaves in a
  gale), a cloud layer inside the sky (Thousandvale's painted cloudy sky round the horizon — `img/sky/cloudy.webp`,
  copied from `thousandvale/assets/sky/` — plus Farhold's cloud deck crossing overhead downwind, grey veil in a storm),
  a bolt with branches, a light made once with the view that flashes the ground (rule 29), the sky lit from inside,
  thunder (`sfx` `thunder`), gloom (less sun and sky fill, slate-grey fog, slightly lower exposure and colour), fog that
  pulls the view in and thickens the valley mist, cloud shadows that come and go with the cover, puddles on level ground
  that grow the longer it rains and mirror the sky, and the rain / storm sound bed (`ambience.rain.*`, `ambience.storm`).
  Motes fade and butterflies shelter in the rain (`render/ambient.js` `wet`, `bedOverride`).
- **Wind** — the weather drives the ONE wind (`render/wind.js`, tree kit round): every frame `setFromWeather({ strength: wind × 1.55, gust })`, so a storm bends the woods hardest and the rain leans the same way as the trees and grass. (Farhold's wind stands in only if the one wind is missing.)
- **Cost** — all pooled and made at start, drawn once hidden in the first frames so nothing compiles when the first storm
  arrives. Low: 1,600 rain streaks, no splashes, sheets, puddles or blown leaves. Medium 4,200 / 160 splashes / 40
  puddles; High 7,000 / 300 / 72. Measured numbers: `tests/ui/weather-shots.mjs`.
- **Dev** — `{ t: 'devWeather', key: 'storm', region?, lock?, instant?, secs? }` or `{ t: 'devWeather', release: true }`
  (dev world server only). Map editor: `mountWeatherPicker(slot, { weather, onForce })` from
  `js/client/weather-picker.js` (preview here, or hold one for the dev world). Tests: `tests/net/weather.test.mjs`
  (through the real hub: a forced storm reaches every client, save round-trip, the clock, the border blend, strikes),
  `tests/ui/weather-shots.mjs` (pictures + numbers per weather, shader programs built while the weather changes = 0,
  frame time).

## Look setting (world-tools round 2026-11-26)

Owner: "shaders like visual effects like used in minecraft with mods … Can we have some shader options to adjust the
look." ☰ Settings → Graphics → **Look** (per device, kept in `localStorage` with the other settings — rule 43), and the
same panel in the map editor (`js/client/ui/look-panel.js`).

- **Presets** (`js/client/render/look-presets.js`): **Classic** (today's picture, bit for bit), **Vivid** (storybook
  colour, rich sky, shining water), **Cinematic** (warm light, cool shade, light shafts, soft lens in the distance),
  **Moody** (deeper shadows, quieter colour, heavier skies), **Custom** (starts from the look you had; every slider).
- **Colour and light** are factors on the Look tuning numbers (`data/tuning.json` group Look) through a stand-in tuning
  object (`js/client/render/look.js`), so the map editor's region looks, the effect zones and the weather all keep
  working on top. Switching changes numbers only — nothing is rebuilt.
- **Effects** (each shows its phone cost; the heavy ones are off on Low): light shafts, soft long shadows, contact
  shading, distance blur, water shine (reflections, shoreline foam, finer ripples — `render/water-look.js`), rich sky,
  wet look in rain. Waving grass and leaves are not a setting: the one wind moves them in every preset.
- **How it is wired**: `view.setLookFx(fx)` (render/view.js) — sky richness (`rich` uniform in the sky shader), the
  sun's shadow reach (+70%) and softness (wider filter), water shine (`WATER_LOOK` uniform; the water carries its depth
  per corner from the terrain's water grid), and `post.setLook(fx)` (render/post.js) — light shafts (High's faint rays,
  up to 25% stronger, or built on Medium), contact shading (High's GTAO, or built on Medium), distance blur (a 12-tap
  blur by depth; the scene is then drawn into its own target with a depth texture, `look-passes.js SceneDepthPass`).
  The wet look is `ATMOS.set({ wet })` (render/atmos.js, a uniform on every fogged material) = how soaked the ground is
  (render/weather.js) × the preset's `wet`. All of these are in the shaders from the start at strength 0, so Classic
  draws exactly what it did; a pass a quality never had is built once on pick behind a short dark fade
  (`.ow-look-fade`), and `view.afterQuality` re-fits the Look and the weather when the graphics setting changes.
- **Map editor**: a compact Look menu and the Weather menu in its top bar (`mountLookPicker`, `mountWeatherPicker`);
  the editor keeps the Look with the game's own settings on that device.
- Tests: `tests/world/look-presets.test.mjs` (Classic returns the very same numbers, presets move only Look numbers,
  bloom ≤ 0.15 and no black lift in any preset, Custom clamps and round-trips), `tests/ui/preset-shots.mjs` (each preset
  picked through the real Settings buttons, pictures + numbers, difference from today, shader programs built on a
  second round of switching = 0, the pick survives a reload, phone settings picture), `tests/walk.mjs` settings line.

## Swing effects (owner report #138, 2026-11-26)

Owner: "make even auto attacks … have more particle effects … like the Cleave ability but with a little less detail …
indicate the swing direction and motion … different versions for different type of weapons if they have different
animations." Every basic attack now leaves a light trail along the blade's real stroke, sparks thrown off the tip, and a
burst on the body it hits, landing when the blade does.

- **Shipped:** swords and daggers (steel-white trail, sparks off the tip, a burst on contact) and axes / maces /
  hammers (warm trail, dust and chips). Bows: a flash at the hand as the arrow leaves, and arrows now fly as the Spell
  Kit arrow (shaft + streak) instead of a dot. Magic weapons keep their own caster attack (it already has a launch
  flash). Monsters: a light reddish crescent at their reach; a **special** blow (the ones with a red ground mark) gets
  the heavy red-orange slash when its tell ends.
- **Built but parked** (`data/swing-visuals.json` `parked`): two-handers, halberd, dagger quick-slash, spear, bare
  hands (cross + jab clips). In the in-game check their trails drifted about 1 m off the real blade (cause not found;
  any clip speed other than 1 broke the match too, so everything plays at normal speed). Those weapons keep the old
  look until their row passes `swing-shots`; daggers use the sword's trail meanwhile.
- **Follows the clip, not a fixed delay.** `tools/measure-swings.mjs` plays each kind's clip on a real hero holding a
  sample weapon and records the grip and blade direction 60 times a second; the stroke it finds goes in the data as
  `path` + `contact`. `render/swings.js` draws the ribbon along that path on the clip's own clock, in the body's frame,
  so the hip twist / lunge (`render/moves.js` blade / heavy / quick / thrust / jab, timed to the same stroke) and the
  hero's facing carry it. Re-time a clip or add one → run the tool again. The shared sword clip strikes at 0.40–0.54 s:
  high over the right shoulder, down across the front to the left hip.
- **Plumbing:** `actor.act('attack')` asks `actors.swingHook` (render/swings.js) for the kind's clip and speed and starts
  the trail; a spell's swing passes `{ spell: true }` and gets none. Monster tells call it too (`a.swingTell`). The kit
  side is `kit.pathSwing()` (avatar-3d/spellkit). No lights, pooled ribbons and particles only; layers marked
  `quality: "high"` are skipped on Low.
- **Checks:** `node --test prototypes/oathwild/tests/world/swings.test.mjs` (every weapon base maps to a look, every
  trail has a measured path that runs the way its blade moves, textured, no lights, lighter than Cleave);
  `flock /tmp/oathwild-browser.lock node prototypes/oathwild/tests/ui/swing-shots.mjs [--phone]` (pictures per kind in
  `test-results/oathwild-swings/`, the trail's tip against the real blade tip in the game, shader programs, draw calls).
- **Not done:** the parked kinds above; a real spear thrust, two-handed overhead chop and bow draw need new clips;
  monster crescents and the bow flash have no pictures checked yet.

## The rules core (`js/rules/`, pure — runs in Node, the server and the browser)

| Module | What it does |
|---|---|
| `farhold.js` | The one door to Farhold / Emberveil / Thousandvale code and `shared/format.js` (by path; never edited). |
| `data.js`, `boot.js`, `engine.js` | Load the data, build one `rules` object (Farhold's `Rpg` on Oathwild's balance, statuses, spell catalogue). |
| `attributes.js` | Point buy, level points, per-point values. |
| `sheet.js` | The character sheet: every number from attributes, classes, passives, talents, background, gear. |
| `classes.js` | Classes as masteries: unlocks, class points, ranks, paths, modifiers, capstones, `castRow`. |
| `spells.js` | The spell catalogue: reused rows + Oathwild's own, ranks, modifiers, targeting kind, power source. |
| `talents.js` | Talent points and rows. |
| `skills-use.js` | Non-combat use-skills (Sneak, Lockpicking, Pickpocket, Speech, Enchanting) and their effects. |
| `proficiency.js` | `canWear` / `canWield` with reasons in plain words; training enchantments. |
| `inventory.js` | Carry weight, durability, enchanting, the horse. |
| `levels.js` | The character record, XP, `levelUp`, respec. |
| `auras.js` | Buffs and debuffs on Farhold's statuses: stacking, ticks, cures, control, display data. |
| `combat.js` | The world sim for ≤ 10 players: weapons, spells, auras, monsters, pets, death, XP, loot, camps. |
| `casters.js` | Magic weapons: which wand / tome / staff style, sceptre swing or off-hand rider an item has (Thousandvale's caster forms), the attack plan, and its card with real numbers (`data/casters.json`). |
| `caster-attack.js` | Carries a caster plan out in the world sim with combat.js's own shapes: bolts, fans, chains, seeking, cones, beams, rings, lobs, forks, wards, lingering ground, riders. |
| `loot.js` | Individual loot per player, gold that must be taken, chests that refill per player. |
| `gear-power.js` | How strong gear is (owner 2026-11-27, "upgrades like D2"): item level grows the base (+12% weapon, +10% armour a level), rarity adds enhanced damage / armour (magic +20-40%, rare +45-75%, legendary +80-120%), tier words on the name (Steel / Tempered / Masterwork…), plate only from item level 4. Every item maker goes through it (`engine.js`). Knobs: `data/loot-tables.json` `power`; plan `docs/BRAINSTORM-2026-11-27-gear.md`; test `tests/rules/gear-power.test.mjs`. |
| `describe.js` | The one tooltip text model for spells, items, auras, talents, class nodes, classes, skills. |
| `world-state.js` | The shared saved world: flags, quests (per-player rewards), camps, chests, shrines. |

## The world (`js/world/`, pure) — details in `docs/WORLD.md`

| Module | What it does |
|---|---|
| `terrain.js` | The ground from `data/map.json`: heights (mesh = walked surface), rivers, marsh, graded roads, bridges and fords, biomes, forest, regions, level bands, walkable, reach on foot. |
| `scatter.js` | Trees and small decor, the same everywhere, clear of roads, water and footprints. |
| `encounters.js` | Camps and roam zones on top of the combat sim; bosses sized to the number of heroes (Guessed). |
| `quests.js` | Quests (shared progress, per-player rewards), NPC talk with choices, escorts, services, the quest log model. |
| `boot.js` | Loads map, placements, quests and NPCs; builds the terrain and the quest book. |

Data lives in `data/*.json` (each file's `_doc` says who reads it). `data/art.json` and `data/spell-visuals.json`
belong to the art and spell-visual helpers.

## Server and client (round 1, 2026-11-23)

| Part | What it is |
|---|---|
| `server/main.mjs` | Node + ws world server: dev 8661 (wss 8663), stable 8660 (wss 8662), `/status`, admin feed; saves in `saves/<dev|stable>/` (JSON, gitignored) |
| `server/hub.js` | Hello (device id or games.radgh.com account ticket → profile), characters, world list, create/join by code, reconnect keeps your hero 90 s, empty worlds saved and put away |
| `server/world.js` | One world: the 20 Hz combat sim, the ground check, camps + roam packs, quests, loot per player, talk, level-up, gear, shops, shrines, travel, respawn; per-player snapshots (units within 95 m) |
| `js/net/protocol.js` | The wire: message checks, rate limits, button bits |
| `js/game/ground.js`, `gear.js` | Shared by server and browser: where a body may stand (prediction uses the same check); equip rules, prices, gear → Tabard pieces |
| `js/client/` | `main.js` (the app contract), `screens/` (title, chars, creator, worlds, play), `play/` (camera + aim, prediction, HUD, minimap, touch), `render/` (view, world, actors, fx + Spell Kit, `caster-fx.js` = how each wand / tome / staff style looks), `ui/` (window kit, the ONE tooltip renderer `tip.js`, every window), `input/` (one binding table, keyboard/mouse/pad/touch, padnav) |
| `ops/` | `oathwild` / `oathwild-dev` user units (linked, never enabled: `tools/game-servers.sh start oathwild-dev`) |

Controls (rebind in Settings → Controls): WASD move, mouse look (click the world), left click attack, F power attack, Space dodge, X sneak, R horse, E talk/loot/use/revive (hold), 1–8 spells (ground spells: hold to aim, release to cast), Tab target, B bag, C character, K trade skills, N level up, L classes, T talents, P spellbook, J quests, M map, Esc menu. No block key and no run: a shield blocks by itself (a chance on the sheet and the shield's card), and walking is quick (owner 2026-11-25). Controller: left stick move, right stick look, RT attack, A dodge, X use, Y power, B sneak, LB/RB + A/B/X/Y spells, Start menu, d-pad up horse. Phone: stick + drag to look, Attack and Dodge buttons (no Use button since 2026-11-26: the on-screen prompt is the use button — tap it to use, hold it to bring a fallen friend back), tap a person / remains / chest / shrine to use it (walks there when far), tap a ground spell then tap the ground. Mouse: with a free mouse, click a person / remains / chest / shrine.

## The ground, sky and light (2026-11-24, "the world looks MVP")

| File | What it does |
|---|---|
| `data/ground.json` | Every knob: the nine painted layers (surface, tint, metres per repeat, tone), biome → layer, how roads wear the ground, town paving (squares, cobbled streets, yards round buildings and yard props), the crops in each field, grass per quality. |
| `js/client/render/ground-plan.js` | Pure (node-tested in `tests/world/ground.test.mjs`): paints two splat maps (1 m a texel; 2 m on Low) from the biomes, fields, roads, towns and placements, and plans the crops + fences (proctown `cropField` / `fenceLine`, none on a road, in water or in a footprint). |
| `js/client/render/ground.js` | The ground mesh (the terrain's own grid, GRID SPLIT), its shader (up to nine texture layers mixed per pixel, rock by slope, a second larger sample on Medium/High so the repeat does not show), water, and the fields (swaying sheaves). Roads are worn into the ground, not laid on it. |
| `js/client/render/grass.js` | Grass tufts on the graphics card round the camera (one draw call; a slot per lattice square, Farhold/Thousandvale's idea), grown from the splat, standing on the drawn triangles, fading out at the edge, a few flowers. |
| `js/client/render/kit-props.js` | Pure (node-tested in `tests/world/kit-props.test.mjs`): every scenery piece without a GLB (98 ids: buildings, camp gear, shrines, stones, ruins, graves, chests, trees, rocks, plants) as unit-shape parts — proctown's set-piece kit (`propkit.js`), building kit (`buildkit.js` + `offices.js`) and Oathwild's own pieces in the same style — fitted to the art row's planned size (so placement radii and colliders still match) and turned so the front faces -Z like every placement. Gallery: `tools/kit-gallery.html` (`?group=building`); pictures: `tests/ui/kit-shots.mjs`. |
| `js/client/render/kit-draw.js` | Draws them: every placed piece in a 128 m tile goes into one InstancedMesh per unit shape (plus an unlit one for glowing parts); trees / rocks / bushes are baked to one low-poly mesh per kind (three variants) for the scatter; campfires flicker, the mill wheel turns. Cost check: `tests/ui/perf-kit.mjs --spot larkford` (draw calls + triangles; `--swap` serves older files for a before/after). |
| `js/client/render/tufts.js` | Leaf crowns as fluffy tufts (2026-11-24, owner: "trees look bad compared to Thousandvale"): each clump of a story tree is a ball of camera-facing tuft quads (the stylized "fluffy tree" technique — douges.dev / Pontus Karlsson, three.js forum), normals out of the clump, a painted dense leaf / needle tuft picture, a depth material for tuft-shaped shadows; conifer tiers as rings of needle tufts. Same full crown on High / Medium / Low (counts change, never flat cards). Gallery: `tools/tree-gallery.html`; pictures: `tests/ui/tree-gallery-shot.mjs`, `tests/ui/tree-shots.mjs`; test: `tests/world/tufts.test.mjs`. |
| `js/client/render/view.js` | The painted sky (gradient, sun + glow, drifting clouds), warm sun + cool sky fill, horizon-coloured fog, shadow box that moves in whole texels (no crawling edges); soft shadows on High. |
| `img/ground/*.webp` | The layer pictures, baked from highdef-3d's painted surfaces by `tools/bake-ground.mjs` (run it after changing `layers`). |

Check: `node prototypes/oathwild/tests/ui/ground-probe.mjs --quality low|medium|high [--phone] [--at x,z]` (draw calls, triangles, forced frame time, who draws what, shader errors, a picture) and `tests/ui/look-shots.mjs --tag ground`.

## The air, light and life (environment round, 2026-11-24)

Owner's guide (`oathwild-environment-guide.md`, written by another thread without the code) → what was built:

| File | What it does |
|---|---|
| `js/client/render/atmos.js` | Height mist (pools in low ground) and drifting cloud shadows on EVERY fogged material, by wrapping `Material.onBeforeCompile` once (each material keeps its own hook and program identity). Numbers: `ATMOS.set`. |
| `js/client/render/post.js` | After-effects per quality: Low none; Medium bloom (half size, only the brightest) → tone map → grade + vignette → SMAA; High 4× MSAA + GTAO ground-contact shade + the same. The grade is a LUT written as numbers (warm highs, cool shadows, calmer greens, barely lifted blacks). |
| `js/client/render/view.js` | Late-afternoon sun (~28°, warmer), image-based light baked from our own painted sky (PMREM; no HDRI download), distant hill rings inside the far plane, Look numbers from `data/tuning.json` applied live (`?tune` panel, group Look), `?envoff` = this round switched off (before/after), `?tone=agx` to compare tone mapping. High: one wider 4096 shadow box (80 m) instead of cascades (CSM replaces material hooks and adds a shadow pass per cascade). |
| `js/client/render/ambient.js` | Dust motes, falling leaves from nearby crowns, chimney smoke (tops found by kit-draw.js), bird flocks, butterflies over meadows, and the ambience bed for where you stand (forest / town / marsh / wind, `sfx` library). |
| `js/client/render/contact.js` | A soft contact shade under every building, prop, shrine and chest, tilted to the slope (one instanced draw). |
| `js/world/scatter.js` `understory()` | Shrubs at tree feet and a stepped wood edge (saplings → shrubs → meadow); drawn by trees.js with leaf tufts (the kit's bush balls became tuft shrubs too); client only, walk-through, 0.15 s. Test: `tests/world/understory.test.mjs`. |
| ground | Big straw/deep-green colour patches on grass (`ground.js`), leaf litter painted under every crown (`ground-plan.js paintGround({ trees })`), rippling water that reflects the sky (Medium/High). |
| tufts | Backlit leaves glow with the sun's colour when you look toward it. |
| quality | First visit picks a tier from the graphics chip (`main.js autoQuality`); an automatic pick that runs under ~24 fps steps down once; `?quality=low|medium|high` for one visit. |

Measured (2026-11-24, `tests/ui/env-shots.mjs`, Medium): the first tune washed out (saturation −20-40%: valley mist veiling whole towns, bloom below the sky's brightness, lifted blacks) — retuned: bloom 0.1 above 1.15, mist 0.0012 max 0.22 in the lowest 4% of the land, no lift, saturation ×1.12, contrast ×1.1, sky light 0.3; after ≥ before on saturation in the field and valley views. High: GTAO blend 0.35 (0.55 left woods near black), god rays faint by design (`RAYS`). Phone Low: 139-159 draw calls, ~400k triangles (decor and trees grouped bigger, one look per species, shrubs merged, understory 30%).
Check: `tests/ui/env-shots.mjs [--quality] [--tag] [--extra envoff] [--only views] [--pitch -0.5]`, `tests/ui/ambient-shots.mjs` (smoke, building base, under a tree; chimney count) — six fixed views + brightness / spread / saturation /
clipped numbers per picture (a washed-out picture has a high mean, low spread, low saturation).
Not done from the guide, on purpose: §8 spending (needs the owner's OK), ez-tree (big-leaf rule 74; tufts instead),
three-csm (see above), KTX2 texture compression (see the round's notes), @takram atmosphere (our painted sky + matched fog).

## Towns (town round, 2026-11-25 — owner: "the town is still very empty … just tiny houses plopped onto a flat area")

Streets first, then the houses that line them (lessons rule 76). Larkford went from nine 6 m houses on a 120 m disc of
flattened dirt to 57 terraced houses along a high street, a ring lane, West Street up the hill and two alleys, with
back yards, a market square, terraces and townsfolk; Thornwatch got 13 log cabins along two lanes.

| Part | What it does |
|---|---|
| `data/map.json` | The towns' own streets are real roads (`town`, `surface` cobble / dirt, a short `shoulder`), so grading, paving, tree clearing and walking read them. A town keeps `relief` of its hill (Larkford 60%); `pads` are level terraces (the square, the shrine yard, the tower terrace); `front: true` = houses face that square. |
| `data/towns.json` | Per town: the street rules (house widths / depths / storeys in 3 m kit cells, shop fronts), work `spots` for townspeople (where they stand, which way they look, their routine), stalls, props, villager `stops`; `idles` = the work routines (shopkeeper, smith, innkeeper, minstrel, priest, guard, trainer, mage, groom, crafter, watcher, elder). |
| `js/world/town.js` | The planner, pure, run by the server (colliders) and the browser (drawing): terraced houses on every frontage (an alley gap every 3-6 houses, the town's edge spaced out), each tested along its whole footprint against every street, square, placed thing, person and other house; floors above the ground under them (stone plinths on the slope); fenced / hedged / stone-walled back yards with clutter and vegetable beds; lamps; terrace walls where a pad stands over the ground; a few big trees in open ground whose crowns clear every roof; the street network and each villager's walking loop. |
| `js/client/render/town-draw.js` | Draws it: Kenney Fantasy Town Kit wall pieces storey by storey (windows, shutters, doors, half-timber bracing by style: timber / stone / plaster / wood), roofs made here from the wall rectangle (they cannot disagree with the walls), plinths, doorsteps, smoking chimneys, shop awnings and banners, fences, hedges, stalls, the fountain, lamps, Survival Kit clutter. Each house's plaster / roof / timber colour comes from swatches painted into the kit palette's empty top row (texture coordinates moved per house) — one material; one merged mesh per 48 m chunk (Larkford: 20 draw calls). |
| `js/client/play/villagers.js` | Nameless townsfolk ("Villager") walking their loops on the wall clock (every player sees them in about the same place, nothing sent by the server); they linger at stalls, the fountain, doors; never units, talk targets, tap targets or name tags; step aside for a hero (drawn only). 4 / 10 / 14 by quality; they give bodies up first when bodies run short. |
| `js/client/screens/play.js` | Townspeople play their routine at their spot, turn to a hero within 4.5 m, talk while their window is open. |
| `js/game/ground.js` | Houses, stalls and terrace walls are solid boxes (a step into one is refused; someone inside one from an old save walks out); town trees and the fountain are solid circles. |

Checks: `node --test tests/world/town.test.mjs` (crowded, nothing on a street / square / water / another house every
0.5 m, every door on a street, floors span the hill, walls stop a walker, villagers never walk through a house or the
fountain and their loops close, spots clear and kept in step with npcs.json, trees clear of roofs, spawn and shrines in
the open, same data = same town); `node tools/town-preview.mjs [--town thornwatch]` (the plan from above, pure Node);
`tests/ui/town-shots.mjs [--house N] [--only aerial,square]` (street level + aerial pictures, the town's cost).
Art: `playground/assets/kenney/` (CC0, credits in `shared/credits.json`).

**Ideas for fuller towns (the brainstorm, 2026-11-25).** Done this round: streets drawn first with houses lining them
as terraces; alleys between terraces into the back yards; the hill kept (plinths, steps, terraces with retaining
walls); back yards with fences, hedges, walls, woodpiles, crates, vegetable beds; 1-3 storeys with gables both ways,
smoking chimneys; shop fronts with awnings and banners and goods at the door; a market square with stalls, a fountain
and benches; lamps along every street; big trees in the open ground; villagers walking and townspeople working.
Next (not built yet): walk-in interiors for the inn and shops; a palisade with a gatehouse at the bridge; a mill race
through town with footbridges; market day (more stalls and a crowd at set hours) and evening (lamps lit, villagers
go home); animals (chickens in yards, a dog, horses at the stable); hanging trade signs, window boxes, ivy; jettied
upper storeys and balconies, an alley that passes under a house; worn steps, puddles, cart ruts, moss on old roofs;
smithy hammering and market chatter in the town's sound; a tall landmark (a temple spire) that shows from afar.

## Tests and tools

- `node --test prototypes/oathwild/tests/rules/*.test.mjs` — 145 tests: purity, drift guard (pins every borrowed
  number), class trees, level 1→10 for every round-1 class and several mixes, plate rules, ranks, tooltips (no NaN,
  no long decimals), individual loot, auras, use-skills, world state, combat bots (every class wins a level-matched
  fight), co-op camp clear, death/revive, forms, summons, taunt, sneak, leash, horse, same seed = same fight.
- `node --test prototypes/oathwild/tests/world/*.test.mjs` — 35 tests: the map, placements, the quest engine and a
  campaign bot that plays all 23 quests from level 1 to 10 alone (warrior, cleric) and as a group of three.
- `node --test prototypes/oathwild/tests/net/*.test.mjs` — the server: join, move, water stops you, sprint, fights, individual loot, spells, quest sharing, a whole quest with per-player rewards, level-up, gear, save/load, reconnect, protocol; and a 3-player co-op test through the real server process.
- `tests/rules/casters.test.mjs` (30) and `tests/net/casters.test.mjs` (3): every wand / tome / staff style, the
  sceptre and each off-hand rider hit what their card says; the attack's events, the bolt's look and a lob's
  crosshair point go through the real server. `tests/ui/caster-shots.mjs` photographs every style firing
  (test-results/oathwild-casters/, dev-only `devGear` holds a styled weapon).
- Browser (one at a time, needs oathwild-dev): `node prototypes/oathwild/tests/ui/smoke.mjs [--phone]` (title → hero → world → walk), `tests/ui/controls.mjs` (keys, mouse, mocked controller change the game), `node tools/walk-screens.mjs oathwild` (every screen, desktop + phone, `tests/walk.mjs`).
- `node prototypes/oathwild/tools/map-preview.mjs [--text]` — draws `docs/map-overview.png`; `tools/place-world.mjs
  --write` rebuilds `data/placements.json` from its layout.
- `node prototypes/oathwild/tools/sim-levels.mjs [--fight] [--class paladin | --plan warrior,cleric,… | --all]` —
  every number per level for tuning.
- `node prototypes/oathwild/tools/pin-drift.mjs` — re-pin the borrowed numbers after reviewing a change in
  Farhold / Emberveil / Thousandvale.
- `node prototypes/oathwild/tools/classes-md.mjs --write` — regenerate the trees in `docs/CLASSES.md`.

## History

- 2026-11-26 — textured trees only, no Use button, one monster at a time (owner: "Where did these low poly mvp trees
  come from? Unacceptable … They sit too low and block view of enemies", "Why is there a use button", "every enemy I
  have seen has been in a pack of 5 or more … I can barely fight 1v1"). Trees: Low / Medium used to draw the trees
  they thinned out as the flat vertex-coloured kit pine / oak (#132's invisible-collider fix); every tree now goes
  through the storybook renderer at every setting (`render/world.js`; hand-placed tree props too), and the kit
  instancer refuses a tree id. Spruce / fir skirts start higher and willow curtains are half as long (lowest leaves
  ≥ 5 m as drawn); tufts within 7 m of the camera dissolve (`tufts.js` NEAR_FADE). Low at the Blighted Grove: 217 → 230
  draw calls, 608k → 812k triangles (perf-kit). New rule: lessons rule 77 "No untextured models" — checked by
  `tests/world/textured.test.mjs` (art.json rows textured or grandfathered; kit-props may not grow). Phone: the
  on-screen prompt is the use button (tap = use, hold = revive); Dodge is a round button against Attack. Monsters:
  camps laid out as small groups 28 m apart with a 12 m notice (`tools/place-world.mjs` CAMP_GROUPS writes
  regions.json), roam spots spaced by notice + wander, roam notice ≤ 16 m, fighters' packs roll 1 / 2 / 3 at
  65 / 27 / 8% (combat.json `packOdds`, `encounters.js packSize`). Encounters (`tools/pack-sizes.mjs`): before 13% one
  monster, 19% five or more (the barrow 18); after 83% one, 17% two, 0.5% three, none bigger. Check:
  `tests/world/packs.test.mjs` (sizes, boss guards, kill quests finishable).

- 2026-11-25 — wildlife round (owner: "Rings should be easier to equip … When everything is looted, automatically close
  the popup. Include group/aoe looting like thousand vale. There is too few enemies in the world, except for large packs
  of goblins I cannot kill. Where are all the wild life? … Keep filling out the world"). Jewellery never asks a level
  (`proficiency.js levelGate`). Area looting: one window for every body of yours within 10 m (`server/world.js
  lootGroup`), Take all / Take gold sweep them, emptied bodies cleared, the window closes itself (`win-loot.js`;
  `tests/net/world.test.mjs` area looting). Wildlife: Quaternius CC0 animated animals (`playground/assets/quaternius/
  animals`, `data/critters.json`, `js/client/render/critters.js`) as red deer, wild horses, raccoons, sheep, hens, cows,
  a field bull, barn rats, cave bats (`data/monsters.json`, `temper` skittish / defensive / hostile); every creature with
  nobody to fight wanders and grazes round its home (`combat.js wanderStep`, combat.json monsters.wander*); 23 new roam
  zones (40 in all). Camps of 5+ split into pairs on a ring with the boss in the middle and a shorter notice
  (combat.json `campGroups`; replaced 2026-11-26 by hand groups of one or two); the Goblin Warren laid out by hand (pickets, shamans, warchief). Hamlets Crossbrook and
  Fernstead (map.json places + towns.json, the town planner); travellers on the long roads (`town.js planTravellers`).
  Checks: `tests/ui/wildlife-shots.mjs`.

- 2026-11-25 — town round (owner: shops buy on a tap on phones; names → jobs; "the town is still very empty"; enchanting
  as the player's trade skill; motionless town; shopkeepers' spots + idles; "brainstorm … detailed terrain, realistic
  paths and alley ways"). See "Towns" above. Shops and repairs: tap = look (the one item card) + a separate Buy / Sell /
  Repair button (`win-shop.js`, `win-services.js`, test `tests/ui/shop-buy.mjs`). Trade skills: `win-trade.js` (K, ☰,
  HUD), works anywhere but mid-fight (`tests/net/trade.test.mjs`). People: only the main story's five keep names
  (`tests/world/npc-names.test.mjs`). Phone fix reported mid-round ("can no longer press my first action ability"):
  the drag-to-look layer covered the lone centred slot; the bottom bar now sits above the touch layer
  (`tests/ui/phone-slots.mjs`, real touch taps, warrior + mage; lessons rule 15 sharpened).
  Then (owner, phone bag: "This tooltip is about 5% of what it needs to be … Reduce level requirements, gear should
  mostly be based on stats requirements and feat requirements"): the bag panel draws the whole item card inline
  (`win-bag.js`, `tip.js itemCardHtml`); requirements are data (`data/proficiency.json attrNeeds`: an attribute — or
  either of two, so hybrids wear their kind of gear — per armour tier / weapon type / shield, + 1 per 4 item levels;
  training as before; a level only on rare and better, item level − 3/4) read by `proficiency.js itemNeeds / canWear`
  (one rule for the server, the bag and the card); the card lists each requirement against what you have.
  `tests/rules/gear.test.mjs` checks every base class can meet its own gear's needs at level 10.

- 2026-11-24 — tap the world + creator pages + trees (owner: "I cannot click to interact with npcs or loot corpses on
  mobile … cannot click to revive at the shrine … class selection after customization on its own screen … view the
  skill tree … background and attribute pages separate … trees look bad compared to Thousandvale"). Tapping (phone) or
  clicking with a free mouse on a person, remains, chest, object or shrine uses it, walking over first when out of reach
  (`play.js` `interactables` / `pickAtScreen` / `reach`); the prompt is a button (phones: above the action buttons); the
  fallen panel sits above the touch look area (it covered Wake at the shrine) and is built once. Creator: Look → Class
  (the class's whole tree, `win-classes.js` `treeHtml` preview mode, real numbers from a draft hero) → Background →
  Attributes (starting numbers). Trees: two causes — the story trees were built ~12 m and SCALED to 18-50 m, so their
  leaf cards became house-sized single leaves; and one detail level for all distances meant Low (every phone) drew the
  far two-card clumps beside the hero. Leaves are now fluffy tufts (`tufts.js`). Low costs ~12% more triangles than the
  old flat cards (ground-probe, phone, Low). Phone HUD: Tap hints from the start, an Attack button, no empty slots.
  Checks: `tests/ui/tap-interact.mjs [--desktop]` (NPC, prompt, far chest walk-to, wolf remains, Wake at the
  shrine — real touch taps), `tests/ui/creator-shots.mjs [--phone]`; dev-only `devDown` / `devDummy hp`.

- 2026-11-24 — Thousandvale's magic-weapon itemization (owner: "wands and tomes having special attacks"): 13 wand
  styles, 4 tome forms, staff styles and element spells, sceptres that swing their element, off-hand riders (Echo,
  Burst, Ward, Siphon), named casters, a `magic` loot kind and two shops; each style drawn with the Spell Kit; cards
  from the same plan the sim fights. Also fixed: a scheduled job's ground point overwrote its due time, so the
  landing hit of every ground-targeted spell was silently dropped (a lingering zone it leaves still worked).
- 2026-11-23 — round 1, rules core: 27 classes consolidated from Farhold / Thousandvale / Emberveil (8 base, 13
  advanced, 6 specialty), mastery trees with ranks and modifiers, attributes, talents, non-combat skills, plate and
  other training, auras, the world sim, individual loot, tooltips, world state; 145 tests.
- 2026-11-23 — round 1, world content: a hand-shaped map of Brightwater Vale and Thornmere Wilds (rivers, marsh,
  roads, four crossings, level bands), Larkford and Thornwatch, 11 camps, 17 roam zones, 7 shrines, 10 chests, 34
  people with trainers for every round-1 class, the main thread (8 quests, a boss in each region, a hook north) and
  15 side quests; 35 world tests including a level 1-10 campaign bot.
