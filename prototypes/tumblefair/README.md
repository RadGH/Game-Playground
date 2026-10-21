# Tumblefair

A couch party game for 2–4 players, played on phones. Everyone opens one link (or scans the QR code on the host's
screen), picks a look for their character, and the match runs: roll dice round a fairground board, vote for a
minigame, play it, collect tickets, buy prize ribbons — most ribbons after the last round wins. A TV or laptop can
join as **the big screen** and just watch. Built 2026-10-13 from the owner's design document (saved in
`~/claude/agent/partygame/design-brainstorm-gdoc.txt`) and reference picture.

- **Play (public):** https://tumblefair.games.radgh.com/ — on the games.radgh.com droplet (2026-10-20; it replaced the
  Cloudflare quick tunnel). **LAN, stable:** `http://<LAN-IP>:8480/` · **dev (working tree):** `:8483`
- **Invite link:** the lobby's QR code and "Copy invite link" give `…/prototypes/tumblefair/?code=ABCD`. Opening it joins
  that room at once; a phone that has never made a character is first asked for a name and a look ("You're invited!",
  `js/client/main.js` showTitle), then one tap joins. Profiles are per browser (a token in localStorage), so the public
  server's players start fresh — nothing carries over from the old tunnel address.
  (a Cloudflare quick tunnel; recorded in the playground's `data/live-links.json` under `tumblefair`)
- **Publish:** commit, then `tools/publish-tumblefair.sh` (the LAN copy on :8480). **Public:** the playground's
  `tools/publish-stable.sh` + `tools/publish-pages.sh` (puts the commit in the gh-pages snapshot), then
  `cd ~/claude/rads-game-server && tools/deploy.sh update tumblefair` (production: only when the owner asks). A restart
  ends the rooms in progress (they live in memory). Bug reports from the public server: `ssh rgs` and
  `cd /srv/tumblefair/current/app/prototypes/tumblefair && /opt/rgs/node/bin/node tools/feedback-report.mjs --dir /var/lib/tumblefair`
- Minigame contract: **`docs/MINIGAMES.md`** — read it before adding a game.

## What it tests

1. **Phones as controllers AND screens.** No app: one web page. A phone in a room is a player — it draws the game
   and holds the controls — so a group with no TV can still play; a TV adds the big view.
2. **The playground's avatar system in a second kind of game.** Characters are Chibi 2 bodies from the same look
   data Thousandvale uses (`{ race, seed, custom }` + a costume), and flat screens (drawing, voting, results, the
   lobby list) use the same avatar as a 2D portrait (`svgPortrait`).
3. **Thousandvale's controls on a phone, simplified.** The same floating thumb stick and round buttons
   (`js/client/controls.js`), keyboard WASD/Space/E, a gamepad on secure pages.
4. **A server-authoritative minigame framework** where a game is two files and the room does seats, votes, clocks,
   scores, reconnects and late joiners.

## How a match runs

`js/sim/room.js` (pure; the server ticks it 20×/s):

```
lobby -> [ board -> vote -> intro -> game -> results ] x rounds -> final -> lobby
```

- **Lobby:** four seats in colour order (red, blue, green, pink — each with a shape, so colour is never the only cue).
  A fifth player waits; a "big screen" takes no seat. The host picks the mode and the number of rounds. One player
  can start a solo practice match.
- **The Fairground Loop** (`js/sim/board.js`, `data/boards/fairground.json` from `tools/build-board.mjs`): 24 spaces
  round the loop plus a 4-space shortcut with two puddles and the jackpot. Tap ROLL (or the 12 s timer rolls for you),
  walk, stop to choose at the crossroads, and pass a **Prize Booth** with 10 tickets to buy a ribbon. Spaces: +3
  tickets, mud puddle −3, Wheel of Whatever (`data/chance.json`: 10 weighted events — steal, give, swap, move,
  everyone +2, a free ribbon), Hall of Mirrors (swap places), the gate (+5 each lap). After everyone has moved, a
  minigame. Final order: ribbons, then tickets.
- **Minigame Marathon:** no board — vote, play, repeat; 4/3/2/1 points.
- **The Fair Never Closes** (endless): marathon scoring with no set length; difficulty steps easy → normal → hard every 3 games, and after every 3 the players vote to keep going or finish (a tie keeps it open; 30 games at most).
- **Teams** (any mode, 2 or 4 players): Red & Green against Blue & Pink (seat % 2); team totals on the bar, results and final; your team's place is your place.
- **Vote:** a shortlist of 3 (unplayed games first, never the one just played), tie broken by the room's seeded
  random numbers. Only games whose player range fits the seated count are offered.
- **Awards:** a game only returns an order (ties allowed) or a co-op success; the room converts it — board: 10/6/3/1
  tickets (co-op 6 each, or 2 on a loss); marathon: 4/3/2/1 points.
- **Coins** (kept between matches, `js/sim/profiles.js`): 10 per match + 5 a ribbon (or 1 a point) + 2 a minigame
  won + 10 for the winner. They buy **costumes** (`data/cosmetics.json`: the 24 class outfits worn without their
  weapons, renamed for the fair; 4 free). Costumes never change how you play.
- **Phones that drop** come back to the same seat and score (a token in localStorage; the room keeps a seat 90 s in a
  match). Someone who joins mid-match watches until the next minigame and is seated then if a seat is free (the
  design doc's rule). The host leaving hands the room to the next player.

## Layout

| Path | What |
|---|---|
| `server/main.mjs` | HTTP + WebSocket (`/ws`) server; `/status`, `/healthz`; `--public <dir>` serves a published copy |
| `server/static.js` | allow-listed static files (the page imports from avatar-3d, avatar-2d, shared, vendor, sfx, thousandvale/js) |
| `js/shared/protocol.js` | message table + validator, rate limits, room codes (4 letters, no I/O), seat colours |
| `js/shared/arena.js` | `stepBody` — arena movement run by the server AND by each phone to predict itself |
| `js/shared/rng.js` | seeded random numbers |
| `js/sim/hub.js` | every socket: hello/token, create/join rooms, shop |
| `js/sim/room.js` | a room and a whole match (see above) |
| `js/sim/board.js` | board turns as rules + events |
| `js/sim/profiles.js` | names, looks, coins, costumes (JSON file on the server) |
| `js/games/<id>/` | one folder per minigame: `sim.js` (rules) + `view.js` (drawing); `js/games/index.js` lists them |
| `js/client/main.js` | the screens: title, lobby, board, vote, intro, results, final, look editor, costume shop |
| `js/client/stage.js` | renderer + a camera that frames a ground rectangle inside the free part of the screen (lens shift) |
| `js/client/play.js` | hosts a minigame view; stick → server 20×/s, own character predicted, others interpolated 100 ms back |
| `js/client/avatars.js` | look → Chibi 2 actor / SVG portrait; ONE clip list game-wide |
| `js/client/boardview.js`, `lineup.js` | the 3D board; the podium line-up behind the lobby and the final |
| `js/client/controls.js` | stick, buttons, keys, gamepad |
| `assets/art/` | Codex-made pictures (logo, cards, board backdrop) as webp; `tools/art.sh` converts from `assets/inbox/` (git-ignored PNGs) |
| `ops/` | user units: `tumblefair` (stable :8480), `tumblefair-dev` (:8483), `tumblefair-tunnel` (public link); `install.sh` |
| `tools/look.mjs` | opens N headless pages, runs a match to a phase, saves screenshots (`tests/shots/`) |

## Minigames

| id | kind | what |
|---|---|---|
| `paint-panic` | arena | walk to paint the floor your colour; paint buckets splat a circle; most tiles in 45 s |
| `trapdoor-treasury` | screen | 6 rounds: pick a chest (bigger = shakier floor) or BANK; a trapdoor empties your sack; banked gold counts |
| `meteor-dash` | arena | hex island over lava; meteors (1.2 s warning ring) knock you back and break tiles, the edge crumbles; A = hop; last one standing |
| `snowball-showdown` | arena | slippery ice ring; A = throw, B = shove-dash; 3 lives, KO credit within 3 s; solo = snowman targets |
| `stack-attack` | arena | carry blocks to your corner pad (gold = 2), grab on a rival's pad steals their top block, B = shove makes a carrier drop; tallest tower |
| `draw-the-disaster` | screen | a private prompt (`data/prompts.json`, 135), 45 s drawing on your phone, anonymous gallery vote (not your own), a rule-based judge's ribbon (+1) breaks 2-player ties; avatar portraits on every card |
| `memory-heist` | screen | study a vault of 9-16 treasures, then 5 quick questions; speed scores more |
| `circuit-scramble` | screen, co-op | everyone turns only their own tiles to connect the battery to the bulbs; 6 boards, clear the goal together |
| `laser-limbo` | arena | beams sweep a round stage: A hops the low ones, hold B to duck the high ones (slower); one touch and you're out; last one standing |
| `cannonball-catch` | arena, co-op | stand in the landing ring to catch (A = dive); big balls need two catchers; misses cost the castle hearts; 4 waves |
| `balloon-stampede` | arena | pop your colour (+1) and gold (+3); someone else's colour gives them the point; A = dash/barge; solo adds grey decoys |
| `caption-clash` | screen | one silly picture for everyone (`data/scenes.json`, 42 scenes drawn from SVG props in `kit.js`); 40 s to write a caption (80 letters, cleaned; "Give me a starter" offers 3 openers), anonymous vote (not your own), points = votes + one judge's ribbon by a printed rule (shortest / most same-letter words / most words; tie = finished first) |
| `pattern-impostor` | screen | 6 rounds of 6-9 SVG tiles (shape x colour x size x pattern x count) that all follow a rule but one; first right tap 5/3/2/1, a wrong tap locks you out; rounds 5-6 are pairing rules; every puzzle checked for a second answer |
| `coinstorm` | screen | 5 rounds: split 10 coins between Piggy Bank (keep), Windmill (x2 unless yours is the biggest pile) and Storm Cloud (x3 or 0, forecast shown); everyone reveals together; solo plays against "the Gust" |

Known gap: a phone that reconnects mid-drawing sees a blank canvas (its strokes are kept on the server and appear in the gallery).

## Bug reports and suggestions

The round **!** button (top right; bottom centre during a minigame) opens a form: Bug or Suggestion, a text box, and a
picture of the 3D view (on by default). It posts to `POST /feedback` (`server/feedback.mjs`: 1.5 MB, 12 an hour per
address) with debug details — screen, recent phases, room and players, the minigame's last state, network, screen size,
device and the page's last errors. Read them with `node tools/feedback-report.mjs --env stable` (markdown),
`--html <file>` (with pictures), `--mark 3,4 --state done --note "…"`. Stored in `~/.local/share/tumblefair/<env>/feedback/`.

## What worked / what didn't

- The lens-shift camera (`stage.js solve()`) is what made one scene readable on a 1280×720 TV and a 393×852 phone:
  fit the rectangle into the free part of the screen, then slide the picture, so the angle never changes.
- **A scrolling panel inside the page blanks the WebGL canvas behind it in Chromium on phones** (the area above the
  panel showed the page background). Panels never scroll on their own; the screen layer scrolls. Written into the
  minigame contract.
- The page asked the server hello before it had loaded its data, so the reply could arrive before anything listened:
  handlers registered late now replay the last welcome.

## Tests

`npm test` here (node): `tests/room.test.js` plays whole matches with bot phones for 1–4 players in both modes,
reconnects, late joiners, host handover, the shop, input cleaning; one test file per minigame. Browser checks:
`tools/look.mjs` (screenshots) and `tests/tumblefair.spec.js` (Playwright, run from the playground root under the lock).

## Not built yet (parked 2026-10-13 when the owner said "wrap up")

From the design document, deliberately left for a later round:
- **Main modes:** the RPG one-shot (story grammar, callbacks to who did what), branching paths. (Board, Marathon,
  Endless and Teams are built.)
- **Host settings in the lobby:** choosing the minigame pool (the server already accepts `opt pool`), vote shortlist
  size and difficulty are not on the lobby screen yet; only mode, rounds and teams are.
- **Accessibility options:** low motion, adjustable timers, larger text.
- **Accounts:** a player is a token in that browser's storage; a new phone or a cleared browser starts fresh (coins
  and costumes included). No account linking yet.
- **Bots** to fill empty seats for one- or two-player groups.
- **More boards** (one starter board), seasonal costumes, achievements.
- Tuning after real play: Cannonball Catch's difficulty, Meteor Dash's pace, ticket and coin amounts.
