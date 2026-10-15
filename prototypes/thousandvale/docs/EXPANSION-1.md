# Expansion 1 — Vharlen, the Burning Isle (and Torbor Downs becomes an island)

Owner, 2026-10-14: *"Update the currently built world to be its own continent, ignoring the extra map area that is
still locked. Then add a new update that adds a new expansion, a higher difficulty zone with its own appearance,
biomes, and specialties. It should be its own content with a unique way to travel between the original."*
Standing direction (2026-10-07): a new region is **completely different** — new biomes, assets and themes, nothing
re-skinned from Torbor Downs.

This page is the spec. Every decision here is made; build to it. Change it here first if a decision has to move.

## 1. The world is now islands (done 2026-10-14)

`tools/lib/world-core.mjs` `CONTINENTS`: the pangea macro is the ground only **inside** a continent; everywhere else
the land sinks to the sea floor over ~1.1 km with a wandering coast (`baseGround`; the old ground is `mainland`).

| Continent | Province | Kind | World zones | Rule |
|---|---|---|---|---|
| Torbor | `torbor_downs` | `block` | x 11–14, y 1–4 (4×4) | the 16 baked zones are untouched (bit-exact); the coast is outside them |
| Vharlen | `vharlen` | `island` | x 11–13, y 9–11 (3×3) | the coast is INSIDE the block: a round island ~2.4 km radius, beaches you walk on, deep water to the block edge |

8 km of open sea separates them. The far horizon (`bake-horizon`) and the world map (`bake-map`, client map model)
show two islands and nothing "locked". The map model has `playables` (one per built province); outside them is
"Open sea". At the walkable edge of Torbor a toast says the land falls to the sea and ships sail from the harbours.

## 2. Vharlen at a glance

- **Levels 10–20** (Torbor is 1–10). Harder: monsters hit harder, packs are bigger, hazards hurt.
- **Look:** a young volcanic island. Black-sand and obsidian beaches, a steaming jungle on the wet (north/east) side,
  grey pumice and ash deserts on the lee (west/south), basalt-column highlands, sulphur flats, steaming mud fens and a
  central volcano with a caldera lake of hot water. Sky leans amber, the air is hazy, ash drifts.
- **People:** the **Vharl**, island folk who build stilted houses of dark basalt and red-ochre plaster with steep
  reed-thatch roofs (a NEW proctown culture `vharl`, not dwarf/human re-coloured).
- **Name rules:** no "ember", "veil", "muster", no WoW words (CLAUDE.md §9). "Cinder", "ash", "slag", "pumice" are fine.

## 3. Zones (sheet grid [x, y] → world zone)

| Grid | World | Id | Name | Biome mix | Band | Archetype | Settlement |
|---|---|---|---|---|---|---|---|
| [2,1] | z13_10 | `blackstrand` | **Blackstrand** — the landing | black-sand coast, jungle edge | 10–12 | coast | **Port Vharl** (hub town, harbour, the ship docks here) |
| [1,0] | z12_09 | `steamwood` | The Steamwood | steam jungle, hot springs | 11–13 | wilds | Mistfall (hamlet) |
| [2,0] | z13_09 | `sulphur_bight` | Sulphur Bight | yellow sulphur flats, acid pools | 12–14 | mine country | Yellowpan (village) |
| [2,2] | z13_11 | `fumarole_fen` | Fumarole Fen | steaming mud fen, vents | 13–15 | marsh | Stiltreach (stilt hamlet) |
| [0,0] | z11_09 | `glasswind_strand` | Glasswind Strand | obsidian dunes, glass beach | 13–15 | ruinfield | Shardhaven (hamlet) |
| [0,1] | z11_10 | `pumice_wastes` | The Pumice Wastes | grey ash desert, dead trees | 14–16 | frontier | Lastwell (fort-town) |
| [1,2] | z12_11 | `ashfall_hollow` | Ashfall Hollow | a valley buried in ash | 15–17 | blight | Cinderholt (half-buried village) |
| [0,2] | z11_11 | `kiln_ridge` | Kiln Ridge | basalt columns, high cliffs | 16–18 | pass | Kilnhold (fort) |
| [1,1] | z12_10 | `the_caldera` | The Caldera | volcano slopes, crater lake | 18–20 | holy ground (fire shrines) | Rim Shrine (hamlet) — world boss arena |

Start: `blackstrand`. World boss: **Ossathra, the Caldera Wyrm** (`world_ossathra`) in `the_caldera`.

## 4. Specialties (what only Vharlen has)

1. **Hot springs** (Steamwood, Caldera lake shore, Fumarole Fen): stand in one out of combat → *Steam-soaked* (fast
   health + mana regen while inside, +5% max health for 10 min after). Drawn as steaming pools.
2. **Geysers** (Steamwood, Fumarole Fen, Sulphur Bight): erupt every 15–25 s with a 2 s rumble warning (a telegraph).
   Standing on one when it erupts **throws you high and lets you drift down** (a traversal shortcut onto ledges);
   monsters on it are thrown and take a little damage.
3. **Lava vents and fissures** (Pumice Wastes, Kiln Ridge, Caldera): lines in the ground that glow, warn (telegraph,
   always visible), then spout fire. Real damage; fights near them are a dance.
4. **Ashfall weather** (Pumice Wastes, Ashfall Hollow): drifting ash, shorter sight; no rules effect beyond looks.
5. **New gathering** (tier 4–5 nodes, Vharlen only): obsidian (ore), sulphur (resin), steamcap (mushroom), ironpalm
   (wood), cinderbloom (herb), salamander hide (skinning). They feed the existing tier-4/5 recipes as alternates and
   one new recipe line each where it fits.
6. **The voyage** (§6) — the only way between the continents.

## 5. Monsters (Vharlen only — new names and new looks; stats borrow a Farhold bestiary block)

`data/monsters-tv.json` (new): `{ id, name, base: <bestiary id>, family, levels, look }`. The rules resolve `base`
for numbers (generalising `TYPE_ALIASES`); the client resolves `look` (same shape as `data/monster-looks.json`).

| id | Name | base stats | look idea |
|---|---|---|---|
| `scoria_crawler` | Scoria Crawler | ossuary_crawler | basalt-plated centipede, glowing seams |
| `ashback_salamander` | Ashback Salamander | mire_drake | low drake/crocodile, black with orange belly |
| `pumice_golem` | Pumice Golem | stone_sentinel | pale porous golem |
| `vent_wisp` | Vent Wisp | hollow_wraith | float plan, sulphur yellow |
| `glasswing` | Glasswing | ridge_griffin | obsidian-feathered griffin |
| `steamwood_prowler` | Steamwood Prowler | frost_stalker | jungle saber cat, mottled green |
| `sulphur_toad` | Sulphur Toad | fen_croaker | huge yellow toad |
| `obsidian_warden` | Obsidian Warden | shale_warden | glassy turtle |
| `mudback_lurker` | Mudback Lurker | silt_lurker | steaming mud crocodile |
| `slagborn_raider` | Slagborn Raider | road_brigand | islander raider (humanoid avatar, ash-grey kit) |
| `slagborn_firecaller` | Slagborn Firecaller | cult_zealot | caster raider |
| `slagborn_chief` | Slagborn Chief | brigand_captain | elite |
| `world_ossathra` | Ossathra, the Caldera Wyrm | (a boss block) | dragon plan, black scales, magma cracks |

Levels are scaled to the zone band (10–20) by the existing level curve.

## 6. The voyage (the way between)

- **Harbours:** Torbor's east coast harbour at **Gullwick** (`gullwick`, z14_02) and Vharlen's **Port Vharl**
  (`blackstrand`). A **Harbourmaster** NPC on a pier at each.
- **Rules** (`js/sim/ships.js`, modelled on `js/sim/carts.js`): talk to the Harbourmaster → fare (gold) → you are held
  for the voyage (~40 s), refunded if cut short → `moveTo` the other province at its dock. Party members can sail
  together. Waystones never cross the sea.
- **Client** (`js/client/ship-view.js`): not a fade — a real voyage across the real sea. A three-masted ship is
  drawn on the ocean between the two islands (both continents are on the horizon); you stand on its deck; the camera
  follows the ship as it leaves Torbor's coast, crosses open water (gulls, spray, a sea serpent breaching once at a
  distance) and the volcano of Vharlen rises ahead with its ash plume; it ends coming alongside Port Vharl's pier.
  Time is compressed (the ship covers ~10 km in ~40 s), skippable after 5 s.
- First voyage awards a journal entry and a quest step.

## 7. Content (per zone, the floor of PLAN §3.4)

Each zone: its settlement (planned with the `vharl` culture), 5–7 camps of the monsters above, a dungeon door
(family names in §8), a zone event, 1–2 rares, an elite, 4–6 quests from the zone's giver(s), harvest nodes, the
zone's specialty sites. A short province questline ("The Burning Isle", 5 steps) from Port Vharl to the Caldera.

## 8. Dungeons (new family names, Vharlen only)

`lava_tube` (Blackstrand: *The Brineglass Tubes*), `steam_grotto` (Steamwood: *Hissing Grotto*), `sulphur_mine`
(Sulphur Bight: *The Yellow Pits*), `drowned_vent` (Fumarole Fen), `glass_tomb` (Glasswind Strand: *Tomb of the
Glass Kings*), `buried_town` (Ashfall Hollow: *Under Cinderholt*), `kiln_forge` (Kiln Ridge: *The Old Kilns*),
`caldera_deep` (Caldera: *The Throat*). Levels follow the zone band.

## 9. Work split and ownership

| Stream | Owns | What |
|---|---|---|
| **T** terrain + look | `tools/lib/world-core.mjs` (profile), `tools/bake-*.mjs`, `data/world/*`, `data/zones/z1{1,2,3}_{09,10,11}`, `js/client/terrain-view.js`, `scatter-view.js`, `horizon-grid.js`, `proctown/` culture | volcanic island shaping + biome overrides, 9 zone bakes, Vharlen ground textures + scatter kinds, the `vharl` building culture |
| **P** multi-province | `server/`, `js/sim/` (not ships.js), `tools/content-*.mjs`, `data/provinces/*` generic splits, tests | every Torbor-only assumption made per province; Torbor outputs byte-identical |
| **V** voyage | `js/sim/ships.js`, `data/provinces/ships.json`, `js/client/ship-view.js`, `js/client/ui/ship-travel.js` (+ ≤10 hook lines in province.js / main.js) | §6 |
| **C** content | `data/provinces/vharlen*.json`, `data/quests/<vharlen zones>.json`, `data/monsters-tv.json`, names, encounters, specialties | §3–§5, §7–§8 (after T + P) |

Check after any re-bake: `content-professions -> content-towns -> content-givers -> content-hunts` (per province).
