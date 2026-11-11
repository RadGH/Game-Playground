# Rogueloot

A co-op action RPG for 1–4 players: Thousandvale's items and mechanics under a Diablo-style angled camera, with combat
paced like vanilla WoW (1.5 s global cooldown, cast bars). Act 1 covers levels 1–20. Chibi 2.6 characters, no voices.

**Read `docs/PLAN.md` first.** §0 holds the owner's ~50 rulings from the 2026-11-10 question rounds, and they override
everything else. §3 lists the 33 milestones. Checklist: `~/claude/agent/rogueloot-checklist.md`.

## Run it

| What | Where |
|---|---|
| Dev server (working tree) | `node server/main.mjs --port 8581 --https-port 8583` → `http://<LAN IP>:8581/` |
| Stable LAN copy | 8580 / https 8582 (publish script comes in M2) |
| Live | https://rogueloot.games.radgh.com/ (`cd ~/claude/rads-game-server && tools/deploy.sh update playground rogueloot`, after `tools/publish-stable.sh` + `tools/publish-pages.sh` in the playground) |
| Unit tests | `node --test tests/sim/*.test.js` |

`npm install` once in this folder for `ws` (or copy Knockabout's `node_modules`).

## How it fits together

- `js/sim/`: the PURE world sim (seeded rng, fixed 20 Hz step, no clocks/DOM). `world.js` (players, step, snapshot),
  `move.js` (the ONE walking rule, used by the sim *and* by the client's own prediction), `area.js` (M1's test meadow;
  M10 swaps in hand-made zone JSON with the same shape), `rng.js`.
- `js/net/`: `protocol.js` (frames, rate limits, room codes) and `hub.js` (rooms: create/join by code, roster, inputs,
  snapshots every 2nd step). The hub is pure, so the **solo game runs the same hub inside a Worker**
  (`js/client/solo-worker.js`): solo and online take exactly the same code path.
- `server/main.mjs`: http + ws (Knockabout's layout), static files from the allow-list in `server/static.js`,
  `/feedback` + `/tally` + admin feed reused from Tumblefair's server modules.
- `js/client/`: `main.js` (title → game, prediction + reconcile against `seq`), `scene.js` (flat-shaded low-poly,
  camera looking north at a 48° tilt: **W = screen north**), `actors.js` (Chibi 2.6 through Thousandvale's
  `createTvBody`, a stand-in while it builds, others interpolated ~110 ms behind), `input.js` (keys, pad, stick),
  `touch.js`, `menu.js` (☰, What's new, Credits, Report a bug), `link.js` (solo Worker or WebSocket).
- `window.gameEye.state()` reports the screen, link, room code, your position and the players.

## Messages

Browser → server: `hello {v, token}`, `create {character}`, `join {code, character}`, `input {mx, mz, seq}` (world-space
move vector, ≤ 1), `leave`, `ping`. Server → browser: `welcome {token}`, `joined {code, you, host, seed, area}`,
`roster {host, players:[{id,name,look}]}` (on every join/leave; looks never ride in snapshots), `snap {tick, players:[{id,
x, z, yaw, moving, seq}]}` at 10 Hz, `left {id, host}`, `err {code, msg}`.

## Credits

Third-party things this game uses are listed in `shared/credits.json` (`games` includes `rogueloot`) and shown by the
Credits button. Add a row whenever something made by someone else comes in (ruling 49).
- **Codex art (2026-11-10):** `assets/art/key-art.webp` (title backdrop) and the games.radgh.com card are one Codex image (prompt in the M1 commit notes; original design).

## Zones and the editor (M10-M11)

- A zone is `data/zones/<id>.json`: readable SHAPES (surfaces, hills, water, cliffs, props, seeded scatter, spawns,
  chests, markers), listed in `data/zones/index.json`. `js/world/zone.js` turns it into the sim's area;
  `js/client/zone-view.js` draws it from the same samplers. Prop kinds: `js/world/props.js` (collision radius) +
  `js/client/prop-meshes.js` (mesh); a test fails if the two lists differ.
- `node tools/zone-check.mjs [id]`: everything reachable from the start, no unknown props, a start marker.
- **Editor:** `editor.html` (`http://<LAN IP>:8581/prototypes/rogueloot/editor.html`). Tools 1-9 (select, prop, paint,
  hill, water, cliff, scatter, spawn, patrol, chest, marker), right-drag pans, wheel zooms, Enter finishes a shape,
  Ctrl+Z/Y, Delete, R turns a prop. **Save** writes the file through the DEV server only (`POST /editor/save`,
  LAN addresses only); **Download** works anywhere; **Play-test** opens the game in that zone (`index.html?zone=<id>`).

## Skills (M9, M20-M28)

A skill is data: a row in `data/skills.json` (Wanderer), `skills-paths.json` (the four Paths) or `skills-specs-N.json`
(specializations, one file per wave, listed in `skills-specs-index.json`). `js/sim/skills.js` runs every row through one
vocabulary of effects; `tests/sim/paths.test.js` casts every active of every Path and spec and fails on an unknown `do`.

Effects (`do`): `weapon` (x weapon damage), `damage` / `bolt` (spell, `base: [a, perLevel]`), `area` (circle / cone /
line, `at: self|target|ground`, inner `effects`), `zone` (lasting ground that re-applies its effects each `tick`),
`dot`, `heal` (`who: 'self'` inside an attack), `hot`, `shield` (`thorns` strikes back while it holds), `buff`
(`stat`: damage, armour, dodge, moveSpeed, crit, healTaken…), `debuff` (stun, root, slow, damageDown…), `mark`,
`taunt`, `interrupt`, `dash`, `pull` (negative = knock back), `resource`, `cleanse`, `revive`, `summon` (pet, or up to
8 minions; `stay: true` stands where dropped), `coat` (every weapon hit leaves a dot), `link` (takes a share of a
friend's hits), `stance` (`bar: [6 ids]` swaps the action bar while it holds; press again to leave).
Modifiers: `cond: 'behindBonus'` + `frontMult`, `cond: { targetHpBelow, mult }`, `cond: { slowed, mult }`,
`perDot`, `perTargetHit` (crowd bonus), bolt `chain: { jumps, range, falloff }`, `spendAll` + `perResourceSpent`,
`weaponOnly: 'ranged'|'melee'`, `altCost` (hybrids), `perRank` on any number, `synergy` rows (also feed pets).

**Legendary powers** (`js/sim/legendary.js`, data in `data/legendaries.json`): a worn, identified, unbroken legendary
reshapes one skill at cast time (`shapeSkill` returns a changed copy of the row plus rules for this cast: charges,
chains, refunds, damage turned to healing…) or a basic action (life leech on auto-attacks, free potions).
`tests/sim/legendary.test.js` wears each power and casts its skill.

## Monsters on screen (M14, M30)

`js/client/bestiary-kit.js` (Fable) builds every monster, rare and boss (`buildMonster`) and animates it
(`animateMonster`); `bestiary.html` is the gallery. `js/client/foes.js` loads the raw `data/monsters.json` once, builds
each body with the kit, rebuilds a boss when its phase changes, and passes the body through `js/client/mesh-merge.js`
(still parts under the same parent with the same material become one mesh: ~23 -> ~16 draws a monster).
`tests/browser-perf.mjs` reads draws / triangles at phone size per zone.
