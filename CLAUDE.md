# Playground — experiments for future games

Reusable **experiments** (libraries, top-level folders), **prototypes** (games, under `prototypes/`) and a shared **library** of blueprints (`library/`). Owner: Radley Sustaire (independent). Sandbox: auto-commit freely.

**This file is a short index on purpose.** Each folder's own `README.md` holds its details and its history — read it before touching that folder, and write new notes THERE, never here. Add one line to the tables below when a folder is new; nothing more.

## Do not stop while work is queued

When work is laid out (rounds, milestones, a feedback list), finish ALL of it before stopping. Do not stop for feedback unless the user asked for it; do not stop after one milestone while others are pending — use agents, `/loop`, or scheduled tasks to keep going. Anything put on hold is written down in the game's docs and brought up when the rest is done. (2026-09-17: an agent stopped after round 6 overnight with 3 rounds still pending; the user lost 12 hours.)

## Every game (also in `~/claude/CLAUDE.md`)

- Read `~/claude/docs/game-standards.md` and `~/claude/docs/lessons-from-games.md` before building or changing a game.
- **Every publish runs `tools/prepublish-check.sh <game>`**: game-lint, every module connected (`tools/game-reach.mjs`), and a walk through every screen on desktop + phone (`tools/walk-screens.mjs` + the game's `tests/walk.mjs` — add a line there for every new screen). A failing game is not published. **No sweep of every game (owner 2026-11-11):** each game has a "QA pass pending" note at the top of its README — when you next work on that game, do its pass first, then add it to `tools/qa-passed.json` (`tests/game-quality.test.js` checks only those).
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
- Promote: commit → `tools/publish-stable.sh` (refuses unparseable JS or red unit tests) → `tools/publish-pages.sh` (GitHub Pages, https://radgh.github.io/Game-Playground/ — never use a path starting with `/`) → for games.radgh.com, `cd ~/claude/rads-game-server && tools/deploy.sh update <game>` (`~/claude/docs/rgs.md`). Games with their own server (Thousandvale, Tumblefair, Knockabout, Roverlands, Oddhaven, Rogueloot) have their own publish script — see their README.

## Experiments

| Folder | What it is |
|---|---|
| `icons/` | SVG spell icons for all Thousandvale classes + game icons (buttons, materials, potions…) |
| `voice-lab/` | Character voices: our formant synth (`FORMANT.md`), espeak, babble, Piper, Web Speech; presets, effects |
| `lingo/` | Text language: templates, lexicon, traits, memory (`MEMORY.md`), scene awareness, relationships (`RELATIONS.md`) |
| `avatar-2d/` | SVG paper-doll builder; `js/parts/chibi2-parts.js` registers every Chibi 2 part id |
| `avatar-3d/` | Three.js characters (Chibi 2/2.5 — read `CHIBI2.md`), creatures, spell effects, vehicles + catalog, mounts |
| `avatar-3d/chibi3`, `chibi4/`, `kestrel/` | Character-system trials (on hold / in trial) — `CHIBI3.md`, `chibi4/README.md`, `kestrel/README.md`. Kestrel's Meshy male/female are NOT for games (owner 2026-11-11) |
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
| `prototypes/spirehold/` | Semi-idle city defence | playable |
| `prototypes/tinyrts/` | Symlink to its own repo `~/claude/tinyrts` — commit THERE; keep its `master` green (stable serves it) | playable |
| `prototypes/lanternfall/` | Side-scrolling pixel action RPG (`docs/HANDOFF.md` = remaining work) | playable |
| `prototypes/bannerline/` | Lockstep RTS of game modes (lane wars, hunters vs farmers) | done |
| `prototypes/thousandvale/` | Online RPG server (Node + WebSockets + Postgres), 8490/8491 | on hold — read `docs/ON-HOLD.md` |
| `prototypes/knockabout/` | Floppy physics brawler, own server 8470-8473 | live |
| `prototypes/rogueloot/` | Co-op action RPG, own server 8580-8583 | on hold |
| `prototypes/roverlands/` | Co-op vehicle game, own server 8550-8553 | on hold |
| `prototypes/tumblefair/` | Phone party game, own server 8480/8483 (`docs/MINIGAMES.md`) | live |
