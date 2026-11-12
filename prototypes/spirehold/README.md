# Spirehold

> **QA pass pending** (added 2026-11-11): the next time this game is worked on, run `tools/prepublish-check.sh spirehold` from the playground and fix what it finds — game-lint (on 2026-11-11: 5 browser-tooltip, 1 root-path), modules nothing loads (`tools/game-reach.mjs`), and a `tests/walk.mjs` that walks every screen on desktop + phone (`tools/walk-screens.mjs`; none yet). Replace this note with the **Status / Play / Next / Parked** block (`~/claude/docs/game-standards.md`) and add `spirehold` to `tools/qa-passed.json`. Publishing this game refuses until the checks pass.

A semi-idle city defence game (2026-11-08). Owner brief, verbatim in `docs/PLAN.md`: a city sim to play for ~40 hours
and keep building bigger cities, **without micromanaging the city** — only the defence: huge sieges, spells, explosions
and meteors from towers and mages, D&D-style adventuring parties sent on quests of varying difficulty (rewards on a win,
empty-handed on a loss), and semi-idle so it can run on another monitor and still progress.

Play: stable `http://<LAN-IP>:8400/prototypes/spirehold/` (https 8442 for a controller); public
`https://games.radgh.com/spirehold/`.

## How it is built

No build step, plain ES modules. The sim is **pure** (seeded rng, `dt` and `now` passed in, no DOM) so node tests and the
pacing bot run the real rules.

| File | What it does |
|---|---|
| `js/sim/data.js` | Every name and number: 13 foes + 5 siege leaders, 9 towers with two path choices each (levels 10 and 30), 8 spells, 7 mage schools, 9 landmarks, 11 hero classes, 6 races, 8 traits, 8 quest kinds, 4 quest lengths, 28 relics, 33 research nodes, 6 realms, 10 Legacy perks, name parts. |
| `js/sim/rules.js` | **All the curves** (`TUNE`) and derived numbers: bonuses from research + relics + landmarks + realm (`bon`) and Legacy multipliers (`lm`, each rank multiplies), enemy hp/gold per wave, tower stats, wall, mana, mage damage, quest odds (`questOdds` — power vs rank difficulty, class tags vs the quest's needs, healer/front-liner checks, traits, races) and rewards, Crowns. |
| `js/sim/battle.js` | The battle around the walls (runtime `B`, never saved): waves built from the realm's mix (same seed + wave = same wave), sieges every 10th wave with a named leader, Great Sieges every 25th; foes walk in on polar coordinates and hammer the wall; towers (arrow/bolt/shell/flame/frost/chain/missile/beam/meteor + every branch effect), mages, heroes on the walls, player spells and apprentice auto-cast, burning ground, statuses (slow, stun, burn, strip, shatter, ward). A breach clears the field and falls back three waves. Events for pictures/sound go to `B.ev`. |
| `js/sim/guild.js` | Parties arrive at the tavern (fame from city level), hire them, the quest board (one safe, one even, one stretch), real-time quests (5 min – 8 h), results with a short story, injuries, rare deaths on hopeless tries, relics, revive with starshards. |
| `js/sim/game.js` | `tick()` (city grows itself: people → taxes; city XP from kills and taxes → wider walls, new landmarks, new towers), every player action, `catchUp()` for time away (taxes + battle income at 50%+ of the usual rate, capped 12 h; quests finish on their own clocks; waves never advance offline), `stewardSpend()` (the optional Royal Steward). |
| `js/sim/state.js` | New game, `foundRealm` (prestige: keeps relics, shards, heroes, legacy, totals; Kept Notes keeps some research), save/load with backups, export/import codes (`SPH1:` + base64). |
| `js/render/*` | Canvas 2D. All art is drawn at load (`sprites.js`: 13 foe bodies, tower tops, mages; glow sprites). `draw.js` paints the ground and the city once (houses fill outward with population, landmarks appear when built), then draws walls, foes (turned toward the city, hit flash, statuses), shots, meteors with growing shadows, lightning, beams, rings, particles, craters, a 12-minute day/night with lit windows. |
| `js/ui/panels.js` | Six sheets — Defend, City, Mages, Guild, Research, Realm — built once and refreshed in place; rebuilt only when `sheetSig()` changes. |
| `js/main.js` | Title, loop (fixed 50 ms steps, 1×/2×/3×, pause), input (tap a wall spot, aim spells, drag/pinch/wheel camera), keyboard, controller (spells on A/B/X/Y, bumpers for tabs; `padnav.js` for menus), HUD, banners/toasts, menus, settings, report a bug (`POST /api/report/spirehold`), cloud saves, `window.gameEye`. |
| `js/audio.js` | Shared `sfx/` library, every id rate-limited (a siege fires hundreds of shots a second). |

## Pacing (the bot)

`node tools/sim.mjs <hours> [dt] [seed]` plays with a bot (builds, upgrades cheapest, researches, hires, sends quests at
≥55% odds, casts). `PRESTIGE=1` founds a new realm after an hour without a new best. Results, 2026-11-08 (40 h run):
wave ~97 at 1 h, the first wall around wave 150 at 4–5 h; realm bests then climb 150 → 200 → 250 → 212+ by hour 24,
each realm faster than the last thanks to multiplying Legacy. Tune in `TUNE` (rules.js) and `data.js`, then rerun the bot.

## Things worth knowing

- **A percent-of-health effect beats any wave.** The spiked ditch was first "x% of max health a second" and the bot
  sailed to wave 240 with no losses; it is a flat sting now (`ditchDps`). Keep foe health out of every player effect.
- **Legacy must multiply.** Foe health grows ~12% a wave, so +20% damage is under two waves; a ×1.3-per-rank perk is
  what makes a new realm go further.
- Wave count × `TUNE.crowd` (2): twice the foes at half the health, so a siege looks like a siege. A crowded field
  sends newcomers in bundles (`stack`, drawn ×N) — `B.cap` is 800, 450 on the Light graphics setting.
- `G._rev` (the bonus cache key) is non-enumerable so it never lands in a save.
- **Research cards measure, they do not describe.** `js/sim/research-fx.js` `researchEffect(G, r)` gives "Now" and
  "Next rank" by running the game's own formulas (`wallRegen`, `ditchDps`, `popCap`…) on a read-only stand-in of `G`
  whose bonus table has that research one rank higher (`atRank`) — so relics, landmarks and Legacy are included and
  a formula change can never leave a card lying. A new ranked research needs a row in its `SHOW` table (a test fails).
- **Tower spots keep their bearing.** A tower's position is `slot / slots` round the wall, so when a ring adds spots
  `keepTowerAngles` rescales every slot (the new spots land in the gaps); `bestEmptySlot` fills the widest gap first
  (Steward + the Defend button). Saves without `G.spread` are spaced out once on load (`evenOutTowers`).
- **Sound off closes the AudioContext** (`js/audio.js`): on iPhone a silent-but-open context still stops the
  player's music. `navigator.audioSession.type = 'ambient'` makes sound-on mix with music too.
- Player-facing text avoids the banned list (`docs/banned-names.md`): waves are sieges, never "Horde".

## Tests

`node --test prototypes/spirehold/tests/` (18 rule tests: determinism, waves, the crowd knob, breach, towers + paths,
spells, meteor delay, quest odds, win/lose rewards, time away, save/export, new realm, Legacy, steward, banned words,
every bonus stat is read). `npx playwright test prototypes/spirehold/tests/game.spec.js` (desktop + phone: found a city,
tap the wall to build, cast, every tab, no sideways scroll, save/continue; hire a party and send a quest).
`tools/shot.mjs` / `tools/shot2.mjs` take screenshots.


## Project history (moved from playground CLAUDE.md, 2026-11-11)

This was the table row for this folder in `playground/CLAUDE.md`, kept word for word when that file was cut down to a short index. Newer notes belong in this README, not in CLAUDE.md.

**Spirehold** (2026-11-08 →): a semi-idle city defence game from the owner's 40-hour brief (`docs/PLAN.md`). The city grows by itself (people → taxes → city levels → wider walls with more tower spots, landmarks); you hold the walls: 9 towers with path choices at 10 and 30 and damage doubling every 25 levels, 7 schools of court mages who cast on their own, 8 spells (Fireball, Chain Lightning, Frost Bloom, Meteor, Earthshake, Aegis Ward, Arcane Barrage, Skyfall) with apprentice auto-cast, sieges every 10th wave with named leaders (never "Horde" — banned). Adventuring parties stop at the tavern; hire them and send them on 5 min–8 h real-time quests with odds in words; win = gold/lore/starshards/relics, lose = nothing. Time away pays 50%+ (capped 12 h); optional Royal Steward spends gold. From wave 100 found a new realm (6 realms) for Crowns → multiplying Legacy. Pure sim in `js/sim/` (all curves in `rules.js` `TUNE`), canvas 2D art drawn at load, pacing bot `tools/sim.mjs`. Read `README.md` first

**Status / key files:** playable 2026-11-08
