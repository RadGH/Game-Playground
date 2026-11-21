# Wyrmroad

**Status:** round 1 LIVE 2026-11-20 — six chapters, four heroes, story with two endings, 144 gear pieces, local co-op 1–4 and online rooms. Not yet played by a person.
**Play:** LAN stable http://192.168.1.34:8400/prototypes/wyrmroad/ (https for controllers: https://192.168.1.34:8442/prototypes/wyrmroad/) · dev 8401 · public https://games.radgh.com/wyrmroad/ · online rooms: LAN dev `tools/game-servers.sh start wyrmroad-dev` (8641 / wss 8643; stable 8640 / 8642), live wss://games.radgh.com/ws/wyrmroad
**Next:** owner play-test (feel, difficulty, phone frame rate on a real device); read in-game reports first.
**Parked:** enemy groups that work together beyond healers, a cart-ride bonus stage, New Game+, more heroes (genre sheet "grow it" list — docs/PLAN.md Rounds). Model Library Meshy enemies not used (owner decides).

A side-scrolling 3D beat 'em up. Four Chibi 2.6 heroes — Vanguard, Duelist, Arcanist, Warden — fight down the
Wyrmroad, an old road that runs along the back of a sleeping stone wyrm, chasing the gang that stole Millbrook's
bell-stone. Six chapters, three twists, two endings. Every chapter has its own weapons and armour, worn on the body.
Play alone (with an optional bot companion), with up to four people on one screen, or online. Independent project by
Radley Sustaire.

Read first: `docs/PLAN.md` (§0: every decision, the story, classes, gear), `docs/ARCH.md` (code map + contracts).

## How it plays
- **Move** along the street and up/down its depth (W = up the screen). **Attack** strings three hits; the third knocks
  the enemy off their feet. **Heavy** breaks shields and launches. **Jump** + Attack strikes from the air; **Dash**
  (or double-tap a direction) + Attack lunges. Walk into an enemy to **grab** it — Attack knees, Heavy throws, and a
  thrown enemy bowls over whoever it hits. **Block** (hold) cuts frontal blows; block just before a hit to stagger
  the attacker. Two **spells** use mana (mana also comes back from landing hits). **Breaker** clears everyone around
  you for a little of your health — it never kills you.
- **Stop and go:** the screen locks at each fight until every wave is beaten, then GO points on. Crates hold food,
  gold, gear or a weapon to pick up for a few swings (pitchfork, mossy log, anchor, candelabra, wyrm scale, chain).
- **Lives:** three per chapter. A downed hero can be picked up by a partner standing beside them; otherwise they lose a
  life and come straight back. Out of lives → retry from the last fight.
- **Enemies** each have one job: thugs brawl, knifers dart in, bruisers grab, wolves and hounds pounce, briar sprites
  float and shoot, Lantern guards hold a shield to the front (hit from behind or use Heavy), crossbows line up a shot,
  priests heal the others (hit them first), zealots charge and burst into fire when they fall, stoneskins shrug off
  light blows, wyrmlings spit fire. Only two enemies swing at one hero at a time; the rest circle. Every attack winds
  up visibly first.

## Files
| Path | What |
|---|---|
| `js/sim/brawl.js` | the rules: state, step, moves, damage, blocks, grabs/throws, spells, Breaker, crates, pickups, lives/revive |
| `js/sim/foes.js` | enemy brains (attack tokens, slots, ranged spacing, boss phases, summons) |
| `js/sim/stage.js` | stop-and-go sections, waves, bosses, chapter won/lost |
| `js/sim/bots.js` | hero bots (solo companion, dropped online players, tests) |
| `js/sim/items.js` | THE stat function (`heroStats`), item numbers, loot rolls, the dressed Chibi look |
| `data/` | classes + spells, enemies + bosses, chapters (+ ground weapons, ally), story (scenes, lines, speakers, choice), items (generated), tuning |
| `tools/build-items.mjs` | the gear design tables → `data/items.json` |
| `tools/botrun.mjs`, `tools/stall.mjs` | bots play chapters; find fights that never end |
| `js/render/` | three.js drawing: `view.js` (createView, createPreview, renderPortrait, renderItemIcon), `actors.js`, `themes.js` (six streets + the wyrm's spine), `fx.js`, `props.js`, `kit.js` |
| `js/main.js`, `js/game.js`, `js/save.js`, `js/ui/`, `js/input/`, `js/audio.js` | screens, local session, saves + cloud conflict kit, HUD, touch/keys/pads (one table: `js/input/bindings.js`), sound |
| `server/`, `js/net/`, `js/ui/online.js`, `ops/` | online rooms — see `docs/ONLINE.md` |

## Tests
- `node --test prototypes/wyrmroad/tests/sim/` (in `npm run test:unit`) — 17 rule tests: every chapter finished by one
  bot and by four, same seed = same chapter, W = up the screen, combos, lane-align, blocks/perfect blocks, shields,
  grabs and throws, Breaker, spells, attack tokens, revives, tuning numbers are read, crates/pickups, gear rules
  (rarer = stronger, legendary > rare, stats add up once), every clip and story id exists.

- `node --test prototypes/wyrmroad/tests/net/` — 30 online tests (rooms, snapshots, rejoin, drop-in, host tools, live server).
- `node --test prototypes/wyrmroad/tests/ui/` — save round-trip, conflict summary, loot to the right hero.
- Browser: `tests/walk.mjs` (strict, 31 screens × desktop + phone), `tests/controls-browser.mjs` (keys, touch, pads),
  `tests/net/online-browser.mjs` (desktop host + phone guest through the real play screen), `tests/render-shots.mjs`,
  `tests/ui/tour.mjs`, `tests/card-shot.mjs` (the games.radgh.com picture).

## History
- 2026-11-20 — round 1 live: render, screens/HUD/saves and online built by three helpers; review fixes (phone camera,
  touch labels, creator close-up, skin colour reaching the body, item icons drawn from the 3D models, floating numbers
  stacking, online ready-up, phone touch stick on real Chrome).
- 2026-11-20 — round 1 started: plan, story, data, rules + bots + tests (lead); render, screens and online by three
  helpers in parallel.
