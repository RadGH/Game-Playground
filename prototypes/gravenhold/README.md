# Gravenhold

Side experiment (owner Radley Sustaire, 2026-10-16, independent project, sandbox, not public). Built by OpenAI Codex (cheap model) under Claude's supervision; Claude does not write the game code. Read `CODEX.md` first if you are the builder.

## Pitch
The run structure of the old Roguelike (RSG-Demos game2: 3-10 minute dungeon runs, floors, a boss, death, meta unlocks, 1-4 local co-op drop-in) rebuilt in 3D with Thousandvale's classes, spells, items and look. Single player first, then 1-4 local co-op. The fan wand (three real projectiles) and all the Thousandvale loot (affixes, uniques) are in from the start.

## Camera
Default: **classic isometric, orthographic**, fixed yaw 45 deg, pitch about 35 deg, follows the hero (the average of all heroes in co-op, zooming out a little as they spread). Optional **tilt-shift** look (a blur band top and bottom, slightly boosted saturation, toy-like), toggled in settings and on by default only on High tier. Walls between camera and hero fade out.

## Reuse (import by relative path, read-only, never copy, never edit)
From `../thousandvale/` (path is `../../thousandvale/...` from this folder):
- Rules: `js/rules/` (index.js, cast.js incl. `resolveWand`, monster-ai.js, packs.js, progression.js, loot-pool.js, affixes.js, character.js), data `data/rules/*.json` (classes-tv, skills-tv, talents, perks, monsters-tv, combat, affixes, gear-tv, loot-pool, projectiles, starter-kits).
- Graphics: `js/client/` scene.js, gfx-tiers.js, atmos.js, surface-mat.js, sig-looks.js + sig-fx.js (class spell effects), actors.js (monster drawing), projectile-kinds.js, fx-level.js, gear-look.js.
- Input: `js/client/input/` (gamepad.js: mind the `activePad` lesson - every player needs their own pad index, not the global active one).
From the playground: `avatar-3d/js/chibi2.js` + `class-outfits.js` (heroes), `avatar-3d/js/creatures.js` (monsters), `icons/` (skill/item/gear icons), `sfx/js/sfx.js` (sound), `shared/` (format.js, tooltip.js, store.js).
Gravenhold adds only its own adapters (`js/adapters/`) so shared files are never touched. If a shared file must change, write a request in CODEX.md.
References only (do not import): Farhold, Emberveil, and the RSG-Demos game2 repo (`git -C ~/claude/rsg-demos show HEAD:game2/README.md`).

## Milestones (each: one Codex session, ends playable + with a test)
- **M0** Skeleton page, iso orthographic camera (+ tilt-shift toggle), one room with walls/floor, a Chibi 2 hero walking (WASD + gamepad), `tests/` smoke test.
- **M1** Pick a Thousandvale class; basic attack + 3 skills from the real rules/data; hotbar, cooldowns, mana; spell effects via sig-fx.
- **M2** Monsters from Thousandvale data drawn with creatures/actors, their real AI; hits, deaths, XP.
- **M3** Procedural dungeon floors (rooms, corridors, doors, stairs, minimap), seeded.
- **M4** Loot from the real items/affixes/uniques (incl. fan wands firing 3 projectiles), drops, inventory, equip, gear shows on the hero.
- **M5** All 32 classes selectable; level-up with talents and perks from the real data.
- **M6** Run structure like the Roguelike: floors, boss, death ends the run, gold/meta unlocks between runs, 3-10 minute pacing, shops/crafting-lite.
- **M7** Local co-op 1-4: join by pressing a button, one gamepad each (+ keyboard), shared camera, per-player HUD, revive.
- **M8** Polish: Thousandvale atmosphere/props and Low/Medium/High tiers, sfx, phone and Steam Deck layout, final test pass.
Adjust as you find things; note changes in CODEX.md Progress.
