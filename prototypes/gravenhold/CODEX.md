# Standing brief for Codex (read every session)

> **ON HOLD 2026-10-17 — Codex no longer builds Gravenhold. Do not start a session from this file.** See README.md for the hold note.

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
- **M4 complete:** Thousandvale loot drops can be picked up into a 12-slot bag; a full bag shows a clear message and leaves the item in-world. The inventory shows worn equipment slots and a comparison card with candidate and worn stats. Equipment appearance updates on the hero. The debug hook equips the named Wand of the Ninth Star with its loaded arcane fan form. Smoke coverage confirms three projectile spawns and three positive-damage hit events from one attack.
- **M5 complete:** All classes from Thousandvale's loaded class table populate the selector and rebuild a rules-backed character with that class's real starter skills. Level-up advances the real character level, opening Thousandvale's skill talent tiers and awarding perk points using the game's point formula. The panel presents available talent nodes for each skill and reachable perk nodes; picks use Thousandvale's talent rules and perk forest allocation, updating the character build. Smoke coverage verifies that a selected talent changes the skill plan's damage/effect data and that a perk can be allocated.
- **M6 complete:** A start screen lets players choose an unlocked Thousandvale class. Runs span four seeded, increasingly difficult floors; each floor requires clearing its enemies to descend, and floor four uses Thousandvale’s Ossathra boss data and creature look. Death and boss victory end the run with a summary. Gold, best floor, completed runs, and class unlocks persist in localStorage with guarded reads/writes. Focused Playwright coverage checks start, gated progression, boss victory/unlocks, and death summary.
- **M7 complete:** Keyboard controls player one; each connected gamepad joins as a separate player when its A button is pressed, tracked by gamepad index. Each player gets a Thousandvale character, individual movement, attack and skill inputs, class selector, and health/mana HUD frame. The orthographic camera centers the living party and widens as they spread. Loot goes to the nearest player, splitting pickup access fairly by position. Fallen players can be revived by a nearby partner pressing E (keyboard) or A (gamepad); the run ends when all players are down. Injected fake-gamepad coverage confirms a second pad creates its own roster entry; the complete smoke suite passes.
- **Run/test:** Existing server `http://127.0.0.1:8401/prototypes/gravenhold/`; run `npx playwright test prototypes/gravenhold/tests/smoke.spec.js`.
- **Known issues:** The dungeon uses a compact fixed 3×3 room grid; seeds vary room dimensions and monster counts. Meta gold currently comes from picked-up loot; shops and crafting-lite remain for later work. Pad players use the gamepad’s A/X/Y/LB/RB inputs directly; there are no separate on-screen hotbars for pad players yet.
