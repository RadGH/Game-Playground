# WILDMARCH — Design Bible, page 20: Travel

**Status:** v0.1 draft — 2026-09-30 (new in round 2)

This page owns how a character gets from one place to another: on foot, mounted, swimming and flying;
**Travel Methods** (the routed wagons, striders, boats, rail carts and flyers that replace flight paths —
canon §12.1 W15); **teleports** (the four class travel spells of canon §6, scrolls and portal stones);
the **Recall Stone** (W24); and **waystones**.

Neighbouring owners, linked by section name:

| Fact | Owner |
|---|---|
| Roads, rivers, towns, stations' surroundings, which landmarks are safe | [page 01](01-WORLD-LORE.md), "The travel network", "The regions" |
| Unlock levels (Recall Stone 7, Travel Methods and waystones 12, mounts 10/20/40/60) | [page 07](07-PROGRESSION.md), "The feature-unlock ladder" |
| Mount species, mount items, mount affixes, scrolls as items and their shop prices | [page 08](08-ITEMS.md), "Mounts", "Consumables" |
| Movement speeds on foot, stamina, fall damage | [page 05](05-COMBAT.md), "Movement in a fight" |
| The four travel spells as class spells (look, sound, talents) | `classes/mage.md`, `classes/chronomancer.md`, `classes/oracle.md`, `classes/druid.md` |
| The Dungeon Finder's discovery rule | [page 12](12-DUNGEONS.md) and canon §8 |
| Keys, screens, settings | [page 02](02-CONTROLS.md), [page 03](03-UI-SCREENS.md), [page 04](04-SETTINGS.md) |
| Quest ids (unlock quests, the flying chain) | [page 14](14-QUESTS-EVENTS.md) |

---

## Contents

1. [The travel ladder at a glance](#1-the-travel-ladder-at-a-glance)
2. [What Farhold already has](#2-what-farhold-already-has)
3. [On foot and swimming](#3-on-foot-and-swimming)
4. [Mounts](#4-mounts)
5. [Travel Methods — the rules](#5-travel-methods--the-rules)
6. [The seven kinds of Travel Method](#6-the-seven-kinds-of-travel-method)
7. [Departures: bus-style and scheduled](#7-departures-bus-style-and-scheduled)
8. [Staying on the route (auto-correct)](#8-staying-on-the-route-auto-correct)
9. [Every route](#9-every-route)
10. [Every station, by region](#10-every-station-by-region)
11. [The route map](#11-the-route-map)
12. [Fares](#12-fares)
13. [Parties, followers, pets and disconnects](#13-parties-followers-pets-and-disconnects)
14. [Waystones — decided](#14-waystones--decided)
15. [The Recall Stone](#15-the-recall-stone)
16. [Teleports: class travel spells](#16-teleports-class-travel-spells)
17. [Teleports: scrolls and stones](#17-teleports-scrolls-and-stones)
18. [Discovery](#18-discovery)
19. [UI hooks, keys and settings](#19-ui-hooks-keys-and-settings)
20. [Data shapes](#20-data-shapes)
21. [Reuse map](#21-reuse-map)
22. [Changes this page asks of other pages](#22-changes-this-page-asks-of-other-pages)
23. [Open questions](#23-open-questions)

---

## 1. The travel ladder at a glance

| Level | What you get | Speed | Owner |
|---:|---|---|---|
| 1 | jog, walk, jump, swim | jog 5.4 m/s, swim 2.7 m/s | page 05 |
| 2 | sprint | 8.1 m/s, costs stamina | page 05, 07 |
| 1 | waystones light up as you enter towns (nothing to use them for yet) | — | §14 |
| 7 | **Recall Stone** — bind at a town waystone, return there | 10 s channel, 30 min cooldown | §15 |
| 10 | **Riding I** — first mount | 8.6 m/s (10.8 on roads) | page 07 |
| 12 | **Travel Methods** and **waystones as teleport targets** (Scrolls of Passage, portal stones); class travel spells | 18–32 m/s on routes | §5, §14, §16 |
| 20 | **Riding II** | 10.8 m/s (13.5 on roads) | page 07 |
| 40 | **Riding III** — every mount swims and leaps | swim +80% | page 07 |
| 60 | **Riding IV** — flying, through the Kingsfire story chain | 13.5 m/s in the air | page 07, §4.4 |

Travel Methods stay the fastest way across a long distance at every level: the slowest (a Longshank at
18 m/s) is 3.3× a jog and 1.3× a Riding II mount on a road; the fastest (the Deepway rail at 32 m/s) is 2.4×
a flying mount.

---

## 2. What Farhold already has

| Farhold piece | What it does | Path | Wildmarch use |
|---|---|---|---|
| Waypoint pads | one pad design everywhere, lit by **entering the town boundary**, travel between lit pads, a player-built pad | `prototypes/farhold/js/waypoints.js` | **reuse** as waystones (lighting, the pad model); **changed**: no pad-to-pad menu (§14) |
| Town portal | one portal at a time, back to where you left from | `js/portal.js` | **reuse** its one-exit bookkeeping for the Mage Portal gate (§16.1) |
| Roads | graded polylines with a `surface` height per point, ribbon drawn from them; switchbacks, bridges, road classes | `js/roadplan.js` (lanes `{points, surface, half}`), `js/road-fold.js`, `js/bridge-plan.js`, `worldgen/js/roads.js` (incl. sea lanes) | **reuse**: every land route **is** a lane (§8) |
| Pathfinding over ground | A* on an 8 m grid, water impassable, slope-costed | `js/haulpath.js` | **reuse** for Longshank routes (shallow water allowed) and route building tools |
| Rivers | water polylines with a surface height | `js/water-plan.js`, `js/planet.js` `riverTopAt` | **reuse** for barge routes |
| Travel vehicles | hand cart, pack mule, covered wagon, ox cart, war wagon, fast coach, drake sled — creature bodies in the shafts, `roll` animation, `metrics()` with hitch and **seat** points | `avatar-3d/js/vehicles.js` | **reuse** for wagon lines, the war wagon, the coach, the sled |
| Boats | raft, skiff, cutter, launch hulls; bob and heel; deck height | `js/boat.js`, `js/gear.js` boats | hull style **reused** for the barge and ships; personal boats **dropped** (§3.3) |
| Mounts | mount slot, speed as a multiplier on the walk, gallop stamina, road pace ×1.25 | `js/gear.js`, `data/balance.json` | **reuse** (page 07/08 own the numbers) |
| World beacon | a column of light over where you are told to go | `js/waylight.js` | **reuse** over the booked station and over your Recall bind |

Farhold has no scheduled vehicles, no passengers and no multi-player boarding. Those are new.

---

## 3. On foot and swimming

### 3.1 Speeds (page 05 owns them; repeated here for the comparison)

| Movement | Speed | Notes |
|---|---:|---|
| Walk (toggle) | 2.4 m/s | |
| Jog (default) | 5.4 m/s | |
| Sprint | 8.1 m/s | stamina: 4 a second out of combat |
| On a road, on foot | ×1.15 | reuse Farhold R27 road pace |
| Swim | 2.7 m/s | |

### 3.2 Swimming

- You swim on the surface anywhere deeper than **1.2 m**; `X` (hold) dives (page 02). Breath: **30 s**
  underwater, then 5% of maximum health a second (page 05 may own this number; proposed here).
- No swimming in lava, ice-covered lakes (walkable) or the Pale Sea past **1.5 km** from shore (a current
  turns you back, with a warning at 1.2 km).
- Mounts put you off in deep water, except aquatic mounts (§4.3) and any mount from Riding III.

### 3.3 Personal boats — dropped

Farhold's personal raft/skiff/cutter (auto-equipped in deep water) is **not** in Wildmarch. Water is crossed
by swimming, by aquatic mounts from level 10 (the owner's giant frogs), by every mount from Riding III, and by
the barge and ship routes (§9). A personal boat would be a fourth answer to the same question. (Page 07's
level-9 "Boats" unlock row should go; see §22.)

---

## 4. Mounts

Page 07 owns the riding ranks and page 08 the species catalogue. The travel facts:

### 4.1 Riding ranks

| Rank | Level | Quest (page 07/14) | Ground | Road (×1.25) | Water | Air |
|---|---:|---|---:|---:|---|---|
| I | 10 | `q_hc_saddle_and_bridle` | 8.6 m/s | 10.8 m/s | off in deep water (aquatic mounts swim) | glide only, winged mounts |
| II | 20 | `q_ss_the_sand_runners` | 10.8 m/s | 13.5 m/s | as I | as I |
| III | 40 | `q_dc_the_tide_steed` | 10.8 m/s | 13.5 m/s | every mount swims at +80% (4.9 m/s), leaps 6 m | as I |
| IV | 60 | chain `q_sky_1..5` | 10.8 m/s | 13.5 m/s | as III | **flies** at 13.5 m/s |

Mounting is a 1.5 s cast, out of combat; a hit dazes you off (page 05).

### 4.2 Land species

Page 08 lists every mount. Canon §12.3 asks for more species; the travel-relevant differences are only:
**jump** height, **gallop** length (stamina seconds), **slope** bonus (e.g. boars, goats +15% up slopes), and
**terrain** tricks (below). Speed is capped by riding rank, so species never outrun each other.

| Trick | Species (examples; page 08 owns the list) | Effect |
|---|---|---|
| Surefoot | boars, rams, mountain goats | +15% speed up slopes steeper than 20° |
| Sand-runner | dune lizards, crested raptors | no speed loss in sand and dunes (others −10%) |
| Snow-runner | bears, great elk | no speed loss in snow (others −10%) |
| Long leap | raptors, frogs | jump 2.4 m (others 1.3–2.1) |
| Glide | every winged mount | from any drop over 4 m, glide forward at ground speed; cannot climb (before Riding IV) |
| Swim (aquatic) | giant frogs, turtles, the Tide Steed | swims from Riding I (§4.3) |

### 4.3 Aquatic hybrids — giant frogs and kin

The owner's "swimming mounts (giant frogs)". An **aquatic** mount:

| Rule | Value |
|---|---|
| Swims from | **Riding I** (level 10) — the only mounts that do before Riding III |
| Swim speed | its ground speed cap × 0.8 on the surface (Riding I: 6.9 m/s; Riding II: 8.6 m/s) |
| Dive | yes: to **8 m** below the surface for **20 s**, then it surfaces (other mounts cannot dive at all) |
| From water to land | a 3 m leap out of the water onto a bank or jetty |
| On land | a normal mount (frogs hop: the camera bob is damped, setting on page 04) |
| Examples | Reedstrider frog (page 08), Tidewalker turtle (×3.0 in water per page 08 — capped to the rules here), the Tide Steed |

### 4.4 Flying at 60

| Rule | Value |
|---|---|
| Unlock | Riding IV, the Kingsfire story chain `q_sky_1` … `q_sky_5` (page 07 owns the steps and must drop its old Depth-run step; §22) |
| Speed | 13.5 m/s in the air; take off with `Space` twice while mounted (page 02) |
| Ceiling | 300 m above the ground below you |
| No-fly | inside Highcourt's walls and any hub's walls (you land at the gate), dungeon entrances within 60 m, a world boss arena within 400 m while its fight is running, the Spire above 600 m, Travel Method stations within 30 m (so nobody blocks a platform) |
| Dismounting in the air | the mount is put away and you **glide** down on a cloak-wing at 6 m/s forward, 3 m/s down; no fall damage |
| Protection | none — flying is not a Travel Method; enemies with ranged attacks can hit you, a hit dazes you into the glide |
| Why Travel Methods still matter at 60 | a rail cart (32 m/s), ship (26) or kite (30) is still twice as fast between their stations, and they protect you |

---

## 5. Travel Methods — the rules

A **Travel Method** (`tm_`) is a vehicle or beast that carries riders along a **known route** between
**stations** (`tms_`). It replaces flight paths (canon W15).

| Rule | Value |
|---|---|
| Unlock | **level 12**, the Waywardens' quest in Highcourt (page 07 row; page 14 id `q_hc_the_waywardens_oath`). Before 12, stations show on the map and the station-master says "The lines take riders with a Wayfarer's writ — the Waywardens in Highcourt issue them from level 12." |
| Speed | **18–32 m/s** by kind (§6) — 3.3× to 6× a jog |
| Routes | fixed, drawn on the map; they **follow real paths**: roads for wagons and trails, rivers for barges, sea lanes for ships, rails for the rail line, wading lines across marsh and dunes for Longshanks, open air only for flyers (§8) |
| Which routes you can use | you **book from a station you have discovered to another station you have discovered** on the same line (§18). Every stop the vehicle halts at on the way is discovered for you |
| Protection | riders **cannot be damaged, targeted or pulled into combat**; no monster aggroes on a rider or a vehicle; weather statuses (Heatstroke, cold slow, sandstorm blindness — page 05) do not apply; no fall damage |
| What you can do aboard | chat, map, bags (look, equip, salvage), social, mail reading, emotes, the camera. **Not**: spells, items, the Recall Stone, mounting, trading, the Trading Post |
| Boarding | `E` at the station opens the station screen; pick a destination, pay, **2 s** boarding animation. Not in combat. Your mount is put away |
| Getting off early | **bus-style land routes**: hold `E` for 1 s to **step off** anywhere on open land (not on a bridge more than 3 m up, not in a tunnel, not over water). You land beside the route, protection lasts **2 s** more, the fare is not refunded. **Scheduled routes and flyers**: only at stops |
| Arrival | at the destination platform; a 1 s step-down; you are free |
| Cost | gold fare (§12) |

---

## 6. The seven kinds of Travel Method

| Kind | id prefix | What it is | Model (reuse / new) | Path it follows | Speed | Departure | Capacity |
|---|---|---|---|---|---:|---|---:|
| **Wagon line** | `tm_wagon_` | a covered wagon or coach behind a horse team (the Waywardens' post) | `avatar-3d/js/vehicles.js` `wagon`, `coach`, `war_wagon` (reuse) | roads (the Kingsroad and its branches) | 20 (coach 22, war wagon 18) | bus-style | 6 |
| **Trail** | `tm_trail_` | a string of trained riding beasts that run a known trail on their own; each rider gets one | creature bodies (reuse `creature-types.js`: deer as **Moonharts**, horse as **herd horses**; the drake sled `dragon_sled` in the snow) | trails and tracks | 22 | bus-style (short hold) | 5 |
| **Longshank** (giant strider) | `tm_longshank_` | a huge grazing beast on stilt-like legs, 9 m to the back, carrying a roofed **howdah** (a basket-room) for 8 | **new** creature body (a quad plan with legs ×3.5 and a slow, rolling gait; `creature-types.js` gains a `longshank` type) + a howdah prop | **straight across** marsh and dunes, wading water up to 3 m deep (A* from `haulpath.js` with shallow water allowed) — 30–40% shorter than the road | 18 | bus-style (long hold) | 8 |
| **River barge** | `tm_barge_` | a long poled and sailed barge | **new** hull in `boat.js` style | rivers (the Wend, the Slowwater) | 16.5 average (18 down, 15 up) | **scheduled** | 12 |
| **Ship** | `tm_ship_` | a two-masted coaster; the Pale Sea ship is larger | **new** hulls in `boat.js` style | sea lanes (reuse `worldgen/js/roads.js` sea lanes) | 26 | **scheduled** | 40 |
| **Rail cart line** | `tm_rail_` | **the Deepway**: the Deepforge Clans' ore line, a train of four open rail carts pulled by a stone-plated engine-beast (a construct ox) on iron rails, through tunnels under the Greyridge | **new** carts (from `vehicles.js` `cart` plan) + construct ox (reuse creature `golem` parts) + rails (a lane with sleepers) | rails | 32 | **scheduled** | 24 (4 carts × 6) |
| **Flyer** | `tm_kite_` | a **kite basket**: a wicker basket slung under two great grey gale kites (birds) | reuse bird/griffin creature bodies; new basket prop | open air — **only where no ground route exists** (floating islands, a lava caldera) | 30 | bus-style | 5 |

The animals' run cycles play faster than a real beast could run; this is a stylised game and the
alternative is a ten-minute wagon ride. Riders sit at the vehicle's `seat` points (reuse `vehicles.js`
`metrics().seat`, extended to a list of seats).

---

## 7. Departures: bus-style and scheduled

### 7.1 Bus-style (wagons, trails, Longshanks, kites)

A vehicle waits at the station and leaves when it has waited long enough or is full.

| Rule | Wagon / war wagon / coach | Trail | Longshank | Kite basket | Highcourt ring carriage |
|---|---:|---:|---:|---:|---:|
| Hold after the **first** rider boards | 30 s | 10 s | 45 s | 20 s | 10 s |
| Each new rider adds | +10 s | +5 s | +10 s | +5 s | — |
| Longest total hold | 60 s | 20 s | 75 s | 30 s | 10 s |
| Leaves early when | full (6) | full (5) | full (8) | full (5) | full (8) |
| **Ready** button | when every rider aboard has pressed Ready, it leaves at once — but never before **10 s** have passed | same | same | same | — |
| Halts at intermediate stations | 10 s, only if someone is getting on or off | same | same | same | same |

- A departing vehicle is replaced **at once** by a new empty one at the station, so nobody waits for a
  vehicle to come back. Each departure is its own vehicle on the server.
- The hold is what makes it a bus: strangers heading the same way end up riding together. The Ready rule
  means a player alone is never made to wait more than 10 s if they choose not to.
- A countdown shows over the vehicle and on the station screen ("Leaves in 0:24 — 3 of 6 seats").

### 7.2 Scheduled (barges, ships, the Deepway)

A fixed number of vehicles run the line all the time, on a timetable that is the same for everyone on the
server. You wait for one to come in; everyone on the platform boards together.

| Rule | Value |
|---|---|
| Dwell | **30 s** at an intermediate stop, **60 s** at the ends of a line, **30 s** at every stop of a loop (boarding is open for the whole dwell) |
| Timetable | derived from the server clock: departure `n` leaves the first station at `epoch + n × headway`. Same answer for every player, no drift |
| The platform | a **departure board** shows the next 3 departures each way, with a live position dot; the station screen lists them too |
| Boarding a moving vehicle | not possible; the doors close at the end of the dwell (a bell 5 s before) |
| Full | if a vehicle arrives full, a **relief** vehicle leaves 30 s behind it on the same path; the timetable is not changed |
| Missed it | the station screen says when the next one comes; nothing is lost (you pay when you board) |
| Watching it come | the vehicle is visible in the world to everyone, whether or not they are riding — a barge you can see coming up the Wend is part of the point |

---

## 8. Staying on the route (auto-correct)

The owner's rule: the route is smart enough to correct itself if something goes wrong (reference: the way
*Satisfactory*'s vehicle paths work, noted as a design reference only).

**The idea in one sentence:** the vehicle's **progress along the route is decided by the clock, not by where
the vehicle's body happens to be** — so if the body is knocked off the path, the game knows exactly where it
should be and puts it back.

| Part | Rule |
|---|---|
| The route | a lane: `points` (every 3 m, reuse `roadplan.js` `LANE_SPACING`) + `surface` height per point + `kind` (road, river, sea, rail, wade, air). Built once from the world's own roads/rivers/sea lanes and saved in `data/travel.json` |
| Progress | `s(t)` — metres along the route — computed from departure time, the kind's speed, a 4 s speed-up and slow-down, and the dwell at each stop. The **server** owns `s(t)` |
| Where it is drawn | the body is placed at `route.at(s)` facing the route's direction every frame. On the client a small spring lets the body sway, bump and heel (and be pushed by physics) without leaving the path |
| When it snaps back | if the body is more than **4 m** from `route.at(s)` for more than **0.75 s**; or more than **2 m below** the route's surface (it fell off a bridge); or a land vehicle is in water deeper than 1 m; or a boat is aground |
| How it snaps | a **0.3 s** fade out, the vehicle and riders placed at `route.at(s)`, a 0.3 s fade in, with a little puff of dust or spray. Riders stay seated. Because `s(t)` never stopped, the timetable is not affected |
| A route that is blocked | a route may carry **detours**: extra lanes around a place a world event can close (a bridge down during an event, a fallen tree on a trail). While the event runs, the server swaps in the detour and adds its extra time to `s(t)`; the station screen shows "Detour: +40 s" |
| Nothing else | a vehicle never fights, never stops for monsters and never takes damage |

---

## 9. Every route

Times include halts. The fare column is the whole line priced at its highest band (§12); what you actually pay
is the sum of the sections you ride, which for a whole line is the same or a few gold less. "Opens" is extra to the level-12 unlock.

| # | id | Kind | Stops (in order) | Length | Time end to end | Departure | Fare end to end (gold) | Opens |
|---:|---|---|---|---:|---:|---|---:|---|
| 1 | `tm_wagon_kingsroad_south` | wagon | Brightwater Yard → Millbrook → Highcourt South Gate | 4.4 km | 3:50 | bus 30 s | 9 | — |
| 2 | `tm_wagon_vale_post` | wagon | Brightwater Yard → Oakhollow → Harrow Watch | 3.0 km | 2:40 | bus 30 s | 3 | — |
| 3 | `tm_wagon_fen_causeway` | wagon | Brightwater Yard → Reedhollow → Highcourt Fen Gate | 6.0 km | 5:10 | bus 30 s | 12 | — |
| 4 | `tm_barge_wend` | barge | Brightwater Quay → Millbrook Quay → Highcourt Low Wharf → Stillwater Landing → Ninewillow | 8.5 km | 10:05 | **scheduled**, 3 barges, one every **7:23** each way | 14 | — |
| 5 | `tm_longshank_fen` | Longshank | Reedhollow → Peatmoor → Ninewillow → Stillwater Landing | 5.0 km (road 7.5) | 4:57 | bus 45 s | 9 | — |
| 6 | `tm_wagon_kettle_road` | wagon | Highcourt North Gate → Kettle Pass → Anvilgate | 7.0 km | 6:00 | bus 30 s | 18 | — |
| 7 | `tm_rail_deepway` | **rail** | Stonebridge → Cutstone → Anvilgate → Fort Ashfall → Hollowpeak Lodge | 19 km (tunnel 7 km) | 11:23 | **scheduled**, 4 trains, one every **6:11** each way | 158 (by section: 8 · 8 · 58 · 84) | Fort Ashfall and Hollowpeak halts need those stations discovered |
| 8 | `tm_wagon_sunroad` | wagon | Kettle Pass → Redmesa Post → Oasis of Tamar | 6.0 km | 5:10 | bus 30 s | 21 | — |
| 9 | `tm_longshank_dune_sea` | Longshank | Oasis of Tamar → Saltwell → Dunehold Caravanserai | 6.0 km (road 9) | 5:43 | bus 45 s | 26 | — |
| 10 | `tm_wagon_moonroad` | wagon | Anvilgate → Hartsrest → Silverbough | 7.0 km | 6:00 | bus 30 s | 32 | — |
| 11 | `tm_trail_moonhart` | trail (Moonharts) | Silverbough → Moonfall Glade → Thistlemere | 4.5 km | 3:34 | bus 10 s | 25 | — |
| 12 | `tm_ferry_thistlemere` | small boat (barge rules) | Thistlemere ↔ Thistlemere East Jetty | 1.2 km | 1:40 | **scheduled**, 1 boat (12 m/s), every **5:20** | 3 | — |
| 13 | `tm_wagon_kingsroad_north` | wagon | Fort Ashfall → Ashfall Watch → Waystone Camp | 6.0 km | 5:10 | bus 30 s | 60 | — |
| 14 | `tm_wagon_last_road` | **war wagon** (Crown convoy) | Waystone Camp → Anchor Hill → Cinderwatch → Last Light | 7.0 km | 6:48 | bus 30 s | 101 | — |
| 15 | `tm_trail_steppe_herd` | trail (herd horses) | Fort Ashfall → Tallgrass → Ghara's Camp | 8.0 km | 6:13 | bus 10 s | 53 | Ghara's Camp after Ch 7 (`q_ms_the_defector`, page 14). **Tallgrass moves** between 3 spots once a real day (page 01); its station moves with it and the route's middle section is re-picked from 3 stored lanes |
| 16 | `tm_wagon_rimeroad` | **coach** | Fort Ashfall → Rimehold | 7.0 km | 5:18 | bus 30 s | 49 | — |
| 17 | `tm_trail_rime_sled` | trail (**drake sled**) | Rimehold → Whitecairn → Icefall Camp | 5.0 km | 3:57 | bus 10 s | 42 | — |
| 18 | `tm_wagon_saltroad` | wagon | Fort Ashfall → Saltmarch Yard | 9.0 km | 7:30 | bus 30 s | 77 | — |
| 19 | `tm_ship_coast_loop` | ship | Saltmarch Harbour → Gullrock → Brinehollow → Lampwick Point → Saltmarch Harbour (a loop, one way round) | 7.0 km | 6:29 per lap | **scheduled**, 1 ship, every **6:29** | 90 (a full lap) | — |
| 20 | `tm_ship_longcoast` | ship | Brightwater Quay ↔ Saltmarch Harbour (down the east coast) | 26 km | 16:40 | **scheduled**, 3 ships, one every **11:47** each way | 332 | both ends discovered — so in practice from the 40s, but a low-level friend walked there can ride it home |
| 21 | `tm_ship_pale_sea` | ship (the large one) | Saltmarch Harbour ↔ Spire Landing | 8.0 km | 5:07 | **scheduled**, 2 ships, one every **6:07** each way | 168 | main story at 60 (page 14); **the only way to Spire Isle** until its waystone is discovered |
| 22 | `tm_kite_riftmarch` | **flyer** | Waystone Camp → Shardfall Post → the High Islands | 5.5 km | 3:13 | bus 20 s | 110 | — (Shardfall Post and the High Islands float; no ground route) |
| 23 | `tm_kite_caldera` | **flyer** | Last Light → Kiln Hollow | 4.0 km | 2:13 | bus 20 s | 96 | after `q_ms_kiln_hollow` (page 14); crosses the caldera's lava lake, no ground route |
| 24 | `tm_wagon_crown_ring` | carriage | Highcourt South Gate → Low Wharf → Fen Gate → North Gate (a loop) | 2.5 km | 2:25 | bus 10 s | **free** | — |

**Totals:** 24 routes, 49 stations, 7 kinds; 5 scheduled lines, 19 bus-style. Flyers are used only on routes
22 and 23, where there is no ground to travel on.

---

## 10. Every station, by region

A station is a platform, a sign, a **station-master** (the one NPC per station; page 01 owns NPC ids,
proposed `npc_stationmaster_<station>`), a departure board for scheduled lines, and a hitching post or quay.
It stands **inside the town boundary** (so entering the town discovers it) or, for the four stations outside
towns, is discovered within **40 m**.

| Region | Station id | Where | Routes |
|---|---|---|---|
| Hearthvale | `tms_brightwater_yard` | Brightwater, the Warden post yard by the north gate | 1, 2, 3 |
| Hearthvale | `tms_brightwater_quay` | Brightwater river port | 4, 20 |
| Hearthvale | `tms_millbrook` | Millbrook (road halt and mill quay are one station) | 1, 4 |
| Hearthvale | `tms_oakhollow` | Oakhollow hedge gate | 2 |
| Hearthvale | `tms_harrow_watch` | Harrow Watch stockade | 2 |
| Mossfen | `tms_reedhollow` | Reedhollow boardwalk landing | 3, 5 |
| Mossfen | `tms_peatmoor` | Peatmoor cutting yard | 5 |
| Mossfen | `tms_ninewillow` | Ninewillow island jetty | 4, 5 |
| Mossfen | `tms_stillwater_landing` | Stillwater Landing ferry post | 4, 5 |
| Highcourt | `tms_hc_south_gate` | outside the South Gate, beside the Stable Gate | 1, 24 |
| Highcourt | `tms_hc_fen_gate` | inside the Fen Gate | 3, 24 |
| Highcourt | `tms_hc_low_wharf` | the Low Wharf (Cutwater river office) | 4, 24 |
| Highcourt | `tms_hc_north_gate` | inside the North Gate | 6, 24 |
| Greyridge | `tms_kettle_pass` | Kettle Pass Waystation yard | 6, 8 |
| Greyridge | `tms_anvilgate` | Anvilgate: the wagon yard outside the great gate and the **Deepway platform** inside the hill (one station, two platforms, 60 m apart by stair) | 6, 7, 10 |
| Greyridge | `tms_cutstone` | Cutstone quarry railhead | 7 |
| Greyridge | `tms_stonebridge` | Stonebridge, under the three arches | 7 |
| Sunscar | `tms_redmesa_post` | Redmesa Post, at the foot of the mesa lift | 8 |
| Sunscar | `tms_oasis_of_tamar` | Oasis of Tamar: wagon yard and the Longshank tower (a tall mounting stair) | 8, 9 |
| Sunscar | `tms_saltwell` | Saltwell salt-pan camp (Longshank stair) | 9 |
| Sunscar | `tms_dunehold` | Dunehold Caravanserai (Longshank stair) | 9 |
| Whisperwood | `tms_hartsrest` | Hartsrest woodcutters' camp | 10 |
| Whisperwood | `tms_silverbough` | Silverbough ground level, root gate | 10, 11 |
| Whisperwood | `tms_moonfall_glade` | Moonfall Glade | 11 |
| Whisperwood | `tms_thistlemere` | Thistlemere lake village | 11, 12 |
| Whisperwood | `tms_thistlemere_east` | east shore jetty (outside a town: discovered within 40 m) | 12 |
| Cinder Steppe | `tms_fort_ashfall` | Fort Ashfall: the barbican yard and the Deepway platform in the fort's undercroft — **the network's great junction** | 7, 13, 15, 16, 18 |
| Cinder Steppe | `tms_tallgrass` | Tallgrass herders' camp (moves once a real day) | 15 |
| Cinder Steppe | `tms_ghara_camp` | Ghara's Camp | 15 |
| Cinder Steppe | `tms_ashfall_watch` | Ashfall Watch tower | 13 |
| Frostmantle | `tms_hollowpeak_lodge` | Hollowpeak Lodge, the Deepway's northern end in the dwarf hall | 7 |
| Frostmantle | `tms_rimehold` | Rimehold: the coach yard and the sled kennels | 16, 17 |
| Frostmantle | `tms_whitecairn` | Whitecairn trappers' village | 17 |
| Frostmantle | `tms_icefall_camp` | Icefall Camp on the glacier | 17 |
| Drowned Coast | `tms_saltmarch_yard` | Saltmarch upper town wagon yard | 18 |
| Drowned Coast | `tms_saltmarch_harbour` | Saltmarch harbour (a stair and a lift from the yard, 90 m) | 19, 20, 21 |
| Drowned Coast | `tms_gullrock` | Gullrock sea-stack quay | 19 |
| Drowned Coast | `tms_brinehollow` | Brinehollow flats jetty | 19 |
| Drowned Coast | `tms_lampwick_point` | Lampwick Point landing | 19 |
| Riftmarch | `tms_waystone_camp` | Waystone Camp: wagon yard and kite perch | 13, 14, 22 |
| Riftmarch | `tms_anchor_hill` | Anchor Hill | 14 |
| Riftmarch | `tms_shardfall_post` | Shardfall Post (a floating island) | 22 |
| Riftmarch | `tms_rift_high_islands` | the High Islands landing (outside a town: discovered within 40 m, or by arriving) | 22 |
| Kingsfire | `tms_cinderwatch` | Cinderwatch fort yard | 14 |
| Kingsfire | `tms_last_light` | Last Light: convoy yard and kite perch on the ridge | 14, 23 |
| Kingsfire | `tms_kiln_hollow` | Kiln Hollow (after its quest) | 23 |
| Spire Isle | `tms_spire_landing` | the Spire Landing harbour | 21 |

(Towns not on a line — Highcairn, Cutstone's neighbours, the Quiet Orchard, Harrow's downs — are a short
ride from one that is. Page 01 may add a station later; §22 asks for a `ST` service code.)

---

## 11. The route map

North up; `=` wagon line, `~` barge or ship, `#` the Deepway rail, `:` trail, `%` Longshank, `^` kite,
`o` station, `O` junction.

```
                                   o Spire Landing
                                   ~ (21) Pale Sea ship
   o Icefall Camp                  ~
   : (17) sled                     O Saltmarch Harbour ~~(19)~~ o Gullrock ~~ o Brinehollow ~~ o Lampwick Pt
   o Whitecairn                    |  stair                                   (loop back to Saltmarch)
   :                               o Saltmarch Yard
   O Rimehold        o Kiln Hollow                                     ~
   =  (16)           ^ (23) kite                                        ~ (20) Longcoast ship
   =                 O Last Light                                       ~  down the east coast
   =                 = (14) war wagon                                   ~
   =    o Hollowpeak o Cinderwatch                                      ~
   =    #            = o Anchor Hill        ^ (22) kite o Shardfall ^ o High Islands   ~
   =    #            O Waystone Camp ^^^^^^^^^^^^^^^^^^^^                               ~
   =    #            = (13)                                                              ~
   =    #            o Ashfall Watch       : (15) herd trail                             ~
   =    #            =                  :::::::: o Tallgrass :::: o Ghara's Camp          ~
   ===========#======O Fort Ashfall ==========(18) Saltroad ============> Saltmarch Yard  ~
                #  (7) the Deepway, 7 km of tunnel                                       ~
   o Stonebridge#o Cutstone#O Anvilgate ==(10) Moonroad== o Hartsrest == O Silverbough     ~
                            =                                            : (11)           ~
   (8) Sunroad              = (6) Kettle road                            o Moonfall Glade ~
   o Oasis = o Redmesa = O Kettle Pass                                   o Thistlemere ~(12)~ o East jetty
   %  (9)                   =                                                             ~
   o Saltwell % o Dunehold  =                                                             ~
                            O Highcourt North Gate                                        ~
                            (24) ring: South Gate · Low Wharf · Fen Gate · North Gate     ~
                   O South Gate      O Low Wharf ~~(4) barge~~ o Stillwater ~~ o Ninewillow
                   = (1)             ~            % (5) Longshank % o Peatmoor % o Reedhollow
                   o Millbrook ~~~~~~~                                      = (3) causeway
   o Oakhollow == O Brightwater Yard ===================================== =
   o Harrow Watch (2)  O Brightwater Quay ~~~~~~~~~~~~~ (20) Longcoast ship ~~~~~~~~~~~~~~~~~~~~
```

The in-game route map (§19) draws the same network over the world map: each line in its kind's colour,
known stations filled, unknown ones hollow, live vehicles as moving dots on scheduled lines.

**A long trip, worked through:** Brightwater to Last Light by Travel Methods — wagon 1 (3:50), ring 24 to
the North Gate (~1:00), wagon 6 (6:00), the Deepway from Anvilgate to Fort Ashfall (~4:30 + a wait of up to
6:11), wagon 13 (5:10), war wagon 14 (6:48) ≈ **30 minutes** of travel for about **250 gold**. Walking the
same ~31 km at 5.4 m/s × 1.15 on the road takes **83 minutes**; riding at Riding II on the road, **38 minutes**
with no protection. A Scroll of Passage (§17) does it in 10 s for 300 gold if Last Light's waystone is already
discovered.

---

## 12. Fares

`fare = ceil( km × kind rate × band )` for each section of the trip (station to station), where **band** is
the higher of the two stations' regions' band multipliers from page 08 "The economy" (Hearthvale 1, Mossfen
1.5, Highcourt 2, Greyridge 2.5, Sunscar 3.5, Whisperwood 4.5, Cinder Steppe 5.5, Frostmantle 7, Drowned Coast
8.5, Riftmarch 10, Kingsfire 12, Spire Isle 14).

| Kind | Rate (gold per km) |
|---|---:|
| Wagon, coach | 1.0 |
| War wagon | 1.2 |
| Trail, sled | 1.2 |
| Longshank | 1.2 |
| Barge | 0.8 |
| Small ferry | 0.5 |
| Ship | 1.5 |
| Rail | 1.5 |
| Kite | 2.0 |
| Highcourt ring carriage | free |

Against page 08's target income, a ride costs about **1–4 minutes of play** at the level of the region it
goes to (e.g. route 10 to Silverbough is 32 gold against 1,600 gold an hour). Fares are a light sink, not a
wall. Page 08 owns the band table; if it changes, fares follow.

---

## 13. Parties, followers, pets and disconnects

### 13.1 Riding with a party

| Rule | Value |
|---|---|
| **Book for the party** | the party leader (or anyone, if the leader allows it) books a destination; every party member within **40 m** of the station gets a prompt (`scr_party_travel_prompt`, 20 s) to board the same vehicle |
| Seats | bus-style: the vehicle reserves seats for every prompted member until they answer or 20 s pass, and does not count down meanwhile. Scheduled: members board during the dwell; one who misses it is told the next departure |
| Paying | each pays their own fare, or the booker ticks **Pay for the party** |
| Different discovery | a party member who has not discovered the destination **can** ride with a party member who has (the booker's knowledge counts for the trip); arriving discovers it for them (§18) |
| Split arrival | none: everyone aboard one vehicle arrives together |

### 13.2 Followers and pets

- **Followers** (hired NPCs, which take a party slot — canon §10) ride with you, take a seat, and pay no fare.
- **Class companions** (tamed beast, bound demon — canon §6) are put away on boarding and come back at the
  arrival platform. They take no seat. A controlled body (Control Undead, Charm) ends when you board.
- **Mounts** are put away on boarding.

### 13.3 Disconnecting mid-route

| Case | What happens |
|---|---|
| You disconnect aboard | the server keeps you aboard, protected and untargetable, until the vehicle reaches your booked stop, then puts you on that platform. Log back in: you are either still aboard (and see the rest of the ride) or standing on the platform |
| You log out (`/camp`) aboard | allowed with no timer; the same as a disconnect |
| Server restart mid-route | on restart you are on your booked platform; the fare is kept (you arrived) |
| Your party leaves the game | nothing changes for you |
| The station you booked becomes unavailable (event) | the vehicle stops at the station before it and the fare for the missing section is refunded by mail |

---

## 14. Waystones — decided

Canon had **waystones as fast travel between discovered waystones** at 12. Travel Methods now do the job of
getting you between towns, and two instant networks would make the routed vehicles pointless: nobody takes a
six-minute wagon if a free menu at the same stone takes them there in five seconds. So:

**Waystones stay, but as destinations, not a departure menu.** A waystone is the anchor that every
*teleport* arrives at. There is **no pad-to-pad travel menu**. Instant travel to a waystone is a **priced,
cooldown-limited choice** (a Scroll of Passage, a Portal Stone, a class spell), and the cheap, slower,
scenic choice is a Travel Method.

| Rule | Value |
|---|---|
| Where | one in every town marked `WS` on page 01, and a few safe landmarks (the First Waystone, `lm_first_waystone`, is Brightwater's) — reuse Farhold's one-design pad |
| Lighting | lit for you forever when you **enter the town's boundary**, at any level (reuse `waypoints.visit`) |
| What a lit waystone is for | **(1)** binding the Recall Stone (from level 7, §15); **(2)** the destination of a Scroll of Passage, a Portal Stone, the Mage Portal and the Druid's Heron's Flight (from level 12, §16–17); **(3)** the place teleports arrive |
| What it is not | not a travel menu, not a respawn point (page 05 owns death and the chapels) |
| Waystone keeper | an NPC at every **hub** waystone (proposed `npc_waykeeper_<town>`, page 01) who sells Scrolls of Passage and Portal Stones, and binds your Recall Stone if you prefer to talk to someone |
| Highcourt's Portal Court | its free portals to every hub are **removed** (they were a second free network). The court becomes the **Waykeepers' Hall**: the largest waystone, all keepers' goods, and the Waywardens' quest-giver (§22) |
| Unlock | lighting from level 1; using lit waystones as teleport targets from **level 12** (the same Waywardens' quest as Travel Methods) |

---

## 15. The Recall Stone

`it_recall_stone` — canon W24. A permanent item in its own belt slot (page 03 shows it beside the potion belt;
it is not a consumable and cannot be sold, traded or destroyed).

| Rule | Value |
|---|---|
| Unlock | **level 7**, the innkeeper quest in Brightwater (page 07 row; page 14 owns the quest id, now renamed for the Recall Stone) |
| Starts bound to | the character's **starting town**: Brightwater starters → the **First Waystone** (`lm_first_waystone`); Oakhollow starters → **the Burrow Gate Waystone** (`lm_oakhollow_waystone`, page 01). The level-7 quest hands the stone over already bound there; binding it at the First Waystone is then optional |
| Where you can bind it | any **lit waystone in a town**, or any landmark page 01 marks **`bindable`** — which it may only do for a landmark **inside a town boundary**, or a **wayshrine with an NPC keeper and no hostile spawn within 80 m**. **Never** a dungeon entrance, a wild landmark, a world boss site, a warband camp, a Travel Method halt outside a town |
| Examples of bindable landmarks | the First Waystone (Brightwater), the Stepped Well (Oasis of Tamar), the Eastmoon Well (Whisperwood, once lit in Ch 6); page 01's tables add the `bindable` flag |
| How to bind | `E` at the waystone or landmark → **Bind Recall Stone here**. The bind dialog (`scr_recall_bind`) shows the current bind and the new one; confirm. **2 s**, free, out of combat. Rebinding at most once every 60 s |
| Using it | `Home` (page 02 `recallStone`) or click it on the belt. **10 s channel**, out of combat, cancelled by moving or damage; then a 1 s fade and you stand at the bind point |
| Cooldown | **30 minutes** (real), shown on the belt icon and the tooltip |
| Where it works | anywhere in the open world and in towns; **inside a dungeon** it takes you out to the bind point (you leave the instance; the dungeon's progress for the party is unchanged). **Not** aboard a Travel Method, not while mounted in the air, not in a world boss arena during its fight |
| Party | self only |
| The spare | page 08's **Scroll of Recall** does the same with its own separate 30 min cooldown (so a Recall and a scroll can be used back to back) |
| On the map | the bind point shows a **Recall icon** (a round stone with a curling line, bespoke SVG) with the label "Recall: <place>"; hovering shows "Ready" or the time left. A `waylight.js` column stands over it for 10 s after binding. The minimap shows it at the rim when off-screen if `set.interface.showRecallOnMinimap` is on |
| Tooltip | "Recall Stone — bound to <place>. Channel 10 s: return there. Cooldown 30 min (ready / 12:30 left)." |

---

## 16. Teleports: class travel spells

Canon §6: four classes have an out-of-combat **travel utility spell** that uses no spell slot. The class files
own the look, sound and flavour; this page owns the numbers. All four unlock at **level 12**, with Travel
Methods, so a group has them by the time it is going to its second and third dungeons.

Shared rules: **out of combat** only; **open world and towns only** (not inside a dungeon, not in a world boss
arena during its fight); cast times are **cancelled by moving or damage**; no reagent and no gold cost;
"discovered" means lit waystone or discovered dungeon entrance (§18).

### 16.1 Mage — **Portal** (`mage_portal`)

| Rule | Value |
|---|---|
| Targeting | **Self** (opens at your feet) |
| Cast | **10 s** |
| Destination | any **town waystone the mage has discovered** (picked in `scr_teleport_picker` before the cast starts) |
| The gate | stands **60 s**; the mage and **party members only** (up to 5 people, followers included) step through with `E`. It closes after 60 s or when 5 have passed |
| Discovery | anyone arriving discovers that waystone and town (and its station) |
| Cooldown | **15 min** |
| Bookkeeping | one gate per mage at a time (reuse `portal.js`'s "one portal, one exit" rule) |

### 16.2 Chronomancer — **Retrace** (`chronomancer_retrace`)

| Rule | Value |
|---|---|
| Targeting | **Self** (and the party near you) |
| What it records | every **10 s**, the position of every party member (and the chronomancer) — up to **60 marks each** (the last 10 minutes). Marks inside dungeons and world boss arenas are not recorded. Marks are kept only while the party exists |
| Cast | **3 s** after you pick a mark on the timeline (`scr_retrace_timeline`: a strip of 60 marks per party member, with the place name and "4 min ago") |
| Who goes | the chronomancer and every party member within **30 m** who has not stepped out of the **green ring** shown for the 3 s cast (stepping out = staying behind) |
| Arrival | at the chosen mark (± 2 m) |
| Discovery | anything the recorded member had discovered **within 60 m** of that mark (a waystone, station, dungeon entrance) is discovered for everyone who arrives |
| Cooldown | **10 min** |

### 16.3 Oracle — **Guiding Call** (`oracle_guiding_call`)

The *assisted teleport* (canon W9): pulls one party member to the oracle.

| Rule | Value |
|---|---|
| Targeting | **Needs target**: a party member (`F2`–`F5` or their frame). Range: anywhere in the open world |
| Cast | **5 s** channel |
| The target | must be out of combat, not in a dungeon or boss arena, not in the air. If they are riding a Travel Method, accepting takes them off it (the fare is not refunded) |
| Accepting | the target gets a prompt (`scr_summon_prompt`) for **60 s**: Accept / Decline. `set.gameplay.autoAcceptSummon` can accept automatically from party members |
| Arrival | beside the oracle (within 3 m) |
| Discovery | **arriving counts as being there**: a dungeon entrance within 40 m of the oracle, and the waystone and station of the town the oracle stands in, are discovered for the arriving player |
| Cooldown | **5 min** |
| Use | the way to bring a friend to a dungeon's door so the Dungeon Finder lists it for them |

### 16.4 Druid — **Heron's Flight** (`druid_herons_flight`)

| Rule | Value |
|---|---|
| Targeting | **Self**; the druid alone |
| Cast | **3 s** (the druid takes Heron form), then an **8 s** flight scene (the heron lifts, the camera follows it up, fades) |
| Destination | **any waystone the druid has discovered** — town or landmark |
| Cooldown | **20 min** |
| Note | cannot carry anyone; in a party it is a way for the druid to get somewhere first and then be the anchor for a Scroll of Calling (§17) |

---

## 17. Teleports: scrolls and stones

Everyone else uses items (canon §6: "Everyone else uses scrolls and the Recall Stone"). Page 08 lists the
items and their shop prices; the rules are here. Enchanters make all three (page 19 "Enchanting"), and a
player-made one usually sells for less than the keeper's price.

| Item | id | Level | Cast | Who goes | Where to | Cooldown | Keeper price (gold) |
|---|---|---:|---|---|---|---|---|
| **Scroll of Passage** | `it_scroll_passage` | 12 | **10 s** | you | any **waystone you have discovered** | **15 min**, shared "travel item" cooldown | **25 × band** of the destination (Hearthvale 25 … Spire Isle 350) |
| **Portal Stone** | `it_portal_stone` | 20 | **10 s**; a gate stands 60 s | you + party members (up to 5) | any **town waystone you have discovered** | **30 min**, shared travel item cooldown | **100 × band** of the destination (cheaper per head than five scrolls) |
| **Scroll of Calling** | `it_scroll_calling` | 20 | **10 s** channel by you **and one other party member standing within 5 m** (a two-person ritual) | pulls **one** party member to you (accept prompt 60 s, as Guiding Call) | where you stand (open world only) | **30 min** per caster | **40 × band** of the region you stand in |
| Scroll of Recall | page 08 | 1 | 10 s | you | your Recall bind | 30 min, its own | page 08 |

- **Scroll of Calling** is deliberately harder to use than the Oracle's spell (two people, a longer
  cooldown, a price), so the Oracle's Guiding Call stays special while every group can still bring a friend
  to a dungeon door.
- Arriving by any of these discovers the arrival place (§18).
- None of them work in combat, inside dungeons or aboard a Travel Method.

---

## 18. Discovery

Discovery decides what you can travel to. It is per character and saved.

| Thing | Discovered when you… | Or when you arrive by |
|---|---|---|
| A **town** (and its waystone and station) | enter its boundary (reuse Farhold's town-boundary visit) | any teleport, Travel Method or Recall into it |
| A **station outside a town** | come within **40 m** | a Travel Method halting there |
| A **wild waystone** (landmark) | come within **40 m** | a teleport to it |
| A **dungeon entrance** (canon §8: the Dungeon Finder lists only discovered dungeons) | come within **40 m** of the door | a teleport, Guiding Call, Scroll of Calling or Retrace that puts you **within 60 m** of the door |

Not a discovery: **riding past** a dungeon entrance, town or station on a Travel Method without halting
there, or seeing it from the air. You have to be *there*, or be brought there.

The Unlocks screen and the map both show "Discovered: 31 of 49 stations · 38 of 60 waystones · 9 of 16
dungeons".

---

## 19. UI hooks, keys and settings

### 19.1 Screens (for page 03)

| Screen id | What it is |
|---|---|
| `scr_station` | the station screen (`E` on a station-master or platform sign): the lines here, each known destination with time, fare and colour of its region band; for bus-style lines the waiting vehicle's countdown and seats; for scheduled lines the next 3 departures each way; **Book**, **Book for the party**, **Pay for the party** |
| `scr_departure_board` | the in-world board on scheduled platforms (the same data, drawn as a sign) |
| `scr_route_map` | a **Routes** layer of the world map (`M`): every line coloured by kind, stations filled/hollow, live dots for scheduled vehicles, your Recall bind, discovered waystones; clicking a station shows its lines and "how to get there" (the chain of lines and walking, with total time and fare) |
| `scr_travel_hud` | while riding: a bar along the top with the route's stops, a moving marker, time to your stop, "Step off (hold E)" where allowed, and the kind's icon |
| `scr_party_travel_prompt` | "<name> booked Anvilgate on the Kettle road (18 gold). Board?" 20 s |
| `scr_recall_bind` | the bind dialog: current bind → new bind, confirm |
| `scr_teleport_picker` | destination picker for Portal, Heron's Flight, Scroll of Passage and Portal Stone: a list grouped by region plus the map, only valid targets enabled, price shown for items |
| `scr_retrace_timeline` | the Chronomancer's 60-mark strip per party member |
| `scr_summon_prompt` | "<name> is calling you to <place>. Accept / Decline" 60 s |

### 19.2 Keys (for page 02; context `travel` while riding)

| Action | Key | Context | Notes |
|---|---|---|---|
| `interact` | `E` | world | opens `scr_station`; boards when a party prompt is up |
| `travelStepOff` | `E` hold 1 s | travel | bus-style land routes only; elsewhere the HUD says "Only at stops" |
| `map` | `M` | travel | opens on the Routes layer, centred on the vehicle |
| camera | mouse drag / wheel | travel | free orbit and zoom around the vehicle; no other movement keys do anything |
| `recallStone` | `Home` | world | (already on page 02) |
| utility spells | from the Spellbook's **Utility** row, or bindable `utility1`–`utility4` (unbound by default) | world | the four class travel spells |

### 19.3 Settings (for page 04)

| Key | Control | Default |
|---|---|---|
| `set.gameplay.autoAcceptSummon` | off / party / party and friends | off |
| `set.gameplay.autoAcceptPartyTravel` | toggle | off |
| `set.gameplay.travelStepOffHold` | slider 0.5–2 s | 1 s |
| `set.interface.mapShowRoutes` | toggle | on |
| `set.interface.showRecallOnMinimap` | toggle | on |
| `set.camera.travelCamera` | follow / side / high | follow |

---

## 20. Data shapes

`data/travel.json` (new):

```json
{
  "kinds": {
    "wagon":     { "speed": 20, "rate": 1.0, "style": "bus", "hold": 30, "holdAdd": 10, "holdMax": 60, "readyMin": 10, "capacity": 6, "model": "vehicles:wagon", "stepOff": true },
    "longshank": { "speed": 18, "rate": 1.2, "style": "bus", "hold": 45, "holdAdd": 10, "holdMax": 75, "readyMin": 10, "capacity": 8, "model": "creature:longshank+howdah", "stepOff": true, "wadeDepth": 3 },
    "rail":      { "speed": 32, "rate": 1.5, "style": "scheduled", "dwell": 30, "endDwell": 60, "capacity": 24, "model": "rail:deepway", "stepOff": false },
    "kite":      { "speed": 30, "rate": 2.0, "style": "bus", "hold": 20, "holdAdd": 5, "holdMax": 30, "readyMin": 10, "capacity": 5, "model": "creature:gale_kite x2+basket", "stepOff": false }
  },
  "snap": { "maxOffset": 4, "graceSeconds": 0.75, "maxDrop": 2, "fadeSeconds": 0.3 },
  "stations": [
    { "id": "tms_anvilgate", "region": "greyridge", "town": "town_anvilgate", "platforms": [
        { "id": "yard", "x": 0, "z": 0 }, { "id": "deepway", "x": 0, "z": 0, "underground": true } ],
      "discover": "townBoundary", "npc": "npc_stationmaster_anvilgate" }
  ],
  "routes": [
    { "id": "tm_rail_deepway", "kind": "rail", "stops": ["tms_stonebridge", "tms_cutstone", "tms_anvilgate", "tms_fort_ashfall", "tms_hollowpeak_lodge"],
      "shape": "line", "vehicles": 4, "lanes": ["lane_deepway_1", "lane_deepway_2", "lane_deepway_3", "lane_deepway_4"],
      "detours": [], "opens": null },
    { "id": "tm_trail_steppe_herd", "kind": "trail", "stops": ["tms_fort_ashfall", "tms_tallgrass", "tms_ghara_camp"],
      "shape": "line", "movingStop": { "station": "tms_tallgrass", "lanes": ["lane_tallgrass_a", "lane_tallgrass_b", "lane_tallgrass_c"] },
      "opens": { "stop": "tms_ghara_camp", "quest": "q_ms_the_defector" } }
  ],
  "lanes": { "lane_deepway_1": { "kind": "rail", "points": [[0, 0]], "surface": [0], "half": 1.2 } }
}
```

A live vehicle (server):

```json
{ "id": "veh_7731", "route": "tm_rail_deepway", "dir": 1, "departedAt": 1790000000.0,
  "riders": [ { "player": "p_123", "from": "tms_anvilgate", "to": "tms_fort_ashfall", "paid": 58, "seat": 3 } ] }
```

Teleport and recall state (in the character save):

```json
{ "discovered": { "towns": ["town_brightwater"], "stations": ["tms_brightwater_yard"], "waystones": ["lm_first_waystone"], "dungeons": ["d01_hollow_barrow"] },
  "recall": { "bind": "lm_first_waystone", "readyAt": 1790001800 },
  "cooldowns": { "travelItem": 1790000900, "scroll_calling": 0, "mage_portal": 0 } }
```

`data/teleports.json` (new):

```json
{ "spells": {
    "mage_portal":           { "cast": 10, "cooldown": 900,  "targets": "townWaystone", "who": "party", "gateSeconds": 60 },
    "chronomancer_retrace":  { "cast": 3,  "cooldown": 600,  "marks": 60, "markEvery": 10, "radius": 30 },
    "oracle_guiding_call":   { "cast": 5,  "cooldown": 300,  "accept": 60, "who": "onePartyMember" },
    "druid_herons_flight":   { "cast": 3,  "flight": 8, "cooldown": 1200, "targets": "anyWaystone", "who": "self" } },
  "items": {
    "it_scroll_passage":  { "cast": 10, "cooldownGroup": "travelItem", "cooldown": 900,  "targets": "anyWaystone", "pricePerBand": 25 },
    "it_portal_stone":    { "cast": 10, "cooldownGroup": "travelItem", "cooldown": 1800, "targets": "townWaystone", "who": "party", "pricePerBand": 100 },
    "it_scroll_calling":  { "cast": 10, "cooldown": 1800, "needsHelper": 1, "helperRange": 5, "pricePerBand": 40 },
    "it_recall_stone":    { "cast": 10, "cooldown": 1800, "rebindEvery": 60 } },
  "discoverRadius": { "station": 40, "wildWaystone": 40, "dungeonWalk": 40, "dungeonArrive": 60 }
}
```

---

## 21. Reuse map

| Wildmarch piece | Reuse | Change |
|---|---|---|
| Waystone pad, lighting on entering a town | `prototypes/farhold/js/waypoints.js`, pad drawn by `js/features.js` | no pad-to-pad menu |
| Mage Portal gate | `js/portal.js` (one gate, one exit) | party-only, 60 s |
| Route lanes, ribbons, grading | `js/roadplan.js`, `js/road-fold.js`, `js/bridge-plan.js`, `worldgen/js/roads.js` (roads and sea lanes) | a route is a lane with a `kind` |
| Rivers for barges | `js/water-plan.js`, `js/planet.js` river surface | — |
| Longshank wading paths | `js/haulpath.js` A* | shallow water passable up to 3 m |
| Wagons, coach, war wagon, drake sled | `avatar-3d/js/vehicles.js` | a list of seats in `metrics()` |
| Barge and ship hulls | `js/boat.js` build style | new hulls |
| Creatures for trails, kites, the Longshank, the rail engine-beast | `avatar-3d/js/creature-types.js`, `creatures.js` | new `longshank` type |
| Mount rules | `js/gear.js`, `data/balance.json` | page 07/08 own them |
| Column of light over a station / bind | `js/waylight.js` | — |
| Map layers and markers | `js/markers.js`, the map screen | a Routes layer |

New: Travel Methods as a whole (routes, stations, timetables, snapping, passengers), the four class travel
spells, scrolls of passage and calling, portal stones, the Recall Stone rules.

---

## 22. Changes this page asks of other pages

| Page | Change |
|---|---|
| 00 §10 "Feature unlocks" row and §3 | "waystones + Travel Methods 12" means: **Travel Methods, and waystones as teleport targets** (§14). There is no waystone-to-waystone menu |
| 01 §10 "The travel network" | replace 10.2 Waystones, 10.3 Portals, 10.5 Skyways, 10.6 Boats with a pointer to this page; add a station service code (`ST` is taken by stable — proposed `TM`) and the station column to each settlement table; mark `bindable` landmarks; Highcourt's Portal Court → the **Waykeepers' Hall**; the Longshank as a creature of Mossfen and Sunscar |
| 07 ladder | remove the level-9 **Boats** row and the level-12 **Portals** row; the level-12 Waystones row becomes "Travel Methods and waystone teleports"; rename the level-7 Homeward Stone to the **Recall Stone**; the `q_sky` chain loses its old timed-dungeon step (that system is gone) |
| 08 | add the three items in §17 and the Portal Stone price rule; the Tidewalker turtle's ×3.0 in water is capped by §4.3; scroll prices use band as above |
| 10 | the `longshank` creature and the rail engine-beast are not enemies (page 10 may add a wild Longshank herd as neutral beasts) |
| 12 | the discovery rule for the Dungeon Finder is §18 here |
| 14 | quest ids for the Recall Stone quest rename; `q_hc_the_waywardens_oath` now unlocks Travel Methods |
| 17 | new models: Longshank + howdah, barge, two ships, the Deepway rail carts, rails and tunnel mouths, kite basket, station platforms, departure board |
| classes (mage, chronomancer, oracle, druid) | the numbers in §16; unlock at 12 |

---

## 23. Open questions

1. **Early wagons.** Travel Methods unlock at 12 (canon). The Hearthvale and Mossfen wagon lines (routes 1, 2,
   3, 5) could open at **level 5** as a taste, with the rest at 12. Recommendation: keep 12 — the starting
   regions are small enough to walk, and the unlock is a better moment with the whole network at once.
2. **Longshank name.** "Longshank" is plain and ours; if the owner prefers another name for the giant strider,
   it changes in one place (`creature-types.js` label and this page).
3. **The Pale Sea ship.** Route 21 is the only way to Spire Isle until its waystone is lit. Should it be free
   (it was in page 01's old boat table) since it is part of the main story? Recommendation: free for the
   first crossing (the story quest pays it), normal fare after.
4. **Riding past discovery.** §18 says riding past a dungeon on a route does not discover it. A stricter or
   looser rule changes how useful the teleport classes are for the Dungeon Finder; this page chose strict so
   the teleport classes have their job.
