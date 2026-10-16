# Standing brief for Codex (read every session)

You are building **Gravenhold** in `prototypes/gravenhold/` (read README.md for pitch and milestones). Work one milestone at a time, in order, finish it with a passing test, then move on if budget remains.

## Rules
- Edit ONLY files under `prototypes/gravenhold/`. Shared code (thousandvale, avatar-3d, icons, sfx, shared/, etc.) is READ-ONLY. If it needs a change, add a line under "Requests for Claude" below and work around it with an adapter in `js/adapters/`.
- Do NOT run git commit/push/add. Do not touch other games' servers.
- Plain HTML + standalone `.css` + ES modules, no build step. Data in JSON. Relative import paths only, never a leading `/`. NEVER use `import ... with { type: 'json' }` (breaks Steam Deck browsers): load JSON with `fetch` or reuse the modules Thousandvale already loads data with.
- Import shared code by relative path (`../../thousandvale/js/...`, `../../../avatar-3d/js/...`); do not copy it.
- Original names only. Banned words in any player-facing text: ember, veil, muster, delve, horde, heroic, mythic. No third-party game names in UI or data.
- Fixed numbers shown to the player go through `shared/format.js` (never "25.02000000000001").
- Keep a short `README` per folder you add. Tests: Playwright specs or `node --test` in `tests/`. Serve with `python3 -m http.server 8470` from `/home/radgh/claude/playground` (page at `/prototypes/gravenhold/`); the dev server on 8401 also works. Run tests yourself and fix failures before stopping.
- Be economical: read only the files you need, do not dump big files, do not rewrite working code.
- At the end of EVERY session update "Progress" below: done, next, how to run/test, known problems.

## Requests for Claude
(none yet)

## Progress
- **M0 complete:** Added a single-room playable page with orthographic isometric follow camera, walls/floor, shared Chibi 2 hero, WASD and standard-mapped gamepad movement, and a tilt-shift toggle. Smoke coverage is `tests/smoke.spec.js`.
- **M1 in progress:** Added Thousandvale class selection, three data-driven skill buttons, mana regeneration/costs, cooldown display, and the shared `sig-fx` renderer. The current prototype casts presentation events only; it does not yet resolve basic attacks or skill hits through the Thousandvale combat rules, so M1 is not complete.
- **Next:** Integrate the rules engine for attack/skill resolution and target/hit feedback; then extend the smoke test for cooldown/mana and run it again.
- **Run/test:** Serve from the playground root with `python3 -m http.server 8470`, open `/prototypes/gravenhold/`; run `npx playwright test prototypes/gravenhold/tests/smoke.spec.js`.
- **Known issue:** M1 casting is visual/UI scaffolding and is not yet combat-functional.
