# Grimring

**Status:** new 2026-11-15 — playable: Gauntlet, Duel, Watch; all twelve Model Library fighters
**Play:** LAN stable http://192.168.1.34:8400/prototypes/grimring/ (https for controllers: https://192.168.1.34:8442/prototypes/grimring/) · not public yet (owner decides; see Parked)
**Next:** owner playtest; tune fighters from what feels off; then decide whether it goes on games.radgh.com
**Parked:** public listing (the Model Library GLBs are left out of GitHub Pages because of size — publishing needs them copied or served by RGS); ratings/insights (no game server); four-legged fighters (the library has none)

A small arena to see the **Model Library**'s Meshy fighters (`model-library/`) in action, one or two at a time.
Owner's ask (2026-11-15): "Create a new game using those Meshy models we created, just a simple arena type of game to
see 1-2 models at a time."

## How it plays
- **Gauntlet** — pick a fighter, then eight rounds against one or two foes (round 6 is always a big one: ogre, orc or
  zombie). Health carries over; win a round → heal 35% and choose one of three boons. Best result per fighter is kept.
- **Duel** — you against one foe, or two. Easy / Normal / Hard changes how hard foes hit and how fast bots react.
- **Watch a fight** — pick two or three; bots play every side.
- Every fighter: **Attack** (hold to keep swinging), a **Special** (heavy sweep, blast circle, shield, arrow fan,
  scream, roar or lunge) and a **Dodge** (you pass through blows and shots). Blasts are marked on the ground first.
- Keys: WASD/arrows, Space or J, E or K, Shift or L, Esc. Controller: stick/d-pad, A, X/Y, B, Start. Touch: stick +
  three buttons. Menus work with the controller (padnav).

## Files
| File | What |
|---|---|
| `data/fighters.json` | one row per model (same id as `model-library/data/models.json`): health, speed, damage, timing, reach/range, special, weapons; boons; gauntlet rounds; difficulty |
| `js/sim/fight.js` | the fight rules, pure + seeded (`createFight`, `step`, bots in `think`) |
| `js/sim/gauntlet.js` | rounds, foe picks, boons, healing |
| `js/render/actor.js` | loads a GLB once, clones it per fighter, removes hip travel from clips, times each swing clip to the rules, hit flash |
| `js/render/weapons.js` | swords, axe, club, spear, staves, bow, shield made in code and hung from the hand bones (`HOLD` = how each sits) |
| `js/render/stage.js` | renderer, arena (sand, wall, gates, stands + crowd, torches, banners), camera, effects pool |
| `js/main.js` | screens, HUD, menu, settings, bug reports, `window.gameEye` |
| `js/ui/text.js` | every stat/special sentence from the real numbers |
| `js/input.js` | keyboard / touch / controller in one key table |

## Tests
- `node --test prototypes/grimring/tests/sim.test.mjs` (in `npm run test:unit`) — every model has a fighter, every bot
  pairing ends, nobody is unbeatable, swings/dodges/blocks/blasts/roars/lunges follow their rules, W = up, boons reach
  the fight, no long decimals on any card.
- `node prototypes/grimring/tests/controls-browser.mjs` — real keys and taps: W up the screen, D right, Space hits,
  touch buttons, Esc pauses (desktop + phone).
- `node tools/walk-screens.mjs grimring` — every screen on desktop + phone (`tests/walk.mjs`).
- `node prototypes/grimring/tests/shots.mjs` — screenshots to look at.

## History
- 2026-11-15 — built: twelve fighters, three modes, arena, weapons, sounds, What's new, credits, reports.
