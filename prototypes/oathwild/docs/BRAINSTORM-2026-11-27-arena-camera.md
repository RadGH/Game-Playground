# Oathwild — arena mode, camera, combat + levelling focus (brainstorm 2026-11-26 evening)

Owner's request, what each point means, the design and Claude's calls (overrule any). Written BEFORE building.
Status: **question** · **planned** · **in progress** · **done**.

> "I think at this point of the game we should focus on improving the camera, combat, and leveling. Add a new hosting
> option for waves mode where you go to a massive arena and fight waves of monsters of certain level ranges, really
> it's own entire game mode. In between battles you can visit the shops and respec. Have gear as rewards via chests
> after the arena matches are completed. Arena matches should scale with level but starting it should be possible for
> a lvl 1 character. Arena may be incorporated into the main game later if that is better than keeping it separate
> hosting option, maybe we can just have a teleport take you there. Include other heroes in the system with special
> rewards for defeating them somewhat like oblivion.
> Camera feels like it is pointed too far forward but i'm not sure how to explain. Can you create camera edit mode so
> i can fine tune the knobs. It's like it focuses too far in front of the character and too far to the side"

## 0. Focus

From now on Oathwild's rounds go to **camera, combat and levelling** first (PLAN §0 gets this ruling). World tools
built today (map editor, house kit, tree kit, world builder) stay as they are and get used, not extended, unless asked.

## 1. Camera

| # | What it means | Design / call | Status |
|---|---|---|---|
| 1a | Why it feels off | `play/camera.js` sits behind and 0.75 m right of the hero (`cameraSide`) and aims at a point **30 m ahead** and slightly down — so the hero sits low-left on screen and the middle of the screen is far out in front. That matches "focuses too far in front … and too far to the side". | done (found) |
| 1b | Camera edit mode | In the game, **☰ → Settings → Camera → Tune camera** (and `?camera` on the dev copy): a small panel docked at the side (the world stays live and playable behind it) with sliders: **distance**, **height of the look point**, **side offset**, **look-ahead** (how far in front the camera aims, today fixed 30 m), **look-down** (how much it tilts toward the ground), **field of view**, **follow speed** (lag), **zoom limits**, **pitch limits**, **where the hero sits on screen** (a read-out). Each slider shows its number and unit. Buttons: Reset, Copy numbers, **Save as the game's default** (dev copy: writes `data/tuning.json`), Keep for me (this device only). Works with mouse, touch and controller (rule 27). | planned |
| 1c | Live with Claude | The panel joins a live channel like the tree kit's, so Claude can move a knob from the command line (`tools/camera-edit.mjs set lookAhead 8`) while you watch, and see what you saved. | planned |
| 1d | A better default | Before you tune: Claude's own starting guess — look point a few metres ahead (not 30), smaller side offset, hero a little left of centre and lower third — so the first thing you see is already closer. You fine-tune from there. The crosshair aim stays honest (it already casts from the camera through the middle of the screen). | planned |

## 2. Arena — "waves" as its own game mode

| # | What it means | Design / call | Status |
|---|---|---|---|
| 2a | Hosting | The world list gets a second kind: **New world** (today) and **New arena**. An arena is a separate saved place with its own code to share, joined the same way, 1–10 players. **Owner: shared heroes** — XP, gold, gear and classes earned in the arena are the hero's. Later a teleport stone in Larkford can take you there instead (the owner's "maybe incorporate later"): the arena is built as a place that could sit inside a world, so that's cheap. | done (README "Arena") |
| 2b | The place | A **massive** arena: a round sand floor ~120 m across inside tiered stone stands with a crowd, banners, gates the waves come out of, torches, a raised champion's balcony; a **staging court** outside the gates with the shops (smith, goods, the trainer for respec), a shrine, the reward chests and a board of brackets. Built with the house kit, tree kit and Kenney/fal props; every model textured (rule 77). | done (README "Arena") |
| 2c | A match | Pick a **bracket** at the board (by level range: 1–2, 2–4, 3–5 … 9–10, later higher). A match = **5 waves** that rise in size and include a mini-boss on wave 3 and a boss on wave 5; between waves a 20 s breather (no shops mid-match). Monsters come from every region's roster at the bracket's levels; packs stay small enough to fight (owner: 1–2, rarely 3 — waves add more over time instead of all at once). Scales with the number of heroes like camp bosses do. Lose = everyone down → back to the court, keep XP earned, no chest. | done (README "Arena") |
| 2d | Rewards | After a win: a **reward chest per player** (individual loot, the game's rule) — gear of the bracket's level, better rarity the higher the bracket and on a first clear; gold; XP for every kill as usual. A bracket cleared for the first time gives a guaranteed magic piece. | done (README "Arena") |
| 2e | Scaling + a level-1 start | Brackets are by level, so a level-1 hero starts at 1–2 (the gentler newHero numbers apply); the board marks brackets above you as "hard" but doesn't lock them. | done (README "Arena") |
| 2f | Between matches | In the court: shops, repair, the class trainer and **paid respec** (as at shrines), level-up windows, talk. | done (README "Arena") |
| 2g | Other heroes, "like Oblivion" | Oblivion's arena is a ladder of ranked fighters up to a Grand Champion; each rank win brings a title and a reward. Here: **Champions** — named heroes built exactly like players (a class tree, gear, real abilities, dodges, a wind-up tell on their specials), fought 1v1 (or vs your party, scaled) in a **Champion bout**, unlocked rank by rank as you clear brackets. Each defeated champion gives a **unique reward**: their signature weapon or armour piece (a named unique item), a title shown on your name, and the next rank. Ten ranks, Grand Champion last. **Owner: made-up champions only** (no copies of other players' heroes). | done (README "Arena") |
| 2h | Code | One arena module on the server (`server/arena.js`: brackets, waves, breathers, champions, chests) on top of the existing combat sim; arena data in `data/arena.json` (brackets, wave tables, champions with their builds + unique rewards); a "Champion" AI that reuses the test bot's player logic (`tests/rules/bot.mjs` grows into `js/rules/hero-ai.js`) so champions play like heroes, not monsters. Balanced with the sim before it ships (rule 81): `tools/sim-arena.mjs` runs every bracket with a bot party and every champion bout. | done (README "Arena") |

## 3. Combat + levelling (the focus, from today's reports)

Already done today: dodge works (blow lands where its mark shows, #137), plain vs special monster blows, gentler
levels 1–4 + more starting health, "Miss" only on a real attempt (#136), auto-attack swing effects per weapon (#138,
helper building). Next in this focus, planned: the sim gets a **new-player bot** (slower reactions, misses some ability
timing) so the numbers are judged against a person, not an expert; levelling pace check from level 1 → 10 in the
campaign bot (time per level), and the arena feeds the same XP curve.

## Owner answers (2026-11-26 evening)

1. Heroes are shared between the arena and the open world.
2. Champions are made-up (a ten-rank ladder to a Grand Champion), not copies of other players' heroes.
