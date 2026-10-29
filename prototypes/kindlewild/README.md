# Kindlewild

A pixel god-game sandbox in a medieval fantasy realm (independent project by Radley Sustaire, sandbox). You are the
sky above a small realm: paint the land, drop creatures into it, and cast spells the world answers with real physics —
fire that runs with the wind, lava that floods downhill and cools to stone, water that pools in craters, blasts that
throw burning debris. Little people farm, chop, build cottages, put out fires with buckets and raise families until you
do something dramatic.

- Owner brief (verbatim): `docs/OWNER-BRIEF.md`. Design: `docs/PLAN.md` (§0 = rules it never breaks).
- Reference: Lodestar M1's cell world. Ideas reused, code is new — nothing here imports Lodestar.
- Serve: playground servers — dev `http://<LAN>:8401/prototypes/kindlewild/`, stable `:8400` after
  `tools/publish-stable.sh` (https `:8442` for a controller).
- No build step: plain ES modules, standalone CSS, data in `data/*.json`.

## Modes

| Mode | What it is |
|---|---|
| **Challenges** | Six acts × 6 levels, one file each in `data/acts/act1..6.json` (listed in `data/levels.json`): I The First Kindling, II The Gathering (creatures first), III The Alchemist's Road (reactions), IV Stormcrown (sky and weather), V The Hollow Dark (undead, slimes, void), VI Wyrmfall (dragons, volcanoes, the Elder Wyrm). An act opens when the last level of the one before is cleared. Each gives its own tools (loadout), a mana pool that regenerates, goals (`js/game/objectives.js`) and three stars. A first clear unlocks its reward page. |
| **Daily Trial** | `js/game/trials.js`: a GENERATED challenge per day (same date = same trial everywhere): threat archetype (swarm, molten tide, wildfire, flock, wyrm, siege night) → land + side (mirrored) → numbers scaled Mon 0.75× … Sun 1.29× → loadout (archetype tools + 2 spells the player owns) → goals and stars. Saved as level id `trial-YYYY-MM-DD`; stars pay Essence like any level. `node tools/bot.mjs trials 14` checks two weeks (lose idle, win with the bot). |
| **Sandbox** | Seven lands (`data/biomes.json` recipes) in three sizes. Endless mana by default; "Use everything" ignores what is unlocked. |
| **Realm** | A saved world (`js/game/realm.js`, localStorage `kindlewild.realm.v1`, RLE + base64). People's **faith** speeds mana and pays Essence; **omens** (raids, swarms, wolves, dry spells, trolls, imps, slimes, the dead, a dragon from day 4) arrive every ~2-3 minutes, announced 12 s ahead; milestones pay once. |

Progress (`js/game/progress.js`, localStorage `kindlewild.save.v1`, cloud-synced through `shared/rgs-cloudsave.js`
when signed in): **Essence ✦** from stars (10 each, first time), first clears (20), discoveries (5-20 each, first time),
Realm faith, omens and milestones. Spent in the **Grimoire** (`data/grimoire.json`): pages in 6 tiers — a tier opens when
you own `opensAt[t]` bought/won pages of the tier below — plus spell **Empower** levels (+20% size and power each, max 3)
and Realm **Boons** (mana cap, regen, faith, fertility).

## The world (`js/sim/`, all PURE — node tests play it in memory)

Top-down. Per-cell typed arrays (`world.js`): `mat` (what stands there), `ground` (the floor), `height`, `temp` (byte,
ambient 40), `life` (fuel / liquid amount / ticks), `flag` (BURN, WET, OWNED, CHARGED, STILL). 16×16 chunks sleep when
nothing changes (`touch(i)` wakes one). Half-res gas field (smoke, steam, poison, spores, marsh gas).

| File | Rule |
|---|---|
| `materials.js` + `data/materials.json` | ~60 materials compiled to typed arrays; every rule reads them. Fire tuning lives in the file's `fire` block (`heatBase`, `heatPerFuel`, `wind`, `burnRate`). |
| `cells.js` | One pass over awake chunks: burning (fuel, heat downwind, smoke, embers from big fuel only), ignition/melt/freeze/boil thresholds, timed cells (frostfire chills and creeps over plants; voidseed devours), sources (spring, vent: `sourceRate`, `sourceAmt`), liquids, reactions with one random neighbour, heat sharing (`>>5`, burning cells excluded — the generic diffusion was what made fire run 12 cells a second). |
| liquids (in `cells.js`) | Surface = `height*LEVEL + amount`. Flow goes to the **steepest** neighbour first (otherwise liquid on a slope spreads as a disc). A cell thinner than `minFlow` (lava: 3) **rolls** downhill whole, leaving a cooling crust trail; still thin lava crusts over. Map edge is a wall. |
| `reactions.js` data | `data/reactions.json`: a + b → c (+ d), with gas, heat, blast, light, spawn and a discovery id. |
| `blast.js` | `blast(x, y, r, power, opts)`: breaks cells by hardness into DEBRIS particles on arcs (burning debris lights where it lands), splashes liquids, scorches, digs craters, heats, chains (mana crystal, runestone, blackpowder), `'blast'` event for creatures. `lightning()`: bolt, ignition, glass from sand, charge through connected water (`'shock'`). |
| `particles.js` | SoA pool (9,000): sparks, embers, debris, drops, motes, breath flames, bolts. `z` = height, landing = an action. |
| `growth.js` | Random sampling: grass spreads, scorched earth heals, trees seed, crops ripen, glowcaps creep at night, thorns spread. |
| `weather.js` | Day clock, wandering wind, rain clouds (wet, douse, crust lava; storms throw bolts; acid; blessed), lights, bolts, shake. |
| `mapgen.js` + `data/biomes.json` | Height (fbm + ridges, shaped: plain/valley/basin/island/volcano/flat) → moisture/temperature → biome → rivers carved below the sea line (still water, free) → vents, glades → village sites. Deterministic per seed. |
| `creatures.js` + `data/creatures.json` | 36 species, sprites as palette-letter rows (tints per individual), 1×1 mites to a 15×11 dragon. Life sim: hunger, grazing (finish the meal — re-picking food every think starved them), hunting, fleeing fire and feared tags, breeding (cooldown, litter, cap; people need beds), ageing, burning (panic, spreads fire), drowning, lava, acid, frost, poison gas. Raiders, guards, healers, ranged shots (a shot at a flyer resolves on arrival), slimes split, trolls turn to stone at dawn, phoenix rebirth, dragon AI (circle, dive, breath cone, flee at 25%). |
| `village.js` + `data/buildings.json` | Villages as real cells (cottage, longhouse, stone house, field, well, shrine, watchtower, lamp). Jobs by need: fight fires with water, eat, sleep at night, harvest, chop, quarry, build cell by cell. Faith per person (+50% per shrine). Windows (glass, OWNED) glow at night. |
| `spells.js` + `data/spells.json` | 24 spells built from the rules (meteor = faller + blast + crater + molten core + embers; tornado = wandering entity that rips cells into debris and catches fire; void orb = devouring cells + pull). |
| `index.js` | `createSim(data, opts)`: event bus (`on`, `fire`), `later()` queue (chain reactions), systems list. |

## Game layer (`js/game/`)

- `session.js` — `createSession(data, cfg)`: sim + creatures + villages + spells + mapgen + level setup (`map.ops`
  terrain edits: flatten, slope, paint, vent, drain, dry...), mana, `use(page, x, y, opts)` = the one entry for the
  player's hand, cooldowns, spawns and timed events, `state()` for tests and game-eye.
- `objectives.js` — WIN goals (kill, grow, survive, dragon, extinguish) and KEEP goals (protect houses, people,
  contain a material out of a zone); stars. Deaths by old age never count as kills.
- `realm.js`, `progress.js`, `data.js` (fetch).

## Interface (`js/ui/`, `css/game.css`)

Phone portrait first. Edge arrows point at off-screen arrivals; ambience follows the world (fire, rain, night, forest); the frame is rebuilt only when the sim stepped (GPU redraws between) and a slow device drops itself to the Fast picture once. `stage.js` (camera, loop, sim at 30 ticks/s × speed), `render/frame.js` (CPU colours, glow,
relief height incl. tall things, edge shading for roofs/canopies, gas, particles, creatures) + `render/gl.js` (WebGL2:
emission blurred twice into a coloured light field, relief lit by a sun that moves with the clock, water ripples, lava
pulse, cloud shadows, bloom, shake, cursor ring; Canvas2D fallback). `play.js`: one finger = tool (tap, drag line, paint,
grab-and-fling), two fingers = pan/pinch, ✋ toggles one-finger pan, the dock (4 tabs, paged tiles — swipe or arrows,
never a scrolling panel over the canvas), long-press a tile for its card, HUD (mana bar with a ghost of the cost, goal
chip, speed, ☰, !). `pad.js`: controller in menus and in the world. `audio.js`: the playground sound library (`sfx/`)
driven by world events. Keyboard: WASD pan, wheel/± zoom, Q/E tabs, 1-9 tiles, [ ] brush, Space pause, Esc menu.

Reports ("!"): saved in localStorage `kindlewild.reports` (text, screenshot, state) and carried to the account with
the cloud save. There is no reports feed for static games on games.radgh.com yet.

## Tools and tests

- `node tools/run-level.mjs <level|sandbox> <secs>` — headless run with progress lines.
- `node tools/bot.mjs [level|all] [seeds]` — each level played idle and by a simple bot: every level must be LOST idle
  and WON by the bot (checked 2026-10-28).
- `node tools/snap.mjs <level> <secs> <out.png> [scale]` — PNG of the CPU frame without a browser.
- `node tools/shot.mjs <outprefix> title|sandbox|level:1-1` — Playwright at phone size (`KW_SIZES=phone,desktop`),
  prints console errors.
- `node --test prototypes/kindlewild/tests/` — unit tests.

## Gotchas found while building

- Generic heat diffusion at `>>3` spread fire faster than the fire rule itself; burning cells must not use it.
- Embers from every burning cell (grass included) made fire leap ahead exponentially; only big fuel throws embers.
- Liquids must try the steepest neighbour first, and thin lava must roll, or a slope floods as a puddle.
- A creature that re-thinks every ~13 ticks can never finish a 20-tick meal — finish what you started.
- `flatten` must loop over its blend radius, not its core radius, or it leaves a square seam (dark lines).

## Round 2 (2026-10-29)

- **Icons, no emoji**: every level, trial, spell and tool has a Codex pixel-art icon (`tools/art/icons.tsv` = the prompts,
  `tools/art/run.sh` runs the batches one at a time, `tools/art/convert.sh` makes 128px nearest-neighbour webp in
  `assets/icons/` and `data/icons.json`). `icons.js iconUrl()`; a plain letter badge stands in until an icon exists.
  Emoji remain only on the title menu; ✦ is the currency.
- **Mana**: a challenge gives 75% of its written pool/flow; each Deeper Well / Quicker Flow boon adds 10%
  (`progress.challengeMana`, `session cfg.manaScale/regenScale`). Sandbox with mana uses the same scale.
- **New**: Archer, Mage (homing `missile` shots — `creatures.missile()`), Barrier (`w.barriers` + `w.shield` cell mask:
  hostile walkers kept out, fire/heat, lava, blasts and breath stop at the skin, folk inside unhurt), Arcane Missiles.
- **Dragon**: resists fire/lightning/frost/magic, short frost, enrages at 60% (faster, calls wyrmlings). Species can
  carry their own `resist` table and fury settings (elder wyrm).
- **Goals**: `reach` (escort travellers with a `tag` to a zone), `guard` (keep N of a species/tag), `destroy` (knock down
  a material in a zone); star `reachedMin`.
- **Behaviour**: raiders go for roofs instead of chasing fleeing folk across the map; monsters and hunters step aside
  when stuck; soldiers do not found villages and do not starve away from one; trolls petrify only at sunrise.
- **Bots**: `tools/bots/act<N>.mjs` hold each act's strategies; `node tools/bot.mjs act3 2` plays an act file directly.

## Round 3 (2026-10-29): real sounds and credits

- Sound goes through the shared `sfx/` library, which now has a real CC0 recording for every id
  (`sfx/README.md` "Recordings"). `js/ui/audio.js` maps spells (`CAST_SOUNDS`), reaction sounds
  (`EVENT_SOUNDS`) and world events to ids, and picks the ambience bed (`ambienceFor`: fire, storm,
  rain, night, forest). New ids made for this game: `explosion.small/large`, `meteor.fall`,
  `thunder`, `tornado`, `quake.rumble`, `dragon.roar`, `arrow.shot`, `magic.missile`,
  `ambience.night`, `ambience.storm` (and a few spare: `beast.growl`, `wolf.howl`, `lava.bubble`,
  `crowd.cheer`).
- **The stuck sounds**: the meteor played `spell.fire.travel` and Blessed Rain `spell.holy.travel`,
  which the catalog marked as loops, and nothing ever stopped them. `play()` now always passes
  `loop: false`, the catalog no longer marks flights as loops, and only `ambience()` starts a loop.
  `tests/audio.test.mjs` checks every id exists and nothing one-shot loops (it also caught the acid
  fizz asking for an id that never existed).
- Speed button: a new level reset the speed to 1x but left the button saying 3x (`play.js` `P.start`).
- Credits: `shared/credits.js` window from the title screen and the ☰ menu (`app.credits`).
- Aiming: a press-drag-release casts where the finger lifts (the circle follows the drag); it used to cast at the first touch.
- Lightning hits bosses at full strength again (owner: 1-5 had become too hard); the boss defaults
  (fire/lava 0.1, frost 0.3, magic 0.55) only apply to a cause the species' own `resist` row does not
  name, so nothing is cut twice.
- **Finding slowness** (owner: 1-5 at 0.5 fps on an iPhone): Settings → *Show speed numbers* draws
  fps and the per-frame split — `sim` (rules), `build` (CPU picture), `draw` (GL calls), `gpu` (a
  1-pixel read-back that waits for the GPU; measured only while the readout is on). `stage.perfReport()`
  is the same data, and every bug report carries it plus the GPU name. Reports POST to the LAN
  server's inbox (`/api/inbox/kindlewild-report` → `library/synced/inbox/` of whichever tree serves the
  page: `~/claude/playground-stable` for 8400) and are retried at start-up; they still ride the cloud
  save too. `tools/perf-hud.mjs`, `tools/fps-level.mjs`, `tools/frame-cost.mjs` measure the same
  things headless. The auto-drop to the Fast picture now waits 2.5 s of slow frames (it waited 240
  FRAMES — eight minutes at 0.5 fps), Fast caps point lights at 12, and the canvas no longer keeps
  every frame (`preserveDrawingBuffer` off; `stage.capture()` draws and reads back for screenshots).
- A window over the world (`stage.covered`: menus, report, What's new, Credits) stops drawing — the last picture stays (owner's report: typing lagged in the report box on the dragon level). The report window pauses the game and takes its picture + speed numbers before it opens.
- **The 50 ms tick (owner's iPhone, 1-5)**: heat sharing used `(t - tj) >> 5`, which floors, so a cell
  colder than ambient pulled at least a degree out of AMBIENT neighbours — one Frost Nova's chill crept
  over the whole map and every chunk stayed awake for good (0.2 → 5.4 ms a tick here, ~50 ms on the
  phone). Into ground at/under ambient it now rounds toward zero; next to a fire the old flooring stays,
  because the fire levels are balanced on it (removing it everywhere made villages burn and the bots
  lose). Freezing ground (<12) thaws at 0.06/tick so a Frost Nova patch stays icy ~4 s — 5-2's balance
  had leaned on the bug (mana raised 90→120, regen 4.5→5.5). `tools/awake.mjs` watches awake chunks.
- Village fighters now hunt wild predators (`huntable`), and a placed soldier holds a `post` that drifts
  toward livestock within 18 cells (not villagers — that dragged 2-1's archers off the palisade).
- Healing Light douses burning cells in its circle. Fire and dragon trials got more starting mana.
- WebKit (the iPhone's engine) runs here now: `WEBKIT=1 node tools/perf-hud.mjs 1-5` (system deps
  installed 2026-10-29).
