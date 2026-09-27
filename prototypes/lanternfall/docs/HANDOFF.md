# Lanternfall — handoff (2026-09-26)

This is the page to read before continuing Lanternfall. It gives the state of the build against the 39-milestone plan in
`REVIEW.md` §d, says exactly which parts are **stand-ins**, and lists every remaining item in the order it
should be done. Canon is still `00-OVERVIEW.md` (v2). How to run each tool is in `../README.md`.

## Where it stands

**Playable end to end.** Title → class pick → new game → the Guild Hall → the Act 1 main path → Mother Tallow →
the Crown Lamp → Acts 2–6 → the last boss → the ending line. Lamp-post saves load back, death leaves a purse and
respawns you at your lamp-post, and Rekindle resets a room. `dev/flow.mjs` walks the whole campaign headless, 87
rooms with no errors. `tests/e2e/campaign.spec.js` walks Act 1 into Act 2 and covers save → load → die → respawn.
Unit tests: `node --test prototypes/lanternfall/tests/unit/*.test.js` (102 tests). Browser: `npx playwright test prototypes/lanternfall/tests/e2e/` (4 tests, incl. a phone first-launch).

**What makes that possible is a stand-in layer.** Most of it is generated or borrowed rather than authored. That is
fine for a stable prototype, but anyone continuing needs to know which parts are placeholders:

| Stand-in | Where | How to replace it |
|---|---|---|
| **Hand-made rooms.** Only `a1_n01_r0` (Guild Hall) and `a1_n08_r1` (Tallow Chapel) are authored. Every other `A` room is a kit room dressed for its node type. | `js/modes/actmap.js` `standInRoom()`; rooms carry `standIn: true` | Author `rooms/act<N>/<id>.json` (format: `10-TECH-DATA.md` §6), add it to `rooms/index.json`, run `tools/room-check.mjs <id>`. The loader prefers a listed file automatically. |
| **Bosses 2–6.** Saint Gnaw, the Sluicemaw, the Lampless Widow, the Bellfather and Ossery (twice) run **Mother Tallow's script**, renamed and scaled ×1.9 health and ×1.6 damage per act. | `js/ai/bosses.js` `bossDef()`; one empty slot per boss in `js/ai/bosses/<id>.js` (`export const boss = null`) | Fill that boss's file with a definition (hooks: `js/ai/bosskit.js`) from `05-BESTIARY-BOSSES.md` §18, §20–24. Tallow in `bosses.js` is the worked example. The three minibosses have slots too (`mb_*.js`); `standInRoom()` places one in its elite room once its file is non-null. |
| **Monster abilities.** All 30 monsters exist, but 26 have simplified attacks: rope climbing, pulls, cone sprays, stealing, gong reflect, hail shedding and the Unlit's unseen-only movement are mapped to contact/melee/lunge/dive/projectile. | `data/enemies.json`: each simplification is in a `_note` | Add the missing behaviours to `js/ai/brain.js` (new attack kinds or move types), then remove the `_note`. `tests/unit/bestiary.test.js` checks that the references resolve. |
| **Monster art.** Only the 4 Act 1 monsters have sprites. The other 26 draw as a coloured block with glowing eyes. | `data/sprites.json` / atlas; `color` on each monster | Add `en_<id>` sprites and set `sprite` on the monster. The renderer prefers the sprite when it exists. |
| **Hub dressing.** Stand-in hubs for Acts 2–6 place shops and NPCs from a small table. | `ACT_PEOPLE` in `actmap.js` | Superseded as each hub room is authored. |
| **Ending.** Relighting the Act 6 lamp and taking the exit shows one line and sets `flags.game_complete`. There is no final choice, no endings A/B/C and no credits. | `takeExit` in `js/main.js` (`to.ending`) | M33. |
| **Modes menu.** Floodgate, Long Descent, Daily, Boss Rush and Trials say "opens in a later milestone". | `ctx.actions.startMode` in `js/main.js` | M20, M24, M34, M35. |

## Milestones (REVIEW.md §d) — status

✅ built · ◐ built in part (what's missing is listed) · ✗ not started

| M | Name | State | What remains |
|---|---|---|---|
| 1 | Cell world | ✅ | |
| 2 | Rooms on screen | ◐ | canvas2d debug view (moved to M38) |
| 3 | Light truth | ✅ | |
| 4 | Currents + floodlines | ✅ | the showcase balcony view in the Guild Hall (the balcony exists; the vista does not) |
| 5 | Bindings | ◐ | gamepad; drop-through platforms |
| 6 | Fighting | ✅ | |
| 7 | Build your own spell | ✅ | `wick-rank` utility tool (M36) |
| 8 | RPG shell + Ledger | ✅ | `reach-check` covers rooms only, not gear |
| 9 | Save + Rekindle | ✅ | brass rim on pinned cells looks like plain brick in some themes |
| 10 | Voices, words, sound | ✅ | bark pre-render |
| 11 | The map you walk | ✅ | flood clock; solution-script runner |
| 12 | Act 1 first half | ◐ | author a1_n02_r0 (First Step, brass-rim beat), a1_n03_r0 (Candlemarket: lob over a wall to light a socket → light door) and a1_n06_r0 (Drip Gallery plank lesson); opening cutscene `cs_opening` |
| 13 | Act 1 second half | ◐ | author a1_n07_r0/r1 (Melting Stair, molten-wax floodline) and a1_n09_r0 (secret); monster ASCII art |
| 14 | Mother Tallow | ◐ | wax cells hardening into terrain after the fight (`tallow_cooled`); `cs_relight_crown`; camzone; a real sprite rig |
| 15 | Shops | ✅ | |
| 16 | Machines + traps | ✅ | `inspect` tool |
| 17 | Ropes | ◐ | level ropes (climbable cells) work; **grapple and tether are unlocks with no verb yet**, so the Beneath the Crown edge stays locked |
| 18 | Act 2 world | ◐ | all rooms are stand-ins; Knell surrender; affixes are on |
| 19 | Act 2 bosses + boards | ◐ | Sewer-King and Saint Gnaw scripts; Rat-Pipe Warren; skill boards exist (`js/rpg/boards.js`) |
| 20 | Floodgate | ✗ | |
| 21 | Water as terrain | ◐ | swimming + breath work; sluice gates, valves and basins exist as things; Floodwall |
| 22 | Act 3 world | ◐ | rooms are stand-ins; Ferry travel + respec (a respec exists on the character sheet) |
| 23 | Act 3 bosses | ✗ | Lockmaster, Sluicemaw |
| 24 | Long Descent + Daily | ✗ | |
| 25 | Darkness | ◐ | light tiers, lantern and hood exist; Unlit spawning in darkness; oil-economy tests |
| 26 | Act 4 world | ◐ | stand-ins; Moth Oracle tracker |
| 27 | Act 4 bosses | ✗ | Matriarch, Widow |
| 28 | Gravity + bells | ✗ | bells exist as things; gravity bands do not |
| 29 | Act 5 world | ◐ | stand-ins |
| 30 | Bellfather | ✗ | |
| 31 | Act 6 climb | ◐ | stand-ins; wind zones |
| 32 | Storm's Eye | ✗ | Ossery phases; the rain stopping |
| 33 | Dry world + end | ✗ | endings A/B/C, credits |
| 34 | Classes + Trials | ◐ | 5 classes selectable (2 locked by challenge); challenge tracking; trials |
| 35 | Boss Rush + meta | ✗ | Guild Hall upgrades, 20 achievements |
| 36 | Balance | ✗ | `sim-lanternfall`; XP pacing; difficulty tables exist in data |
| 37 | Sound pass | ◐ | sfx + voices + score v1 are wired; mix, boss pulse layers |
| 38 | Polish + access | ◐ | settings screen exists (not every setting is applied yet); gamepad; perf auto-degrade; menu fit |
| 39 | Ship | ◐ | stable + pages published; full e2e bot route for acts 1–6 exists as `dev/flow.mjs` (make it a spec) |

## Recommended order to finish

1. **Act 1 hand-made rooms** (M12–M13): a1_n02_r0, a1_n03_r0, a1_n06_r0, a1_n07_r0/r1 and a1_n09_r0. These are the first impression. The node gifts in `js/modes/campaign.js` (`NODE_GIFTS`) already grant each room's lesson unlock when you enter.
2. **Grapple + tether verb** (M17). It unlocks Beneath the Crown and is used from Act 2 on.
3. **Real boss scripts, one per act** (M19, M23, M27, M30, M32). Each is a `BOSSES` entry plus any arena gimmick.
4. **Monster behaviours behind the `_note`s**, then sprites for the 26.
5. **Floodgate** (M20), then **Long Descent/Daily** (M24). Both reuse kits and the wave director.
6. **Endings + credits** (M33), Trials + class challenges (M34), Boss Rush + achievements (M35).
7. **Balance sim** (M36), sound pass (M37), gamepad + settings application + perf auto-degrade (M38).

## Things to know before touching the code
- **Rooms that are not listed are never fetched.** `readRoomFile` in `main.js` only loads ids that are in `rooms/index.json`. Anything else goes to `standInRoom()`, so the console stays clean.
- **Every game gets its own loader.** `roomLoader` uses the game being built (`made`), not the current one. Before this fix, a new game started from the title screen generated its kit rooms from the *title's* seed.
- **Boss flags are per room.** A boss thing can carry `flag` (stand-ins use `boss@node`), so Ossery can be fought twice. Dying sets both `<flag>_dead` and `<bossId>_dead`.
- **Leaving an act.** The last node's `@next` goes to the next act's first room only once `flags.lamp_<act>` is set. Before that, the player gets "Relight the Great Lamp before you go on." After Act 6 the result is `{ ending: true }`.
- **An exit can be verb-gated.** Give it `needsVerb: 'grapple'` and the room checker skips it for acts that do not have that verb yet.
- **Arena lock.** `game.arenaLocked` blocks exits while a boss is awake. The Great Lamp refuses you until the boss is dead.

## Code review, 2026-09-26 (fixed and released)

A review of the whole prototype found 12 bugs, plus one reported from an iPhone. Everything that affects a built
feature is fixed, and each fix has a test (`tests/unit/review-fixes.test.js`, `tests/e2e/campaign.spec.js`,
`tests/e2e/firstrun.spec.js`).

| # | Bug | Fix |
|---|---|---|
| — | **"Before you start" → Done did nothing, on every device.** `ctx.settings` had a getter and no setter, so `done()` threw before the card closed, and every first launch was stuck behind it. | The setter now exists, and the card closes first no matter what fails after. A phone e2e taps from the first launch to the Guild Hall. |
| 1 | Swimming never unlocked in the campaign (the player only read `flags.swimming`) | `player.js` also reads `hero.unlocked.mechanics` ('swimming', the a3_n01 gift) |
| 2 | Using a consumable deleted it and did nothing; the belt keys did nothing | New `js/rpg/consume.js`: tonics heal over time, oil, Gillwater, Clearwater, thrown pots; belt keys Z/X/C/V |
| 3 | An Iron Wick death did not delete the save | The death screen's button calls `respawn`, which deletes the slot |
| 4 | The death purse was never put back in the world | It is spawned when you re-enter that room; picking it up clears it |
| 5 | Loading dropped play time, stats, the purse, visited rooms and the bestiary | Saved and restored |
| 6 | The act maps (~31 KB) were written into every save | Removed; they are rebuilt from the seed |
| 7 | Screen shake and bloom read in the wrong units (shake was ~0, bloom always off) | Shake is 0–1; bloom maps off/low/high |
| 8 | "Return to the lamp-post" counted a death | The purse drops, but no death is counted |
| 9 | Save-slot cards showed a blank class, 0 lamps and 0 deaths; the character totals were always 0 | Filled in from the save and the run |

**Findings that touch unbuilt features** (only made to stop failing silently):

| # | Finding | What was done / what the milestone must do |
|---|---|---|
| 10 | Class switch ("Answer the call") called a missing action and silently closed | It now says it opens with M34. **M34** must add `ctx.actions.switchClass` and `trackChallenge`. |
| 11 | Modes can never unlock (`profile.modes` is an array; the title read it as an object; nothing writes the profile), and starting a missing mode showed no message on the title | The title reads both shapes, and a missing mode shows a message. **M20/M24/M34/M35** must write `profile.modes` when a boss dies and add `js/modes/<id>.js`. |
| 12 | The mode API held the boot-time settings | It is now a getter. Matters once any mode exists. |

**Phones:** there are no touch controls. A phone can get through every menu into the game, but cannot play it
(the "Desktop recommended" card says so). Touch play would be its own milestone.
