# Voidwright

> **Status:** live on games.radgh.com · round 4 2026-11-13: ore stand-ins (better ore pays for Ferrite etc., `sim/mats.js`), outposts take their tier's ore, economy + combat retune from `tools/econ.mjs` / `tools/combat-sim.mjs`, weapon effects + knockback + far less explosion smoke, Screens deck (`ui/navmenu.js`), title sign-in box fixed · lint clean, every screen walked desktop + phone
> **Play:** LAN `http://<LAN IP>:8400/prototypes/voidwright/` (stable; https 8442 for a controller) · public https://games.radgh.com/voidwright/
> **Next:** the owner's play-test of round 4 — does knockback feel good on your own ship (`world.js` knock caps), is the late game's money pace right (warp cores III/IV/V should take ~15-25 min of play, `tools/econ.mjs`), danger 9 packs are still hard for a bare battleship in the sims (by design for now — watch it); older watch items: missile pressure at 3+, bridge limits, merc wages
> **Parked:** co-op (the input shape is ready, `docs/PLAN.md`); nothing else on hold

A 2D top-down space game: **build your ship from blocks → kill things or work for things → upgrade → kill bigger
things.** You start in a tiny mining skiff at the edge of a galaxy and can grow into a dreadnought about 100 times
its mass. Started 2026-11-06 from the owner's brief (`docs/OWNER-BRIEF.md`); his 20 rulings are `docs/PLAN.md` §0 —
read both before changing anything.

Play: `http://<LAN-IP>:8400/prototypes/voidwright/` (stable) — `8401` is the working tree. Controllers need the https
ports (8442 stable / 8441 dev).

## How it plays
- **Fly** with WASD / left stick / left thumb. The nose follows the way you fly (owner ruling #10), so fixed forward
  guns point where you travel and turrets cover the sides and back.
- **Aim** with the mouse / right stick / right thumb. Turrets aim and fire on their own; *manual* weapons (beams,
  rocket pods, railguns, plasma cannons, mining lasers) fire where you aim while Fire is held; *fixed* weapons fire
  straight ahead; *missiles* lock onto the marked target nearest your aim and fire with the Missile button.
- **Harpoon** (F / X): spear an asteroid, wreck or ship and drag it around; press again to let go; hold R to reel in.
  The rope is a real spring constraint between two bodies, so a big ship drags *you*.
- **Mine** asteroids (they are block grids too — the laser cuts them cell by cell; ore cells drop ore) and planets
  (fly over one — "low orbit" — and point a mining laser at the ground).
- **Dock** (E) at stations to trade, refit, repair, hire crew, buy ships, insure, research, take bounties.
- **Build mode** (B): place blocks on your hull — structure from materials, parts from your hold. Turret arcs and a
  coverage ring show where you can shoot. CPU is a hard limit; power and crew shortfalls slow your parts down.
- **Star map** (M): jump to linked systems. Danger rises with distance from the start; so do loot quality, enemy
  strength and what the shops sell. Your **warp core** class caps the danger you can jump INTO (Class I = danger 2,
  each class +2, `WARP_CORES` in `sim/galaxy.js`); upgrades are bought at outfitters for credits + materials; safer
  stars are always reachable; locked stars show a padlock. Each star has **traits** (`systemTraits`: enemy density,
  loot luck, asteroid richness, size, economy) that the star map spells out.
- **Local map** (N, D-pad left, or tap the radar; `ui/localmap.js`): the whole system — sun, planets, stations,
  belts, every sector inside sensor range, ships, POIs — with a key; tap anything to set a course marker.
- **Big systems** (30-65 km across): `sim/sectors.js` cuts space into 4 km sectors whose contents (asteroid
  cluster, rich cluster, wreck field, enemy camp, alien swarm, convoy) come from the star's seed alone;
  `streamSectors` fills the ones near you (one per call) and drops far ones, remembering mined rocks and camp kills
  for the visit. **Cruise**: out of combat with no enemy within 2.2 km, top speed ×2.4 (`inp.cruise`).
- **Combat rules (2026-11-11 play-test)**: no friendly fire (shots/beams pass through non-hostiles), ally bumps do
  no damage, allies steer around you (`ai.js avoid`); combat (which blocks building/docking) is only a real
  exchange with an enemy (`world.js noteCombat`). Stations never turn hostile over reputation. **Safe launch**:
  `P.grace` for 6 s after undocking/arriving — nothing can hurt or target you, your auto turrets hold fire, firing
  yourself ends it; hostiles are moved off a friendly station's doorstep (`SAFE_RADIUS` 3.5 km, also kept free of
  spawns/camps). Enemies are hardened (`shipgen.js hardenEnemy`: guns ×0.75 rate; hostile stations ×0.45
  rate, ×0.6 damage, at most 3+danger big guns). One blast deals at most 1.5× its damage to YOUR ship
  (`SPLASH_CAP`). The ×2+ enemy hull and the blast cap on enemies were taken back on 2026-11-11 (owner: "now they
  are too strong") — `ENEMY_HP` is 1.
- **Gnats** (2026-11-11, owner: "low level enemies easy to kill in small swarms without shields"): `generateShip({
  gnat: true })` makes a 3-4 cell dart with one small gun, frame hull, no shield, 60% damage (Gnat-123 for human
  factions, Mite-123 for aliens). `spawnGroup(..., 'gnats')` makes a pack of 5-9; about a quarter of roaming groups
  near home are gnat packs (fewer further out), and the sector streamer adds **Gnat pack** sectors (orange on the
  local map).
- The **quest line** (Goals, J/Tab) gives one vague goal at a time ("mine 25 ore", "make 3,000 profit trading") that
  can be done anywhere; each one unlocks the next part of the game (drip-feed). Finding certain parts unlocks their
  feature early.

## Expansion 1 — "Shipwright" (2026-11-12)
Owner rulings E1-E10 are in `docs/PLAN.md` §E1; play-test reports #24-#41 answered. Checklist: `~/claude/agent/voidwright-expansion-checklist.md`.
- **Materials** (`data/types.js`): Rock (filler: hull frames and cargo bays) + one structural / energy / exotic ore
  per tier; tier = warp-core class (`matTier(danger)`, `matOf(role, tier)`). Old ids fold in via `OLD_MATERIALS`
  (main.js `migrate`, `G.fixes.exp1`). Rock cells drop Rock; the hold's Cargo tab can switch that off (`G.settings.noRock`).
- **Typed asteroids** (`galaxy.js pickRockType/makeRock`): one ore per rock (`body.oreType`), plain rock common,
  mixed "cluster" rocks ~8% (owner: allowed, not the norm). **Scan** (V / D-pad right / Scan button, `sim/scan.js`):
  1.5 km from the bridge, Scanner 3.5 km, Deep scanner 9 km; marks rocks (`body.scanned`) on screen + local map.
- **Rarity is power** (`sim/partstats.js` — the ONE place part numbers are computed; ship.js, world.js, grid.js and
  ui/items.js all read it): rarity lifts base stats (+12% … legendary +85%, relic +125%), then rolled bonuses
  (`loot.js AFFIX`, every part kind incl. CPU / crew / cargo / slots) and legendary powers (`POWERS`).
- **Named uniques** (`data/uniques.js`, 20): fixed stacked powers, `loot.js rollUnique(r, from, chance)`; collection
  log in the hold (Crew & finds). **Reveal card** (`ui/reveal.js`) for epic+ and uniques, with a compare line.
- **Manual / auto fire** (#26): every gun fires by hand at your aim; Auto needs a targeting slot (bridge 2, command
  deck 4, flag bridge 10, Targeting computers +2/+6/+18); sentries and point defence are always automatic
  (`ship.js` sets `t.autoOn`; the choice is the 7th grid field `b.auto`; build mode Weapons tab toggles it).
- **Crew** (#33/#34): a number — least to fly (`crewMin`), needed (`crewNeed`), room (`crewCap`). Pods give "+N Crew";
  no passengers. 25% chance to lose one crew when a crewed part dies. Crew hall hires and sells.
- **Play-test 2026-11-12 batch 2 (helper B, tests in `tests/playtest-1112b.test.mjs`)**: drones are tiny block-built
  ships baked like any hull at half a block per cell (`render/drone-art.js`, #44); the hold's Drones tab (C) and the
  drone shop share one picker — Fly / Store / Swap in (`ui/drones-ui.js`, `state.js fitDrone/unfitDrone/swapDrone`,
  `main.js app.refreshDrones`, #53); mining drones cut `mine` rock/s as medium hits — Prospector 55, Excavator 120,
  Quarrier 240, × rarity, vs the Mining Laser I's 98 (#54; they also no longer stall after digging to a rock's
  middle); in formation drones fly with your velocity so boost/cruise never leaves them (#58); an empty booster locks
  until 30% (`world.js BOOST_RELOCK`, striped bar, #60); crew pickups say only "+N crew" (`world.js crewText`, #55);
  phones: right thumb = hold where you want to shoot, missiles fire by themselves at the nearest enemy, no Missiles /
  Dock buttons (the Dock pill docks) (#49); C, I, N, M, J close their own panel and swap between each other
  (`main.js panelKeys`, #51/#52); crafting, drone building and sealed caches spin one rarity reel weighted by the
  real odds (`sim/reel.js`, `ui/reel.js`, `craft.js cacheOdds`, #62).
- **Drones** (#28/#31): items (`G.droneItems`, rarity lifts health/damage) fitted to Drone ports in build mode
  (`G.ship.drones` = uids); a lost drone is rebuilt free after 12 s (`main.js droneUpkeep`). Menders heal wingmen too.
- **Workshop** (station tab, or ☰ → Fabricator with a Fabricator part; `sim/craft.js`, `ui/workshop.js`): craft parts
  and drones from ore, exotic ore boosts rarity odds, re-roll one bonus, open sealed caches (always rare+).
- **Grow hull** (shipyard, `sim/hullgrow.js`): next class keeping every block, credits OR ore. **Ship upgrades**
  (☰ menu, `ui/upgrades.js`): Ship rating + next hull + weak spots with buy / craft / loot routes.
- **Outfitter by slot** (`ui/items.js SLOTS`): Weapons, Shields, Power, Engines, Computing, Crew & cargo, Utility,
  Drone ports, Warp core, Sell parts. **Goals**: "Hook, line" removed; finishing "Further out" unlocks everything.
- Undocking puts you back on the side you docked from (`G.dockAngle`).
- **Mercenaries** (#29, E1/E2; `sim/mercs.js`, `ui/mercs.js`, station tab `mercs` — every pirate den, ~half the trade
  stations): a merc is a person with FIXED stats — piloting (max CPU + crew of a ship → `GRADES`), gunnery (body
  `dmgMul`), one trait (`TRAITS`: shield tech, field mechanic, missile ace, prospector, hunter) — plus a hire fee and
  a wage every 10 min of play (`payWages`: warn, then leave after 2 min). Better ones at more dangerous stations. Give
  them a hangar ship (`assign`; hangar records get a stable `rec.hid`; refusal reasons are shown on each row). Wing
  slots by flagship class: 1 skiff/corvette, 2 frigate/destroyer, 3 cruiser+ (`wingSlots`). Wingmen are bodies with
  `team 'player'`, `s.wing`, never `w.player`; `ai.js think` hands them to `escortThink` (formation behind you, fight
  what hits you / what you mark, leash 2.2 km, catch up past 6 km). Shot down → merc ejects, `rec.wrecked`, no loot;
  repair for credits on the Mercenaries board or the shipyard hangar. Damage is written back to the hangar on dock /
  jump / autosave (`storeWing`). Repair rigs (not bridges) patch allies within 600 out of combat (`world.js upkeep`).
- **Parts hold > Ships** (owner 2026-11-13; `ui/ships-tab.js`, `app.switchShip` in `main.js`, `switchShip` in
  `sim/mercs.js`): every ship you own, anywhere — in space or docked at any station (not every station has a
  Mercenaries board). Each card: picture, numbers, who flies it. **Fly this one** makes it your flagship (refused in a
  fight — 6 s calm — when wrecked, or when your cargo does not fit); in space the new ship takes your place, your crew
  moves with you (bunks permitting), and a merc who flew it swaps seats into your old ship when they can fly it.
  **Choose pilot** lists every hired merc with Assign / Move here / Swap in (bumps the current pilot) or the reason on
  the row; the wing re-forms at once. The shipyard's "Fly this one" uses the same switch. Hiring, dismissing and
  repairs stay at stations. Tests: `tests/ships-switch.test.mjs`; walk screen `hold-ships-pilots`.
- **Outposts** (#39, E3; `sim/colony.js`, `ui/colony.js`): Use over a planet → found one (credits + structural / energy
  / rock of the system's tier). A small station in orbit beside the planet (`outpostBody`: your colours, dockable,
  invulnerable, 2 real guns per Defence level), placed by `placeOutposts` on entering the system; docking opens its own
  screen. Modules (`MODULES`, 3 levels): Ore site, R&D lab, Factory, Trade post, Storage, Defence turrets; output
  piles up by `G.playTime` to the storage cap (`produce`), "Collect all" moves what fits. Raids every 30-55 min of play,
  warned 3 min ahead: in the system → raiders spawn at the outpost, beat them for loot + credits; away → settled on
  paper by turret level (`REPEL` / `LOSS`), never destroyed. Shown on the star map (⌂) and local map (green).
  Hooks in `main.js` are marked `[wing]` / `[outpost]`.
- **Encounters + space outposts** (E6, E7; `sim/encounters.js`): `sectors.js` hands empty squares to `encounterSector`
  (own seeded stream, so older sector kinds never move): convoy under attack (help → credits + standing + a part; rob
  it → standing loss + cargo), wandering merchant (Use → `ui/merchant.js`, rare+ parts, buys yours), space rift (3
  alien waves, then a cache), ion cloud (`s.ionized` stops shield regen in `world.js upkeep`, lightning, rich rocks),
  comet (circles its sector dropping ore), derelict station (hollow hub, sealed cache), wanted captain (`s.wanted`,
  bounty on screen, cache on the kill), ambush (looks like a field), friendly outpost (`OUTPOST_TYPES`: 1-3 services
  + Missions; docks through `app.dockAt`; not in `w.stations`), corsair outpost (silence the guns, crack the vault:
  parts, cache, `rollUnique('vault')`), alien nest (swarms every 22 s until under 40% hull), abandoned outpost
  (sections: cache / survivors / salvage / trap). Done ones are kept in `sysMem(G, sys).enc[key]`. A timed spawner adds
  raids / merchants / wanted captains near you every ~2-3 min, plus event spawns. Messages go out through
  `w.encMsgs` (the sim never touches the DOM).
- **Missions** (E8; `sim/missions.js`, board = the station / outpost **Missions** tab, which also holds the bounty
  board): recovery (harpoon a marked rock / hull / disabled ship into the station's reach), delivery (here or one jump,
  sometimes timed), clear a site (camp / nest / corsair outpost), escort (freighter to a relay beacon, 3 raider waves),
  survey (scan typed asteroids — counts `body.scanned` — or fly into anomalies), acquisition (ore or a rare+ part of a
  sort). 4 jobs per board from its seed + 10-minute window; 3 active max; `G.missions = { active, done, taken }`;
  `G.stats.missions` feeds "Odd jobs". HUD lines under the goal box (tap = course), and a Jobs section in Goals.
- **Galaxy events** (E10 + E4 treasure; `sim/events.js`): invasion / gold rush / pirate war / treasure system, rolled
  per 20-minute window of `G.playTime` from the galaxy seed, never at the start star. Read in ONE place each:
  `w.eventLuck` (destroy loot), `w.eventRich` (sector rocks), `eventMods().spawn/bounty/tough` (encounters.js).
  Star map halos + timers + an events strip (`ui/events.js`). Hooks are marked `[encounters]`; glue is
  `ui/missions.js initExpansion`. Tests: `tests/expansion-*.test.mjs`.

## Missiles, bridges and CPU (play-test #42 / #57 / #61 / #66, 2026-11-12)
- **CPU node** is +2 CPU for 1,200 cr (rarity lifts it); Logic racks are +1 (+4 / +16 for the 2×2 / 4×4 racks).
- **Bridge limits** (`ship.js partLimits`, `isCpuPart`, `isPowerPart`): the bridge sets how many CPU parts (`cpuParts`)
  and power parts (`powerParts`) run — Bridge 3/4, Bridge Mk II 5/6 (tier 3, danger 2+ shops), Mk III 8/9 (tier 5,
  danger 4+), Command Deck 14/12, Flag Bridge 40/30. The best parts count; the rest stay fitted but idle (`b.idle`), so
  old saves load unchanged. Player-team ships only — generated enemies are built to their own budget. Build mode shows
  "CPU parts 3 / 3", refuses an over-limit part with the next bridge and where to get it (`ui/items.js nextBridge`), and
  says how to get a bigger hull for a 2×2 part (`biggerHullText`); block size stays gated by hull class (ruling E5).
  Outfitters have a **Bridge** shelf (every bridge the shop can sell); better bridges can also be crafted.
- **Missile kinds** (`weapons.js warhead`): std (Homing Missiles, Swarm pod), ram (Ram Torpedoes / Battery: very fast
  kinetic darts, no blast, pierce), he (Blastcap Missiles / Battery, Torpedo Tube: slow, huge blast), emp (Ion Seekers /
  Battery / Ion Storm Silo: shield ×3.2, stalls systems), fire (Firebrand Missiles / Battery: blocks burn 6 s). Each has
  its own turret art, missile look, trail, burst (`fx.js boom wh`) and launch sound. `exotic` (emp, fire) are tier 3+,
  re-rolled 75% of the time near home in shops and drops (`loot.js pickPart`), and only on enemies of their tier.
- **Enemy missile volume** (#66): `shipgen MAX_LAUNCHERS` by class (1,1,2,2,3,4,3,5), bases `1 + tier/3`; enemy
  launchers reload at ×0.6 (`world.js ENEMY_MISSILE_RATE`), warn 0.8 s before a salvo (`lockwarn` event: red ring +
  lock tone; big ships also post "Missile lock: …"), keep at most `MISSILES_IN_FLIGHT[rank]` in the air, and all enemy
  missiles deal at most 30% of your full hull per 2.5 s (5% past that, ceiling 40%; `SALVO_SHARE`). Fixed a bug where
  burst weapons fired their whole count on every burst step (a swarm pod launched 57 missiles, rocket pods 13).
  Small enemies (skiff/corvette, not gnats) do ×1.2 damage, weave, lead their shots, call their pack in, and pull back
  to recharge shields (`ai.js`, `s.small`).
- **Missile defence**: Blast Screen / Array (bubble shield, explosions 35%, missiles ×0.6 on top — `shield.resist`),
  Decoy Launcher / Battery (`world.js launchDecoys`: flares that pull each chasing missile with 75-85% chance), plus the
  existing Flak Burster, Point-Defence Laser and Warden drone. Every outfitter stocks a Blast Screen, a Decoy launcher
  and one point-defence gun. Tests: `tests/playtest-1112-missiles.test.mjs`.

## Jobs, salvage, scans, planets (play-test #43-#50 / #56 / #63-#65, 2026-11-12)
- **Job markers** (#43/#46): `sim/missions.js missionTarget` answers "where now" by the job's STAGE — tow target →
  (once harpooned) the station / outpost that wants it; meet the freighter → the freighter; delivery / hand-over → the
  board's station or outpost (`boardBody`); anomaly survey → nearest unrecorded anomaly. `missionMarks` lists every
  job with a place; `ui/missions.js drawMarks` draws them LAST (on top): a reticle on screen, an edge arrow + km off
  screen, kept clear of the HUD boxes; the radar and local map draw a diamond in the job colour. A course set from a
  job (`app.waypoint.mission`) follows the stage every frame (`followCourse`) and toasts when it changes.
- **Tractor beam** (#48): a delivered tow is let go and pulled into the station (`pullIn` / `tractorTick`, 3.2 s;
  `b.shrink` / `b.fade` read by `render/draw.js`), beam drawn by `ui/missions.js drawTractors`.
- **Salvage yard** (#45): a lot is stripped on the spot; a result card says what went into which hold and what to do
  next. Rock (tier 0) is no longer in the salvage ore pool — it gave an endless pile and Infinity credits.
- **Honest scans** (#50): `sim/scan.js rockOre` reads the live cells (a node = at least 4 cells and 6% of the rock;
  two nodes = mixed), cached per grid version, so labels follow mining. `makeRock` tops a typed rock up to a node.
- **Planets** (#56/#63): planet ids repeat in every system and the jump frame drew the old world once after the cache
  was cleared, so a planet got the previous system's picture and tiles sampled at the old radius. `render/planets.js
  state()` now rebuilds unless it is the same planet object.
- **Claims removed** (#64): rich fields are rich, glowing asteroids you mine; old saves keep `G.claims`, unread.
- **Insurance** (#65): every station, den and friendly outpost; opens with the first dock.
- Tests: `tests/playtest-1112c.test.mjs`.

## Round 4 — ore, economy, combat feel, Screens deck (owner 2026-11-13)
Checklist: `~/claude/agent/voidwright-round4-checklist.md`. Tests: `tests/round4.test.mjs`.
- **Title screen**: the shared sign-in box was squeezed into a 440px left column because it carries the class `modal`
  and this game styles `.modal` as a card; `shared/rgs-signin.css` now resets `.rgs-signin.modal` (lessons rule 52).
  The tagline used `.tag` (the chip class) and drew a box — now `.tagline`. Title buttons share one look.
- **Ore stand-ins** (`sim/mats.js`, owner: "ferrite is nowhere in a danger 3 zone"): any ore of the same kind
  (structural / energy / exotic) and the same tier or higher pays one for one; rock pays only for rock. The exact ore
  goes first, then the cheapest stand-in; needs of a higher tier are paid first. EVERY charge goes through
  `planPay` / `payMats` — build mode (`ledNet` shows what will really be taken), outposts (`colony.js pay`),
  crafting, warp cores, grow hull — and cost chips count stand-ins (`haveFor`) with `SUBS_HINT` underneath.
  Outposts ask for the system's tier (`foundCost`), so a lower tier's ore never pays for a deeper outpost.
- **Economy** (`tools/econ.mjs` measures loot per pack, mining per minute, job pay and minutes to each next step):
  late loot was mostly ore from big wrecks (~460k a pack at danger 9; warp cores cost 3-6 minutes of fighting).
  Knobs: `loot.js LOOT_MAT_PILES / LOOT_MAT_SIZE / LOOT_PART_ROLLS`, `SELL_SHARE` 0.35 → 0.25 (shops pay a share of
  `listValue`, which is what they charge), `missions.js MISSION_PAY` = 1.6 × danger^1.5 (jobs were a sixth of
  fighting), `colony.js FOUND_CR` 5000 × tier factor, Ore site 120 / Trade post 800 a level, warp cores III/IV/V
  45k / 200k / 650k, the dearest ores come out in smaller lumps (`world.js dropOre`: tier III ÷1.3 … V ÷1.9).
- **Combat sims** (`tools/combat-sim.mjs`: the ship you are likely in at each danger vs every faction there, pack /
  big / gnats, a player-like pilot): the step into danger 5 was bigger hulls AND rarer gear at once (a frigate won
  every fight at 4 and none at 5); roaming packs grew to 4-6 big hulls. Now: packs are mostly 2 (`galaxy.js
  spawnGroup`, 4 only rarely past 8), enemy gear rare from danger 6 and epic from 9 (`shipgen.js itemFor`), `TIER_DMG`
  flattened at the top, no small-enemy damage boost at danger 1, and shipyard ships come fitted with parts as good
  as the shops at their tier sell (`PREMADE_RARITY`). Lattice ion missiles could chain-stun you forever — see
  the EMP guard below. Known sim limits: drone carriers (Falcon, Kestrel) fight without drones; at danger 1 the
  enemies barely shoot (0-18 damage a second) but the test pilot is slow to land hits on small ships, so the starter
  ships' sim win rate there understates real play. After the retune, pack wins: danger 5 destroyer 23-83%, 6-8
  70-100%, 9 battleship 16-36% (endgame), 10 dreadnought 86%.
- **Combat feel** (helper agent; `render/fx.js`, `draw.js`, `post.js`, `turret-art.js`, hit paths in `world.js`; tests
  `tests/knockback.test.mjs`): every weapon kind has its own muzzle flash (sized by hit size, mount and rarity),
  tracer/trail and impact (damage-type colour); rails leave an afterglow line + shock ring and tear through hulls;
  plasma scorches; lightning forks with afterglow; beams shimmer and drip; shield hits ripple round the bubble and
  never throw debris. **Knockback** (`world.js knock` / `knockDv`): damage × hit size × weapon kind × 8 ÷ mass, at most
  150 px/s a hit (85 on your ship), pooled over a short window, spin from off-centre hits, static bodies never move;
  blasts push everything outward; heavy guns recoil (≤ a tenth of top speed). **Smoke** cut ~95% (fewer, shorter,
  fainter puffs; flash + rings kept). Damaged blocks spark / burn, debris flies outward red-hot, shake fades with
  distance (Settings → Screen shake: Full / Gentle / Off, `app.fx.shakeMul`), heavy hits on you pulse the screen edges
  red. **EMP guard**: every EMP goes through `empHit`; after a stun ends you get `EMP_GUARD` 2.5 s in which an EMP only
  slows you (`EMP_GUARD_SHARE` 25%) — Lattice ion missiles used to chain-stun a ship's guns off for the whole fight.
- **Screens deck** (`ui/navmenu.js`, `css/navmenu.css`; owner: "a menu button … to navigate between cargo, ships,
  etc without looking like the settings menu"): a tile button beside ☰ drops a console of picture tiles — Ship
  (Cargo, Parts, Drones, Ships, Build, Upgrades, Fabricator), Space (Local map, Star map, Goals), People (Factions,
  Crew & finds) — with hotkeys and the open screen lit. Every ship screen's head has a **Screens** button
  (`main.js tagPanel`), so Cargo → Ships → Star map is two taps from anywhere; a hold tab just switches tabs
  (`app.nav.go`). The ☰ menu keeps Resume / Build / Settings / Save and one "Ship screens" line.

## Code map
No build step; ES modules. `index.html` → `js/main.js`.

| Folder | What |
|---|---|
| `js/core/` | `math.js` (seeded rng, noise, angles), `input.js` (keys/mouse, gamepad, two touch sticks → one input object), `audio.js` (a synthesized voice per weapon + the shared `sfx/` library for explosions/loot/UI; positional; beam/mining loops) |
| `js/data/` | Plain data: `types.js` (5 damage types × 3 hit sizes, 14 armour materials, 17 materials, 6 rarities), `weapons.js` (36 weapons/tools incl. 13 alien), `blocks.js` (≈150 blocks: structure in 1×1/2×2/4×4, modules, rock/ore cells), `hulls.js` (8 hull classes + 13 shipyard ships), `factions.js` (3 human + 4 alien), `drones.js` |
| `js/sim/` | The pure simulation (no DOM, no clock): `grid.js` (block grids, connectivity), `ship.js` (bodies, stats, damage, breaking apart), `world.js` (the step: flight, collisions, turrets, shots, beams, shields, splash, destruction, loot, drones, harpoon), `ai.js`, `shipgen.js` (procedural ships + stations from a seed), `galaxy.js` (galaxy, star traits, warp cores, system population, asteroids, outposts, encounter groups), `sectors.js` (big systems filled in as you fly), `loot.js`, `economy.js`, `quests.js`, `state.js` (the save), `rand.js` |
| `js/render/` | `planets.js` (procedural planets: lighting, air, clouds, rings, city lights, low-orbit tiles), `smooth.js` (draws moving things between sim steps — play-test #35), `post.js` (WebGL2: bloom, coloured light map, up to 16 shockwave ripples with colour split, vignette), `bake.js` (grid → hull picture with the cosmetic slope smoothing + a glow layer), `turret-art.js` (per-weapon turret drawings with recoil), `fx.js` (particles, lights, waves, shake; sim events → visuals), `draw.js` (the frame) |
| `js/ui/` | `dom.js` helpers, `station.js`, `build.js`, `galaxy.js` (star map), `localmap.js` (local system map), `hold.js`, `quests-ui.js`, `minimap.js`, `items.js` |

### Gotcha
- A station body's `kind` is always `'station'`; what sort it is lives in `stationKind` (`trade`/`pirate`/`hive`).
  Until 2026-11-11 `generateStation` passed `kind` in the makeBody options, which overwrote it — trade stations and
  hives were never treated as stations (their guns never ran, the reputation rules missed them).

### Key ideas
- **Everything is a block grid.** Ships, stations, ground bunkers, wrecks and asteroids share `makeBody(kind, grid)`.
  Shots ray-walk the grid (`rayHit`), splash damages the cells in a radius, collisions sample the smaller body's
  blocks against the bigger body's grid. When blocks die, `splitOff` breaks off anything no longer connected to the
  core into a tumbling wreck; a ship dies when its core goes or its hull drops below 25 % (12 % for the player).
- **Slopes are cosmetic** (ruling #5): `bake.js` cuts outside corners and fills inside corners at 45° on the
  picture only.
- **Armour maths** (`types.js armorDamage`): `max(10 %, dmg × (1 − resist[type]) − flat × sizeFactor)`; size factor is
  1 / 0.45 / 0.12 for light / medium / heavy hits, so plate stops machine guns but not capital shells.
- **Shields**: bubble (whole ship) or deflector (an arc facing the block's rotation), each its own pool with regen
  after a delay; lightning does ×1.6 to shields.
- **Scale**: block size per class (1, 2, 4), weapon DPS per cell grows with mount size, enemy damage scales with
  danger tier (`TIER_DMG` in shipgen). Stations are 70–140 cells across.
- **Determinism**: the sim draws randomness from `world.r` via `rand.js`; same seed + same inputs → same fight
  (tested), which keeps co-op possible later (ruling #19).

## Tools
- `node tools/smoke.mjs [system] [design]` — 30 s headless fight, prints step cost and event counts.
- `node tools/duel.mjs <design> <faction> <tier> <pack|big> <runs>` — balance check, a bot flies a shipyard design.
- `node tools/combat-sim.mjs [runs] [danger]` — the whole danger ladder: likely ship × every faction × pack/big/gnats.
- `node tools/econ.mjs [runs]` — loot per pack, mining and job pay per danger, minutes of play to each next step.
- `tools/shot.mjs` — Playwright screenshots: `STEPS="click:text=New game~~wait:300~~…" node prototypes/voidwright/tools/shot.mjs name`.

## Tests
`node --test prototypes/voidwright/tests/*.test.mjs` (rules: grids, premades fit CPU/power, scale ratio, armour,
loot, shields, determinism, mining, harpoon, destruction, galaxy, economy, quests; `playtest-1110.test.mjs` = one
test per play-test report 15-23) and
`npx playwright test prototypes/voidwright/tests/game.spec.js` (desktop + phone, zero console errors).


## Project history (moved from playground CLAUDE.md, 2026-11-11)

This was the table row for this folder in `playground/CLAUDE.md`, kept word for word when that file was cut down to a short index. Newer notes belong in this README, not in CLAUDE.md.

**Voidwright** (2026-11-06 →): 2D top-down space game — ships are grids of SQUARE blocks (slopes are a cosmetic smoothing pass in `js/render/bake.js`), arcade flight with the nose following travel, turrets with arcs, 41 weapons over 5 damage types × 3 hit sizes, bubble + deflector shields, 14 armour materials, mining asteroids cell by cell and planets from low orbit, harpoon tether, drones that fly ahead, 7 factions (3 human, 4 alien), a 46-star galaxy whose danger grows with distance, station shops (market with price memory, outfitter, shipyard, refinery, repair, crew, insurance, drones, research, salvage, bounties, black market), 8 hull classes up to a dreadnought ~100× the starter's mass, an 18-goal quest that drip-feeds features. Pure sim in `js/sim/` (seeded via `rand.js`), WebGL2 post pass (bloom, light map, shockwave ripples) in `js/render/post.js`. Read `README.md` + `docs/PLAN.md` §0 (owner's 20 rulings) first

**Status / key files:** playable 2026-11-06
