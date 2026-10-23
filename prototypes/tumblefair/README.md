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
- **Big QR code (2026-10-22):** a "QR" button in the top corner (and "Big QR" in the lobby) opens the join code full
  screen, big enough to scan from the sofa off a TV. It shows in the lobby on every device, and during a match on the big
  screen and on a computer (not on a phone mid-game, where it would sit on the controls); a mid-match joiner watches, then
  gets a seat at the next minigame. `js/client/main.js` showBigQr, `css/tumblefair.css` `.qr-btn` / `.qr-big`;
  `window.tumblefairQr` for specs.
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
- **Round 5 board additions (2026-10-22):** two boards (the host picks): **The Fairground Loop** and the **Moonlit
  Pier** (`data/boards/pier.json`: 26 + 4 spaces, the Ghost Train shortcut straight up the middle, Friendly Ghost
  spaces that whisk you to a random loop space). Both boards are built by `tools/build-board.mjs` from one table each.
  New spaces: **Duck Pond** (pick one of three ducks hiding 1-10 tickets), **Dice Duel** (you and a random player
  each roll; the higher takes 4), **Bumper Cart/Boat** (zoom 3 ahead). The **Wheel of Whatever** has 27 results
  (golden die = two dice next roll, sticky candy floss = 1-3, piñata, tax collector, lost and found, pony ride to the
  next booth (buys a ribbon if you can), carousel moves everyone, coin flip, fog machine shuffles everyone, raffle
  ribbon for someone else, back to the gate, treat everyone, swap tickets…). A **Fair Bulletin** is read at the start
  of every round after the first (`data/chance.json` `bulletins`: Ticket Rain, Ribbon Sale, Mud Season, The Parade,
  Double Prize Day, Piñata Party, Underdog Hour, Golden Ducks, Duel Day, A Lovely Evening) and the last round is
  always **Last Call** (ticket stands, jackpots and puddles count double). At the end, a **Bonus Ribbons** screen
  (phase `bonus`) hands out two awards drawn from six (Minigame Star, Ticket Magnet, Long Walker, Bad Luck Charm, Dice
  Champion, Wheel Fan); ties share, and nobody gets one when everyone is tied. Rules tested in `tests/board.test.js`.
- **Lobby (round 5):** difficulty (Family / Normal / Tricky, sent to every minigame) and a **minigame picker** (cards
  grouped by kind, All / None / Only Action…; nothing ticked = every game; the host's list is remembered on their
  phone).
- **Minigame Marathon:** no board — vote, play, repeat; 4/3/2/1 points.
- **The Fair Never Closes** (endless): marathon scoring with no set length; difficulty steps easy → normal → hard every 3 games, and after every 3 the players vote to keep going or finish (a tie keeps it open; 30 games at most).
- **Teams** (any mode, 2 or 4 players): Red & Green against Blue & Pink (seat % 2); team totals on the bar, results and final; your team's place is your place.
- **Vote:** a shortlist of 3 (unplayed games first, never the one just played), tie broken by the room's seeded
  random numbers. Only games whose player range fits the seated count are offered.
- **Awards:** a game only returns an order (ties allowed) or a co-op success; the room converts it — board: 10/6/3/1
  tickets (co-op 6 each, or 2 on a loss); marathon: 4/3/2/1 points.
- **Coins** (kept between matches, `js/sim/profiles.js`): 10 per match + 5 a ribbon (or 1 a point) + 2 a minigame
  won + 10 for the winner. They buy **costumes** (`data/cosmetics.json`: the 24 class outfits worn without their
  weapons, renamed for the fair, plus 35 written out slot by slot in round 5 — Pirate Captain, Lifeguard, Juggler,
  Rodeo Rider, Moon Walker, Tiger Cub, eight 'Spooky' ones for Halloween…; 10 free; `tests/costumes.test.js` checks
  every part id). Costumes never change how you play.
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
| `js/client/tunes.js` | little looping Web Audio tunes for game views (`start('jig' / 'sing' / 'boogie')`, `stop(scratch)`, `mute`) and made-up sounds (`fx('roar' / 'scratch' / 'tick' / 'boing' / 'honk' / 'pop' / 'ding')`); no files, silent if audio cannot run |
| `assets/art/` | Codex-made pictures (logo, cards, board backdrop) as webp; `tools/art.sh` converts from `assets/inbox/` (git-ignored PNGs) |
| `ops/` | user units: `tumblefair` (stable :8480), `tumblefair-dev` (:8483), `tumblefair-tunnel` (public link); `install.sh` |
| `tools/look.mjs` | opens N headless pages, runs a match to a phase, saves screenshots (`tests/shots/`) |

## Minigames

85 games (12 of them Halloween-only, see "Holidays"). Fishing (2026-10-23) added 4 — Reel Rumble, Pier Pressure, Net Gains and Glimmer Ice (see "Fishing" below). Golf (2026-10-23) added 4 — Putt Party, Long Drive, Chip-In Challenge and Halloween's Haunted Hole — with shared ball physics in `js/games/golf-kit.js` (a small same-input-same-output 2D rolling model: friction, wall/bumper/ball bounces, ramps, slope patches, windmill paddles, cup capture under a speed, aim help), the putting match flow in `js/games/golf-putt.js`, and the putting view + HUD in `js/games/golf-view.js` / `golf.css`. Round 8 (2026-10-22) added 20: six boss fights in the spirit of Dragon's Weak Spot (Golem Smash, Kraken Cove, Sky Serpent, Goblin King's Crown, and Halloween's Pumpkin Knight and Witch's Tower — shared helpers in `js/games/boss-kit*.js`), seven arena games (Hilltop Hold, Thin Ice, Pillow Fight, Firefly Catch, Spotlight Dance, and Halloween's Bat Swarm and Skeleton Stack) and seven tap games (Odd One Out, Crow Count, Higher or Lower, Shape Sorter, Number Climb, and Halloween's Potion Mixer and Mummy Wrap; `tools/build-fa-icons.mjs` copies in the Font Awesome Pro icons they use). Round 5 (2026-10-22) added 12 (Tiptoe Tiger, Hay Bale Scramble, Fizzpop Pass, Bumper Bash, Sheep Shuffle, Mole Mallet, Rope Rumble, Lantern Leap, Jellybean Jar, Quick Draw, Pin the Tail, Size Up — Size Up draws 153 Font Awesome Pro icons, copied in by `tools/build-size-up-icons.mjs`). Round 4 (2026-10-21) added 26: the owner's five (Wobblewheel Rally — racing, Boardwalk Brawl — side-scrolling
brawler, Fling Ring — toss-out, Ring-a-Ding Rumble — boxing, Costume Catwalk — dress-up runway) and every unbuilt game
of the design document's 30-game list. Several were tuned against perfect bots (Kitchen Catastrophe targets, Castle
Defense waves, Dragon's Weak Spot): ease them after a real play-test if they feel hard. Round 5 (2026-10-22) eased those three by about one step
before the first family evening, added a lobby difficulty choice, and added the new games marked "round 5" below.

**Halloween reskins (round 6, 2026-10-22).** While the season is Halloween (`js/shared/seasons.js`: October, or the
host's Holidays option), every ARENA game gets a shared dressing from `js/client/halloween.js` (dusk light — the
stage's lights dimmed and tinted, never switched off, and put back after the game — a purple sky, ground mist outside
the play area, glowing jack-o'-lanterns, circling bats and little ghosts; all instanced, no extra lights), the intro card
shows a "Halloween edition" ribbon, and eleven games dress up: Balloon Stampede (dusk playroom, jack-o'-lantern gold
balloons, ghost greys), Cannonball Catch (pumpkins for cannonballs, a lavender castle with lit windows), Jellybean Jar
("Candy Jar": candy corn, eyeball gumballs, pumpkins in a cauldron, ghost balloons), Lantern Leap (jack-o'-lanterns on
the pads, bats for fireflies), Mole Mallet (moles in witch hats, the bomb becomes a fizzing TRICK ball), Sheep Shuffle
(ghost sheep, pumpkins for hay, BOO!), Coinstorm (wrapped candy for coins, dusk sky), Snowball Showdown (glowing slime
balls, pumpkin-headed snowmen, a lavender rink on a purple sea), Paint Panic (purple flagstones, slime cauldrons),
Memory Heist ("Haunted Heist": twelve spooky treasures — the only sim change, names in `init`) and Trapdoor Treasury
(purple dusk over its art, candy bursting out). Looks only: `tests/halloween-reskins.test.js` plays each with and
without the season and checks the results are identical. Size Up was left plain (its pictures are icon data, not worth
a second set).

| id | kind | what |
|---|---|---|
| `paint-panic` | arena | walk to paint the floor your colour; paint buckets splat a circle; most tiles in 45 s |
| `trapdoor-treasury` | screen | 6 rounds: pick a chest (bigger = shakier floor) or BANK; a trapdoor empties your sack; banked gold counts. Round 5: painted vault, chests, trapdoor, sack and piggy-bank safe (Codex, `assets/art/tt-*.webp`); chests open one after another with a coin burst or drop through the trapdoor; pickers' faces over each chest |
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
| `jellybean-jar` | screen | round 5. 3 rounds of "how many?": a jar of jellybeans, a gumball machine, a paddling pool of rubber ducks or a bunch of balloons (one each round, 18-45 / 50-110 / 110-220 of them), drawn from the seed by `jar-art.js` (hex packing clipped to the container, filled to a level); a big number pad (every digit is a draft, OK locks); the reveal dims everything and lights it up one by one while a counter climbs and every guess waits on a guess-o-meter; closeness 0-10 + exact +5 + closest +5 (ties share); solo = score out of 45 |
| `quick-draw` | screen | round 5. 7 rounds: wait for the BELL, first tap wins (3, 2nd 1 with 3+ players); fake-outs (hen, balloon pop, cow, the words BALL / BELT, never in the last 0.9 s) and any tap before the bell = out of the round, -1 (never below 0); no clock while waiting. Fair-ish timing: the server rings, each phone times its OWN reaction from the frame it showed the bell, the server keeps that number inside what it saw (no slower than its own count, no more than 0.7 s of lag forgiven, under 90 ms = a guess); solo = points for speed (5 under 0.25 s) |
| `pin-the-tail` | screen | round 5. 5 rounds in a 160 x 120 SVG paddock: a donkey / pony / goat / pig / cow / sheep shows its tail spot (a star) for 2.6 s, then a trick per round (blurry, hidden, trots across, the paddock spins 180, two animals swap places) and everyone taps where the tail goes (tap again to move, Done locks); 0-10 by distance + closest +3; reveal puts the tail back and every pin in seat colour with name and points; solo = score out of 50 |
| `size-up` | screen | round 5. 8 quick questions (rounds 4 and 8 have three things): BIGGER / SMALLER / HEAVIER / LIGHTER / FASTER / SLOWER over 153 things in `items.js` (rough real size m, weight kg, top speed km/h for things that move), only asked when values differ 2.5x+ ("bigger" needs size AND weight to agree), close calls preferred; first tap final; right = 5 + up to 5 for speed (phone-timed like Quick Draw); reveal shows real values and "about 7x heavier"; pictures are Font Awesome Pro duotone icons (`icons.js`, built by `tools/build-size-up-icons.mjs`) |
| `sheep-shuffle` | arena | a meadow with a straw pen in each player's corner (fenced on its two inner sides, gap at the inner corner, flag + painted seat shape + live count); sheep graze and run from anyone within ~3 m, so you herd by walking BEHIND them; A = BAA! scares every sheep in a 50° cone ahead into a sprint (the only thing that moves a penned sheep, so walk into a rival pen and BAA toward its gap to steal); golden sheep count 3; the field restocks; score = what is in your pen at the bell; solo: score attack |
| `mole-mallet` | arena | a garden lawn with 20 holes; moles pop up all over (4 solo → 10 with four players) and duck back after ~2 s; A swings your mallet at the spot in front of you (a ring there turns gold when a mole is under it): brown +1, gold +3 (quick), black bomb-mole = BOOM, dizzy 1.6 s, no points lost; bonking a player makes them dizzy 1.1 s, then they blink and cannot be bonked for 2.3 s; most points wins; solo: score attack |
| `rope-rumble` | arena (no stick) | tug of war on a village green, best of three pulls: solo vs Big Barnaby (a CPU strongman), 1v1, a three-way rope star for three, 2v2 for four; tap PULL (or the drum on screen) once per drum beat — a tap is judged ON THE PHONE (perfect = full heave, a bit off = 0.6, extra taps in the same beat do nothing, so rhythm beats mashing) and sent as `pull {n, q}`; drag the ribbon over your chalk line; on time-out the side it leans toward wins; plain A presses without a view are judged on the server's beat |
| `lantern-leap` | arena | a lily pond between a dock and a reedy bank; lily pads with paper lanterns drift across in four lanes (each its own way), new ones float in and fresh ones bob up in big gaps; a pad you stand on wobbles (turns yellow) then sinks; you ride your pad; A = leap (further than a walk); coins +1 and fireflies +3 sit on pads; fall in = splash back to the dock and lose your streak (4+ in a row = +1 a pickup, 8+ = +2); most points wins; solo: score attack |
| `tiptoe-tiger` | arena | round 5. creep up a mown strip toward a cardboard tiger on a stage; while it SINGS (back turned, `tunes.js` lullaby) you may walk; the TELL (0.45 s: music scratches off, tail shoots up, red "!", FREEZE! banner) comes before it LOOKS — anyone still moving faster than 0.55 m/s after a 0.35 s grace is roared back to the start line in an arc (and safe until the next song); about one in four tells after the first is a fake-out half-turn; hold A = statue (stock-still); first to the bell wins and ends it, else furthest at the bell; solo = the same race on the clock |
| `hay-bale-scramble` | arena | round 5. musical bales: a fiddler on a barrel plays a jig (`tunes.js`) while a ring of one-fewer-than-players hay bales turns like a carousel; music stops = ring stops, free bales glow, A beside a free bale sits (first come); left standing = out to the cheer wagon; a fiddle hiccup (music cuts out but the ring keeps turning) catches early presses — A during music = stumble; B = barge (seated players are safe); nobody sat = round again; last one standing; solo: five bales VANISH one by one after the stop, one fewer each time you make it, three tries |
| `fizzpop-pass` | arena | round 5. hot potato with a cream pie on a picnic lawn (two tables + a party cake to dodge round): bump someone (or A within 1.9 m) to pass; a fresh holder must hold 0.45 s and cannot pass straight back to the giver for 1.6 s; the holder runs 17% faster; hidden fuse 6-11 s, the fizz (sparks, shake, ticks) climbs in 4 steps with a per-round random offset so it is never exact; SPLAT = lose a life (2, or 3 for two players), everyone still standing +1, last one standing +2; out players sit on the OUT blanket; solo plays pass with Dot and Pip (CPU; they juggle a fresh pie for 0.7 s), +1 a CPU splat, 3 lives |
| `bumper-bash` | arena | round 5. bumper cars (`move.mode: 'car'`, drifty grip) in a square rink with bouncy padded walls and a striped pole; ram a car: from behind 3, side 2, nose to nose 1 (the car that was driving into the other harder scores); the hit car spins out and cannot be scored on until it recovers; ★ stars +2, ⚡ bolts = 2.6 s turbo (+1 a hit while charged); fair-organ music; 70 s, most points; solo bashes three drifting target cars (two players get one to fight over) |
| `trick-or-treat-street` | arena | **Halloween, Oct only** (round 6, `meta.season: 'halloween'`). A moonlit street of candy-coloured houses (5 along the back, 2 down each side); a LIT door glows (warm door, yellow windows, light pool + ring, jack-o'-lantern, a floating sweet over it); A by a lit door = knock: you wait 0.5 s on the step, then a treat (+1/+2/+3, BIG BAR +5) or a harmless trick (a cartoon bedsheet ghost pops out: BOO, spooked 1.1 s and nudged off the step; or slime: slowed 3 s, green puddle); a knocked door goes dark 5-8 s, at most players+2 lit at once; CANDY RUSH in the last 12 s relights doors fast; B = bump: the bumped player spills one candy on the road for anyone to grab (then safe 1.4 s); pumpkin buckets in seat colours fill up; portrait phones follow their own character; solo = score attack, medals 20/35/50 |
| `ghost-tag` | arena | **Halloween, Oct only** (round 6). A moonlit pumpkin patch with lavender gravestones and jack-o'-lanterns (seeded layout, mirrored left-right, sent as `arena.blocks/posts`), lantern posts and a crooked tree; one round per player, each player starts as the ghost exactly once (2 s counting, eyes covered); ghosts float, glow pale blue, go see-through with sparkles and run 10% faster; a touch turns a human into a ghost (rises 0.8 s); one button A: human = quick dash, ghost = BOO! (nearby humans stumble 0.35 s); humans carry torch beams; points = 1 a second survived as a human + 3 a tag + 5 for the last human standing (still human at the bell, or the last one tagged); solo: bedsheet CPU ghosts drift in (one more every 9 s, each quicker), 3 lanterns (a catch shoos them to the corners), score = seconds survived; `spooky-kit.js` (night lighting that restores the stage, sheet ghost, jack-o'-lantern, glow sprite) is shared with Trick-or-Treat Street |
| `pumpkin-carve-off` | screen | **Halloween, Oct only** (round 6). Everyone gets a secret prompt (50 in `sim.js`: "a surprised pumpkin", "a pirate pumpkin", "a pumpkin who lost its sock"…) and carves a big orange pumpkin with a finger in 42 s: thin knife / big scoop, Undo, Clear, Done; every cut draws as a dark rind edge with a candle glow inside (cuts travel like Draw the Disaster's strokes, `[tool, "xxyy…"]`, chunked, `restore()` gives a returning phone its carving). The TV shows a row of blank pumpkins that wobble as their carver cuts. Then the lanterns light up in a row at night (anonymous, numbered, a CSS candle flicker): vote for the best, not your own (2 players may say "both"); the prompts and carvers only appear at the reveal. Points = votes + the Night Judge's ribbon (+1) by a printed rule: most carved / most separate cuts / most even face (a 32x32 grid mirrored left-right); solo: the judge scores 0-10 (carving up to 6 + evenness up to 4) |
| `apple-bobbing` | screen | **Halloween, Oct only** (round 6). A night-time wooden tub cut into one lane per player; your face hangs over the middle of yours and an apple bobs side to side (two sines, seeded; everyone gets the same 90 apples in the same order, getting quicker). Press BITE (or Space / tap the tub) when it is under your face: a glowing bite band turns green and says NOW. A bite dunks your face in: up with the apple (red 1, golden 3, quicker), or a SPLASH face (1.2 s pause, so mashing loses to timing), or a rubber spider on your nose (-1, never below 0; leave it and it bobs away in 2.6 s). The phone counts its own clock from the start and sends only WHEN it pressed (`bite {k, t}`); the server checks t (not in the future, at most 1 s old, never backwards) and judges the bite at that time itself, so lag never moves the apple. Phone: your lane big, the others small above, one huge button; TV: one long tub with every lane. Ties on apples go to fewer splashes; solo: medals at 8 / 15 / 22 |
| `monster-mash` | screen | **Halloween, Oct only** (round 6). A rhythm dance on a graveyard stage at night (the shared Halloween dressing: dim purple light, glowing pumpkins, bats, ghosts; plus tombstones, a bouncing backup ghost and a moon). Arrows slide down four lanes to a line in time with a synthesized "graveyard doo-wop" (Am F Dm E, kick/snare/hats, walking bass, organ stabs, a wobbly theremin, a pluck on every arrow); tap the matching big button — Wave / Hop / Zombie / Clap (each its own colour, arrow and word; arrow keys or D F J K too) — and your character dances it (Chibi clips wave / jump / cast / clap; `dance` pose from a 12 combo, a shrug on a miss, cheer or bow at the end). Seeded chart in four sections (warm-up, eighths, off-beats, finale), never four of one button in a row; perfect 100 / good 50 x combo (x2/x3/x4 at 8/16/24); a wrong button breaks the combo. Timing judged ON THE PHONE against its audio clock (like One Button Orchestra); everyone sees each player's last move. Solo: score attack with a grade |
| `odd-one-out` | screen | round 8. A race through picture grids (everyone gets the same seeded list of 150, each at their own speed): one picture of a grid of Font Awesome Pro icons (copied in by `tools/build-fa-icons.mjs`) is different — turned, mirrored, smaller, drawn in outline, or a look-alike (smile among frowns) — never by colour (the whole grid is one colour); tap it and the next, bigger grid shows at once (the phone holds the list; the server re-checks `tap {k, i}`); a wrong tap freezes you 1 s; a grid is worth side − 2 points (3×3 = 1, 4×4 = 2…); easy grows to 5×5 with big differences, hard starts at 4×4, grows to 7×7, subtle turns; TV: a lane per player with their current grid live; solo = score attack with bronze/silver/gold |
| `crow-count` | screen | round 8. Four rounds: crows sit in a cornfield round a smiling scarecrow, then for 4.5-7.5 s crows flap in and land, others leave, and (normal/hard) some just fly over; a seeded script `[t, i/o/p, spot, side]` plays the same on every screen; then the field is covered ("No peeking!") and you guess how many are left with big − / + and OK (drafts count); exact 5, one off 3, two off 1, closest (within two, ties share) +2; the reveal numbers the crows one by one; busier each round and each difficulty; solo = out of 20 with a grade |
| `higher-or-lower` | screen | round 8. Nine flips of a 26-card fair deck (1 Ticket … 13 Trophy, Font Awesome duotone pictures); everyone secretly picks HIGHER, LOWER or BANK; a right call grows your streak and adds it to your POT (1, 2, 3…), a wrong call loses the pot, the same card does nothing, BANK moves the pot to your score; a BRAVE CALL (right, and alone on your side, 2+ callers) = +3 to the score; pots are banked at the end; a 1-13 ladder shows where the card sits; easy shows the odds from the cards left and gives 6 s, hard 4 s; no pick = sit out; solo = medals 12/24/36 |
| `shape-sorter` | screen | round 8. Smiling toys drop down a wooden chute one at a time; tap the bin with the same SHAPE and COLOUR (each colour has its own pattern: red stripes, blue dots, green checks, plus the words on the bin); easy 3 bins (one cue is enough), normal 4 (2 shapes × 2 colours, you need both), hard 6; everyone sorts the same seeded toys at their own pace (the next drops when you sort), falls get faster; a sort scores 1 + combo/5 (max 5); wrong bin or a dropped toy breaks the combo; the phone runs the toy clock, the server re-judges `sort {k, b}`, drops toys nobody sorts and counts skipped ones; TV: a lane per player with the toy they are on; solo = medals |
| `number-climb` | screen | round 8. Three rounds of one scrambled grid for everyone (normal 3×3, 4×4, 5×5; easy 3,4,4; hard 4,5,5 with numbers drawn at different sizes and angles): tap 1, 2, 3… in order; a wrong (ahead) tap freezes 0.8 s; +1 a number, + the seconds left when you finish, + 5/3/2/1 by finishing place (2+ players); a round ends when everyone is done or on its clock; bars show everyone's climb; TV: the grid big with each player's face on the number they need next; solo = medals |
| `potion-mixer` | screen | **Halloween, Oct only** (round 8). A witch's kitchen: the recipe card shows 3-6 ingredients in order (Eye of Newt is a cute googly eye; Glow Mushroom, Bat Wing, Spider Silk, Candy Corn, Old Bone, Crow Feather, Moon Dust, Pixie Sparkle, Frog Burp, Acorn Cap, Wiggle Worm, Pumpkin Seed — Font Awesome duotone, each with its name); tap them off the shelf into your smiling cauldron (it takes each colour); a full recipe bottles a potion and the next appears; a wrong one = puff of smoke, start that potion again, 1 s wait; same recipes for all, own pace; easy 5-shelf short recipes, hard 8 and the shelf shuffles every potion; TV: everyone's cauldron with bottles; most potions wins; solo = medals |
| `mummy-wrap` | screen | **Halloween, Oct only** (round 8). A smiling mummy wobbles in a ring while the loose end of its bandage runs round it; tap WRAP (or the ring, or Space) when the end is in the glowing gap: centre = PERFECT 2 wraps, inside = GOOD 1; then the gap jumps ahead (110-300° from where you hit, seeded offsets); outside = a wrap slips off and you fumble 0.6 s, so mashing loses; the spin speeds up over 40 s; the phone sends WHEN it tapped (`tap {t}`) and the server judges that moment itself (not ahead, at most 1.2 s old, never backwards); a stripe per wrap, then a bow, then a crown; TV: everyone's mummy spinning side by side; easy wide/slow, hard narrow/fast; solo = medals |
| `golem-smash` | arena, co-op | round 8 boss. A big stone golem stomps after one player at a time (it takes turns), stops and raises both fists while a red ring fills where they will land (1.25 s; 1.5 easy, 1.0 hard), then SLAMS (caught = knocked back + dizzy, nothing lost); from the 2nd turn pebbles rain too (small rings). After each slam it is stuck and a CRACK glows gold on one limb (a fist, a leg or its back — always a reachable spot) with a gold ring + bobbing arrow beside it: stand in it and A to hit (2 + 1 a player hits a crack, 3 solo; hits stay if it closes). Break every crack (6/8/10 by difficulty) before the bell; it never blocks; scores = hits (cracks + rubblings). Round 9: each slam shakes loose RUBBLINGS (clay-orange rock critters; 1 + half the players on normal, capped at 2 + 2 per player) that waddle after the nearest player and bonk them (short stun); A in reach smashes one, landing on one does too; B jumps, and landing on a team-mate's head stuns them a second and bounces you |
| `kraken-cove` | arena, co-op | round 8 boss. A round dock in a cove, a googly purple kraken in a sailor hat behind it. Tentacles rise at the edge (2 at once, 3 with 3-4 players, one more after 30 s): a red zone shows the hit first — SLAM = a strip from the edge inward that fills, SWEEP = a curved band with arrows for its direction — then it lands/sweeps (caught = knocked back + dizzy); then it RESTS on the dock with a gold zone round it: A beside it = 1 whack, the 3rd whack counts double and sends it off early. Empty the courage bar (56 normal, x1.3 a player more) before the bell; scores = whacks |
| `sky-serpent` | arena, co-op | round 8 boss. A paper-lantern sky serpent loops round a floating stone lookout with four harpoon cannons on the rim (a green ring = loaded, grey = reloading 0.9 s). Stand at a cannon, face it (the cannon swivels with you) and A: aim help snaps to it within ~30 degrees and the harpoon curves after it. DIVE: a shadow chases one player for 1.2 s, locks and flashes red, then it swoops through — B = dash out; after a dive it skids across DAZED for 2.2 s (harpoons do double). Beat it before the bell; scores = damage |
| `goblin-kings-crown` | arena | round 8, everyone vs one boss but the score is yours. A Chibi goblin king in royal robes waddles round a treasure courtyard; A next to him = 1 point, the FINAL bonk +5 and ends the game; he never blocks. He lobs barrels (red landing ring, 1.2 s), does a royal hop after a flurry of bonks or every 6 s (landing ring), and whistles up two pickpocket sneaks (red rings) that run at whoever has the most points and steal 2 — bonk one first for +1. Most points wins; solo = score attack, every second left when he falls is a bonus point |
| `pumpkin-knight` | arena, co-op | **Halloween, Oct only** (round 8 boss). A headless tin-can knight (purple smoke for a neck) plods after its own jack-o'-lantern head, which bounces and hops round a pumpkin patch. While the head is loose the knight goes CLANG. Kick the head (A next to it; aim help toward the cauldron within ~30 degrees) into the bubbling cauldron: the knight kneels for 6 s (7 easy, 5 hard) with a gold BONK ring — A for damage. If it reaches its head it scoops it up and lobs it far (landing marker); its wooden sword swings at anyone in front (an orange wedge fills first). Scores = 1 a bonk + 3 for a goal |
| `witchs-tower` | arena, co-op | **Halloween, Oct only** (round 8 boss). The round top of a crooked tower at night; a witch on a broom loops a figure-eight overhead dropping potions: a shadow grows where one will land and its ring turns green and pulses in the last 0.9 s — stand in it and A to catch (early presses do nothing). A again throws it back up: it flies straight to her if she is within ~35 degrees of your facing or right above you (purple 1 damage, gold 2; she spins dizzy and stops dropping for 1 s). Missed potions burst into sticky puddles (7 s, slow you); one landing on you splashes you. Scores = 1 a catch + 2 a hit (3 gold) |
| `hilltop-hold` | arena | round 8. A round meadow with six soft hills (one shared `groundAt()` height function: the sim sets `body.y`, the view bends the mesh); one hill wears the glowing ZONE (disc + light column): alone in it = 2 pts/s, two or more = red "SHARED", nobody scores; a dashed turning ring + "Next hill in N" warns 2.5 s before it hops (~every 10 s, never the same hill); A = shove (nearest player in a wide cone, aim help turns you, 1 s cooldown); difficulty = zone size + hop rate; solo: hops every ~5 s to a hill away from you, medal scores |
| `thin-ice` | arena | round 8. A frozen pond of hexagon tiles (61 for 1-2 players, 91 for 3-4: `pond(rings)`, the arena is sent from `init`); slippery (accel 4.2); standing on a tile strains it, then it CRACKS (three crack overlays, it shivers) and drops into the water; skating across is safe, stopping is not (strain heals fast); 2.5 s "Ready…" grace; after ~16 s the pond cracks on its own, faster and faster; B (or A) = slide dash that bumps others; fall in = out; last one standing (falls on the same step tie); solo: survive for seconds + snowflakes (+3) |
| `pillow-fight` | arena | round 8. A giant bed (patchwork quilt) high over a bedroom floor, no edge; A = pillow swing (wide cone, aim help, pillow on the hand bone, feather bursts from one instanced pool); every bop raises the target's WOBBLE % (shown under their feet) and knock-back grows with it; off the bed = 2 s on the rug, −1 (not below 0), wobble back to 0, last bopper within 3 s gets +1; B = hop (a short straight slide); solo: sleepwalkers in nightcaps (`createActor`, Sleepyhead costume) climb on and shuffle at you, a bump wobbles you, bop them off for points |
| `firefly-catch` | arena | round 8. A meadow at dusk (stage lights dimmed and restored; Halloween uses the shared dressing); fireflies are blinking glow points that wander and dart away from people (harder = jumpier); golden ones are quicker and worth 3; A = net swing (cone in front, aim help, a faint wedge on the grass shows your reach); B by a bush = shake out 3 more (sometimes a golden one), the bush refills in ~10 s; portrait phones follow their own character; solo: medal scores |
| `spotlight-dance` | arena | round 8. A light-up club floor, mirror ball, coloured spotlights gliding about; a beat ring shrinks onto each light's edge on the beat (66 steps a minute = every 2 beats of the fair-organ tune, started on a beat); stand in a light and press A on the beat: timing is judged on the PHONE's clock (`act('step', {t})`, like Apple Bobbing) — perfect +1 bonus, streak ×2/×3/×4 after 4/8/12; early/late/out of the light/twice in a beat/skipped beat = streak gone; two lights merge into one big one every ~12 s and split again; difficulty = timing window, light size and speed; solo: medal scores (a perfect dancer gets ~300) |
| `bat-swarm` | arena | **Halloween, Oct only** (round 8, `meta.season`). A moonlit cobbled courtyard with a jack-o'-lantern piñata on a striped party arch that bursts wrapped sweets (lollipops = 3); flocks of cute bats sweep across in FORMATIONS — lane, column, two lanes, criss-cross, a wall with one gap (hard: wall + column) — always shown first as glowing purple stripes with arrows sliding the way they will fly (2.0/1.6/1.25 s warning by difficulty); a bat bump = dizzy 1.2 s, drop up to 2 sweets for anyone, then safe 1.9 s; A = dash; bats cast shadows; most candy wins; solo: medal scores |
| `skeleton-stack` | arena | **Halloween, Oct only** (round 8). A friendly graveyard; each player has a mound plot with a headstone; bones of five SHAPES lie about (feet, leg bones, rib cage, arm bones, a smiling cartoon skull); A grabs/drops (carrying = slower, bone held over your head), walk into your plot with the NEXT piece in order (feet → legs → ribs → arms → skull) and it clicks onto the skeleton; a full one dances (+3) and joins the little dancers by your plot; wrong piece = "Needs Legs first!"; placed bones rise again elsewhere; B = bonk: the target drops their bone and sees stars; the kind you need glows on the grass; 1 pt a piece; solo: medal scores |
| `putt-party` | arena | golf (2026-10-23). Mini golf on a fairground lawn, everyone at once: each player putts their OWN ball on the same hole at the same time (balls knock each other about). Stick = aim (your character turns round the ball), hold A = charge (the power rises then falls back — holding forever is never full), let go = putt; a dotted aim line shows only the first few metres and turns gold when the gentle aim help (window 14°/9°/5° by difficulty, only when the straight line to the cup is clear) has you on it; a power meter fills by your ball, counted on your own phone. Three holes in 30 s each: Bumper Alley (springy mushroom bumpers, par 2), The Windmill (four paddles turning in the only gap, faster on hard, par 3), The Hump (a ramp you need pace to climb, then a green that breaks toward the cup, par 3); each hole may be mirrored by the seed. Par + 3 strokes = picked up; an unfinished hole counts par + 3. Fewest strokes wins; ties go to whoever putted on more holes, then to the ball left nearer the cup. Easy = bigger cup, slower power swing, wider aim help. Scorecard between holes; portrait phones follow their own ball and the cup; solo = medals against par (gold at par or better) |
| `long-drive` | screen | golf (2026-10-23). Everyone tees off side by side at once, 3 drives each. Two taps: stop the POWER bar (it swings up and back), then stop the ACCURACY needle in the middle (early hooks left, late slices right, a mishit loses distance); ◀ ▶ aim 2° a step to play the wind (a flag by the tees + an arrow and mph on screen; the SAME wind for everyone on drive 1/2/3, stronger later and on hard). Rough either side does not count, trees past it, a pond on the right at the long end; your best drive that finishes on the fairway is your score (yards). The meters run on the phone and only `swing { p, a, aim }` is sent, so lag never moves them; the server works out the flight. A wide screen looks across the fairway, an upright phone down it; balls fly in an arc with a trail and leave a pin with the yards. Easy = slower meters, light wind. Solo: target flags bronze 200 / silver 250 / gold 290 |
| `chip-in` | arena | golf (2026-10-23). A practice green with a painted target (bullseye 50, rings 25 / 10 / 5), the cup in the middle (roll it in = CHIP-IN 100) and two buckets at the back (land it straight in = BUCKET 75). Everyone chips from their own mat at once, 5 shots each: stick aims (aim help toward the flag or a bucket), hold A charges the carry while a landing ring + dotted arc show where it will come down; the ball flies in an arc with its shadow racing to a ring on the grass, then checks and rolls; where it stops scores. Resting balls are solid, so you can knock a rival's ball off the target (their points are already banked). Hard = smaller rings, a little landing scatter, firmer green; easy = bigger rings, none. Ties go to more shots taken; solo = medals 90 / 180 / 300 |
| `haunted-hole` | arena | **Halloween, Oct only** (golf, 2026-10-23, `meta.season`). Putt Party's rules on a moonlit graveyard course (iron fence, big moon, the shared dusk dressing): Tombstone Row (round-topped smiling lavender tombstones as bumpers, and a friendly sheet ghost drifting across the green that says "Boo!" and puffs any rolling ball it touches off its line, par 3), Pumpkin Tunnel (a hedge across the green; putt into the giant jack-o'-lantern's glowing grin and the ball pops out of a little pumpkin by the cup — or go the long way round, par 2), Coffin Cup (the cup sits in a coffin whose lid creaks, then swings shut for a moment, again and again: shut = no cup and the lid knocks you back; open 2.6/2.1/1.6 s by difficulty, par 3). Fewest strokes wins; same ties and solo medals as Putt Party |
| `reel-rumble` | arena | fishing (2026-10-23). Everyone fishes one lake from their own peg on a dock. Stick aims, hold A charges the cast (the golf power swing; a ring + dotted arc show where the bobber lands, 2.2-9.6 m out), let go to cast. Fish are shadows under the water — a bigger shadow is a bigger fish and the big ones keep to the far water (a long cast biases the species pick toward fighters; a Moonscale's shadow glints gold). A free fish near a resting bobber may swim over, nibble (the bobber twitches) and BITE (it plunges): press A inside the window (1.15/0.85/0.6 s by difficulty) to hook it; A before a bite reels the bobber back in. The fight is the kit's reel model: HOLD A to wind in (the line tightens), LET GO to ease it (the fish swims off a little); full tension = SNAP, too far out = it got away; the fish surges now and then (pulls ~2x — let go) and tires on a tight line. A tension meter with a red zone and a distance bar float by you. Points by species (Tiddler 1 … Old Gilbert 20; boots and weed 0, never snap); ties by catches then kilos. Halloween: a purple moonlit lake and the fish's Halloween names (looks only). Solo: medals 8 / 18 / 30 |
| `pier-pressure` | screen | fishing (2026-10-23). One lane of sea per player off a fairground pier and ONE big button. Tap to CAST, then read the silhouette that swims up: a FISH nibbles (twitches — tapping now scares it off) then BITES with a plunge and "!" — tap then (window 0.9/0.65/0.48 s); JUNK (boot, kettle, weed — drawn as their own shapes) must be dodged by tapping BEFORE it reaches the hook, or it snags and you tap tap tap to untangle (4/6/8 taps). Three fish in a row without a slip get +1 each. Timing is Apple Bobbing's: each lane's visitor is a script on the game clock sent in the state, the phone draws it on its own clock and sends `tap { t }`, the server judges at t (not in the future, not older than 0.7 s). Space / Enter / a controller's A work too. Halloween: a night pier, orange bunting, Halloween names. Solo: you race Skipper Pebble, a CPU fisher in the next lane (reaction, fooled-by-a-twitch and dodge odds by difficulty) |
| `net-gains` | arena | fishing (2026-10-23), teams. Red + green against blue + pink (seats 0 + 2 vs 1 + 3, like the lobby's teams), wading in a lagoon with one net per team strung between its two holders; a team of one gets a CPU deckhand (Finn / Marlo) who keeps a net's width (3.4 m) to your side. Fish touching the mesh are scooped — only while the net is stretched 1.4-5.6 m (bunched or pulled tight = red and slack, catches nothing). 8 fish fill a net, 5 make it heavy (you wade slower); nothing counts until either holder touches your own dock. A = splash: fish within ~3 m dart away (herd them in, or out of the other net). At 35 s left Old Gilbert (20) cruises in and only a net stretched 3.6 m+ holds him. Fish flee harder and swim faster on hard. Team mates share the score and the place. Solo: you + Finn, medals 45 / 90 / 140 |
| `glimmer-ice` | arena | fishing (2026-10-23). A frozen pond at night under the northern lights with 8-11 holes. Fish swim under the ice and are only visible when they GLIMMER — each on its own fixed schedule (0.65-1.25 s every 2.6-5.8 s by difficulty; Aurora Chars glow longer) and only glimmering fish are sent to phones at all. A at an open hole drops your line (you sit, frozen in place); a fish that swims near may come, nibble and bite: A again inside the window to pull it up; A with no bite pulls the line up. Every hole freezes over (sealed in 24/17/12 s from open); a sealed hole cannot be fished and one that seals with your line in freezes it in. B chips the ice of the hole you stand at (-0.36 a chip). Slippery ice (low accel). Your nearest hole gets a ring: green = fish here, blue = chip first. Halloween: purple night and Halloween names. Solo: medals 8 / 16 / 26 |

Known gap: a phone that reconnects mid-drawing sees a blank canvas (its strokes are kept on the server and appear in the gallery).

## Looks, costumes and button names (round 6, 2026-10-22)

- **Look editor and costume shop** are a side panel (a bottom sheet on a phone held upright); the menus behind hide and
  the camera frames your own character close up, turning slowly (`lineup.focus`). The editor has **Quick looks**
  (`js/client/look-tidy.js` PRESETS). The shop lets you tap ANY costume to try it on (`lineup.preview`, only on your
  screen), then Wear (owned) or Buy (enough coins); otherwise it says how many coins you still need.
- **Tidy random faces** (`look-tidy.js` tidyFace, from the look's seed): parts the editor does not offer (2.5's
  removed soot/dirt) become defaults, face marks and accessories are usually none, unusual eyes/mouths/hair mostly
  become everyday ones. Editor choices always win. `tests/look-tidy.test.js`.
- **Button names follow the device** (`js/client/buttons.js` btnText; views use `ctx.btn(text)`): instructions are
  written controller-first ("press A", "B = bump"); on a keyboard they read Space / E, on a phone the on-screen
  button's label, with a controller A / B. `tests/buttons.test.js`.
- **Wobble Tower**: a drop that sets off a topple no longer lands after the trim (the tower was drawn one block too
  tall, level with the next swinging block).

## Holidays (round 6, 2026-10-22)

`js/shared/seasons.js` is the one table of holidays (Halloween = October 1-31; Christmas and Valentine's are written in
as comments, not built). Everything seasonal checks it:
- **Holiday minigames** (`meta.season: 'halloween'`, tag `holiday`): Trick-or-Treat Street, Ghost Tag, Pumpkin
  Carve-Off, Apple Bobbing, Monster Mash, the round-8 ones in the table above, and Haunted Hole (golf). Only offered while the season is on. The host's **Holidays** option in the
  lobby is Auto (by the server's date, the default), a holiday by name (forces it on any day of the year), **Holiday
  games only** (round 8: `holiday: 'only'` — the date's holiday, else the first one, and every vote offers holiday
  games first; regular ones only fill a vote when there are too few), or Off. In the minigame picker they are their own
  "Holidays" group.
- **Reskins**: every game is created with `season`, and the browser has `ctx.season`. In season, every arena game gets
  the shared dusk dressing (`js/client/halloween.js`: dimmed lights, purple sky and mist, jack-o'-lanterns, bats and
  ghosts outside the play area), and 11 games reskin themselves (Balloon Stampede, Cannonball Catch, Jellybean Jar ->
  Candy Jar, Lantern Leap, Mole Mallet, Sheep Shuffle, Coinstorm, Snowball Showdown, Paint Panic, Memory Heist ->
  Haunted Heist, Trapdoor Treasury). The intro card says "Halloween edition". Out of season every game is unchanged
  (`tests/halloween-reskins.test.js`).
- **Costumes** with `season` (20 Halloween ones, 5 free) are in the shop and can be worn only while the season is on
  BY THE DATE (the host option does not unlock them); outside it the shop hides them and the server draws their
  wearer in their own clothes (`room.js` pub, `profiles.js` buy/equip, `avatars.js`).
- **Board**: seasonal Wheel of Whatever results and Fair Bulletins (`data/chance.json` `season`), and a board may name
  `seasonBackdrops` (the Fairground Loop has a Halloween-night repaint with the same paths).
- **Menus**: `body[data-season]` themes the colours; a few bats cross the title and lobby.

To add a holiday: a row in `SEASONS`, `season: '<id>'` on its content, `body[data-season=<id>]` styles, and (optional)
reskins reading `ctx.season`. `tests/seasons.test.js` checks every `season` names a real row.

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

## Ratings, public games and counts (round 7, 2026-10-22)

The owner: "a like/dislike system … players rate minigames after playing them … we can use that data later to weed out
the unfun ones or prioritise the good ones", "a public lobby system to help people find games", "basic analytics, replace
with GA later".

- **Rating a minigame.** The results card asks everyone who PLAYED it "Did you like this one?" 👍 / 👎, then offers reasons
  (👍 fun, funny, exciting, good teamwork, looks great, play it again, but buggy, but unfair — a fun game can still be buggy; 👎 confusing, awkward controls, too hard, too easy,
  too long, unfair, laggy, boring, buggy, unplayable — `RATE_REASONS` in `js/shared/protocol.js`) and "Tell us more", which opens the ! form
  as a suggestion already about that game (`fb.open({ kind, text, about })` in `js/client/feedback.js`). Skipped on the
  results card, it shows again, small, on the next vote screen. Message `rate {game, v: 1|-1, why}`; the room accepts it
  only from someone who played that game in this room, cleans the reasons, and answers `rated`. A change of mind
  replaces the earlier rating (same `voter` id).
- **What the rooms report** (`createRoom({ report })` -> hub -> `server/insights.mjs`): `rate`, `played` (game, players,
  difficulty, real seconds against its clock, ended early, drop-outs, all tied, co-op success), `vote` (every minigame
  offered with its votes, and the winner — a game nobody picks is as telling as a 👎), `match`, `final`. Never a name,
  token or address. Stored as `<data>/insights/YYYY-MM.jsonl`.
- **The report:** `node tools/insights-report.mjs [--env stable|dev] [--days 30] [--json]`, or on the droplet
  `--dir /var/lib/tumblefair`. One row per minigame: plays, 👍, 👎, a score (lower edge of a 90% Wilson interval, so 3/3
  does not beat 40/50), top reasons, how often it wins the vote when offered, average seconds against its clock, ended
  early, drop-outs; then the day-by-day page counts.
- **Find a game.** In the lobby the host picks "Who can join": Invite only (default) or Public. The title screen's
  "Find a game" lists every public room — lobbies with a free seat first, fullest first — and refreshes every 3 s; one
  tap joins (a game under way: you watch, then get a seat at the next minigame). Message `rooms` -> `rooms {list}`
  (`hub.publicList`, `room.listing()`: code, host name, players/seats, phase, mode — nothing else).
- **Counts, cookie-free.** `js/client/tally.js` `tally(name, props)` batches events (page_view with device kind,
  host_game, join_game by code/invite/public, find_game, make_public, start_match, minigame_done, rate, rate_more,
  open_editor, open_shop, buy_costume) to `POST /tally`. The server counts them per day in
  `<data>/insights/counts-YYYY-MM-DD.json`; a day's visitors are counted with a hash of (address, browser, a salt thrown
  away at midnight), so nobody can be followed across days and no address is written down. No cookies and nothing on
  the device for this, so no consent banner; the title says so in one line. **For Google Analytics later:** load gtag
  and set `window.tumblefairTally = (name, props) => gtag('event', name, props)` — every `tally()` call goes there too —
  and add a consent banner then (GA sets cookies). The file is not called analytics.js because ad-blocker lists block
  that name. Automated browsers are not counted unless the page has `?tally=1`.
- Tests: `tests/insights.test.js`, `tests/tumblefair.spec.js` (rate on a phone, Tell us more, Find a game, big QR).

## Bug reports and suggestions

The round **!** button (top right) opens a form: Suggestion (first, and picked) or Bug, a text box, and a
picture of the 3D view (on by default). It posts to `POST /feedback` (`server/feedback.mjs`: 1.5 MB, 12 an hour per
address) with debug details — screen, recent phases, room and players, the minigame's last state, network, screen size,
device and the page's last errors. Read them with `node tools/feedback-report.mjs --env stable` (markdown),
`--html <file>` (with pictures), `--mark 3,4 --state done --note "…"`. Stored in `~/.local/share/tumblefair/<env>/feedback/`.

## Round 8 (2026-10-22): the owner's live reports

Twelve reports from the live server, all fixed:
- **☰ Menu** next to the ! on every screen but the title (a player's report: "a reliable menu button to get back to the
  main menu, including this screen and the invite QR screen"): back to the game, invite (big QR), report, leave to the
  main menu (a second tap confirms mid-game). The invite ("You're invited!") screen has "Back to the main menu"; the big
  QR has a Close button. On a phone the corner QR button is gone from the lobby (the panel's Big QR does it).
- **Just watch** replaces the "This is the big screen" tick box: a popup says you won't play, then joins as a watcher
  (the old display join). In the lobby a watcher has **Play instead** and a non-host player **Just watch instead**
  (two taps); both leave and rejoin the same room the other way (`S.swapTo`).
- **Holiday games only** (Holidays option, above). **Bulletin pill** on the board is a button: tap it to read the
  bulletin again. **Feedback form**: Suggestion first.
- **Defuse Together**: the device holder could not tap ANYTHING. `#game-ui .game > * { pointer-events: auto }` carried
  an id, so it beat every game's own `pointer-events: none` — and the game's invisible full-screen confetti layer took
  every tap. The rule is `:where(#game-ui .game) > *` now (no weight), which fixes the same trap for every overlay.
- **Wobble Tower** "couldn't see any blocks, rejoin fixed it": three.js works out an InstancedMesh's bounding sphere
  ONCE, at its first cull. Blocks start at count 0, so the sphere was empty and pinned at the tower's base, and the whole
  tower vanished as soon as the camera rose past it (a rejoin built a sphere from blocks that were already there).
  `js/client/stage.js` stops culling InstancedMesh for every game (our scenes are small).
- **Rope Rumble** "I win and don't even press": a player who never pulled is ranked last now (teams too).
- **Laser Limbo** "short": three lives (a blink of safety after a zap); one zap used to end a 2-player game in 4 s.
- **Dragon's Weak Spot** "he kept blocking my attacks": a strike on a pad between dizzy windows chips 2 damage instead
  of clanging; a wrong scale knocks you back less; the window is 8 s.
- **Snowball Showdown** "very hard to aim": a throw turns toward the target nearest where you face (within ~29°, 11.5 m,
  leading a moving one).
- **Halloween costumes** got real models (avatar-3d/js/chibi2-hats.js, Chibi 2 and 2.5): Pumpkin Head is a carved
  jack-o'-lantern over the whole head, plus a witch's hat, a candy-corn hat, a toadstool cap, a bedsheet ghost and the
  monster's flat-top with neck bolts; the pumpkin and ghost have 2D portraits too.

## Fishing (2026-10-23)

Four fishing minigames that play differently: **Reel Rumble** (arena, aim + timed cast, hook on the bite, a reel
tension fight), **Pier Pressure** (screen, one button: read fish vs junk silhouettes, ignore nibbles, hook the bite,
dodge or untangle junk; solo vs CPU Skipper Pebble), **Net Gains** (arena, teams: a net between two holders, CPU
deckhand for a team of one, bank at your dock, Old Gilbert needs a wide net) and **Glimmer Ice** (arena: fish only
visible when they glimmer, holes freeze over, B chips ice). Shared pieces:
- `js/games/fish-species.js` — THE fish table (16 species incl. 3 junk), each with an original name, a Halloween name
  (`hw`), the waters it lives in (`lake` / `pier` / `lagoon` / `ice`), weight, points, fight, speed, size, colours, glow.
- `js/games/fish-kit.js` — pure rules: weighted species pick (with a "long cast finds fighters" bias), weights, cast
  landing + arc, the golf power swing (`charge`), the reel fight (`LINE` per difficulty, `startReel` / `stepReel` →
  snap / land / free, surges, tiring, junk that cannot snap), `botHolds`, `wander` / `steerTo` for fish shadows, `groupBy`.
- `js/games/fish-view.js` — browser-only 3D bits: a cartoon fish (or boot / kettle / weed) per species, bobber, a rod on
  the hand bone with a tip, a sagging line. `js/games/fish.css` (imports golf.css) — tension meter, catch card, medals.
- Halloween reskins (looks + names only) on Reel Rumble, Pier Pressure and Glimmer Ice; all three are in
  `tests/halloween-reskins.test.js`. Lobby difficulty changes bite windows, line strength, freeze speed, how shy fish are.
- Tests: `tests/{reel-rumble,pier-pressure,net-gains,glimmer-ice}.test.js` (full bot games 1-4 players, a good bot beats
  a sloppy one at every difficulty, determinism, small state); `tests/helpers.js` has a `pier-pressure` UI bot.
- Card art: Codex (`assets/art/card-{reel-rumble,pier-pressure,net-gains,glimmer-ice}.webp`).

## Round 9 (2026-10-23): live reports #13-#18 + Claude's play-test

- **The invite code survives a tab switch (#13):** a lobby keeps a phone that dropped for five minutes
  (`TIMES.GONE_LOBBY_MS`), and a room whose phones have all gone is kept five minutes too (`EMPTY_MS`). It used to drop
  a lobby player after 15 s and delete the room the moment it was empty, so switching apps on an iPhone killed the code.
  A match starts without anyone still away (`startMatch` removes them), so a sleeping phone never holds up the board.
- **Controllers work on every menu (#14):** `js/client/padnav.js`. The d-pad or left stick moves a gold highlight
  (`.pad-focus`) to the nearest button that way (buttons in the same column/row win over ones off to the side), A
  presses it, B closes the top sheet. Only the top layer can be reached (big QR, else the last `.modal`, else the
  page), it finds its button again after the lobby redraws, and it lets go of the pad whenever an arena minigame shows
  its controls (`controls.shown`).
- **Pick-lists in Change look (#15):** every ‹ › row (hair, eyes, accessory, body type…) has a drop-down between the
  arrows that jumps straight to any one (16 px text so an iPhone does not zoom).
- **Move cards (#16):** lobby option **Moving: Roll a die / Move cards** (`opts.moves`, board games only). Each player
  holds 4 cards (1-6); on your turn play one (you know what you get) or take a face-down **mystery card** from a random
  rival's hand (they draw a new one). Golden die adds a roll, sticky shoes cap the card at 3, and the timer plays your
  first card. `board.js` `playCard(pid, i)` (`i = -1` = mystery), message `card { i }`. Dice games are unchanged.
- **Golem Smash: rubblings and jumping (#17, #18):** see its row above. A bot that ignores the rubblings now wins
  about 5 s later on normal and gets bonked ~60 times a game instead of 2.
- **Claude's play-test:** the guest lobby's see-through "Waiting for the host" bar sat over the Teams button (the bar
  is solid now and only the host's Start button stays stuck to the bottom), and the board's top bar ran under the
  ☰ button (it stops 92 px from the edge now).

## Accounts (2026-10-23)

The owner: "sign in optional. QR code to sign in using your phone on all games … I'd like to use my TV account for the
other games — same password, different saves." One games.radgh.com account works in every game (Thousandvale usernames
and passwords included); each game keeps its own save on it.

- **For players.** "Sign in" sits on the title screen, in the ☰ menu and at the bottom of the look editor. It opens the
  shared sign-in box (`shared/rgs-signin.js`: a QR code to approve from a phone that is already signed in, username +
  password, or make an account). It is optional — guests play exactly as before. Signed in, your character, coins and
  costumes are kept on the account, so the same ones turn up on any phone or PC you sign in on. Your in-game name stays
  whatever you typed; the account name only shows on the account button.
- **How the server learns who you are.** The page asks rgs-api for a one-time **ticket** (`account.ticket('tumblefair')`,
  shared/rgs-account.js) and sends it in `hello` (every connect, so a reconnect is still you) or in `account { ticket }`
  (signing in without reconnecting; `account {}` signs out). `js/sim/hub.js` hands it to `redeem` —
  `server/rgs.mjs` `createRedeemer`, which calls `POST <RGS_API>/auth/redeem` (works once, lasts 2 minutes, must be a
  ticket made for this game). Only that answer is believed; a user id from a browser is never used. While a ticket is
  being redeemed, that socket's other messages wait in a short queue. If redeem fails (bad ticket, API down) the player
  carries on as the guest, it is logged (`account.redeem_failed`) and the page says so in a small message.
- **Profile keys** (`js/sim/profiles.js`, `<data>/profiles.json`): a guest is keyed by its random token (the one in the
  browser's localStorage, as before); an account by **`acct:<user id>`**. `profiles.guest(token)` refuses any `acct:` key, so a
  browser can never name one. First sign-in on a device: if the account has no profile yet, the guest profile
  **becomes** the account's (moved, not copied — no coins counted twice; note `moved`); if it has one, the account's is
  used and the guest profile is left alone (note `kept`, and the page says so). Signing out goes back to the device's
  guest profile — a fresh one if it was moved. Signing in while in a room keeps your seat and moves it onto the account
  (the match's coins go to the account). Server answers: `welcome`/`acct` carry `account: { id, name, username } | null`,
  `note`, and the device's guest `token` (omitted when it became the account's).
- **The admin feed** for games.radgh.com/admin/ (`server/rgs.mjs` `createAdminFeed`, also used by Knockabout):
  `GET /internal/admin/feed` -> `{ game, build, uptime_s, online: { rooms, players }, reports (newest 300, no addresses),
  ratings (per minigame: up, down, plays, score, offered, picked, reasons), insights (30-day totals), counts (day by
  day + totals) }`; `POST /internal/admin/action { action: 'report', ids, state: 'done'|'declined'|'new', note }` ->
  `{ ok, changed }` — the same as `tools/feedback-report.mjs --mark` (both use `markReports` in `server/feedback.mjs`).
  Off (404) unless `RGS_ADMIN_SECRET` is set; the request needs header `x-rgs-admin: <secret>` (constant-time compare,
  403 otherwise).
- **Env vars:** `RGS_API` (default `https://games.radgh.com/api`; the droplet and the VM dev unit use
  `http://127.0.0.1:8600/api`) and `RGS_ADMIN_SECRET`. The dev unit gets them from a local drop-in,
  `~/.config/systemd/user/tumblefair-dev.service.d/rgs.conf` (not in git); the droplet unit reads
  `EnvironmentFile=-/etc/tumblefair/env`.
- Tests: `tests/accounts.test.js` (redeem against a pretend rgs-api, the move / keep rules, signing in and out on one
  socket and in a room, the admin feed's lock and the report action) and `tests/accounts.spec.js` (Playwright against the
  dev server + the VM's real rgs-api: the button shows, a guest can host, sign-up / out / in swaps the character).

## What worked / what didn't

- **Round 4 (2026-10-21):** the lobby on a phone could not reach "Change look"/"Costumes" — the join-code box was pinned
  over the panel and the panel was stacked with `align-content: end`, which pushes overflow off the TOP where no scroll
  reaches. The lobby is a flex column with an auto margin now, and the code box folds to one line (remembered).
- **Board art vs spaces (bug report #1):** the backdrop was painted separately from the formula-laid spaces, so they
  never lined up. Fix: draw the board's own loop as a guide picture, have Codex paint the fairground over it, then
  `tools/fit-board.py` slides each space sideways onto the middle of the painted path (`data/boards/fairground-fit.json`).
- Characters are Chibi 2.5 (Thousandvale's `createTvBody`); the look editor shows the 2.5 extras.
- The browser loads `js/games/metas.js` (generated, meta only) instead of every game's rules.

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
`tools/phone-check.mjs` (round 5: real touch drags on three phone sizes + a WebKit pass — the menus scroll and Start/Done are reachable; the iPhone lobby could not scroll because `#screen` had `pointer-events: none`, which WebKit will not scroll), `tools/look.mjs` (screenshots) and `tests/tumblefair.spec.js` (Playwright, run from the playground root under the lock).

## Not built yet (parked 2026-10-13 when the owner said "wrap up")

From the design document, deliberately left for a later round:
- **Main modes:** the RPG one-shot (story grammar, callbacks to who did what), branching paths. (Board, Marathon,
  Endless and Teams are built.)
- **Host settings in the lobby:** choosing the minigame pool (the server already accepts `opt pool`), vote shortlist
  size and difficulty are not on the lobby screen yet; only mode, rounds and teams are.
- **Accessibility options:** low motion, adjustable timers, larger text.
- ~~Accounts~~ — built 2026-10-23, see "Accounts (2026-10-23)".
- **Bots** to fill empty seats for one- or two-player groups.
- **More boards** (one starter board), seasonal costumes, achievements.
- Tuning after real play: Cannonball Catch's difficulty, Meteor Dash's pace, ticket and coin amounts.
