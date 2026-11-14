# Hullforge — plan

## §0 Owner request and answers (2026-11-14) — these never change without asking

Request, verbatim: *"Create a new game similar to Voidright but in 3d. Build ships out of blocks sorta like minecraft.
Add corners automatically for both 1x1 and 1x2 style gaps and make weapon turrets look different and move around."*

| # | Question | Answer |
|---|---|---|
| 1 | How should it fly? | **Full 3D space (6 directions)** — not a flat plane |
| 2 | How big is the first version? | **Core loop, finished**: builder with auto corners, flying, turret combat with distinct animated turrets, mining, loot, a station to refit/upgrade, a few star systems with rising danger, saves. Trade/mercs/outposts later |
| 3 | Phones? | **"It does not need phone support"** — desktop: keyboard + mouse + controller |

## §1 Decisions Claude made (owner can overrule)
- **Mouse-aim flight**: the mouse moves a free aim direction; the ship turns its nose toward it at its turn rate; the
  camera sits behind along the aim. Q/E roll; the camera's up follows the ship's. Arcade flight assist (thrust asks for a
  velocity, thrusters get there).
- **Cubes only, 1 m each**; corners are cosmetic (same rule as Voidwright §0 #5). Bigger ships = more blocks, limited by
  the bridge's block limit (no 2×2 / 4×4 blocks in v1).
- **Thrusters work by facing**: pushes along each of the six directions come from the thrusters pointing the other way,
  plus 40% of all thrust as manoeuvring jets in every direction (so a ship is never stuck), so engine layout matters
  without being fiddly.
- **Every turret fires at the crosshair while Fire is held**; auto-aim for as many as the bridge + targeting computers
  allow (Voidwright E-ruling #26 carried over). Mining lasers are manual only.
- **Ship comes apart** at the bridge or at 30% of its full block health (so the health bar means something).
- **Death**: back at the station, ship rebuilt, ore lost, parts kept, 60% of a full repair charged (what you can pay).
- 14 systems, danger 1-6; a capital ship in danger 4+.

## §2 Built (2026-11-14) — see README.

## §3 Round 2 (owner 2026-11-14): "Implement the other features except for mercenaries for now. Ensure the graphics
are updated like we did in voidwright with multiple spiral beams for mining lasers and extra effects for everything else."
Built: everything that was parked here except mercenaries/wingmen — trade goods, drones, outposts + raids, crafting +
re-rolls, missions (jobs) + encounters, factions + standing, harpoon, scanning, insurance, research, 2×2×2 big blocks,
turret arc preview, saved blueprints — plus the Voidwright-style effects pass. Copy/paste of designs (optional) was not
built.

## §4 Parked
Mercenaries / wingmen (owner: "except for mercenaries for now"); copy/paste in the Shipyard.
