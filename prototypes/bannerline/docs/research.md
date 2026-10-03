# Bannerline research: Hero Line Wars and its relatives

Claude-facing research note (third-party names are fine here; never in player-facing text or data). Written 2026-10-03 from web sources listed at the end. Where a claim comes from general community knowledge rather than a fetched source, it is marked **(unsourced)**. Hero Line Wars was never one map. It was dozens of forks (Vortex/"HLW 7.x-9.x", HatoZILLA, Lition, BuuFuu, Custom Hero Line Wars, Starlight on SC2, a Dota 2 port), so numbers differ by version. The *shape* of the game is very consistent across all of them.

## 1. The core loop in one paragraph

Two teams (1v1 up to 4v4, some forks 5v5). Each player picks one hero who stands in their own team's lanes and kills whatever the other team sends. Nobody attacks the enemy base directly. You attack by **buying creeps** ("mercenaries", "mobs", "sends") from a building at your base. Each bought creep immediately walks down an *enemy* lane, and the purchase **permanently raises your income**, which is paid every few seconds. Gold buys either more sends (offence plus economy) or items for your hero (defence). Every enemy creep that reaches the end of your lane costs your team a life. When a team hits zero lives, it loses. As one guide puts it: "To get money, you need to spend some money."

## 2. Map layout

- **Lanes.** Each player owns one lane on their team's side of the map. Lanes run in parallel strips (typical WC3 map size 64x96, e.g. *Hero Line Wars Final*, made for 2v2-5v5). Creeps sent by an attacker spawn at the top of the matching enemy lane. **(unsourced)** In most forks player N's sends go to the opposing player N's lane, so in practice each player defends one lane against one rival. That turns team games into a set of parallel 1v1s with shared lives.
- **The end of the lane** is a "base ring" (HLW 2.3), a beacon (Starlight), a crystal plus generators (Hero Line Defence), or "Chance Points" with a town that gets razed on defeat (Lition). It is a leak counter, not a fight. Legion TD uses an actual **king** unit that fights back. Castle Fight uses a **castle with HP**.
- **The base** holds the creep shop (Town Hall / Mercenary Camp / tavern), an item shop, a tome shop (stat tomes), a potion shop, and often a "trained creeps" shop where you hand-steer the send (HLW 2.3).
- **Team spell building.** Nearly every fork gives the team a free emergency button: a temple or shrine with spells like Blizzard (clears grouped creeps), Tornado (lifts one strong creep for ~12 s) and Lightning Strike (20,000 damage to up to 20 creeps) in HLW 2.3. Lition calls it a Magic Shrine whose spells must be upgraded to keep up. Dota 2 HLW gives each player a "controller" unit that casts powerful spells. Starlight: "use your shrine if you get overwhelmed."
- **Duel arena** (common in later forks). Custom Hero Line Wars runs duels roughly every 5 minutes for extra gold and extra team lives.

## 3. Sending units: tiers and costs

- Creeps come in **tiers** (T1/T2/T3, or levels 1-3). Higher tiers unlock through a **base upgrade** paid in gold. HLW 2.3: Town Hall to Stronghold at 30,000 gold, to Black Citadel at 100,000, with a suggested ~10,200 income before the first upgrade. In HLW 8.0b's guide, T3 sends give roughly **11% more income** than T2, so finishing T2 fast is the standard advice.
- **Income per gold drops as cost rises.** HLW 2.3 example: Peasant costs **10 gold for +2 income** (20% of the price back *every tick*). The top sends (Avatar, Lightning Ghost, 75k-100k) give **0 income**. They are pure pressure units. Starlight says the same thing: "Cheaper units give more income per cost, but also more experience" (for the defender who kills them). That is the central tension. Cheap spam builds economy but feeds the enemy hero XP. Expensive units are pressure that does not pay you back.
- Some forks randomise sends inside a tier (Custom Hero Arena Line Wars: 11 levels across 4 shops). A reviewer called that a flaw because "it removes tactical counterplay": you could not pick a send that counters the enemy hero.
- Purchase order advice: buy weakest to strongest within a tier to maximise income (HLW 2.3). Starlight lets you right-click a creep to auto-send whenever you can afford it (an "auto-buy" toggle).

## 4. Income

| Version | Tick | Base | Notes |
|---|---|---|---|
| HLW 2.3 (WC3) | **10 s** | 20 gold/tick, 40 start gold | sends add income, cheap ones best ratio |
| Classic HLW / Dota 2 port | **10 s** | n/a | "Spawning creeps costs gold but adds to your income given every 10 seconds" |
| Custom Hero Line Wars | 10-20 s (sources disagree) | n/a | income from summoning only, gold from kills; lumber tradeable for gold |
| itch.io remake | **20 s** | n/a | lose at 15 leaks |
| HatoZILLA 2.511 | n/a | n/a | income cap of 1,000,000 |
| Castle Fight | set by mode | 5 gold | each building adds a % of its cost (see §9) |
| Legion TD 2 | end of each wave | n/a | income rises with every mythium spent; workers make 1 mythium / 10 s |

Rule of thumb from HLW 2.3: a T1 send pays itself back in about **5 ticks (~50 s)**, and by the late game income reaches 10k+ per tick. Numbers inflate wildly. Late HLW forks deal in tens of thousands of HP and 20,000-damage spells, which is why level-120 heroes and "-str max" chat commands exist.

**Gold vs lumber.** Classic HLW is gold-only. Lumber appears in forks as a second currency for special items or as a convertible (Custom Hero Arena Line Wars trades lumber for gold). Legion TD splits it properly: gold for defenders, lumber/mythium for sends. Castle Fight uses lumber only for special/legendary buildings.

## 5. Waves that come regardless

Pure Hero Line Wars mostly has **no neutral wave**: every creep on your lane was bought by an opponent. **(unsourced)** Many forks add a small automatic trickle per lane so a passive opponent cannot leave you with zero XP. The relatives that *do* have fixed waves are Legion TD (21 waves in LTD2, 30ish in WC3 Legion TD, every player faces the same wave each round) and Hero Line Defence (portal waves whose gold scales with wave number, difficulty up to 3x creep multiplier).

## 6. Heroes: levels, items, death

- **XP** comes from killing sent creeps, so the defender is paid for being attacked. Some maps share XP across the whole team (Custom Hero Arena Line Wars uses global XP plus a deliberately slow level rate).
- **Stats:** STR = HP + damage, AGI = attack speed + armour, INT = mana + regen (standard WC3). Tomes give permanent stats and are a main gold sink. Huge level caps are common (HLW 2.3 grants Blink at level 120).
- **Death:** HLW 2.3 respawns the hero **30 s** after death at the base ring, keeping all stats. While you are dead your lane leaks, and the shrine spells exist to cover that window. Hero kills in the PvP arena cost lives in some forks (Custom Hero Arena: **-5 lives** per hero kill against 300 starting lives).
- **Inventory:** stock WC3 heroes carry **6 items**, one per numpad slot, with no bag, no paper-doll and no slot types. Duplicates are allowed, but some effects (Boots of Speed) do not stack. A full inventory means selling or dropping. Late game is mostly "6 of the best stat item" plus tomes. Map makers fake extra space with bag items or extra carrier units, but the 6-slot limit shapes how every fork's item list is designed.

## 7. Win/lose and length

- **Lives:** 50 leaks (classic HLW, Dota 2 port), 100 (HLW 2.3, HatoZILLA), 300 (Custom Hero Line Wars), 15 (itch remake). Legion TD loses when the king dies. Castle Fight loses when the castle dies.
- **Length:** HLW 2.3 estimates 15-20 minutes to reach tier 3. **(unsourced)** Full games commonly ran 30-60+ minutes, especially between evenly matched or very defensive teams. Line Tower Wars Reforged players call it "quick (10~30 min)". Legion TD 2: "most games end before wave 21".

## 8. Team play

Shared team lives, individual lanes **(unsourced: typical layout)**. Each player defends their own lane, and helping a teammate means walking over (or teleporting late game). The emergency spells are a team resource. Weak players drain shared lives, so a team is only as strong as its weakest lane. That is a common source of tension in pub games **(unsourced)**. Dota 2 HLW is 5v5. HLW forks range from 1v1 to 4v4/5v5.

## 9. Distinguishing the related genres

| Genre | You control | Defence by | Attack by | Economy | End |
|---|---|---|---|---|---|
| **Hero Line Wars** | One hero | Your hero (plus shrine spells) | Buying creeps sent down enemy lanes | Sends raise income per tick (10 s) | Lives run out (50/100) |
| **Line Tower Wars** | A builder | Towers you maze in your lane | Sending creeps to the player on your **right** (free-for-all ring of 3-12 players) | Every send raises income for the match | Last player with lives wins |
| **Castle Fight** | A builder, no hero | Not directly: buildings auto-spawn units every cycle | The spawned units march two lanes to the enemy castle | Base 5 gold plus a % of each building's cost (normal 2.0%, siege 1.8%, spell 1.2%, enemy-spell 0.9%, tower 0.8%). Progressive tax +10% per bracket, max 80% (bracket 25/20/12.5 income by mode). Losing buildings lowers income | Castle destroyed |
| **Legion TD** | A builder | Fighters placed in your lane, which reset every wave | Sending mercenaries with lumber/mythium | Gold from waves/income, lumber from workers (LTD2: 1 mythium / 10 s each) | 21 waves (LTD2), king killed |
| **Hero Line Defence / Hero Defense** | One hero | Hero vs. fixed portal waves | None (co-op or race) | Wave-scaled gold | Crystal dies |

The short version: in HLW **you are the tower**. Line Tower Wars swaps the hero for a maze. Castle Fight removes direct control of fighting entirely. Legion TD has build rounds and a fighting king.

## 10. Modern descendants

- **StarCraft II Arcade:** *Hero Line Wars Starlight* (1v1-4v4, 47 heroes, Mercenary Camp, beacon, shrine, merchants for ability upgrades, auto-send toggle). *Squadron TD* was Legion TD's SC2 bridge, using per-round income from sends. *Direct Strike* is the Castle Fight-style tug-of-war, where minerals grow 7.5/s and the team holding the centre line gets +1/s.
- **Dota 2 Custom Games:** *Hero Line Wars* (5v5, taverns, 10 s income, lose at 50, a per-player spell controller, a spell building).
- **Standalone:** *Legion TD 2* (2017, AutoAttack Games) is the success story, kept alive by constant balance patches. Line Tower Wars never got an official standalone. Tower Wars (2012) and similar attempts failed because they "added friction, split a small player base, or launched without the free, drop-in accessibility." Recent: *Send & Defend* and a Steam *Line Tower Wars* (2026). WC3 Reforged still hosts *Line Tower Wars: Reforged* (3-12 players, 100+ towers, 10 tech paths, ranked seasons, AI opponents).

## 11. What players loved and what frustrated them

**Loved (mostly unsourced, community memory):**
- Two decisions every 10 seconds: send (greed plus pressure) or gear (safety). Gaming-tools: "You must find a good balance between getting more gold and spending enough items for your hero."
- Indirect PvP. You "fight passively versus the opponent team" (gaming-tools), so a newer player is never directly bullied by a better hero.
- The big-number fantasy: level-120 heroes, screen-clearing spells.
- Huge hero rosters (24-85 heroes depending on fork) and "every WC3 user played it once" ubiquity.

**Frustrated:**
- **Snowballing.** Income compounds. A player who falls behind earns less, leaks lives *and* pays the attacker's XP. Comebacks are rare **(unsourced)**. Castle Fight's progressive tax (up to 80%) is the clearest published counter-design.
- **Income-stalling / greed builds.** Sending only cheap high-ratio units to farm income while barely defending works until it suddenly does not. Top-tier zero-income sends exist partly to punish it.
- **Turtling.** Two cautious teams can stall for an hour. Long games are a recurring complaint **(unsourced)**.
- **Leavers/AFK.** A leaver's lane leaks freely into shared lives, and WC3 had no backfill. Gold-sharing of the leaver's income was a common patch **(unsourced)**.
- **Balance.** "some heroes are still unbalanced" (Lition review). "One decent nuking ability... and make insane amounts of cash" (Custom Hero Arena review): AoE heroes trivialise spam sends. Hero Line Defence reviews: early heroes broken, ranged waves brutal for ranged heroes, tier-3 items too slow, tooltips not matching values.
- **Random sends** removed counterplay (Custom Hero Arena review).
- Inflated numbers that become unreadable late game.

## 12. Design takeaways for a modern remake (split-screen, online 1v1/2v2/3v3, AI, real inventory)

1. **Keep the 10-second income tick** and show it as a visible ring on the HUD. It is the game's heartbeat. Start around 20 base and 40 starting gold scaled to our numbers. A T1 send should pay itself back in ~5 ticks, top sends should pay ~0 back, and every tier in between should slide down.
2. **One lane per player, mirrored across teams, shared team lives (~50).** For split-screen, each viewport *is* one lane, so local 1v1 is two vertical halves and 2v2 couch is four quadrants. Lanes need no camera scrolling beyond their own strip.
3. **Anti-snowball, published as rules:** a progressive income tax (Castle Fight style, e.g. +10% per bracket, capped), a **catch-up bonus** when a team is behind on lives, and XP to the defender for each kill (already built into the genre). Show the tax in the UI. Hidden rubber-banding feels like cheating.
4. **A clock that ends the game.** Escalating sudden-death (lives drain, or auto-waves that grow) after ~25-30 minutes, plus a soft auto-wave from minute 1 so a passive opponent cannot starve you of XP. Target 15-25 minute matches.
5. **Counter-picking matters.** Fixed, readable sends with tags (armoured, swarm, flying, magic-immune, healer) so you send *against* the enemy hero. Avoid random sends. A "next send" preview on the defender's side gives counterplay.
6. **Team shrine spells on shared cooldowns** cover deaths and spikes. Use a short respawn (~10-20 s at our scale, not 30 s+) because a dead hero means free leaks.
7. **Real inventory replaces the 6-slot list.** Use Farhold's equipment slots and affixes, but keep shopping fast: a recommended-buy column, one-click "buy best upgrade", and buy-from-anywhere (or a courier) so shopping never leaves the lane undefended. Tomes become stat buys or perk points.
8. **Leavers/AFK:** an AI takes over the lane immediately (the same bot as solo play), and their income is optionally shared. Online play should allow reconnect into the bot's seat.
9. **AI is mandatory for the genre to work without a crowd.** It needs three skills: income-vs-defence policy (send while hero can hold the lane), counter-sending against the enemy hero's tags, and item buying. Difficulty comes from reaction delay and greed, not cheats.
10. **Readable numbers.** Cap inflation. Keep HP and damage in the hundreds-to-low-thousands, using shared/format.js.
11. **Hero kills are not the game.** Keep PvP optional (a timed duel arena for bonus lives/gold) so the indirect-PvP feel that made HLW friendly stays intact.

## Sources

- Hero Line Wars v2.3 guide: http://herolinewarsguide.blogspot.com/
- Hero Line Wars 8.0b guide hub (PDF, English/German; fetch blocked, quoted via search snippet): https://hlw.levelupgilde.de/ , https://hlw.levelupgilde.de/guide/de
- Hero Line Wars HatoZILLA Style v2.511: https://www.hiveworkshop.com/threads/hero-line-wars-hatozilla-style-v2-511.40883/
- Hero Line War Lition v7.97: https://www.hiveworkshop.com/threads/hero-line-war-lition-v7-97.80037/
- Custom Hero Arena Line Wars: https://www.hiveworkshop.com/threads/custom-hero-arena-line-wars.182566/
- Hero Line Defence 1.23: https://www.hiveworkshop.com/threads/hero-line-defence-1-23.257880/
- Hero Line Wars Final (epicwar): https://www.epicwar.com/maps/89764/
- Best Hero Line Wars map (gaming-tools): https://gaming-tools.com/warcraft-3/hero-line-wars/
- Hero Line Wars (itch.io remake): https://tomhai.itch.io/hero-line-wars
- Dota 2 Hero Line Wars (Steam Workshop / fandom): https://steamcommunity.com/sharedfiles/filedetails/?id=492195751 , https://dota2customgame.fandom.com/wiki/Hero_Line_Wars
- Hero Line Wars Starlight guide (SC2): https://www.nonfictiongaming.com/2017/02/14/hero-line-wars-starlight-hero-guide/ , https://sc2arcade.com/map/2/177608/
- Squadron TD review: https://scifibloggers.com/starcraft-ii-arcade-reviews-squadron-tower-defense/amp/
- Direct Strike: https://en.namu.wiki/w/Direct%20Strike
- Line Tower Wars: Reforged: https://www.hiveworkshop.com/threads/line-tower-wars-reforged.354130/
- WC3 maps that became standalone games: https://maultactics.gg/articles/wc3-custom-maps-standalone-games
- Castle Fight income guide: https://castlefight.cfd/guides/income
- Legion TD (Wikipedia): https://en.wikipedia.org/wiki/Legion_TD
- Legion TD 2 manual: https://beta.legiontd2.com/manual/
- WC3 hero items / inventory: http://classic.battle.net/war3/basics/heroitems.shtml
