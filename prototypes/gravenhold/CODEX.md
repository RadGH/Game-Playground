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
- **M1 complete:** Added a browser adapter that loads Thousandvale's rules data and constructs its real engine, room, character, field, and combat pipeline. Class selection rebuilds the rules-backed character; Space performs a basic attack; the hotbar resolves real skill slots with actual mana/cooldowns and `sig-fx`; a target health readout and hit feedback show landed damage. The smoke test confirms a Star Dart damages the target.
- **M2 complete:** The Moor Hound uses avatar-3d's shared `createCreature` builder; Thousandvale's monster AI and combat remain rules-backed. The focused Playwright test covers AI movement, damage, death/XP, and verifies the Warrior hotbar no longer shows Starcaller skills after class selection.
- **M3 complete:** Added a seeded nine-room floor layout with connected corridors and door openings, room-based hound placements using the shared creature model and rules entities, stairs that descend to a newly seeded floor, and a live minimap showing rooms, stairs, and player position. Initial class state is Warrior in both the picker and rules character; the M1 smoke test asserts this before changing the picker. M3 smoke coverage verifies room connectivity, minimap presence, and stair descent to a new floor.
- **Next:** M4 loot, drops, inventory, equip, and visible gear.
- **Run/test:** Use the existing playground dev server at `http://127.0.0.1:8401/prototypes/gravenhold/`; run `npx playwright test prototypes/gravenhold/tests/smoke.spec.js`.
- **Known issue:** The dungeon uses a compact fixed 3×3 room grid; seeds vary room dimensions and monster counts. Player movement is not yet blocked by walls, and combat targeting still centers on the original practice hound.
