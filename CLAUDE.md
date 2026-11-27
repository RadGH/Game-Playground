# Playground — experiments for future games

Reusable **experiments** (libraries, top-level folders), **prototypes** (games, under `prototypes/`) and a shared **library** of blueprints (`library/`). Owner: Radley Sustaire (independent). Sandbox: auto-commit freely.

**This file is a short index on purpose.** Each folder's own `README.md` holds its details and its history — read it before touching that folder, and write new notes THERE, never here. Add one line to the tables below when a folder is new; nothing more.

## Do not stop while work is queued

When work is laid out (rounds, milestones, a feedback list), finish ALL of it before stopping. Do not stop for feedback unless the user asked for it; do not stop after one milestone while others are pending — use agents, `/loop`, or scheduled tasks to keep going. Anything put on hold is written down in the game's docs and brought up when the rest is done. (2026-09-17: an agent stopped after round 6 overnight with 3 rounds still pending; the user lost 12 hours.)

## Every game (also in `~/claude/CLAUDE.md`)

- Read `~/claude/docs/game-standards.md` and `~/claude/docs/lessons-from-games.md` before building or changing a game.
- **Every publish runs `tools/prepublish-check.sh <game>`**: game-lint, every module connected (`tools/game-reach.mjs`), and a walk of the screens the change can touch on desktop + phone (`tools/walk-plan.mjs` decides from the diff against `stable`: rules/data/server-only changes skip it, window files walk their own screens, anything else walks all; `WALK=all` forces all — `tools/walk-screens.mjs` + the game's `tests/walk.mjs`, add a line there for every new screen). A failing game is not published. **No sweep of every game (owner 2026-11-11):** each game has a "QA pass pending" note at the top of its README — when you next work on that game, do its pass first, then add it to `tools/qa-passed.json` (`tests/game-quality.test.js` checks only those).
- **README status block**: every game README opens with **Status / Play / Next / Parked** lines — update them at the end of every round.
- **game-lint runs by itself**: a hook (`tools/hooks/game-lint-hook.mjs`, wired in `~/.claude/settings.json`) lints every game file you edit when you finish a turn and sends you back once to fix problems. You can still run `node tools/game-lint.mjs prototypes/<game>` by hand. Mark a true exception with `// lint-ok: <why>`.
- **What's new** (`shared/whats-new.js`, the game's `data/changelog.json`): append a player-language entry at every publish. **Credits** (`shared/credits.js`, `shared/credits.json`): add a row when a game starts using someone else's work.
- **No third-party IP in player-facing text or data** — invent original names; other games may be named only in chat and Claude docs. Banned names are listed in `docs/banned-names.md`. Never use "muster"; stop reaching for "ember" and "veil".
- Experiments (libraries) aim for wide option coverage; games aim for finished, designed screens (no MVP menus).

## Layout and conventions

- `<experiment>/` — kebab-case folder, `index.html` entry, thorough `README.md`, tests. Stable APIs.
- `prototypes/<name>/` — a game: `index.html`, `README.md` (what it tests, history), `js/`, `data/`, `tests/`. Many have `docs/PLAN.md` with owner rulings in §0 — read that first.
- `shared/` — helpers every page imports (format, dialog, tooltip, store, voices, accounts…). **`shared/README.md` lists them**; use them instead of writing a new copy.
- **No build step**: plain HTML, standalone `.css`, ES modules. Third-party code vendored under `vendor/` (licences in `vendor/README.md`).
- **Data first**: anything reusable goes in JSON or a plain data module, apart from UI code.
- **Adding an experiment**: one row in `data/experiments.json` (`tests/experiments.test.js` checks it), one line in the table below, one line in `~/claude/docs/playground.md`, the folder in `ALLOW` in `prototypes/thousandvale/server/static.js` (`tests/H/public-lists.test.js` checks it), and the README.
- **Tests**: `npm test` (Playwright, serial — never run two suites at once) and `npm run test:unit` (node). Screenshots land in `test-results/`.
- Building a game from the parts: `GAME-GUIDE.md`. Shared character JSON: `shared/character-schema.md`. Research before building: `docs/research-*.md`.

## Servers and publishing (full note: `tools/README-servers.md`)

- Start both with `tools/serve-both.sh`. **8400 = STABLE** (worktree `~/claude/playground-stable`, `stable` branch) — the URL to give the user. **8401 = DEV** (this working tree, often broken mid-edit). https for gamepads: 8442 stable, 8441 dev. Always give the LAN IP (`hostname -I | awk '{print $1}'`), never localhost. Do not use `./serve.sh --bg`.
- **Game servers (own Node server per game) are OFF by default** — start with `tools/game-servers.sh start <unit>` when working on that game; an hourly timer stops them after 24 h; `keep` only when the owner asks; `status` lists them. 8400/8401 stay up.
- **Going live, one command: `tools/go-live.sh <game…>`** (all the steps below + the RGS commit; `--check` only checks the games.json entry, picture and What's new).
- Promote by hand: commit → `tools/publish-stable.sh` (refuses unparseable JS or red unit tests) → `tools/publish-pages.sh` (GitHub Pages, https://radgh.github.io/Game-Playground/ — never use a path starting with `/`) → for games.radgh.com, `cd ~/claude/rads-game-server && tools/deploy.sh update playground` (stamps every changed game) (`~/claude/docs/rgs.md`). Games with their own server (Thousandvale, Tumblefair, Knockabout, Roverlands, Oddhaven, Rogueloot) have their own publish script — see their README.

## Experiments

| Folder | What it is |
|---|---|
| `icons/` | SVG spell icons for all Thousandvale classes + game icons (buttons, materials, potions…) |
| `voice-lab/` | Character voices: our formant synth (`FORMANT.md`), espeak, babble, Piper, Web Speech; presets, effects |
| `lingo/` | Text language: templates, lexicon, traits, memory (`MEMORY.md`), scene awareness, relationships (`RELATIONS.md`) |
| `avatar-2d/` | SVG paper-doll builder; `js/parts/chibi2-parts.js` registers every Chibi 2 part id |
| `avatar-3d/` | Three.js characters (Chibi 2/2.5 — read `CHIBI2.md`), creatures, spell effects, vehicles + catalog, mounts |
| `avatar-3d/chibi3`, `chibi4/`, `kestrel/` | Character-system trials (on hold / in trial) — `CHIBI3.md`, `chibi4/README.md`, `kestrel/README.md`. Kestrel's Meshy male/female are NOT for games (owner 2026-11-11) |
| `avatar-3d/tabard/` | Tabard: WoW-style low-poly painted characters, armour swappable per slot (painted boxes + swap-in pieces + props); free path |
| `avatar-3d/spellkit/` | Spell Lab: layered WoW-style spell visuals (wind-up hands, ground indicators, missiles, impacts, lingering ground spells, auras) from JSON; Codex-painted textures; pooled, budgeted |
| `avatar-3d/pixelsplat/` | Pixel Splats: a model as square splats carrying material, lit live on a fixed pixel grid (from a Reddit post); vs baked splats / pixel filter / smooth |
| `avatar-3d/fal/` | Paid fal.ai test (2026-11-22): Rodin bodies + Meshy rig moved onto the free animation skeleton, Trellis-2 armour/weapon sets fitted and swappable; costs in `data/spend.json` |
| `namegen/` | Name Forge: per-race languages and names for people, places, artifacts |
| `items/` | Item Vault: tagged item catalog, materials, loot roller |
| `library/` | Blueprint library (characters, npcs, items, parties, enemies) + sync to Claude |
| `conversations/` | Structured conversations on top of Lingo + memory |
| `sfx/` | Sound Lab: 164 sound ids, CC0 recordings + synth, loudness normalising |
| `meters/` | Damage meter (records every hit, drill-down UI) |
| `worldgen/` | World Forge: procedural world maps, regions, roads, weather |
| `assets/` | Shared art: scenery backdrops, map icons, fx sprites |
| `universe/` | Star Forge: galaxy, star systems, planets, moons, surface maps |
| `proctown/` | Procedural towns (streets from cuts, cultures, building kit, prop kit) |
| `highdef-3d/` | High-detail outdoor world in plain three.js (lighting, grass, post effects) |
| `armory/` | Review page for every wearable/holdable Chibi 2 model |
| `model-library/` | Meshy-made rigged + animated enemy models (goblins, skeletons, orc, ogre, bandits…) with their Codex sheets and prompts — **no game uses them yet: remind the owner when Thousandvale or Rogueloot is worked on; he decides** |
| `combined/` | Two full characters talking in one 3D scene |
| `mechkit/` | Overdrive Frame's mech parts (4 makers, 116 parts with stats), layered baked sprites + paint masks, dress-up page |
| `citykit/` | Arcline's procedural iso city: three.js models baked to 2D day + night pictures; review page for buildings, walls, turrets, creatures, vehicles |
| `worldbuild/` | World Build: a brief → shape → regions → places → roads → detail → checks pipeline for big worlds (Oathwild 4 × 4 km sample with the hand map pinned), stage pictures, a streamed 3D fly view, `tools/build.mjs` |
| `housekit/` | House Kit: Oathwild's modular town houses (Kenney walls + Codex-painted atlas, decorations, landmarks) — Oathwild's town-draw imports it; review page |
| `treekit/` | Tree Kit: Oathwild's trees from parts (species.json: trunk, roots, branches, leaf clumps, bark, wind), the ONE wind shader, live editing with Claude (`tools/live.mjs` 8670 + `tools/tree-edit.mjs`) — Oathwild imports it |

## Prototypes (games)

| Folder | What it is | Status |
|---|---|---|
| `prototypes/emberveil/` | Emberveil 2: auto-battle party RPG rebuild | done |
| `prototypes/frontier-foundry/` | 4X + RTS automation across planets | done |
| `prototypes/farhold/` | Third-person RPG on a whole planet (also `RPG.md`, `BUILD-MODE.md`, `CLASSES.md`) | rounds 1-28 |
| `prototypes/lodestar/` | Pixel-physics commander RTS from a bunker | building |
| `prototypes/oddhaven/` | Modern life sim with fantasy races; jump into anyone | building |
| `prototypes/kindlewild/` | Pixel god-game sandbox | live |
| `prototypes/stoneward/` | Planet-wrapping medieval pixel city sim | live |
| `prototypes/voidwright/` | 2D block-built space game | live |
| `prototypes/hullforge/` | 3D block-built space game (auto corners, animated turrets, 6-direction flight); desktop only | new |
| `prototypes/spirehold/` | Semi-idle city defence | playable |
| `prototypes/arcline/` | SimCity 4-style iso cyber city builder + wall/turret defence (plan in docs/PLAN.md) | planning — round 0 = `citykit/` |
| `prototypes/overdrive-frame/` | Iso co-op mech action in a neon city; fully prerendered (City Kit + Mech Kit); co-op room server 8620/8621 | live, round 4 |
| `prototypes/grimring/` | Arena with the Model Library Meshy fighters (1-2 foes at a time) | live |
| `prototypes/wyrmroad/` | Side-scrolling 3D beat 'em up, Chibi 2.6, story + gear, co-op 1–4 local/online, own server 8640/8641 | live |
| `prototypes/oathwild/` | Third-person co-op open-world RPG, own server 8660/8661; tools: `editor/` (map editor), with `housekit/`, `treekit/`, `worldbuild/` (README "Tools") | live |
| `prototypes/tinyrts/` | Symlink to its own repo `~/claude/tinyrts` — commit THERE; keep its `master` green (stable serves it) | playable |
| `prototypes/lanternfall/` | Side-scrolling pixel action RPG (`docs/HANDOFF.md` = remaining work) | playable |
| `prototypes/bannerline/` | Lockstep RTS of game modes (lane wars, hunters vs farmers) | done |
| `prototypes/thousandvale/` | Online RPG server (Node + WebSockets + Postgres), 8490/8491 | on hold — read `docs/ON-HOLD.md` |
| `prototypes/knockabout/` | Floppy physics brawler, own server 8470-8473 | live |
| `prototypes/rogueloot/` | Co-op action RPG, own server 8580-8583 | on hold |
| `prototypes/roverlands/` | Co-op vehicle game, own server 8550-8553 | on hold |
| `prototypes/tumblefair/` | Phone party game, own server 8480/8483 (`docs/MINIGAMES.md`) | live |
