# Wandering packs and wild events (2026-10-16)

Owner: "add wandering packs … groups or parties of mobs, either the same mobs or an assortment, sometimes led by an
elite … not stick to one place but wander around … at least 5 … up to 10 … feel more like an action RPG … larger group
fights good for area effect stuff … more events … the world should be more alive, and more dangerous."

## Files

| File | What |
|---|---|
| `data/provinces/packs.json` | Shared `rules` (balance, rests, spoils), Torbor's `compositions`, the six events' knobs (`events`), their words (`eventText`) and their extra bodies (`eventMonsters`: rift tiers, warlords) |
| `data/provinces/vharlen-packs.json` | The Burning Isle's own `compositions` and `eventMonsters` (laid over the shared file key by key) |
| `data/provinces/pack-routes.json`, `vharlen-pack-routes.json` | Where packs walk — made by `tools/content-packs.mjs`, never by hand |
| `js/sim/pack-routes.js` | Pure route maker + `routeProblem` (the check the tests run) |
| `js/sim/packs.js` | The runner per wilds copy: virtual packs on routes, bodies near players, rests, wipes, spoils, re-forming, crowd scaling |
| `js/sim/pack-world.js` | The province's side: one runner per copy, the spoils chest + experience |
| `js/sim/wild-events.js` | The six wild events and their director |
| `js/rules/packs.js` | What a pack member IS in a fight: weaker numbers, the leader's fall (rout / enrage) |
| `js/rules/monster-ai.js` | `[Packs]` blocks: follow the leader, hunt a quarry, the quarry's flight, the leader's route (hold, there-and-back), the whole pack waking, the group leash, NPC foes kept |

## A pack

A composition (`packs.json` `compositions.<id>`):

```json
{ "name": "Hound Hunt", "kind": "beasts", "weight": 3,
  "members": [{ "type": "moor_hound", "count": [5, 8] }],
  "leader": { "type": "moor_hound", "rank": "champion", "affixes": ["packleader"], "chance": 0.75, "names": ["Grey-Muzzle", "…"], "epithets": ["Hungry", "…"], "title": "Leads the hunt" },
  "formation": "wedge", "doing": "hunt", "prey": "vale_deer", "preySpeed": 2.6, "pace": 0.5, "onLeaderFall": "rout", "likes": ["valley", "open", "cross"],
  "says": { "pull": ["…"], "near": ["…"] } }
```

* **Size**: 5–10 bodies with the leader (`rules.size`; a pack is filled from its first kind or cut from the end).
* **Leader**: a champion with the Pack-leader modifier (the client hangs its banner on it) plus up to one more, a name
  ("Grey-Muzzle", "Captain Marl Redhand") and a title line over the name. Starter zones (band starting at 1): members at
  least level 2, no leader below level 3. `onLeaderFall`: `rout` — 60% of the pack (at least one) run for 6 s, then come
  back leaderless; `enrage` — every member takes `PACK_FURY` (+30% damage, +15% speed, 15% faster swings).
* **Formation**: `wedge`, `column` or `loose`. **At a rest** (`doing`): `hunt` (a quarry breaks cover 18–26 m ahead and the
  pack runs it down, then feeds round the carcass), `graze` (spreads out), `camp` (a real campfire you can cook at, the
  crew sits round it), `rite` (a ring round the leader), `march` (never rests).
* **Placement**: `tools/content-packs.mjs` lists on every route the compositions whose kinds the route's zone(s) already
  hold (≥ 12 bodies of each in its camps), weighted by how much the composition `likes` the route's kind; `noLead` when the
  zone has none of the leader's kind (it walks leaderless).

## Numbers (`packs.json` `rules`)

| Knob | Value | Meaning |
|---|---|---|
| `member` | hp 0.45, dmg 0.3, reward 0.45 | against a lone monster of its kind (reward = experience, gold and its own drop chance) |
| `leader` | hp 0.6, dmg 0.55, reward 1 | against a champion of its kind (rank + modifiers on top) |
| `crowdPerPlayer` | 0.5 (cap 10) | every member's health × (1 + 0.5 (n − 1)) for n players fighting it — grows as they join |
| `perZone` | 10 | routes (packs) per zone |
| `restSec` | 22–40 | a rest; `respawnMin` 6–10 (a new pack after a wipe, ≥ 250 m from every player); `regrowMin` 4 (a dead member of a parked pack) |
| `spoils` | magic / rare (led), xp 5% / 8% of a level | the chest only its fighters may open (look `packs`, 3 min), and the experience paid at once |

Measured (`tests/C/packs-balance.test.mjs`, a bot that uses every skill, walks into melee or holds 8–22 m, never drinks
or dodges): solo level 5 vs hound hunt / brigand crew and level 15 vs Slagborn war-party / prowler pack — warrior and
ranger win every fight (warrior at L15 on 5–29% health); a warrior + ranger party wins all four on 77–100% health.
Normal-camp baseline with the same bot: three level-15 prowlers kill the warrior.

## How it runs

A pack is a distance along its route that always advances (cheap for every pack in the province). Its bodies exist only
while a player is within `MATERIAL_R` (220 m) and are put away (survivors and their health remembered) after `PARK_MS`
(30 s) with nobody within 280 m and no fight. At most `MAKE_PER_STEP` (2) packs get bodies in one tick. While it has
bodies the rules walk it: the walker (leader, else the first living member) has a `patrol` over the route, the others a
`follow` slot. Social pull: one member in a fight wakes the whole pack (`awakePacks`). Group leash: one member leashing
(120 m / 20 s) resets every member (home, full health).

Server cost (`TV_PERF=1 node --test tests/A/bots-packs.test.js`, 30 bots on the real province's roads, 60 s, this VM
under other agents' load): packs + events OFF p50 7.3 / p99 15.2 / max 19.3 ms → ON p50 9.0 / p99 16.2 / max 31.8 ms,
up to 76 pack bodies in the room beside ~760 other monsters. Materialising a pack ~1.2 ms (median), parking ~0.06 ms.

## The six wild events

Every one is an ordinary zone event run in the province's `zoneRuns` — the tracker card (`eventTrack`), the map pin
(`zoneEvent start/update/end`), the start / result lines (`eventDone`), credit by contribution and a personal reward
(`js/sim/events.js` `eventReward`). Their waves grow with the crowd (head-count × (1 + 0.5 (n − 1)), health × (1 + 0.15 (n − 1))).
Director: 1 Hz, at most 4 live per copy, never one within 300 m of another live event, never for a newcomer.

| Event | Trigger | What happens | Reward (`reward.xp` = share of a level) |
|---|---|---|---|
| **Ambush on the Road** | on a road ≥ 220 m from towns, level ≥ 3, not fighting: 3% per 10 s, 15 min per player | the zone's road crew (bandits/cultists/Slagborn) springs out on one side, then the other, the leader in the second wave | 0.2, magic+ |
| **Caravan Under Attack** | on a road ≥ 260 m from towns, level ≥ 4: 2% per 10 s, 20 min per player | a wagon 95–140 m ahead: a drover (3× health) and three guards who fight; two waves come for the crew; drover down = lost | 0.3, rare |
| **Night Raid on <village>** | night, within 170 m of a village/hamlet, level ≥ 3; 25 min per village | three raiding parties of the zone's packs from three sides, 25 s apart, the last with a leader; three militia fight beside you | 0.45, rare |
| **A Rift Tears Open** | 8% a minute (×2 at night), 12 min per copy, 90–150 m from a player away from towns | waves every 16 s; a cleared wave makes it falter for 12 s — touch it (E) to set a seal; missed: the next wave is bigger; the third seal is behind a Rift-Warden | 0.4, rare |
| **<Warlord> Marches** | every 25–40 min per copy, in a zone of band ≥ 4 where someone is | a named rare with a 10–12 escort of the zone's packs on a long route; the pin follows it; gone after 18 min | 0.7, epic |
| **Wanted: <leader>** | every 20–30 min per copy, band ≥ 3 | a wandering pack's leader carries a bounty and a "Wanted" line; its last-seen circle (±60 m) moves every 15 s; 30 min to kill it | 0.35, 40 gold base, rare |

Not built: a storm event — the server has no weather (the clear / cloudy sky is a client picture from the realm day).

## Re-bakes

After any zone re-bake run `node tools/content-packs.mjs` and `node tools/content-packs.mjs --province=vharlen` LAST
(after content-professions -> content-towns -> content-givers -> content-hunts -> fill-quest-marks, and content-hazards on
Vharlen). `--check` exits 1 when a file would change; `tests/E/packs-data.test.js` runs it.

## Tests

`tests/A/packs.test.js` (bodies near players, walking, parking, fire, hunt, spoils, re-forming, leader's fall, the
encounter rate), `tests/A/wild-events.test.js` (each event start → card → pin → win → pay), `tests/E/packs-data.test.js`
(data, every route on the real bake, the tool's `--check`), `tests/C/packs-balance.test.mjs` (the numbers),
`tests/A/bots-packs.test.js` (perf, TV_PERF=1), `tests/D/packs.spec.js` (shots `tests/D/shots/packs-*.png`).
