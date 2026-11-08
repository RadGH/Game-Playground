# Tumblefair Expansion 1 — "The Fair Comes Alive" (started 2026-11-07)

Owner request (2026-11-07): "start a new expansion for Tumblefair including 8 milestones of updates, you decide where
to invest that effort into improving the game taking current feedback into consideration".

## What the numbers say (live insights, last 30 days, read 2026-11-07)

- **74 matches started, 31 finished (42%).** Most matches are abandoned part-way. Matches are too long or lose people.
- **Rooms of 1 are common** (the owner's own reports are mostly from 1-person rooms). Only 65 of 129 minigames have a
  computer player; the parked list still says "Bots to fill empty seats".
- **The top complaint is "confusing" / "controls"** (Defuse Together, Two Truths One Goblin, Storm Shelter, Portal
  Routing, Safecracker, Meteor Dash, Monster Makeover, Laser Limbo, Tile Flip Race, Firefly Catch, Secret Architect…).
- **The best-loved games are funny and social**: Pin the Tail (82), Bumper Bash, Long Drive, Costume Catwalk, Size Up,
  Apple Bobbing, Memory Heist, Bat Swarm, Pumpkin Carve-Off. The owner loves the boss games (Dragon's Weak Spot).
- **Visits fell off after Halloween ended** (21/day → 1–4/day). There is no winter season yet; the owner asked for
  Christmas "later" in round 6.
- **Coins and costumes barely move** (buy_costume ≈ 10 in 30 days): nothing to work toward between matches.
- Still parked from the design doc: the **RPG one-shot** main mode, **accessibility options**, **achievements**.

## The 8 milestones

| # | Name | Why | What |
|---|---|---|---|
| M1 | **CPU Fairgoers** | rooms of 1–2; half the games have no CPU | Named computer players fill empty seats (host picks how many, and how good). Every minigame playable with CPUs (a shared CPU kit + a CPU for each game that lacks one). CPUs must be beatable: tests that measure CPU win rates per difficulty. |
| M2 | **Finish the night** | 58% of matches abandoned | Quick Match (~10 min) and a time estimate on every mode/length choice; a clock on screen; "Play again" with the same group and settings; a short end-of-match highlight reel (best moments, awards). |
| M3 | **Learn by doing** | "confusing"/"controls" is the #1 complaint | A practice window in every intro: controls work, nothing counts, a ghost hint shows the move; a how-to audit of all games (one goal line + one controls line, picture of the buttons); comfort settings (bigger text, less motion, longer timers). |
| M4 | **Fix the bottom of the table** | low scores, buggy flags | Rework the 12 lowest-rated / buggy games so each has one clear idea, good phone controls and a CPU. |
| M5 | **More of what you love** | funny/social + bosses win | 10 new games in the style of the top-rated ones (silly-physics, dress-up/judge, guessing, two new co-op bosses). |
| M6 | **Winter Fair** | visits fell when Halloween ended | A winter holiday season (Nov 1 – Jan 6) through `js/shared/seasons.js`: a snowy board reskin, 8 winter-only games, winter reskins of favourites, 12 winter costumes; the host's holiday box gains Winter. |
| M7 | **Fair Pass** | nothing to work toward | Sticker book (achievements), a fairgoer level from playing, a daily challenge, rewards that unlock costumes and name colours. Power-neutral. Works for guests, saved to the account when signed in. |
| M8 | **Story Night** | the design doc's RPG one-shot | A new main mode: a 15–20 minute story adventure built from a story grammar, where choices on spaces and minigame wins are remembered and called back later ("After Mabel outran the clockwork guard…"). 5 story arcs. |

## How it is built

Three lanes so two agents never edit the same file at once:
- **Lane A (room and screens):** M1 → M2 → M3 → M7
- **Lane B (minigames):** M4 → M5
- **Lane C (content + mode):** M6 → M8 (M8 keeps its logic in its own `js/sim/story*.js` with a small hook in room.js)

The lead writes `data/changelog.json` and `js/games/fresh.js` and publishes. Progress: `~/claude/agent/tumblefair-expansion-checklist.md`.
