# Overdrive Frame — plan

Isometric co-op mech action in a neon city. You pilot a customizable mech (parts from four makers), boost and dodge
through City Kit streets, and blow up swarms by the hundreds alongside a rival company's army, elites and bosses.
Loot, crafting, firmware chips and maker licences drive progression. Independent project by Radley Sustaire.
Sandbox (playground prototype). Everything the owner said: `docs/OWNER-BRIEF.md`. Idea #3 of
`playground/docs/ideas-sprite-games.md`.

## §0 Owner rulings (2026-11-17 — these override anything below)

| System | Ruling |
|---|---|
| View | Arcline's iso angle, fixed. No view turning in v1; buildings in front of a mech fade see-through |
| Art | **Fully prerendered**: every mech part, enemy, building, wreck is a three.js model baked to sprites (City Kit baker). No live 3D in play |
| Player mech | Layered baked parts stacked at run time; legs face movement, upper body faces aim; paint = baked colour mask |
| Makers | 4 part makers, each with its own look (sleek, chunky, rounded, scrap-built) and design leaning |
| Slots | Head, core, arms, legs, booster, generator, cooling, CPU (fire control); 4 weapon slots (L/R arm, L/R shoulder) + hangar swap slot |
| Movement | Boost, quick boost, jump + hover, energy bar, **heat bar**, leg types (biped, reverse-joint, quad, treads, hover), weight. **No wall kick** |
| Aiming | Free aim (mouse / right stick) + homing weapons lock inside an aim circle + a sticky lock-on button |
| Weapons | Wide list (rifles, shotguns, lasers, blades, missiles, swarm pods, mortars, rail, flame, chain lightning, plasma, shields, deployables, drones, repair beam). Overload = a late "ultimate" part. Healing is a niche, never a required role |
| Upgrades | **Firmware chips** slotted into the CPU's capacity (e.g. two-handed weapon in one arm); **maker licences** from reputation. No pilot implants |
| Loot | Diablo-style rolled parts (Voidwright's roller), rarity Common → Refined → Rare → Prototype → Experimental, rare kept rare early. Each player own loot |
| Materials | **Simple**: Scrap / Alloy / Exotic + one boss material per chapter. Nothing else |
| Crafting | Base recipes known; more unlock by level/progress (shown locked); **secret recipes** hidden until learned (odd weapons, tweaked crafted versions) |
| Damage | Damage types + resistances, status effects, weak points, rounded damage numbers, **crit tiers past 100%** (late game) |
| Enemies v1 | Alien swarm (hundreds) + rival company army (tanks, artillery, gunships, enemy mechs, aces). Suicide units, burrowers, jammers: **sparingly** |
| Bosses | Occasional, part-breakable; no warning screen — a comms character mentions it |
| Missions | Variety: wipe out, defend, escort, demolition (structures), sabotage, convoy/train raid, extract, hunt, nest, **orbital drop**; optional objectives; chains |
| Length | Mostly 4–8 min; some 8–15 min built up to; a few 15+ min late game |
| Campaign | City map of districts held by enemies; story missions push in; contracts in reached districts; city recovers visibly |
| Modes | Campaign + contracts first. Arena / PvP simple, later. Endless + dailies later. Seasons on hold |
| Grades | S–D, affect rewards |
| Losing | Fail, keep picked-up loot, no pay; mech never lost; checkpoint in long missions |
| Co-op | Online rooms, own server, up to 4, drop in/out, revive, **always shared pay**, host's mission with each player's rewards at their own level, bots for solo |
| Hub | 3D-looking hangar you **walk your mech around**; shops/stations are bays; friends there too. Not menus |
| Story | In-world: comms characters (shown as their machine + callsign + waveform), dropship arrival/extraction, letters, news. No big centre text. Voice later |
| Places | Neon city first. Moon, station hull, space, ice, volcanic, desert, jungle: planned, minimal later |
| Main menu | Giant mech in a maintenance workshop: sparks, industrial features; forklifts, semi trucks and other everyday objects for scale (owner 2026-11-17) |
| Platform | Desktop + controller first; phone usable if possible |

## Rounds

Every round ends: tests green, `tests/walk.mjs` updated, README status block, What's new entry, live on
games.radgh.com (owner: always push live), checklist `~/claude/agent/overdrive-frame-checklist.md` ticked.

- **R0 — Kits.** City Kit: genre/game category filter (Arcline's = "neon"), damage stages (whole → cracked →
  burning → rubble) for buildings, swarm + army enemy recipes. New **Mech Kit** experiment (`mechkit/`): parts per
  maker and slot, layered bake (8/16 directions × anims: idle, walk, boost, jump, fire recoil, down), paint masks,
  dress-up page with stats, every combo stays aligned (tests). Workshop props for the title scene (forklift, semi truck, gantry crane, scaffolding, cable reels, tool carts, tiny crew figures).
- **R1 — One mission, solo.** City block map from City Kit, mech movement + energy + heat, free aim + locks,
  ~8 weapons, swarm with grid buckets, destruction, drop-in + extraction, damage numbers, grades. Sim written so the
  co-op server can run it unchanged. Title scene: the player's own mech on a maintenance lift in a huge workshop, baked from a low camera looking up, with live layers on top (welding sparks, hanging lights swaying, crane hook drifting, steam, a forklift crossing); menu along one side. ☰ menu, bug reports, What's new. **Goes live.**
- **R2 — Hangar.** Walkable hangar hub, parts dealer, workshop (recipes: known / locked / secret), loot with rolled
  bonuses + rarity, 3 materials, scrap, firmware chips, saved builds, test range, paint bay.
- **R3 — Campaign.** District map, contracts board, mission types, comms characters + dialogue, rival ace, first
  boss (part-breakable), orbital drop, chained missions, licences.
- **R4 — Co-op.** Own server, rooms + link/QR, drop in/out, revive, shared pay + level scaling, bots, ping markers.
- **R5 — Breadth.** Full weapon + enemy role lists, status effects, crit tiers, more bosses, long missions,
  checkpoints, simple arena/PvP, first taste of moon/space.
