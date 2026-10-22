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
| `js/client/play.js` | hosts a minigame view; stick → server 20×/s, own character predicted, others drawn from `interp.js` |
| `js/client/interp.js` | the server clock + per-player history that draws other players smoothly (see "Online play and lag") |
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
| `boardwalk-brawl` | arena, co-op with points | side-scrolling brawler down a long fairground street (levels are data: `levels.js`, 3 streets, one per seed); the screen only scrolls forward and stops at each wave (the window is two moving `arena.blocks`, so phones predict the screen edge); A = 3-punch combo, B = jump kick (no damage taken in the air); stand by a downed friend to lift them; boss at the end pays everyone +30; all down = over |
| `fling-ring` | arena | hold A by someone to lift them, let go to throw (longer hold = further); B = shove (makes a carrier drop); carried? mash to wriggle free; 3 decks as data (`levels.js`: shrinking raft, turning carousel with a sweeper bar, pier with gaps + rolling barrels); 3 lives, last one standing, ties by KOs; solo throws Bumbles |
| `wobblewheel-rally` | arena | top-down kart race, whole track on one screen; kart steering (`move.mode: 'car'`, stick = heading); 4 hand-made layouts x mirror x direction (16), sent as `arena.segs` from init(); 3-5 laps by length, progress counted only along the track (no cutting); ? boxes (Zoom Jar / Slick / Bonk Ball, odds by place), arrow pads (F.BOOST), mud (F.SLOW); A = item, B = hop (clears hazards, landing bumps a kart); placings = finish order then distance; 15 s window after the first finish; solo races two CPU karts |
| `ring-a-ding-rumble` | arena | boxing in a roped ring, 2-4 at once (free-for-all); A tap = jab, A hold = big swing (on release or by itself at full), B = block (front only; big swings drain puff and can break a guard), B + stick = dodge; puff (stamina) so mashing runs dry; health 0 = knockdown (2.2 s, back up with less), third = out; knocked into the ropes = bounce; points: jab 1, swing 2, knockdown +2; order = still standing (by points), then last out first; solo spars with "Bolster" (CPU) |
| `costume-catwalk` | screen | a theme card (`pieces.js`: 34 themes, each loving two of eight style tags) and a private tray of ~22 random Chibi 2 pieces in random colours (hat, top, legs, feet, cape, prop, extra, hair dye); 40 s to dress a runway model (live 2D paper doll), pick a pose; then each outfit walks a 3D catwalk on a random anonymous body and poses; vote (not your own; 2 players may vote both) + one judge's ribbon by a printed rule (most theme pieces / most in one colour / most colours; tie = ready first); solo: judge scores theme pieces +2 for three in one colour. The outfit is temporary: piece indexes on the wire, rebuilt on every browser, never touches the real look |
| `one-button-orchestra` | screen | one big button: notes fall to a line, tap on the beat; seeded chart in four sections (on the beat, eighths, off-beats, busy finale), WebAudio backing + a tick on every note; perfect 100 / good 50 x combo (x2/x3/x4 at 8/16/24); timing judged ON THE PHONE against its audio clock, the server only accepts possible verdicts (each note once, never before its time); a 3D bandstand of everyone's characters with drum / chimes / gong / bongos; solo = score attack with a grade |
| `going-going-gone` | screen | 5-lot auction paid with ONE pool of 20 energy, all lots shown up front: secret bids, revealed together; highest bid wins and pays (tie splits the points), the mystery lot's worth (0-10) shows when sold, the cursed lot (-4) goes to the LOWEST bid and everyone pays; RUMMAGE: mash for +1 energy per 4 taps (3 a round) but everyone sees you rattling; ties on points go to energy left; solo bids against Auntie Gavel (CPU) |
| `portal-routing` | screen, co-op | a marble rolls by itself along rails broken by chasms; same-letter portals carry it across; gates (junctions) belong to one player each, who taps to flip them (big "Gate 2 → right" buttons on the phone, the gate ringed on the board); a wrong arm leads to a pit (back to the start) or a shut arm bounces it back; 6 stages, at least one gate per player (fewer players = more gates each); each stage is built route-first and checked with `runBall` (solves with the right settings, not with the starting ones); clear the goal number together |
| `word-relay` | screen | everyone races on the same prompt: a word starting with the last letter of the chain's word AND obeying a rule (contains R, no E, 6+ letters, double letter… changes every 2 words); score = length, first good word +3 and becomes the next link, others get a few seconds to add theirs; no word twice; live ticks as you type, a refused word says why on your phone only; dictionary `words.js` = 17,000 common words (wordfreq rank x SCOWL-50 x CMUdict, minus a blocklist; rebuild with `tools/build-words.py`); a letter + rule pair is only asked when 20+ unused words fit; solo races Quill (CPU owl) |
| `safecracker` | screen | crack your own row of 5 safes (3-5 numbers, later ones may repeat): each guess answers RIGHT (right number, right place) and MOVED (in the code, wrong place) as dots + rings + words; out of tries = the safe jams (3 s) and gets a new code; LISTEN shows one number in place for -3 points and a 2.5 s lockout; pay = worth + 1 a try left, +5 to the first to open each safe; the TV shows everyone's answers, never their numbers; solo races Nimble Nell (CPU) |
| `wobble-tower` | arena | each player stacks their own candy-block tower: a block swings over the top, one big DROP button lets it fall; dead centre = PERFECT (steadies the tower, block grows back), a little off = it leans, further off = the overhang is sliced off; wobble builds with height and lean and topples the top third at 1 (then you keep building); characters ride a lift beside their tower; the press is judged at the swing phase the phone SAW (act `drop` [block, phase], accepted within 0.7 s); tallest at 45 s; solo = score attack; a phone with 3-4 towers centres on its own |
| `rope-bridge-panic` | arena, co-op | three plank-and-rope bridges over a gorge (seeded lengths, weak planks, pre-broken holes); planks wear when walked, fast when stood on or shared by two or more, A = hop (thumps the landing); each bridge tips toward the weight on it plus warned gusts — tip it fully and everyone not on the high side falls (back to the start of that bridge); everyone across = success; order = who made it first; score = bridges crossed; 50 s |
| `slippery-delivery` | arena | pie carts on a wet square (kart steering, low grip; A = brake): stop at the bakery counter to stack up to 5 pies, deliver at any of three doors (1 a pie, +2 for a full five, the moving RUSH door doubles); hard bumps on walls/crates cost pies, rolling barrels and spinning signs knock you back (-2), cart crashes cost both a pie; 60 s; solo = score attack with medal targets 10/20/30 |
| `tile-flip-race` | screen | 7x7 board (mirrored both ways: plain 1, star 2, gem 3, rocks), everyone starts on a home corner; every 2 s all picks flip together: one tile next to your land, free or a rival's (never a home corner); two picks on the same tile bounce; score = tile values + 1 a tile of your biggest joined-up patch; 20 flips; solo races Tumbleweed (CPU) |
| `monster-forecast` | screen | one goofy 3D monster per game (`monsters.js`: 4, built from plain shapes, 3 moves each with 2 tells and one answer); each round a tell plays (crouch, eyes glow, big breath…), everyone secretly picks DODGE / BLOCK / COUNTER, then the move and every pick show together; right = 3 (+1 from a third in a row); rounds 1-3 big tell + caption, 4-6 quicker, 7-8 fake-outs (the LAST tell is true); 8 rounds; players' characters act out their picks; solo = score attack |
| `treasure-map-bluff` | screen | 5 rounds, 4 routes on a parchment map: 1 treasure, 1-2 traps; each phone privately sees 2 routes; post up to 3 canned claims a round ("Route B is safe!", true or not) and secretly pick a route; the 12-gold pot is split between finders, traps -4 (never below 0); the reveal stamps every claim TRUE or FIB; solo shares the map with Captain Squawk (CPU parrot, honest about half the time) |
| `auction-of-chaos` | screen | 6 curios from `items.js` (57, each with a value on paper, tags, a clue and a hidden twist: eats your best item, melts next to hot things, goes to the poorest rival, +1 a chip kept…); 15 chips for the whole auction, secret bids revealed together (tie = fewer prizes, then more chips, else unsold); the finale reveals every twist and appraises each haul; solo bids against Baron Bidwell (CPU) |
| `alibi-assembly` | screen | co-op: a fair crime ("Who ate the prize pie?", 16 in `data.js`); BUILD (25 s): 4-6 alibi slots (Where / Eating / Who saw you / When / Wearing / Doing / Carrying, 10 options each, 4 shown), each owned by one player who taps a pick everyone sees (unfilled = the house picks); STUDY 6 s; then the Inspector questions each phone privately: one multiple-choice per slot (wrong answers = the options everyone saw) + 2 "So you were … and …?" yes/no with a detail sometimes swapped; 70% right as a team = story holds; score = your right answers; solo: the house builds it piece by piece, you answer |
| `secret-architect` | screen | co-op, the Architect rotates (one round each): they privately see a 6x6 blueprint (`shapes.js`, 32, easy/hard) and may only use 3 pins, 2 crosses and 6 canned messages (19 lines + "It's a …!" once), watching every build live; builders tap blocks; match = blocks in both / blocks in either; builders score their match, the Architect half the average; team win at a 50% builder average; tie = fewer messages as Architect; solo: 3 blueprints from memory (4 s look + one 1.5 s peek) |
| `two-truths-one-goblin` | screen | the Teller rotates (4 rounds, 3 for 3 players): dealt 2 TRUE claims and 2 possible GOBLINS (`cards.js`, 122 cards x 2 wordings, truth decided by the deal); privately plants one Goblin, picks wordings, reorders, Ready; others tap the Goblin (changeable): catch +2, fastest catch +1 (2+ guessers), Teller +2 a fooled guesser; tie = least time on catches; solo: 5 rounds against The House, whose Goblin is usually its longest claim |
| `kitchen-catastrophe` | arena, co-op | a fair food stall: orders (lemonade, corn dog, candy floss, combos) queue at the hatch with patience timers; eight ingredient stations round the kitchen, each OWNED by one player (colour mat + shape tag; dealt evenly, so fewer players = more each); A at your station grabs, A at the tray adds — the oldest order is built in recipe order and a wrong step spoils the tray (and costs patience); fill the target (solo 6 → four players 10) in 75 s; score = parts you added; solo owns all eight with more patient customers |
| `castle-defense` | arena, co-op | a cardboard castle courtyard; scripted waves (data in `RULES.waves`, scaled by headcount) of googly blobs, hoppers and horned stompers waddle up to bash three wall stretches; man a cannon (stick aims, A fires, B steps off), carry ammo crates (+3) and planks (repair) from the piles, bonk creatures at the wall with empty hands; a broken stretch lets creatures through to the keep (5 hearts); hold to the bell or clear all six waves; score = kills + loads + repairs |
| `defuse-together` | screen, co-op | a confetti cannon with 4 modules (wires / picture keys / switches / word buttons, `makeModule` + reference `solve`); the DEVICE passes round the team, the rule book for the module is dealt line by line across everyone else's phones so they must talk; mistakes burn 8 s of the 85 s fuse; solo holds the device plus a short book (3 modules, fewer rules) |
| `dragons-weak-spot` | arena, co-op | a goofy fairground dragon behind the yard: ATTACK phases telegraph fire rings (get out) and a fire sweep (the arc glows, then B = hop as the flame reaches you; a burn costs a team heart, 3 + 1 a player); then it gets DIZZY and four scales open (Sun/Moon/Star/Leaf, colour + picture, each with a pad): hit them in a secret 2-4 step order, each phone privately shows only SOME steps (rotating holders), so call them out; stand on the pad + A = 10 damage, the whole order adds a bonus, the wrong scale makes it flinch (window -1.5 s); beat its health before the bell; scores = damage; solo sees the one step it is on |
| `ghost-photographer` | arena, co-op | invisible ghosts drift round a funhouse floor of nine named rooms; each ghost's clue is on ONE phone (room it is in / footprints on a mini map / a cold-spot thermometer from your own character); one player carries the LANTERN (passes every 12 s): ghosts near it show for everyone and slow, B = big flash; everyone else A = snap the frame in front of them; catch the goal (50-75% of the ghosts by team size); a catch = 2 to the photographer, +1 clue holder, +1 lantern if lit; solo carries a smaller lantern AND the camera with every clue |
| `storm-shelter` | screen, co-op | three meters (Heat, Roof, Food, 0-10, start 6); 13 beats of 5 s: an event card (`deck.js`, 45: hit + 2-3 trade-off choices, team vote, tie = first voted) plus wind that grows with team size and the storm; each player plays one card a beat from a private hand of 3 (10 kinds; a meter caps at 10, so talk); any meter at 0 = lost; the beat ends early once all are in; scores = meter points your cards really added; solo holds 4 and plays 2 |

Known gap: a phone that reconnects mid-drawing sees a blank canvas (its strokes are kept on the server and appear in the gallery).

## Online play and lag (round 4, 2026-10-21)

The owner reported that online play "lags pretty bad but only in some game modes" — the arena games, where you watch
and touch other players. Measured, not guessed (`tests/interp.test.js`, `tests/netcode.test.js`):

- **Other players were drawn wrong, not late.** `play.js` kept the last two updates and timed the slide between them
  from when each one ARRIVED; with an update every 50 ms each arrival restarted a "wait, then slide" timer, so everyone
  else stood frozen on ~90% of frames and was drawn 330-650 ms behind, then jumped. `js/client/interp.js` keeps a short
  history per player stamped with the server's tick and a clock that follows the line's real delay and measures its
  jitter; others are drawn one tick + the jitter behind (~95 ms on a clean line, ~145 ms with 0-60 ms of wifi jitter),
  never frozen, and carry on at their last speed for up to two ticks when an update is late.
- **A late phone was moved twice.** The server "coasted" a phone whose input was late on its last input, then applied
  the real inputs when they came as well — movement the phone never predicted, so its own character snapped forward.
  Every input is now applied exactly once, in order; a late phone waits and catches up 3 a tick.
- **Bandwidth is not the problem:** 5-10 KB/s per phone in every arena game.
- **Instant own actions:** a view's optional `input(inp)` hook runs the moment your phone sends a button press, so a
  punch or throw animates before the server answers.
- The round trip (± jitter) shows in the top corner during a match: green under 80 ms, amber under 160, red above.
- The droplet is in San Francisco; from the owner's home the round trip is ~25 ms.

**LAN / wifi play:** yes. The VM runs the stable server on the house network: phones on the same wifi open
`http://<LAN-IP>:8480/` (the lobby's QR code and invite link then use that address, so everyone stays on the LAN). It is
only as new as the last `tools/publish-tumblefair.sh`. Anyone with Node can also run their own:
`node prototypes/tumblefair/server/main.mjs --port 8480` from a checkout, and phones join at that machine's address.

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
