# Farhold — The Territory

**An expansion plan.** Round 10 made the world the right size and put you on a level-1 world. This
plan makes the ground between the towns worth walking.

---

## The problem it solves

Farhold is a whole planet, and crossing one is slow on purpose. But everything the game currently
asks of you is *somewhere else*: the four quest kinds are `hunt`, `visit`, `gather` and `clear`, and
three of the four pick a destination from `world.nodes` — any node, anywhere on the map. On a
163 km world that is a twenty-minute walk to a thing that takes forty seconds.

Meanwhile the zone you are standing in contains: a settlement, some roads, a handful of landmarks,
a dungeon or two, and enemies that spawn, die and are forgotten. Nothing in it remembers you, nobody
lives there between visits, and there is no reason to walk back.

**The whole expansion is one idea: a zone is a place with people in it, and everything it asks of
you is inside its own borders.** Dwarf Fortress adventure mode and Cube World both do this — the
interesting content is local, generated out of what is actually around you, and it changes because
of what you did last time. Travel then becomes something you choose, not something a quest marker
makes you do.

### Design rules this expansion holds itself to

1. **Local first.** A generated job names a place in the current zone, or in a zone that touches it.
   Anything further away is offered as a *rumour*, never as a job with a pin on it.
2. **Everything is made of what is already there.** A quest frame binds to real objects — a real
   camp, a real caravan, a real faction, a real named enemy — not to a coordinate rolled from
   nothing. If the thing dies, the quest resolves; if it moves, the pin moves.
3. **The world moves without you.** Patrols walk, caravans travel, camps grow back, a faction's grip
   on a zone tightens or slips. All of it on a cheap simulation tick, not on physics.
4. **Standing is the memory.** What you did last time is a number per faction, and it changes what
   people offer, sell, say, and whether they shoot at you.
5. **No third-party names.** Every faction, rank, place and item name here is original.

---

## The ten systems

| # | System | New file(s) | What it adds |
|---|---|---|---|
| 1 | Factions and standing | `js/factions.js`, `data/factions.json` | 12 factions, territory claims, a −100…+100 standing per faction |
| 2 | Territory control | `js/territory.js` | Who holds each zone, and how that changes |
| 3 | Patrols | `js/patrols.js` | Groups that walk real routes and react to your standing |
| 4 | Caravans | `js/caravans.js` | Traders on the roads: escort, rob, trade, or find the wreck |
| 5 | Wandering NPCs | `js/wanderers.js`, `data/wanderers.json` | 14 kinds of person you meet outside a town |
| 6 | Landmarks and holds | `data/landmarks.json` | 14 buildable points of interest that fill a zone |
| 7 | Procedural quests | `js/jobgen.js`, `data/job-frames.json` | 18 frames bound to real local objects |
| 8 | Incidents | `js/incidents.js`, `data/incidents.json` | 12 things that happen to a zone over time |
| 9 | Rumours and the board | `js/rumours.js` | Where jobs come from, and how you hear about the next zone |
| 10 | Faction rewards | `data/faction-rewards.json` | 12 ranks' worth of things standing buys |

Everything hangs off one new object, the **territory record**, one per zone:

```js
{
  zoneId: 7,
  holder: 'ashen_pact',        // the faction whose ground this is
  grip: 0.62,                  // 0..1 — how firmly. Clearing their camps drops it.
  contested: 'wardens_reach',  // who is pushing back, if anyone
  sites: [ { id, kind, faction, x, z, cleared, respawnAt } ],
  patrols: [ … ], caravans: [ … ], wanderers: [ … ],
  incidents: [ { id, kind, startedAt, endsAt, resolved } ],
  heat: 0.2,                   // how much attention you have drawn here
  visits: 4, lastVisit: 12840, // seconds of run time
}
```

It is seeded deterministically from `(worldSeed, zoneId)`, so a zone you have never entered already
has a holder, sites and a patrol schedule, and walking in does not create them — it reveals them.

---

## 1. Factions — twelve of them

Each faction is a row in `data/factions.json`. `holds` is the biome/zone-danger profile it prefers,
so factions distribute themselves over a world without being placed by hand.

| key | name | what they are | holds | at odds with |
|---|---|---|---|---|
| `wardens_reach` | The Warden's Reach | The settled order — town guards, road wardens, tax on the crossings | settled, open country | `ashen_pact`, `cutwater` |
| `ashen_pact` | The Ashen Pact | Burn-and-take raiders who hold the high ground and the burnt places | wild, lawless | `wardens_reach`, `lantern_house` |
| `lantern_house` | The Lantern House | Lamp-lighters and relic keepers; they pay well for anything old | settled, hostile ruins | `ashen_pact`, `deepworn` |
| `cutwater` | The Cutwater | River and coast people; smugglers with a code and a ferry | coastal, wetland | `wardens_reach` |
| `deepworn` | The Deepworn | Mine-folk who went down and came back changed | mountain, underground | `lantern_house` |
| `greenhand` | The Greenhand | Farmers, drovers, hedge-doctors. Neutral, feed everyone, hate raiders | settled, farmland | `ashen_pact` |
| `stonecount` | The Stone Count | Toll-keepers of the passes and bridges. Everything has a price | pass, bridge, highland | `cutwater` |
| `quiet_wake` | The Quiet Wake | Grave-tenders who put down what does not stay down | any, drawn to death | `hollowed` |
| `hollowed` | The Hollowed | What the void-touched worlds sent back. Not people any more | wild, hostile | everyone |
| `saltbound` | The Saltbound | Whalers and wreck-divers; they own the shoreline | coastal | `cutwater` |
| `emberwrights` | The Emberwrights | Forge-clan; the only people who can brand a weapon properly | mountain, settled | `deepworn` |
| `longsight` | The Longsight | Surveyors and map-makers. Pay for places, not for kills | any frontier | nobody |

### Standing

One number per faction, −100…+100, five bands:

| band | range | what changes |
|---|---|---|
| Hunted | −100…−60 | their patrols attack on sight, their caravans flee, their towns closed |
| Disliked | −59…−20 | 40% shop mark-up, no jobs, patrols challenge you |
| Known | −19…+19 | the default — trade at list price, ordinary jobs |
| Trusted | +20…+59 | 15% discount, better jobs, patrols reinforce you in a fight |
| Sworn | +60…+100 | their stronghold opens, rank rewards, a companion offer |

Standing moves for real reasons, and **helping one faction is felt by its enemy at a third of the
rate** — which is what makes a world with twelve of them a set of choices rather than a checklist:

- finish a job for them: **+6**, and −2 for whoever they are at odds with
- clear a hostile camp in their territory: **+4**
- escort a caravan of theirs home: **+8**
- rob one of their caravans: **−15** (and +5 with their rival)
- kill one of their patrol: **−10** each
- kill a named enemy that had been hunting them: **+12**
- hand back a relic instead of selling it: **+10**
- pay a toll rather than fighting: **+2**
- desecrate one of their landmarks: **−20**
- decline a job after taking it: **−3**

---

## 2. Territory control

Every zone has a `holder`, and `grip` (0…1). Grip decides how many of that faction's patrols walk
the zone, whether the settlement's shop stocks their goods, and which incidents can fire.

- Clearing one of the holder's camps: **grip −0.12**
- Leaving a camp alone for a day of game time: **grip +0.05** (it comes back)
- Killing the zone's named champion: **grip −0.3**
- Escorting a rival's caravan through: **grip −0.06**, rival's claim +0.06

When `grip` falls below 0.25 and a rival claim is above it, **the zone changes hands** — the
settlement's banner changes, the shop restocks, patrols swap, and the wanderers on the road tell
each other about it. That is the loop the whole expansion is built to reward: a zone you keep coming
back to visibly becomes yours, or somebody else's.

---

## 3. Patrols — ten compositions

A patrol is 2–6 actors that walk a **real route** — a loop through the road and landmark nodes the
zone already has — at 3.2 m/s, and stop for the night. Cheap: only the patrol the player is inside
`props.radius` of gets real bodies; the rest are a position and a timer.

| # | patrol | size | who fields it | behaviour |
|---|---|---|---|---|
| 1 | Road watch | 3 | `wardens_reach` | walks the road between two settlements, challenges strangers |
| 2 | Toll party | 4 | `stonecount` | sits on a bridge or pass, asks for coin, fights if refused |
| 3 | Raid band | 5 | `ashen_pact` | moves camp-to-camp, attacks caravans and the player on sight |
| 4 | Lamp round | 2 | `lantern_house` | walks landmark to landmark at dusk, lighting them; friendly |
| 5 | Drove | 4 + beasts | `greenhand` | moves livestock between farms; will pay you to see it through |
| 6 | Dig escort | 4 | `deepworn` | guards a mine mouth, rotates on a long loop underground |
| 7 | Wake procession | 3 | `quiet_wake` | walks to a grave site, performs a rite, walks back |
| 8 | Runner pair | 2 | `cutwater` | fast, avoids roads, drops cargo and flees if engaged |
| 9 | Hollow drift | 4 | `hollowed` | no route — drifts toward the player from the zone edge at night |
| 10 | Survey line | 2 | `longsight` | walks to an unvisited landmark, marks it, moves on |

**Reaction is standing.** Hunted → attack on sight. Disliked → block the road, demand, then fight.
Known → a line of dialogue and past you. Trusted → greet, and *join your fight* if one starts within
40 m. Sworn → they will follow you to the next node.

---

## 4. Caravans

A caravan is a vehicle from `avatar-3d/js/vehicles.js` (the game already draws seven), 2–5 guards,
and a cargo manifest. It moves settlement→settlement along the road graph the world already has, at
2.4 m/s, over real in-game hours.

Four ways to meet one, all of which are the same object:

- **Trade** — it carries stock the local shop does not have. Ten cargo types below.
- **Escort** — a job: walk with it to the next settlement. It is attacked 60% of the way.
- **Rob** — kill the guards, take the manifest. Faction standing −15, the road remembers.
- **Find the wreck** — if a caravan you never met was ambushed, its burnt vehicle and scattered
  cargo are on the road when you get there, with tracks leading to whoever did it.

### Ten cargo manifests

| cargo | carried by | what it means to you |
|---|---|---|
| Salt and cured meat | `greenhand` | rations: the travel supply the world layer already spends |
| Forge iron | `emberwrights` | crafting material in bulk — 20–60 scrap |
| Lamp oil | `lantern_house` | torches and a light-radius consumable |
| Warded relics | `lantern_house` | one magic-or-better item, and a job to hand it back |
| Bound essence | `deepworn` | the mid crafting material |
| Wool and hide | `greenhand` | armour bases, cheap |
| Coast catch | `saltbound` | food, and a chance of something swallowed |
| Toll coin | `stonecount` | pure gold, heavily guarded — the robbery everyone regrets |
| Powder and shot | `cutwater` | quiver stock and thrown consumables |
| Grave goods | `quiet_wake` | one item with a curse affix, and someone who wants it buried |

---

## 5. Fourteen kinds of person you meet outside a town

These are `wanderers`: one-encounter NPCs standing on or near a road, at a landmark, or at a
campfire at night. Each has a talk tree of 2–4 lines, one thing they want, and one thing they give.
They are the main way a job reaches you without a notice board.

| # | who | where | wants | gives |
|---|---|---|---|---|
| 1 | Pedlar | road, daylight | to sell you three things at a mark-up | a consumable you cannot buy in town |
| 2 | Courier | road, fast-walking | to be left alone, or escorted | a letter → a `deliver` job, and the next zone's rumour |
| 3 | Hedge-witch | edge of woods | a component you can gather here | a temporary blessing (a buff for a real hour) |
| 4 | Bounty poster | crossroads | nothing | the named-enemy board for this zone |
| 5 | Refugee | road, fleeing | escort to the settlement | the incident that made them run |
| 6 | Surveyor | high ground | a landmark marked on your map | pays per landmark, `longsight` standing |
| 7 | Hermit | far from any road | to be fed | the location of something buried |
| 8 | Mercenary captain | camp near a settlement | coin up front | a hired sword for one zone |
| 9 | Toll-keeper | bridge, pass | a toll | passage, and standing if you pay |
| 10 | Minstrel | camp fire, night | a story of something you did | a rumour, and a morale buff at camp |
| 11 | Poacher | woods, dusk | you to look the other way | cheap hides, and a `greenhand` grudge |
| 12 | Relic hunter | ruin, dungeon mouth | to get there first | a race: whoever clears it takes the chest |
| 13 | Tax collector | road near a settlement | a cut of your gold | `wardens_reach` standing, or a fight |
| 14 | Wounded patroller | anywhere a fight happened | healing, or an end | the rest of their patrol's fate, and standing |

Each is drawn with the existing 2D-avatar → Chibi 2 pipeline and speaks through Lingo, so nothing
new is needed to render or voice them.

---

## 6. Fourteen landmarks that fill a zone

These are placed on the existing `world.nodes` landmark and pass slots, plus new slots at road
junctions and river fords. Each is a small scene you can interact with, not scenery.

| # | landmark | what is there | what you can do |
|---|---|---|---|
| 1 | Wayshrine | a lit stone, a bowl | rest without a camp; revive a fallen companion once a day |
| 2 | Standing stones | five stones, one fallen | a puzzle: put it back, get a permanent small stat |
| 3 | Watchtower | 12 m, climbable | reveals the zone's map; a patrol beds down here |
| 4 | Gibbet | a cage on a post | a named enemy's last victim; starts a bounty |
| 5 | Burnt farm | ruins, a cellar | loot, and the family's fate as a job |
| 6 | Collapsed mine | a blocked mouth | dig it out over three visits for a dungeon entrance |
| 7 | Ferry landing | a boat, a keeper | cross a river without swimming; `cutwater` ground |
| 8 | Toll bridge | a gate, a keeper | pay, fight, or ford it somewhere worse |
| 9 | Hunting blind | a platform, bait | spawn a big beast on purpose |
| 10 | Field of cairns | thirty stone piles | `quiet_wake` ground; dig one for loot and a curse |
| 11 | Beacon | unlit wood on a hill | light it to call a patrol to you — once, loudly |
| 12 | Sunken wreck | a hull in shallow water | dive loot; `saltbound` want it back |
| 13 | Forge-fire | an outdoor anvil, always warm | a crafting bench outside a town |
| 14 | Broken road | a washed-out stretch | slows travel until you repair it — then it is faster for good |

---

## 7. Procedural quests — eighteen frames

This is the heart of it. A **frame** is a template with typed slots; the generator fills every slot
from **things that exist in the current territory record right now**, and refuses to emit the frame
if it cannot. That is the Dwarf Fortress trick: a quest is a fact about the world, phrased.

```js
// data/job-frames.json, one entry
{
  "id": "beast_moved_in",
  "scope": "local",                       // local | adjacent | rumour
  "needs": [
    { "slot": "site",  "type": "site",   "where": "cleared === false" },
    { "slot": "beast", "type": "enemy",  "where": "tier === 'champion'" },
    { "slot": "giver", "type": "npc",    "where": "zone === here" }
  ],
  "title": "{beast.name} has taken {site.name}",
  "text": "{giver.name} says nobody has been up to {site.name} since {beast.name} moved in.",
  "goal": { "kind": "kill", "target": "{beast.id}", "at": "{site}" },
  "reward": { "gold": [60, 140], "xp": [70, 160], "standing": { "{giver.faction}": 6 } },
  "onDone": [{ "grip": -0.12 }, { "rumour": "the {site.name} road is walkable again" }]
}
```

| # | frame | binds to | the ask |
|---|---|---|---|
| 1 | Beast moved in | a site + a champion | kill it where it lives |
| 2 | Overdue caravan | a caravan whose ETA has passed | find the wreck, learn who did it |
| 3 | The escort | a caravan leaving now | walk it to the next settlement |
| 4 | Patrol gone quiet | a patrol that met a raid band | find them; bring back one survivor |
| 5 | The grudge | a named enemy who beat you | it is personal, and it knows where you sleep |
| 6 | Pay the toll | a toll bridge you refused | settle it, or the pass stays closed |
| 7 | Feed the hold | a settlement in a `hunger` incident | bring 8 rations from anywhere |
| 8 | Standing stone | a landmark with an unsolved puzzle | put it right |
| 9 | Someone's boy | a wanderer + a dungeon | he went in three days ago |
| 10 | The relic | a caravan's warded relic | take it to the Lantern House, or sell it and lie |
| 11 | Push them out | 3 sites of one faction in this zone | clear all three; the zone changes hands |
| 12 | The claim | a rival faction's new camp | burn it before it takes root |
| 13 | Light the beacon | a beacon + an incoming raid | reach it before they reach the town |
| 14 | Dig it out | a collapsed mine | three visits' work, then it is a dungeon |
| 15 | The wake | a field of cairns + a `restless` incident | put down what came back up |
| 16 | Map the edge | 3 unvisited landmarks in this zone | a surveyor pays per pin |
| 17 | The apprentice | an Emberwright + your own weapon | brand it — but they need an element source first |
| 18 | The neighbour | an adjacent zone's incident | the only frame that sends you out of the zone, and it says so |

**How the generator runs.** Once per zone entry, and every ten in-game minutes while you are in it:

1. Collect the territory record's live objects into a bag of typed candidates.
2. Score every frame: does it have bindings, is it appropriate to your level and standing, has it
   been offered recently, does it repeat a frame you already have open.
3. Keep the top 3–5. Attach them to a giver — a townsfolk, a wanderer, or the notice board.
4. Anything with no binding is silently skipped. **The generator never invents a target.**

---

## 8. Twelve incidents

An incident is a timed state on a zone. They start on a clock, on your actions, or on a faction's
grip crossing a threshold, and they change what spawns, what the NPCs say, and which frames can fire.

| # | incident | starts when | lasts | what it changes |
|---|---|---|---|---|
| 1 | Raid coming | `ashen_pact` grip > 0.6 | 2 days | a raid band walks to the settlement; the beacon frame opens |
| 2 | Hunger | a caravan of rations is lost | 4 days | shop prices +50%, `feed the hold` opens, townsfolk thin out |
| 3 | Restless dead | a field of cairns is dug | 3 days | undead spawn at night everywhere in the zone |
| 4 | The grudge | a named enemy beats you | until settled | it hunts you across the zone, and gets stronger |
| 5 | Feud | two factions' grip within 0.1 | 5 days | their patrols fight each other on sight; you can pick |
| 6 | Bloom | random, wet biome | 2 days | gathering nodes triple; a rare herb appears |
| 7 | Mine collapse | random, mountain | permanent | a dungeon is sealed and a dig-it-out frame opens |
| 8 | Ash fall | volcanic neighbour, or a burn | 1 day | visibility down, fire damage up, everyone indoors |
| 9 | Fair day | `greenhand` grip > 0.7 | 1 day | a big shop, a gambler, a minstrel, cheap everything |
| 10 | Quarantine | plague, random | 3 days | the settlement is shut; you trade over a wall |
| 11 | Bounty escalation | a named enemy survives 3 fights | until dead | its bounty triples and other people go after it too |
| 12 | The road is out | a storm, or the broken-road landmark | until repaired | the direct route is closed; the long way is dangerous |

---

## 9. Rumours and the board

Two places jobs come from, and both are local:

- **The notice board** — one per settlement, holds 4–6 generated jobs, refreshes daily, and shows
  which faction posted each one. Taking one from the board costs nothing; abandoning it costs −3.
- **Rumours** — one-line facts about a zone, picked up from wanderers, minstrels, and townsfolk.
  A rumour about an adjacent zone is how you decide to walk there. Twelve kinds: a named enemy, a
  faction pushing in, an incident running, a landmark nobody has claimed, a caravan route, a
  dungeon's depth, a shop that stocks something, a bounty, a grudge, a wreck, a bloom, a fair.

Rumours are the ONLY thing that describes somewhere you are not. That is deliberate: the game tells
you what is over the hill, and lets you decide the walk is worth it, instead of pinning it.

---

## 10. What standing buys — twelve rank rewards

At Trusted (+20) and Sworn (+60) each faction opens something only it has.

| faction | Trusted | Sworn |
|---|---|---|
| `wardens_reach` | patrols reinforce you | a road warden follows you for a zone |
| `ashen_pact` | raid bands ignore you | they will burn a rival camp on your word |
| `lantern_house` | relic prices +40% | a lamp that never goes out |
| `cutwater` | free ferry, anywhere | a fast boat, and one smuggled item a day |
| `deepworn` | mine maps | a dig crew opens one collapse for you |
| `greenhand` | rations at half price | a farm you can rest at, anywhere in their ground |
| `stonecount` | tolls waived | you collect the toll instead |
| `quiet_wake` | curses lifted free | one free revive per day, anywhere |
| `hollowed` | *(cannot be liked)* | — |
| `saltbound` | wreck sites marked | a diver who fetches what you cannot reach |
| `emberwrights` | branding at half cost | a second brand on one weapon |
| `longsight` | the whole zone map on entry | the adjacent zones' maps too |

---

## Implementation order

Each phase leaves the game playable and testable on its own.

| phase | what | files | why first |
|---|---|---|---|
| **A** | Factions + standing + the territory record | `js/factions.js`, `js/territory.js`, `data/factions.json` | everything else reads it |
| **B** | Sites, and grip that moves when you clear one | `js/territory.js` | makes a zone worth re-entering |
| **C** | The job generator and its frames | `js/jobgen.js`, `data/job-frames.json` | the headline: local jobs bound to real things |
| **D** | Wanderers | `js/wanderers.js`, `data/wanderers.json` | jobs reach you without a board |
| **E** | Patrols | `js/patrols.js` | the world moves |
| **F** | Caravans | `js/caravans.js` | escort / rob / wreck |
| **G** | Incidents | `js/incidents.js`, `data/incidents.json` | the world changes |
| **H** | Landmarks | `data/landmarks.json` | fills the map in |
| **I** | Rumours, the board, the faction screen | `js/rumours.js`, hud | the interface for all of it |
| **J** | Rank rewards | `data/faction-rewards.json` | the long reason to care |

## What this does NOT do

- **No new combat systems.** Patrols, caravan guards and raid bands are existing actors with a
  faction tag and a route.
- **No off-world content.** Everything here is per-zone, on the ground.
- **No second renderer.** Distant patrols and caravans are a position and a clock; they get bodies
  only inside the prop radius.
- **No save-breaking.** The territory record is generated from `(worldSeed, zoneId)` and only its
  *deltas* (grip, cleared sites, standing, open incidents) are saved — a few hundred bytes a zone.
