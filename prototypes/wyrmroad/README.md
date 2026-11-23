# Wyrmroad

**Status:** high-detail models (2026-11-23): a first-start choice between High detail (hand-painted fal.ai monsters + Tabard heroes wearing their gear) and Legacy (Chibi 2.6), switchable live in Settings; the wisps are elementals now. Round 2 (2026-11-21) — three acts: Act I's six chapters, then two choices split the road four ways (24 chapters, 12 per play-through, four endings), staged cinematics, 286 gear pieces, levels to 20, local co-op 1–4 and online rooms. Owner played round 1 (23 reports, all fixed this round).
**Play:** LAN stable http://192.168.1.34:8400/prototypes/wyrmroad/ (https for controllers: https://192.168.1.34:8442/prototypes/wyrmroad/) · dev 8401 · public https://games.radgh.com/wyrmroad/ · online rooms: LAN dev `tools/game-servers.sh start wyrmroad-dev` (8641 / wss 8643; stable 8640 / 8642), live wss://games.radgh.com/ws/wyrmroad
**Next:** owner looks at the high-detail models (choice screen, a chapter, the bag) and the play-test of round 2 (feel, difficulty, phone frame rate on a real device); read in-game reports first.
**Parked:** high-detail leftovers (below: giants and flame ghosts stay legacy, the creator and item icons are legacy, no off-hand blade on Tabard); enemy groups that work together beyond healers, a cart-ride bonus stage, New Game+, more heroes (genre sheet "grow it" list — docs/PLAN.md Rounds). Model Library Meshy enemies not used (owner decides).

A side-scrolling 3D beat 'em up. Four Chibi 2.6 heroes — Vanguard, Duelist, Arcanist, Warden — fight down the
Wyrmroad, an old road that runs along the back of a sleeping stone wyrm, chasing the gang that stole Millbrook's
bell-stone. Act I: six chapters and three twists; then the hero's choices pick one of four roads through Acts II and III
(docs/STORY.md), each with its own chapters, bosses, cinematics and ending. Every chapter has its own weapons and armour, worn on the body.
Play alone (with an optional bot companion), with up to four people on one screen, or online. Independent project by
Radley Sustaire.

Read first: `docs/PLAN.md` (§0: every decision, the story, classes, gear), `docs/ARCH.md` (code map + contracts).

## How it plays
- **Controls (PC):** WASD to move, left mouse = Attack, right mouse = Heavy, 1/2 = spells, Space = jump, Shift =
  block, Q = dash, E = grab, R = Breaker. The old key layout is one switch away in Controls. The mouse pointer hides
  while you play with keys or a controller.
- **Move** along the street and up/down its depth (W = up the screen). You can turn round mid-combo. **Attack** strings three hits; the third knocks
  the enemy off their feet. **Heavy** breaks shields and launches. **Jump** + Attack strikes from the air; **Dash**
  (or double-tap a direction) + Attack lunges. Walk into an enemy to **grab** it — Attack knees, Heavy throws, and a
  thrown enemy bowls over whoever it hits. **Block** (hold) cuts frontal blows; block just before a hit to stagger
  the attacker. Two **spells** use mana (mana also comes back from landing hits). **Breaker** clears everyone around
  you for a little of your health — it never kills you; it has a short cooldown and costs more if you spam it.
- **Class moves** (every class upgrades its dash and block): Vanguard — Shoulder Charge, Brace, and the channelled
  **Iron Gale** spin; Duelist — Slipstream, and **Riposte** (block at the right moment to counter); Arcanist — **Rift
  Step** (teleport dash), Mana Ward, Rift Burst; Warden — Shield Rush, Shield Wall. A fourth move opens at level 13;
  levels go to 20.
- **Co-op scales:** more players means more enemies at once, tougher foes and bosses. Health comes back between fights,
  not during them. Each hero has their own bag and gear, and heroes can trade items.
- **Stop and go:** the screen locks at each fight until every wave is beaten, then GO points on. Crates hold food,
  gold, gear or a weapon to pick up for a few swings (pitchfork, mossy log, anchor, candelabra, wyrm scale, chain).
- **Lives:** three per chapter. A downed hero can be picked up by a partner standing beside them; otherwise they lose a
  life and come straight back. Out of lives → retry from the last fight.
- **Enemies** each have one job: thugs brawl, knifers dart in, bruisers grab, wolves and hounds pounce, briar elementals
  float and shoot, Lantern guards hold a shield to the front (hit from behind or use Heavy), crossbows line up a shot,
  priests heal the others (hit them first), zealots charge and burst into fire when they fall, stoneskins shrug off
  light blows, wyrmlings spit fire. Only two enemies swing at one hero at a time; the rest circle. Every attack winds
  up visibly first. Some get knocked back instead of down, some get up quickly; bosses can't be knocked down over and
  over. Acts II–III add hollowborn, root callers, drowned ringers, Silver knights and archers, bounty hunters, kiln
  monks, wingspawn, brood drakes, lantern elementals and Order wraiths, plus giant bosses at the back of the street.
- **Story:** cinematics stage the characters in the street. A short scene plays before every Act II/III boss. Two
  choices (end of Act I, end of Act II) pick the road; the map shows the roads you have walked and the endings found.

## High-detail models (2026-11-23)
Owner: "ask if you want high detail models or legacy … Generate new enemies and consider the old ones as legacy … when we
make those improvements they automatically go into Wyrmroad." The first start asks (`js/ui/models.js`, two picture cards
from `tools/model-cards.mjs`); Settings → Characters switches it live (`settings.models` = `'hd' | 'legacy'`).
- **Enemies and bosses** are fal.ai models (`avatar-3d/fal`, `js/fal.js` + `data/catalog.json`), **heroes** and look-built
  story people are Tabard characters (`avatar-3d/tabard`, `js/tabard.js`). Both are imported straight from avatar-3d,
  never copied: a model fixed or added there shows up in Wyrmroad as is.
- **One table:** `data/hd-models.json` — enemy/boss/speaker id → fal body (+ weapon, tint, glow), or `legacy`, or `tabard`
  (built from their own look). `body` may list several: the first in the fal catalog is drawn, so a planned model
  (bruiser, grell, vessa, thornling, stone golem…) replaces its stand-in the moment it is added to avatar-3d/fal.
  Bosses without a model of their own reuse their faction's, scaled by their height and tinted. Four-legged bodies
  (wolf, drake) move by `avatar-3d/fal/js/beast.js`. Heroes: each look part their gear dresses them in (`dressedLook`) names outfit paints
  (cloth / leather / mail / plate / sage — a new Tabard outfit of that paint is used with no change here), helms,
  shoulders, weapons (`fal:<id>` = any fal weapon) and shields; the form picks the male or female body. `clips` maps every
  Wyrmroad clip to the model clips; `strike` times a model's blow to the sim's wind-up.
- **Code:** `js/render/hd-map.js` (pure: who gets what), `js/render/hd.js` (builds bodies with the same shape as the
  legacy ones: drawn height = data height, facing, wind-up glow, hit flash, dead fade, outline; enemy body parts merged
  into one mesh shared by every enemy of that kind). `actors.js` asks for an HD body first and falls back to the legacy
  one for anything without a model, or when a model fails to load. Portraits and the bag's 3D hero use HD too.
- **Stays legacy, on purpose:** the giants at the back edge (Undermaw, its hand, Ossmara) and the two flame ghosts
  (Aldric Eternal, the Lantern Wraith); the hero creator (its face, hair and skin choices are Chibi features) and the
  item icons. Tabard has no off-hand blade yet, so the Duelist's second blade is not drawn in HD.
- **Tests:** `tests/render/hd-models.test.mjs` (every id exists in the real catalogs, every gear look and every clip is
  covered, gear changes the body, no wisps), the walk picks High detail and walks every screen with it,
  `tests/render-shots.mjs --models hd`.

## Files
| Path | What |
|---|---|
| `js/sim/brawl.js` | the rules: state, step, moves, damage, blocks, grabs/throws, spells, Breaker, crates, pickups, lives/revive |
| `js/sim/foes.js` | enemy brains (attack tokens, slots, ranged spacing, boss phases, summons) |
| `js/sim/stage.js` | stop-and-go sections, waves (scaled by player count), bosses, pre-boss hold, chapter won/lost |
| `js/sim/big.js` | giant bosses at the back edge (exposed weak points) and Ossmara's sky fire on the friendly roads |
| `js/sim/route.js` | the hero's road: Act I + the two choices → chapter list, progress, old-save migration |
| `js/sim/bots.js` | hero bots (solo companion, dropped online players, tests) |
| `js/sim/items.js` | THE stat function (`heroStats`), item numbers, loot rolls, the dressed Chibi look |
| `data/` | classes + spells + class moves, enemies + bosses, chapters (+ ground weapons, ally), story (scenes, lines, speakers, choice), `acts.json` + `story-acts.json` (Acts II/III, merged at load), items (generated), tuning |
| `tools/build-items.mjs` | the gear design tables → `data/items.json` |
| `tools/botrun.mjs`, `tools/stall.mjs` | bots play chapters; find fights that never end |
| `js/render/` | three.js drawing: `view.js` (createView, createPreview, renderPortrait, renderItemIcon), `actors.js`, `hd.js` + `hd-map.js` (high-detail models), `themes.js` (Act I streets) + `themes-acts.js` (18 Act II/III streets), `hands.js` (two-handed grips), `stage.js` (staged cinematics), `fx.js`, `props.js`, `kit.js` |
| `js/main.js`, `js/game.js`, `js/save.js`, `js/ui/`, `js/input/`, `js/audio.js` | screens (map with acts and roads: `js/ui/map.js`; pre-boss scenes: `js/ui/bossscene.js`), local session, saves + cloud conflict kit, HUD, touch/keys/pads/mouse (one table: `js/input/bindings.js`; pointer hiding: `js/input/cursor.js`), sound |
| `server/`, `js/net/`, `js/ui/online.js`, `ops/` | online rooms — see `docs/ONLINE.md` |

## Tests
- `node --test prototypes/wyrmroad/tests/sim/` (in `npm run test:unit`) — rule tests: every one of the 24 chapters
  finished by one bot and by four, every road's route and choices (`route.test.js`, `acts.test.mjs`), round 2 rules
  (`round2.test.mjs`: co-op scaling, Breaker cooldown, knockdown kinds, kit moves, the 1-HP bug), same seed = same chapter, W = up the screen, combos, lane-align, blocks/perfect blocks, shields,
  grabs and throws, Breaker, spells, attack tokens, revives, tuning numbers are read, crates/pickups, gear rules
  (rarer = stronger, legendary > rare, stats add up once), every clip and story id exists.

- `node --test prototypes/wyrmroad/tests/net/` — online tests (rooms, snapshots, rejoin, drop-in, host tools, live server,
  the host's road, pre-boss scene hold + release over real sockets).
- `node --test prototypes/wyrmroad/tests/ui/` — save round-trip (old saves → Act I choice), conflict summary, loot to the
  right hero, sound map. Render: `tests/render/` (stage director, two-handed grips), `tests/render-geometry.mjs` (roofs
  sit on walls).
- `tests/ui/layout-browser.mjs` — map places line up with their buttons at 8 window sizes, no layout shift from boss bars.
- Browser: `tests/walk.mjs` (strict, 34 screens × desktop + phone; starts on the models choice and plays in High detail), `tests/controls-browser.mjs` (keys, touch, pads),
  `tests/net/online-browser.mjs` (desktop host + phone guest through the real play screen), `tests/render-shots.mjs`,
  `tests/ui/tour.mjs`, `tests/card-shot.mjs` (the games.radgh.com picture).

## History
- 2026-11-23 — high-detail models: first-start choice + Settings switch, fal enemies and Tabard heroes through one
  table (`data/hd-models.json`), HD portraits and paper-doll; Lantern Wisp → Lantern Elemental, Briar Sprite → Briar Elemental.
- 2026-11-21 — round 2: Acts II and III (four roads, four endings, 18 new chapters and bosses, giant back-edge bosses,
  Ossmara as friend/foe), staged cinematics, class moves, Iron Gale, co-op scaling, mouse controls, two-handed grips,
  body forms, softer face outlines, fixed roofs/boats, and all 23 round-1 reports (helpers: sim, render, screens).
- 2026-11-20 — round 1 live: render, screens/HUD/saves and online built by three helpers; review fixes (phone camera,
  touch labels, creator close-up, skin colour reaching the body, item icons drawn from the 3D models, floating numbers
  stacking, online ready-up, phone touch stick on real Chrome).
- 2026-11-20 — round 1 started: plan, story, data, rules + bots + tests (lead); render, screens and online by three
  helpers in parallel.
