# Rogueloot — Act 1 bestiary (design)

Designed by Fable, 2026-11-10, for PLAN §0 rulings 4, 6, 14, 16, 19, 24, 38, 41, 42, 45, 46, 48. The data is
`data/monsters.json`; this page is the *why*. Plain language throughout.

Numbers at a glance: **12 families, 58 monster types** (19 brutes, 13 skirmishers, 7 archers, 9 casters, 4 shamans,
3 leaders, 3 swarms), **18 champion modifiers, 11 rare named monsters, 8 bosses** (one per dungeon; the eighth is
the act boss), **18 spawn tables** (10 zones + 8 dungeons).

## The story in one paragraph

The Hollowhorn warband came down from the hills to raid the bright Brightwater coast — but they are not here for the
fishing villages. Their warlord, Ruhk of the Black Stag, hired diggers and sent them under the Gravewatch hills to
open an old kingdom's sealed catacomb, because there is a king down there who was never buried and never quite
died. The diggers found him first, and became something else: the Gravesworn. By the time you reach the deep
catacomb, the warband is a sideshow and the real enemy is a dead king's household waking up one hall at a time.
Every family in the bestiary is one chapter of that: the coast, the farms, the wood, the road, the old elves, the fen,
the pass, the camp, the ruins, the hills, the throne.

## The families and their fantasy

| Family | Fantasy | Damage | Where | What it teaches |
|---|---|---|---|---|
| **Tidewrack** | crabs, leaping shoal-fish, gull-things, brine-hags | physical, frost | shore, tide caves, sunken ruins | brute vs skirmisher; "hit it from behind"; the first interrupt |
| **Fieldpest** | grain rats by the dozen, moles under your feet, wasps, mill weevils, walking mould | physical, poison | fields, mill cellars | swarms + flocking; area attacks; a brute that surfaces under you; the first lasting ground hazard |
| **Hollowhorn Warband** | squat horned hill-folk under one warlord; the full people roster | physical, fire | shore → camp → mine (7 areas) | every role, introduced one at a time |
| **Wild Beasts** | wolves that circle, boars and rams that charge, a lynx that opens from out of sight | physical | thornwood, road, pass | charge lines; flankers that pick the squishy player; sequenced charges |
| **Thornkin** | bramble walkers, thistle sprites, reaching roots, a tree too old to be a tree | physical, poison | thornwood, hollow, glade, roots | poison over time; roots; pulls; "a bush until you are next to it" |
| **Creepers** | spiders of the hollow, borers of the deep | physical, poison | thornwood, hollow, roots, mine | slows; spawners you break first; the cocoon rescue |
| **Elderkin** | what the elves left: wooden wardens, oath-bound ghost archers, moon-cantors | storm, frost, physical | glade, roots | resists matter; wide line telegraphs; the interrupt exam; a caster boss |
| **Mirefolk** | frog-folk, leeches in their thousands, log-lurkers, mudwitches | poison, physical | fen, crypt | stacking + persisting poison; healer first; a swarm that flows like water; a charm that walks you into hazards |
| **The Restless** | the old kingdom's dead: husks, bone archers, candle-skulls, shroud-mothers, reeves and knights | shadow, physical, frost | tide caves (preview), barrow, crypt, ruins, hills, catacomb | shadow damage; the dead get back up; raise-the-dead casts; the leader that calls the dead |
| **The Gravesworn** | diggers turned cult; hooded, candle-crowned, they open doors | shadow, fire | barrow (camp) → catacomb | interrupts as the whole fantasy; the interrupt ORDER puzzle (keeper then chanter) |
| **Stonebound** | a scarecrow-mill golem, rune-watchers, tide wardens, cairn sentinels | physical, storm | mill, ruins, mine, catacomb | huge telegraphs; armour that rewards magic; push/pull positioning; cross telegraphs |
| **Wyrmkin** | scree drakes that land to breathe, cliff kites that never land | fire, storm | pass, camp | flyers; the landed window; "ranged players have a job" |

Three palettes carry the whole act so a player can read a pack at a glance: **warm wood-and-red** = warband,
**bone-and-blue** = Restless, **dark-and-gold-candle** = Gravesworn. Everything natural is bright (moss green,
berry red, shell orange, fen yellow) so the undead read as the odd thing out when they appear.

## How each role reads on screen

Ruling 45 gives us six roles; I added a seventh (swarm) because "ten tiny bodies that flock" is a different brain
from a skirmisher. Each role has a **body shape rule**, a **movement rule** and a **threat rule** so a player can tell
what a thing is going to do before it does it:

- **Brute** — the widest silhouette in the pack, slow (3.2 m/s vs the player's 4.0), walks straight at the top
  threat, taunt-able, never retargets to a healer on its own. Every brute has one ground telegraph. Variants: the
  one you tank (raider, knight), the one you kite (breaker, bramblewight), the one you hit from behind (crab,
  knight's shield), the one you lure onto land (lurker).
- **Skirmisher** — lean and fast (4.6–5.8), always picks the LOWEST-ARMOUR player in reach, hits twice and circles
  to a flank, escapes at low hp. The pack of wolves holds a ring and sends one in at a time. The cutthroat hides
  behind the brutes until they engage. Skirmishers are the reason to protect your caster.
- **Archer** — thin, stands on something (every zone has `perch` markers), holds 9–12 m, steps sideways to regain
  line of sight, backs off ONCE from melee then fights badly in melee. Counterplay is cover: rocks, trees, coffins,
  pillars are all line-of-sight blockers in the walk grid. One archer (the cliff kite) flies and must land to rest.
- **Caster** — stands still with a cast bar and a drawn telegraph; every big cast is interruptible and the lock-out
  is long (3–8 s). Casters are fragile (0.55–0.7 hp). The visual rule: a caster's hands/head light up for the whole
  cast so you can see from across the screen who is casting.
- **Shaman** — stays BEHIND the pack, never attacks while a packmate is under half, heals and buffs on cooldown, and
  the pack bodyguards it (`defendShaman`: the nearest brute shoves whoever walks at it). The shaman is always the
  loudest-looking thing in the pack (antlers, a reed crown, a shroud with no face) so "kill that first" is obvious.
- **Leader** — tallest in the pack with a pole or a plume you can see over the others, rallies (interruptible ring),
  and at 25% hp **runs to the nearest other pack within 40 m and brings it** (ruling 45). The tell is a smoke flare
  (warcaller), a candle trail (candlebearer) or a dark ripple (reeve). A stun, root or burst at the flare wins the
  fight outright; chasing a candlebearer down its fire trail hurts. When the leader dies the pack goes Leaderless
  (−15% damage, skirmishers flee sooner), so killing it early pays twice.
- **Swarm** — 8–14 bodies at 0.25–0.3 hp each, flocking with separation + cohesion (ruling 16: no stacking). They
  pour out of a prop (grain sacks, egg sacs, a leech pool). Standing still gets you ringed in ~4 s; walking breaks
  the ring. The leechswarm is the one swarm physical attacks are weak against (fire does double).

Pack rules the programmer needs (all in `ai` notes): `attackSlots` (wolves: only 2 bite at once), `spread`
(elderkin archers stay 6 m apart so one area attack cannot catch both), `bodyguard`/`defendShaman`, `sight-hound`
(a hound runs 5 m ahead and the pack follows ITS target), and `Leaderless`.

## How the act escalates (what each zone adds)

| Lvl | Area | New thing the player learns |
|---|---|---|
| 1–3 | Saltgrass Shore | brutes vs skirmishers; crabs are slow and face-forward (walk behind); snappers leap and flank; gullhawks fly (ranged players have a job); the first warband scouts at the far gate |
| 3–4 | Tidecaves (d1) | the first interruptible cast (Brinewife's Drowning Song draws a circle for the whole channel); the shellback's Hunker shows armour does not stop magic; drowned husks preview the Restless; **Clatterjaw** |
| 3–5 | Windmill Fields | swarms (rats), the first archer (slinger: break line of sight), a brute from underneath (churnmole: Upheaval circle travels under you), wasps that melee CAN hit |
| 5 | Mill Cellars (d2) | the first lasting ground hazard (Bloom) and the first armour shred (Bore); swarms in tight rooms; **Gristmaul** teaches the donut ring and "fight away from the cloud" |
| 5–7 | Thornwood | flanking in earnest (wolves hold a ring and bite one at a time; cutthroats go behind you and hamstring); charge lines you can end in a tree (rootboar stuns itself); bramblewights are bushes until you are beside them |
| 7 | Thornwood Hollow (d3) | slows (webs as geometry), spawners you break first (egg sacs), trapdoors in the floor, a flying caster that drops to cast; **Mother Thrum** teaches the cocoon rescue |
| 7–9 | King's Road | the whole warband: the first shaman (bonechanter heals and hastens — interrupt or kill first), the first leader (warcaller flees at 25% to the next patrol 35–50 m up the road), warhounds that pull stragglers. The road is a chain of toll camps so flee-calls usually land |
| 9–11 | Elderglade | storm and frost damage (resists matter now); a donut ring from a brute (warden); an enemy taunt; wide line telegraphs (Moonbeam); the Unfinished Chorus is the interrupt exam (6 s channel, nothing if stopped); formation fighting — nothing here flanks |
| 9–10 | Old Barrow (d4) | the Restless: husks stand back up once (burn them), Gravecandle auras (kill the light), the Shroudmother raises everything in 10 m (interrupt), bone hounds fear you briefly; floor 1 shows the Gravesworn as a digger camp before they are a cult; **Reeve Oswin** |
| 12 | Elder Roots (d5) | pulls (Drag) and column-piercing charges (Bore Through) — stop standing in a line; **Ildreth** is a caster boss with a moving arena |
| 11–13 | Mirefen | poison that stacks and persists (Poison Well), a healer-shaman with a lurker between you and her, a swarm physical attacks are weak against, a charm that walks you into the pools, "logs" that are not logs, a tail cone BEHIND the brute that punishes the behind-it habit |
| 14 | Mire Crypt (d6) | the Gravesworn proper: Open the Door at every door prop (8 s, interrupt any time), the interrupt ORDER (keeper's ward first, then chanter), husks that burst on death; **Sister Vennel** |
| 13–15 | Highcairn Pass | flyers for real (drakes land to breathe — the landed window; a kite that never lands and must rest), surprise openers (lynx from a ledge), sequenced charges (rams 0.7 s apart), a brute you kite instead of tank (the breaker turns slowly and shrugs off knockback) |
| 15–17 | Redcliff Heights | every warband role at once in packs of 5–6, patrols that answer flee-calls, area denial (sapper firepots; blast charges you can kick), chained drakes |
| 16–17 | Warband Mine (d7) | warband and Gravesworn side by side, charges at chokepoints, a dug-up sentinel with a storm weakness; **Warlord Ruhk** |
| 17–18 | Sunken Ruins | shades that walk through walls to come out behind you (stand in open floor), push/pull wardens (whirlpool), the first CROSS telegraph (rune watcher), the Gravesworn's leader |
| 18–20 | Gravewatch Hills | the Restless with everything: knights with a front-only shield wall (the crab lesson at level 20), reeves that sink into the ground to fetch the next cairn's pack, Gravesworn processions among them |
| 19–20 | Deep Catacomb (d8) | the boneweaver makes NEW adds (corpse-burning does not help), bone cages friends must break, crossfire corridors; **Harrowmund** |

The rule I used for pacing: **one new verb per zone, two per dungeon, never three.** A player who has read nothing
should still be able to say "oh, that's the thing from the last place, but worse" every time.

## Champions and rares

Champion packs roll 1 modifier at levels 1–7, 2 at 8–14 and 3 at 15–20 (D2's curve). Each of the 18 modifiers has
a **tell you can see before the pull** (spines, speed lines, a bubble with a number, chains on the floor, a crackle
of lightning), a **one-line rule** and **counterplay** written down. Some are pack-wide (Thorned, Hasted, Stonehide,
Venomous, Leeching, Volatile, Hale), the rest only on the champion. Pairs that would be unfair together are excluded
(Warded with Thorned or Stonehide; Rimed with Volatile). Most modifiers have a **normal monster that teaches them
first**: the bramblewight is Thorned, the sludge husk is Volatile, the glade warden's Oath Bind is a taunt, the
gravecandle is Summoning-lite. A champion is a thing you already met, turned up.

Rares are one spawn point each, 35% up per session (ruling 25), with 1–2 fixed modifiers plus one random, their base
type's kit and **one signature** that only they have (Old Pincer's Claw Lock, Grandmother Root's thorn-wall ring,
Velka's three-part channel, Captain Vosk's six-pot barrage, The Kept Bride's Vow). Each has a `uniqueHint` for the
item designer: a shield, boots, a chest, a helm, a ring, a wand, a belt, gloves, an amulet, a ring, a two-hander.

## Every boss, walked through

Bosses follow ruling 46: 2–3 phases, 2–4 readable mechanics, a ground telegraph, adds, one interruptible big cast,
and an enrage (a soft timer: past it the boss does double damage, so a party that cannot kill it wipes rather than
grinds). Boss hp scales ×1.0 / 1.7 / 2.3 / 2.9 by player count; damage follows the baseline's player scaling.
Each has fixed loot on top of personal drops and a unique with a mechanic that answers the fight.

**d1 Clatterjaw, the Pool Tyrant (lv 4)** — a rowboat-sized crab in a tide pool. Phase 1 is two telegraphs and
nothing else: a 90° Claw Slam cone (the tank points it away) and a sideways Scuttle line that ends in a 2 s daze
(free damage). Phase 2 at 60%: Call the Tide brings 4 crabs and the boss takes 30% less damage while 3+ live —
and the cast is **interruptible**, which is the point: the first boss teaches that a boss cast can be stopped. Phase 3
at 25%: the shell cracks, armour drops to 0.6, attack speed +50%. Burn it. Loot hint: a front-blocking shield.

**d2 Gristmaul, the Mill That Walks (lv 6)** — the mill's stones stood up. Millstone Spin is a donut (safe hugging
it or 6 m out); Crush is a circle. Phase 2: Flour Cloud (interruptible) makes 40% of attacks miss inside it and
hides telegraphs beyond 3 m, while Rats in the Walls pours 8 rats from a chute — so you must leave the cloud to
clear the rats, and the rats come in a line you can area. Phase 3: the Runaway Wheel rolls a line, bounces off the
wall, and comes back. Loot hint: a belt with knockdown resistance.

**d3 Mother Thrum, the Brood Below (lv 8)** — the brood mother; her legs are taller than you. Web Lines are three
root-on-cross strips that stay as geometry. **Cocoon** wraps the player furthest from her and a FRIEND must break
the prop (solo: it breaks itself after 4 s at a cost) — the game's rescue mechanic. Phase 2 at 55%: she climbs to the
ceiling for 12 s and every unbroken egg sac hatches 6 spiderlings — the fight rewards breaking sacs in phase 1 while
she is slow. Phase 3: Thrum, an expanding knockdown ring that a web line absorbs: the one time standing on a web is
good. Loot hint: silk chest, slow immunity.

**d4 Reeve Oswin, the Unburied Clerk (lv 10)** — a clerk, not a knight; the barrow's hall of records with twelve
coffins. Grave Pit is a circle that roots and halves healing. Read the Names (interruptible) raises husks from the
coffins nearest you, and corpses rise AGAIN next time unless burned at a brazier (an interact) — drag the fight to
the fire. Phase 2: Chain of Office shackles a player to a coffin a friend must break. Phase 3: **Death Knell**, a
5 s cast that wipes the group if two go off — interrupt it, or hide behind a coffin (line of sight blocks it; the
coffins are there for that). Loot hint: his ledger as an off-hand.

**d5 Ildreth, the Wilted Verse (lv 12)** — a caster boss who floats over a moon-well out of melee reach. Phase 1:
Moon Lance, a rotating **Moonbeam Cross** (stand in a quadrant), sprites whose Pollen Cloud makes spells cost more;
melee reach her only by breaking a root pillar, which falls as a 15 s bridge. Phase 2 at 60%: she comes to the floor
and Root Walls split the party (fire burns a gap). Phase 3 at 25%: ONE mechanic, The Last Verse — a 10 s channel
(6 s solo) that must be interrupted; she is interrupt-immune 3 s after each stop, so a group needs two interrupters
or one with a short cooldown. Loot hint: a crescent circlet that shortens interrupt cooldowns.

**d6 Sister Vennel, Keeper of the Drowned Bell (lv 14)** — the Gravesworn's first boss, in a half-flooded bell
hall with four sconces you can light. Candle Ring pens you in or out. Husks wade out of the water and burst on death
(kill them at the water's edge). Phase 2: **Toll the Bell** — she WALKS to the bell (3 s of warning), rings it,
everyone is stunned 3 s and every corpse rises; interrupt it, or stand at a lit sconce to halve the stun. Phase 3:
Lights Out — the hall goes dark, you bleed outside the light, and her own candle rings become good places to
stand. Loot hint: her key as a wand.

**d7 Warlord Ruhk of the Black Stag (lv 17)** — the warband's end, in the mine's deep gallery with cart rails on the
floor. Phase 1: Stag Cleave (120° cone), two bannerbearers whose Rally you interrupt and whose dropped banners YOU
can pick up for +15% damage, and **War Drum** — he turns his back to beat it, so the interrupt must come from behind
him (a tell and a punishment in one). Phase 2: sappers plant 3 s-fuse charges you can kick toward the raider pack
that comes from each tunnel every 30 s. Phase 3 at 25%: he mounts the Black Stag — charges on 20 m lines that daze
them both if they end in a wall, carts on the rails, +30% damage, interrupt-immune: a real enrage phase with a
visible reason. Loot hint: his antlered crown, the Stag's hide.

**d8 Harrowmund, the Sealed Lord (lv 20, act boss)** — three phases and an arena change (ruling 46).
*Phase 1, The Seal Holds:* he sits bound on the throne, reaching 6 m and casting bone lances at whoever is furthest
away (it punishes max-range camping). Four Gravesworn chanters channel at the four seal points (60 s each,
interrupt-immune for 10 s, then an interrupt sets one back 15 s); an Ossuary Knight steps from a niche every 25 s.
The phase ends when the chanters finish or die — not on his hp. *Phase 2, Unsealed (70%):* chains snap; Crown of
Candles (interruptible: 3× shadow and a fear unless you are at a sconce), Grave Wave (an expanding ring — hug him or
take cover), The Levy (4 husks + a shroudmother, kill her first). *Phase 3, The Vault Below (40%):* **the floor
breaks and everyone falls** into a bigger hall with a bone-river down the middle that widens every 30 s (the fight
shrinks), pillars that fall on lines and then STAY as cover, and The King's Due — a 6 s cast that is interruptible
for the first two minutes of the phase and then is not (the enrage). Twelve candles on his crown light up as the fight
goes on, 4 / 8 / 12 by phase, so anyone can read where the fight is. First kill per difficulty unlocks Veteran.

## Design principles I followed

1. **A tell before every hit that matters.** Every ability with more than basic damage has a drawn shape and a
   wind-up animation that is the shape (a claw held up, a throat glowing, a back turned). Phone players see a shape
   on the ground; nothing relies on reading text.
2. **Each role has a body rule.** Brutes are wide, skirmishers lean, archers stand on things, casters light up,
   shamans wear the loudest hat, leaders carry a pole, swarms are many. You can call the pack from across the screen.
3. **Teach with a normal, test with a champion, examine with a boss.** Thorns on a bush at level 6 → the Thorned
   modifier at 8 → a boss who punishes melee at 12. Interrupts: a brinewife at 3 → a cantor's 6 s song at 10 → a
   chanter's 8 s door at 14 → the Last Verse at 12 and the King's Due at 20.
4. **Counterplay is written down for every ability.** `counter` on every ability, mechanic and modifier. If I could
   not write one, the ability was cut.
5. **Co-op mechanics have a solo fallback.** Cocoon, chains, cages and death rolls are all "a friend frees you"; solo,
   each breaks on its own at a cost. Nobody needs a trinity (ruling 42) — a solo Mage beats every boss.
6. **The behind-it habit is taught, then punished, then rewarded.** Crab (walk behind) → lurker's tail (do NOT) →
   rune watcher's blind eye and the knight's shield wall (do again, with a friend holding its front).
7. **Everything rises from something.** Rats from sacks, spiderlings from sacs, leeches from pools, husks from slabs,
   knights from niches, charges from sappers: spawns are props in the zone, so the editor can place them and the
   reachability checks can see them.
8. **The undead are the odd thing out.** The coast is bright; bone-and-blue only appears where the digging has
   reached. The Restless' palette never shows up in a natural family.
9. **Original names, checked by machine.** The assembler fails on any word from `docs/banned-names.md` (it caught
   seven of mine, all renamed before the file was written).

## What a programmer must know

- **Multipliers, not numbers.** `baseline` gives hp/damage/armour/xp as formulas of level; every monster is a
  multiplier (brute 1.6 hp, caster 0.65…). Change one formula and the whole act re-tunes. Bosses are ×14–28 hp.
- **Level bands overlap, not contain.** A spawn table's `levelBand` must overlap a monster's `levelRange`; the sim
  spawns at the zone level clamped into the monster's range. Packs with `minLevel` roll only on markers at or past it.
- **Marker tags** the zone editor needs: `pack`, `patrol`, `swarm`, `perch` (archers/casters/lynx), `burrow`
  (moles/borers/spiders), `log` (lurkers), `bush` (bramblewights), `door` (Gravesworn chanters need a door prop
  within 8 m), `chokepoint` (sentinels), `crossfire` (archer pairs), `egg_sac` / `grain_sacks` / `leech_pool`
  (spawner props), `dais`, `clearing`, `drake_post`, `overhang`.
- **Telegraph shapes:** `circle`, `cone` (with `angle`, default 90; `behind: true` for the tail), `line`
  (`size` length, `width`), `ring` (`size` outer, `innerSize` inner; `pulse: true` expands from the caster),
  `cross` (two lines, optional `rotates`), `none`. `warn` is the seconds it shows before landing. `fuse: true` is a
  bomb with an interact-to-kick. `count` repeats the shape N times.
- **Flee-call** (`flee_call` kind) needs the pack system to know where the nearest other pack is within 40 m and
  a `Leaderless` pack buff. **`defendShaman`/`bodyguard`** needs a pack-level "someone is walking at our healer"
  hook. **`attackSlots`** is a token counter per pack.
- **Props that are mechanics:** cocoons, coffins, bone cages, egg sacs, trapdoor lids, candle sconces, braziers,
  the chanters' doors, dropped banners, kickable charges, fallen pillars (which become line-of-sight cover).
- **Flyers** have an `altitude`; melee reach only when landed (drakes land 3 s to attack; the kite rests 4 s every
  20 s; the gullhawk lands 1.5 s after a dive; wasps and gravecandles float low enough to hit).
- **Corpses persist 20 s** so raise-the-dead casts are real; `fire` damage removes a corpse; braziers/sconces
  burn corpses in radius.
- `look` blocks are build specs: `bodyPlan`, proportions as fractions of `size`, a parts list, a 3–4 hex palette
  (body / secondary / accent / eyes), a silhouette note for phone scale, and idle/attack/death notes; `tiers` on
  the raider and husk say how the same model dresses up across level bands. Boss looks add phase changes.

## What makes this good

- You can **read a fight before it starts**: role by body, pack by palette, danger by hat.
- The act has a **curriculum**: one verb a zone, and every boss is an exam on the verbs you just learned, not a new
  trick. By Harrowmund, a player has already met every mechanic in his fight in a smaller form.
- Enemies **behave like a team** (bodyguard the healer, hold a ring, run for help, come through the wall behind you),
  which is what makes the role system (ruling 45) feel like intelligence rather than stats.
- **Co-op has moments** — breaking a friend out of a cocoon, kicking a bomb into a pack, picking up a banner, lighting
  a sconce while someone tanks the dark — and all of them degrade gracefully solo.
- It is **cheap to build**: 58 types over 7 body plans with shared rigs, 3 family palettes, every spawn a prop, and a
  single baseline so balance is a formula edit. Nothing here needs a feature the plan does not already list.
