# Hullforge — world systems (round 2, 2026-11-14)

Owner: *"Implement the other features except for mercenaries for now."* This file covers the world share: factions and
standing, jobs, encounters, planet outposts, drones, the harpoon and the scan pulse. All of it is registered from
`js/ui/world-ext.js` through main.js's plug-in points; the sim side is pure and tested in `tests/world.test.mjs`
(node) and `tests/world-browser.mjs` (a real browser pressing the real keys).

## Keys (one owner each, `js/core/input.js BINDINGS`)
| Action | Keyboard | Controller |
|---|---|---|
| Harpoon: fire at the crosshair / let go | G | B |
| Reel the harpoon in (hold) | T | LT (hold) |
| Scan pulse | V | Right stick press |
| Launch / recall drones | B | Left stick press |
| Jobs you have taken | K | ☰ menu |
| Standing | L | ☰ menu |
| Dock at your outpost / found one / trade with a merchant / join raiders | F (the existing "use") | X |

## Factions and standing (`sim/factions.js`)
- Meridian Traders (neutral team, run most stations), Halcyon Patrol (ally team, home and some near stations),
  Rustwake Pirates and the Hive (hostile). Standing −100…100 in `G.rep`; start 0 / 0 / −40 / −60.
- `addRep(G, f, n)`: a loss also gives each rival half of it (killing a pirate: Pirates −2, Traders +1, Patrol +1).
  The Hive's standing never rises. Kill changes: pirate −2, Hive −2, trader −12, patrol −15 (yours only — kills by
  traders or the patrol neither count as your kills nor change standing; `world.js shipDestroyed`).
- Levels (`REP_LEVELS`, the one table): Hated < −50 (their ships shoot you, no jobs, ore −15%), Disliked (3 jobs,
  pay −10%, ore −6%), Neutral (4 jobs), Liked ≥15 (pay +10%, ore +4%, pirates calm), Trusted ≥40 (5 jobs, +20%, +8%),
  Allied ≥70 (+30%, +12%). Pirates at Liked+ leave you alone unless you come within ~200 m or shoot
  (`ai.js` reads `w.sightMul`); at Trusted+ a robbed convoy pays 50% more.
- Who fights whom: `world.js hostile()` — teams player / hostile / neutral / ally; `angry` ships fight you, `truce`
  ships (raiders you joined) do not. Shots and blasts only hit ships their shooter is hostile to, so auto-turrets and
  stray fire never hurt traders or the patrol.

## Jobs (`sim/missions.js`, `ui/jobs.js`)
Each station board offers 3-5 jobs (owner's standing), changing every 10 min of play; up to 3 taken at once; a styled
confirm before dropping one. Pay = base × (1 + 0.75 × (danger − 1)) × standing lift, + 3-6 standing, sometimes a part.
| Kind | What | Base pay |
|---|---|---|
| Recovery | harpoon a rock / lost hull / disabled freighter 2-3.4 km out, tow it into the 750 m safe zone | 360 + distance/9 |
| Delivery | sealed freight (6-15 crates, takes hold room) to a station 1-2 jumps away; 35% on a clock | 300 / 520 + 12 a crate |
| Clear a site | 2-5 pirate (or Hive, danger 3+) ships at a camp 2.6-4.2 km out | 300 + 140 a ship |
| Escort | a tough freighter waits until you come alongside, flies 2.6-3.5 km; 3 raider waves spawn ahead of it | 700 |
| Survey | scan 5-8 rocks here (or 2-3 of one ore), or fly into any anomaly | 45 a rock / 90 typed / 420 |
| Acquisition | 12-30 of an ore, or a spare part of a kind at uncommon+ (rare+ at danger 4+) | 120 + 1.5× ore value / 500-1000 |
Markers: a dashed ring + label on screen, an edge arrow off screen, a big dot on the radar; the tracker card under the
bars lists each job with where to go. Delivered tows are pulled in by the station's tractor beam (3.2 s).

## Encounters (`sim/encounters.js`)
1-3 sites rolled per visit (1.8-5 km out) + a new one near you every 150-260 s of flying (max 4 live); bodies appear
within 2.6 km. Convoy under attack (help: 260 × pay + Traders +5, 40% a part; join with F: Traders −10, then your cut
320 × pay, Pirates +6), wandering merchant (F: parts +25%, buys at 40%, 1-2 drones; leaves after 8 min), space rift
(danger 2+, 3 Hive waves 2/3/3, then a cache), ion cloud (420 m, shields do not refill, rich rocks), comet (loops 500 m
at 35 m/s, drops ore every 3 s, harpoonable), derelict station (hollow, a 5 m way in, a hidden cache in the middle —
scan reveals it; fly into it), distress call (stay 6 s within 120 m: 220 × pay + Traders +4; or 30-45% a trap: pirates
appear 520 m beyond it), wanted captain (danger 2+, ×1.6 hit points, bounty 600 × pay + Patrol +4 + a rare+ part),
ambush (looks like a rock cluster; pirates come out 240 m beyond it when you are within 450 m — a scan shows them).
Caches: 2-3 parts, 250 × pay credits, 30% a drone.

## Planet outposts (`sim/outposts.js`, `ui/outpost-ui.js`)
- The orbit spot is 3.5 km from the station toward the drawn planet (`app.sky.planet`). F there: found one for
  2,500 + 1,500 × (danger − 1) cr and 40 + 10 × (danger − 1) ore of any kind (cheapest first).
- Modules, 3 levels each, cost base × level × (1 + 0.4 (danger − 1)) cr + 15 × level ore: Ore site 40/90/150 ore an
  hour (the system's ores), R&D lab 3/7/12 research points an hour (to `G.researchPoints`) and +10% factory luck a
  level, Factory 1/2/3 parts an hour, Trade post 250/600/1,100 cr an hour (× danger lift), Storage ×2/3/4 room,
  Defence guns 2/4/6 real turrets (autocannons, railguns from the 5th) on the outpost body.
- Room: 200 ore, 4 parts, 3,000 cr (× danger lift), 40 research points, × (1 + storage level). Output piles up by
  play time; "Collect all" when docked there (ore only as far as your hold has room).
- Raids every 30-55 min of play, warned 3 min ahead (banner + tracker countdown). In the system: raiders spawn 700 m
  beyond the outpost, strip 1% of the store per raider every 2 s while within 350 m; beat them for loot + 200 × pay;
  after 4 min the rest is settled. Away (or you jump out mid-raid): the store loses 50/30/15/5% by gun level. Never
  destroyed.
- The body is a small station in your two most used paints: hub, ring on four spokes, docking arm, and a piece per
  module (drill, glass dome, works block, antenna, cargo pods, guns). Marked on the star map (green square).

## Drones (`sim/drones.js`, `ui/drones-ui.js`)
Drone bay part (`blocks.js PARTS.dronebay`, 2 power, 320 cr basis, in shops and loot): each holds one drone. Drones
(`G.drones`, loaded via `G.droneBays`) are 6-block bodies (bridge, engine, nose, two fins, tool) that fly in formation
off your wings; lost ones are rebuilt free after 12 s if the bay is still on. Combat drone: a real autocannon of its
Mk and rarity (Mk I common: 52 damage per second, 171 m), chases enemies within 450 m. Mining drone: cuts rock at
40 × Mk lift × rarity lift per second within 250 m when nothing has fought for 4 s, nudges freed ore to you. Repair
drone: mends 5 × lifts hit points per second within 60 m. Prices 420 / 380 / 520 × Mk × rarity steps; sell for half.
Drones jump back to their slot if you get 700 m ahead (cruise).

## Harpoon (`sim/harpoon.js`)
From the nose toward the crosshair (aims for you at a hookable thing within 4° of it, past its own size); head flies
340 m/s for 450 m; latches onto rocks, wrecks and ships (not stations or your own). Spring 12 per metre stretched +
4 per m/s separating, impulse shared by mass (the lighter body moves more); slight cable drag. Hold T: reel in 22 m/s.
Snaps past 2.6 × its length + 60 m. G again lets go. Towing a rock or wreck into a station's safe zone sells it as
salvage (ore blocks at half price, 3 cr a hull block, 30 a part).

## Scan (`sim/scan.js`)
V: range = the best Scanner (2.5 / 3.5 / 5 / 7 km by Mk) or 1.5 km from the bridge; 6 s recharge. Marks rocks with
the ore they really hold (≥4 blocks of it; two ores = mixed) for 120 s on screen and radar, reveals caches and hidden
ambushes, counts survey jobs.

## Save fields (`state.js worldDefaults`, used by newGame and migrate)
`rep`, `missions { active, taken, done }`, `freight`, `outposts`, `drones`, `droneBays`, `dronesOut`,
`researchPoints`, `stats.missions / salvaged / scans / encounters`.
