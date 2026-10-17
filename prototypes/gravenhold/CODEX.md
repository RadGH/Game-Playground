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
- **M3 fixes complete:** Player movement resolves against wall boxes, monsters cannot cross walls, skills and attacks select the nearest living monster, and camera-side wall sections are cut down for an isometric cutaway. Playwright coverage exercises wall blocking and nearest-target selection.
- **M4 complete:** Thousandvale loot drops can be picked up into a 12-slot bag; a full bag shows a clear message and leaves the item in-world. The inventory shows worn equipment slots and a comparison card with candidate and worn stats. Equipment appearance updates on the hero. Wand attacks still resolve through Thousandvale's real combat path, including its three-projectile fan implementation. Existing pickup/equip smoke test passes; explicit fan-hit verification remains a known gap.
- **M5 in progress:** All classes from Thousandvale's loaded class table populate the selector and rebuild a rules-backed character with that class's real starter skills. A level-up panel surfaces that class's real skill/talent names. Talent and perk allocation is not yet connected to level-up; this milestone is not complete.
- **Run/test:** Use the existing playground dev server at `http://127.0.0.1:8401/prototypes/gravenhold/`; run `npx playwright test prototypes/gravenhold/tests/smoke.spec.js`.
- **Known issues:** Explicit test coverage for three individually landed fan-wand projectiles is still needed. The level-up panel is presentation-only; it does not yet award/select real talents or perks. The dungeon uses a compact fixed 3×3 room grid; seeds vary room dimensions and monster counts.
