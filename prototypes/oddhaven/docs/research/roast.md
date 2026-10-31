# Oddhaven: roast

Status: an honest attack on `brainstorm.md`, checked against `tech-recon.md` and the brief. **The brief is the contract.**
Everything the owner named stays; only how and when are up for debate. Game names here are reference only and must never
reach the player. Nothing below has been measured on a phone, including my own estimates.

## 1. Verdict in brief

The brainstorm has one very good idea (a town that keeps going while you jump into anyone), one bad wrapper for it (the
Lodger), one hidden contradiction that would have broken co-op (the clock jump), and about 30 ideas too many. The job
table is the right size for a five-year game. The god half is much thinner than the hands-on half and needs its own verbs.

## 2. The Lodger framing: NO

Gimmick. Cut it as a mechanic, a name and a fiction.

- **It gets between the player and a plain ask.** The brief says "play it like a god game or take control of a character."
  That is a camera and a button. Nobody needs a backstory for it, and new words (Lodged, Favour, the landlord's knock) cost
  phone screen space and teaching time.
- **The tone goes wrong fast.** "They will have opinions about what you did with their body", next to "the kiss" in idea
  21, is a sentence no warm comedy wants. It gets worse with the brainstorm's own teenagers and kids, and worse again in
  co-op, where a friend is granted a character. A permission screen must read as a game setting, never as possession.
- **It fights "my family".** The brainstorm's own Moment says "your son is on shift". Players of this genre are the family.
- **Lodger Opinion is the worst part.** A character who "tugs against the stick" punishes the game's central verb with
  bad controls on a phone. Killed.
- **Lodger Favour** is a second currency that does what money and dream rewards already do. Killed.

**What survives, and is the actual gold:** "bodies remember". Hand a character back and they deal with what just happened,
as things *they* did. Nobody in town knows about a spirit. "Why am I in the fountain? Anyway. Morning." is funnier than an
explanation. It is one memory event plus Lingo lines, and it comes free from the shared event log.

**New hook line:** *The town keeps living without you, and you can jump into anyone in it.*

## 3. Is "hands are the scarce resource" fun?

**Half true.** Keep the shape, drop the claim.

- It is scarce only if the things competing for your hands are all appealing. If simulation does things "decently", the
  rational answer to most prompts is "leave it". What pulls a player in is curiosity and comedy, not the economics of
  attention. Say that plainly: the question is **"what do I feel like doing right now?"**, not "where are my hands worth most?"
- **The trap is pay.** 1.5-2x pay for hands-on means the best play is to repeat the highest-paying minigame. Money then turns
  the toy into a chore, which the brainstorm itself says must not happen. Hands-on should pay a bit more, with most of the
  real difference in things money can't buy: stories, medals, finds, saves. Say 1.25x, to tune.
- **Never ration it.** No cooldowns, no cost to jump, no limit on swaps, no Burnout (idea 18 punishes the core verb; killed).
  The owner has reversed this kind of rationing before. The sim and the toys must feel generous.
- **Rank cap (sim-only stops at rank 2-3): killed.** The brief makes god mode a first-class way to play; a god player must
  be able to reach Chief. Slower, not capped.
- **Moments budget:** the brainstorm's "2-4 a day" is right for **pop-ups** and wrong for **events**. The town should have
  as many things going on as it really does. A "Happening now" list is always open with everything live; only the top item
  may interrupt, and it never pauses or blocks.
- The brainstorm's starter numbers don't work: 5 shifts × $110 = $550 against $700 weekly bills. One simulated earner goes
  backwards, so god play gets punished by default. Placeholders, but the tuning rule must be that **a family on autopilot
  never goes under**.

### The thin half: what does a god actually do?

The brainstorm gives hands-on 55 jobs and god mode "a poke". On a phone, "tap someone, suggest something" gets dull by day 2.
God mode needs three verbs of its own, all one-thumb:
1. **Direct:** tap a person, tap anyone or anything, pick from a short list. Queue of three. They may misunderstand.
2. **Stir:** drag one person onto another to set up a scene: introduce, set up a date, start a row, patch it up. This is the
   Tomodachi-style toy and the biggest single thing god mode has. Results are visible and funny within seconds.
3. **Plan:** the household board. Jobs, shifts, purchases, who owns which car, bills, where people live.

## 4. The clock contradiction (must fix before any code)

The three documents disagree, and the brainstorm's fix breaks the brief.

- Brainstorm: a day is 12-15 real minutes, a session ends in 5, a hands-on shift is 2-4 minutes and then **the world clock
  jumps**. Recon: a day is 24 real minutes.
- **A clock jump cannot exist in a shared world.** If I finish my shift and jump the clock, my friend's fire skips six hours.
  It also breaks the promise that the family keeps living alongside you.
- **The fix is arithmetic.** At **16 real minutes a day**, one game hour is 40 seconds, so a 6-hour shift is 4 real minutes.
  The hands-on shift simply *is* the shift, on one clock, with no jump. Sleep at night fast-forwards only when every player
  agrees (solo: automatic). Speed controls are solo god view only and drop to 1x when you take control.
- **Side effect to accept:** 105 s between the cities is 2.6 game hours. Cross-town jobs are a real commitment, and sim
  schedules must work back from travel time. Commute by bus, or live close. That is the brainstorm's "commuting is real".
- **The calendar is too slow.** 7 days × 16 min = 112 minutes. In 5-minute sessions that's 22 sessions to one payday, and a
  monthly Moon Fair is 7.5 hours of play in. So: pay at the end of each shift, bills and the paper **every 3 days**, a town
  event **every 3-4 days**. Seasons can stay at 7 days.
- A 5-minute session is about 7 game hours, so **the session unit is a shift or a Moment, never a day.** The Day's Mail
  can't be an end-of-day screen the player must reach. It waits in the phone inbox whenever you come back.

## 5. What's boring by day 5

- **The fire, the third time.** The same house layout, same hose, same result. Fires need variety from the place (who is
  inside, which room, your own home, a pet), and rank must change the tools.
- **The Mail.** Mad-Libs show their seams in about four days. It's only as good as the real events under it. It must skip
  dull days rather than pad them, and needs at least 8 shapes of recap.
- **Needs upkeep.** Autopilot should do all of it. Only a person in real trouble should ever reach the player's attention.
- **The money curve flattens** once the second house and a good car are bought. Dreams and ownership (shop, mill, fleet) have
  to arrive before that; "several ways to earn money" is the fix, not a side item.
- **Voice.** Hundreds of lines through a robot voice are grating by day 2. Default to short barks, with babble for strangers
  and full speech for the household only. Hundreds of written lines are still a fixed pool at 16 minutes a day, so
  no-repeat rules and tags from real events matter more than the raw count.
- **Same-looking interiors.** A generated house is a nice surprise once. Sixty of them are the same house.

## 6. Ideas: kill, merge, park

**Tone kills.** Goblin lender and "curses from the small print" (43), "goblin free market" (Expansion 8), and the goblin
shiny-things need together form a greedy-moneylender stereotype, a real risk once it's in a modern town with banks. Change
the goblin's habit, and no race holds the money jobs. Races with cops and court need care: jokes aim at the paperwork, and
race never decides who gets stopped.

**Kids park, entirely.** The brief asks for a party/family, not children. Chibi bodies, romance and possession-style jokes
are a bad mix, and kids need their own rig, clips and rules. First version: adults only. Romance stays adults only forever.
This parks ideas 24, 79, generations, and "new baby". Families can still be siblings, housemates and couples.

**Merge into the Phone.** The in-game phone becomes the one hub, which suits a phone game and portrait layout: the Day's Mail,
group chat (9), Gig app (45), Happening now, advice letters (4), camera (66), summon vehicle, party orders and permissions.
It's one screen with tabs, and it's also the natural home for the owner's "summon from the menu".

| Idea | Verdict | Why |
|---|---|---|
| 3, 4 Letters, advice | Keep (Phone) | Cheap; a god verb; great on a phone |
| 5, 22 Rumours, witnesses | Park, simple gossip first | Mutating text is a system of its own |
| 7 Feuds | Keep without inheritance | Feeds Stir; needs only a score and a cause |
| 14 Six needs | Keep | One mood face, tap to expand |
| 15 Race needs | Keep as small moods | Race flavour for little cost; not a ninth bar |
| 16 Mood weather | Keep, promote | Reads at distance, so it's what makes stand-ins worth watching |
| 17 Quirks | Keep | Lingo already has 25 traits |
| 19 Autonomy dial | Merge | One household setting, not one per person |
| 21 Mess stays | Keep | Is "bodies remember"; drop "the kiss" |
| 26 Who's Who wall | Keep | The god player's home screen for drama |
| 28, 29, 33, 34 Fair, race, bake-off, parade | Fair + road race stay; others park | Reuse minigames and physics |
| 30, 31, 32 Election, strike, meeting | Park; merge 32 into 30 | Late-game town changes |
| 35, 37 Charms, household spells | Keep; 4 spells | "Magic aspects" is a brief item and needs real verbs |
| 36 Permits | Keep with police | Gives cops a magic goal |
| 40 Tow gnomes | Keep | Cheap comedy for a brief item |
| 44, 45, 46, 47 Shop, Gig, flip, landlord | Keep | The "several ways to earn" |
| 48, 49, 50 Foraging, busking, pawn | Keep small | Good 5-minute money |
| 52-57 Crime | Keep 52 small; 53 as reputation; park 54 court, 55 jail | Cops need something to do first |
| 58 Room fires | Keep | Brief item, flagship |
| 59, 60, 63, 64 Flood, power cut, storm, collapse | Park | Each is an events-table row later |
| 61 Basement rift | Keep | How monsters reach town |
| 62, 65 Runaway truck, giant sneeze | Kill 65, park 62 | 65 is a one-liner |
| 66-70 Collecting | Medals yes; album + museum park | "What's funny" can't be auto-detected yet |
| 78-82 Co-op ideas | 78, 82 are the brief; 81 keep; 80 park | |
| 83 Ducks | Keep | One running joke, cheap |
| The Odd Sheet | Keep, every 3 days | The best trophy, and it reuses the Mail's events |

### Jobs: 55 is a trap, but the brief's list is not

The owner's lines stay: firefighter, cops with varied goals, monster hunter with real combat, and **all primary industries
with a good minigame**, including forestry and sawmilling. What must go is the idea that each row is its own game.

- **One career per industry, several stations inside it.** Forestry = fell + haul + saw (lumberjack, log hauler, planter and
  sawmill are one chain). Farming = crops + animals + harvester. Fishing, mining + quarry, oil. That's five industries, all
  covered, about 12 stations.
- **Police is one job with a radio** giving varied calls: speeder, shoplifter, lost duck, magic misuse. Detective comes later
  as a call type. That's the brief's "variety of goals" for the price of one job.
- **Kill as separate jobs:** well tech, crowd cop, tree planter (now a station), lifeguard, vet, charm repair until later.
- **A job kit of 8 verbs:** carry, aim/spray, drive-to-mark, time-the-lever, swing, tension, herd, trace. A job is a verb, a
  place and props. If a job has no verb in the kit, it waits.
- **Beware meter games.** Thousandvale's `professions-games` is a neat pure core, but it's bars on an overlay. The owner said
  **physical, like Wobbly Life**. The rule: at least the first five jobs happen in the world, with real props on Rapier. A
  meter may add to that, never replace it.
- **Nobody has wobbly bodies here.** The walker is a capsule, Chibi 2.5 has no ragdoll, and Knockabout's floppy bodies are on a
  different physics engine. Cheapest wobble: carried props on a spring at the hand, a lean, and a tumble clip. Test early.
- Any job the sim offers must have a hands-on version, because the brief says taking control means doing real actions.
  So jobs only appear in the sim once they have a kit verb.

## 7. Technical risks and the cheapest test for each

| # | Risk | What's actually wrong | Cheapest test |
|---|---|---|---|
| 1 | **Phone heat** | The recon's numbers are peak, ×3-4 by guesswork. Phones slow down after 5-10 minutes, and this game is played in long sittings | A **20-minute soak** on a real iPhone with the full scene. Log frame times to the dev server. Pass: 30 fps at minute 20, no lost WebGL context |
| 2 | **Car draw calls** | The recon swaps to full models within 20 m. A busy junction then has 5+ cars at 17 draws each, 85 of a 180 budget | Keep every non-party car baked at any distance. Add wheels as their own instanced mesh so they spin. Count draws at the worst junction |
| 3 | **70 people, but in which view?** | Bands rank by distance from the camera. God view hovers at 40-60 m, so **everyone is a stand-in exactly when you want to watch tiny funny people** | Rank by "what's the camera centred on", give the 10 full bodies to the middle of the screen. Test the look of a stand-in crowd in god view. If poor, use the shared low-poly body with shirt/skin colours now |
| 4 | **Look build stall** | Each look costs ~270 ms on a phone, and any new shirt colour is a new template. 300 unique looks can't be cached | Limit to a palette, so templates repeat. Measure hit rate in a town walk. Uniform swaps happen indoors only |
| 5 | **Sim to hands handoff** | Taking over a seated, driving, or background person; handing back someone on a roof, in a fountain or at 20 m/s | **Hop test:** a bot jumps between six people in six states 200 times. Pass: nobody under the ground or stuck, every jump under 1 s, every handed-back person finds a route home |
| 6 | **Moment jump to far away** | "Drop straight in" means building a body, a house interior and colliders at once at a spot with nothing loaded | Fade to a short wipe (0.5-1 s) and stand-in first. Time it on the phone in M2 |
| 7 | **Interiors in world space** | Third-person cameras in 4 m rooms are dreadful, doubly on a portrait phone. Rooms sit on a 4 m height grid. Giants vs doors | Use **the god cutaway camera indoors for hands-on too**: tilted, walls faded. One camera. Test: all nine races walk through every door, and no floor gap is over 2 cm |
| 8 | **"Enterable" numbers** | Recon: ~100 households, ~60 enterable buildings. The brief says buildings are enterable | The rule: **a door you can see is a door you can use.** Apartments absorb households. Test: a list of every building with a door |
| 9 | **Fire in a background building** | Sim needs room plans without geometry, or it can't burn them | `planInterior` is pure and lives in the sim. Node test: burn a building in the sim only, then walk in and see the same state |
| 10 | **Gridlock** | Rails plus one parked truck on the only bridge means the town stops, and nobody flips, so reset never fires | Add to the reset rule: blocked for 20 s = fade through. Test: park across the bridge; traffic must keep flowing |
| 11 | **Followers off-road** | A follower car on rails can't follow you across a field | Party rides as passengers first. Overflow car goes by road to where you're heading. On foot: over 40 m behind, fade in out of sight |
| 12 | **Solo to co-op** | Solo save lives in a browser Worker, rooms on a server. "Join your party" needs one world to move | Round-trip test from M2: save in the Worker, load in a Node room, carry on, bring back, compare state |
| 13 | **Ownership mid-drive** | "Leader can always take control back" during a 20 m/s car, with passengers under a different player | Two-tab test at speed. Rule: a takeback at the wheel waits for the car, or hands the car over whole. Must not pop more than 2 m |
| 14 | **Co-op bandwidth** | 8 KB × 4 a second is 115 MB an hour on someone's phone data | Don't send L1 at all; nothing past 120 m is drawn. Target 2 KB a tick. Measure in two tabs |
| 15 | **Droplet load** | 1 vCPU shared with live games | Node room with 300 people and 2 fake clients. Pass: under 2% of a core |
| 16 | **Save size** | A full table of 6 feelings between 300 people is 540 KB raw. Event log and Town Book grow for ever | Sparse feelings (~30 people each ≈ 72 KB), capped logs. Bot plays 60 days. Pass: under 1 MB compressed. Also check against cloud save |
| 17 | **Shared files** | Live games use chibi, proctown and Rapier code | All additive. `chibi25.test.js` stays green; Roverlands tests run before each publish |
| 18 | **Clip cap** | Sit, eat, sleep, type, carry, hose, hug all cost every template; 39 clips is the cap | Pick which clips leave before adding new ones. Measure build time after |

Also note: game standards say phone **portrait**. God view suits it; driving is fine with a pulled-back camera; the job
minigames must be tested in portrait from day one, or they'll get designed for landscape by accident.

## 8. The smallest slice

The brainstorm's slice (float, Moment, firefighter, recap) is a fine demo and a poor loop test. One fire proves nothing about
day 5, and it needs interiors, the hardest unbuilt piece, before anyone knows the phone can cope.

**Smallest slice that proves the loop:** two adults in one home, about 30 townsfolk, a mill and a fire station. Two jobs that
both work **both ways**, sim and hands-on (lumberjack/sawmill, firefighter). One Stir scene type. Bills, the Phone, and one
Moment. Pass: play three real days and want a fourth; a family left alone for 10 days survives and has a story to tell; the
owner can jump in and out without thinking about it.

## 9. Build order

Rule: **a playable build on the phone after every milestone**. Each one ends published to the LAN stable port, with an in-game
frame readout. Phone tests that need Radley are a one-tap link that posts numbers back; work never stops waiting for them
(use the low graphics tier until a result arrives). From M2, every milestone runs one two-tab co-op smoke test, so co-op
never becomes a late rewrite.

| M | Name | What's in it | Must prove | Pass test |
|---|---|---|---|---|
| 0 | **Keys and a road** | Vehicle page + tags (era/domain/class); standards shell (☰, !, What's new, Credits). 3 km world blockout, two towns as box shells, bake traffic; 10 bodies, 60 stand-ins, 40 cars. Drive around | The phone can hold it | Risks 1-3 pass, or tier cut logged |
| 1 | **The street lives** | Clock, needs, autonomy, schedules, L0-L2, 300 residents, traffic rails + reset + fade-through, god camera, Direct verb, premade gallery (pick a household), races as looks, Lingo bubbles, `speak()` interface | It's fun to watch | 10-day bot run: nobody stuck. Risks 3, 4, 10, 16 |
| 2 | **Jump in** | Take control of anyone, walk, drive, tap-to-walk, hand back, "what did I just do?", party follow, get in, catch-up, summon a car, room loopback | Switching feels effortless | Hop test. Risks 5, 6, 11, 12 |
| 3 | **Doors open** | Modern town plan and buildings, `planInterior`, cutaway, furniture slots, levers/buttons/plates/events (`mechanisms`), life clips, home + shop interiors | People live indoors | Risks 7, 8. Family gets through a day inside, in view |
| 4 | **First wage** | Job kit (carry, swing, time-the-lever), forestry + sawmill both ways, pay, bills, the Phone, Mail, Happening now, Stir verb, modern clothes batch 1 | Money loop works | A family left alone stays solvent. Hands-on beats sim for fun, not by money |
| 5 | **Fire** | Room fires in sim, engine + hose, carrying people, alarm wiring, Moments, the Odd Sheet. **Slice done** | The hook | Section 8 pass test, plus risk 9 |
| 6 | **People are funny** | Hundreds of lines, relations, quirks, mood weather, feuds, Who's Who, race moods, 4 spells, no-repeat audit | Day 5 isn't boring | Bot audit: no repeats inside 5 days. A stray-`{` test on every line |
| 7 | **Make yourself** | Full creator, all nine races checked, clothing batch 2, premade gallery complete | Your own person, in 2 minutes | Every race dressed in every job uniform |
| 8 | **Bring a friend** | Real server rooms, make/join a party, permissions, takeback, split into a new party, drop-in from a solo save, room sleep and catch-up | The brief's co-op list | Risks 12-15. Two phones, one town |
| 9 | **Law and rifts** | Police radio, crimes, permits; monster combat, rift rooms, party in a fight, swap mid-fight | Combat holds up on a phone | 3-button fight beaten by a bot and a person; 8-10 monsters merged |
| 10 | **Primary industries** | Farming, fishing, mining + quarry, oil, using the kit; real goods feed shops; gig jobs, own a shop, flip cars, buy another house, rent it | All brief industries and ways to earn | Every job in the sim has hands-on; every good is produced and used |
| 11 | **Two cities** | Second city full, vehicles extended (extra data, trims, garage, fleet), buses, full traffic, more interiors | The full small world | M0 soak re-run on the finished world |
| 12 | **Pick a world** | World picker: Premade plus a seeded generator using `proctown`, public publish, games.radgh.com if Radley says yes | Same format, new towns | 20 seeds pass the same bot run |

Notes on order:
- **Vehicle page is M0** because it's small, the owner asked for it by name, and it's useful to every other milestone.
- **Both towns exist as shells from M1**, so distances and commuting are real from the start.
- **Keep positions `{zone, x, z}`-friendly from M1** and ids independent of coordinates. This is the cheap insurance for the
  owner's bigger map and planet.
- **Stand-in risk (3) can reorder the plan.** If it fails, the shared low-poly body comes first, ahead of M1's crowds.
- **M9 and M10 can swap, but neither can be cut.** Everything through M12 is in the brief.

## 10. Final lists

**Keep (core):** one clock with no jumps; town that keeps living; jump into anyone, free and unlimited; Direct/Stir/Plan;
bodies remember; Moments as ignorable pop-ups over an always-open Happening now; the Phone hub; job kit; forestry, farming,
fishing, mining, oil; firefighter; police radio; rifts and 3-button combat; wiring as plain data; tow gnomes; mood weather;
quirks; Who's Who; the Odd Sheet; ducks; life dreams; four spells; permits; shop, gigs, flips, landlord.

**Park for later expansions:** seasons (real-date holidays stay), inheritance, unlikely hero, kids and generations, rumours that mutate, rap battles, court and jail,
election and strike, weddings gone wrong, potions, enchanted cars, album + museum, floods/power cuts/storms, bank heist,
broad town events, build-your-own wiring (with house building), and Expansions 4-10 in that order. Rails and the county
stay as written, and a train driver job arrives with them.

**Kill:** the Very Long Goodbye as a system (one Lingo joke), the Lodger fiction, Lodger Opinion, Lodger Favour, Burnout, sim rank caps, world clock jumps, broom lane, haunted
appliances, goblin lender and goblin free market, insurance, giant sneeze, replay clips, mail-order, recipe cards, town meeting
as its own system, overlay-only "physical" jobs.

**Open for the plan:** day length (16 min proposed), hands-on pay gap (1.25x proposed), 300 residents (recon) vs 60
(brainstorm; I back 300, because L2 is cheap and the brief wants every house alive), and the `future` era tag, which is
fine alongside the three the owner named.
