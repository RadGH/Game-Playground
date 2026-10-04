# Fellreach — plan v1

**Status:** v1 draft, 2026-10-04. Design only — no game code yet. This page goes next to a roast, then an
independent review, then a refined final plan (checklist `~/claude/agent/mmo-checklist.md`).
Research behind every choice here: [`research.md`](research.md).

**One-line pitch.** A big open world you can walk across — hundreds of zones of towns, forts, farms,
dungeons, ruins and caves — shared online with up to a thousand other players, with Farhold's 30 classes,
skills, talents and loot.

---

## 0. Ground rules for this plan

**Owner must-keeps** (binding, from the checklist):
1. Classes, skills, talents and items like Farhold — reuse Farhold's data and rules modules.
2. Characters and elements from Farhold/Emberveil. No Skyrim or WoW names or IP; convention 9's banned list;
   no "ember", "veil" or "muster" in new names.
3. One huge world (no planets), **hundreds of zones**, each a full region: cities, towns, forts, farms,
   multi-tier dungeons, world boss events, rare enemies, hidden treasure, and more.
4. A real server; 100–1,000 players at once; parties; instances and copies to split load, **except shared
   hubs like towns**.
5. A public link anyone can open. One server (realm) for now. Must run on this VM first.
6. New models go into avatar-3d (or another experiment) and the library so Farhold and Bannerline can use them.

**Genre feel that must survive any roast or balance pass** (memory note *genre feel over paper balance*).
A later reviewer may NOT trade these away to make a spreadsheet tidier:
- **Go anywhere.** Nothing on the map is locked behind a level, a key or a quest. Danger is the only gate.
- **Something new every ~45 seconds of walking.** Density beats size.
- **Open every chest.** Loot is plentiful and personal; nobody can take your drop. No loot caps on the open world.
- **Dungeons are a full run with a reward room at the end**, every time, no lockouts on normal runs.
- **Kill it, take its stuff, sell it, buy better.** Gold is the only currency; everything except quest items trades.
- **Towns feel full.** Hubs are the last thing to be split into copies.
- **Your character feels powerful.** Farhold's big numbers, uniques and builds stay; we do not flatten them for PvP (there is no open PvP).

**What this plan takes from Wildmarch** (owner's earlier MMO bible, `prototypes/wildmarch/docs/`, not binding):
- Architecture: Node on a server + Postgres + Cloudflare in front; 20 Hz tick; AOI table; JSON-then-binary
  protocol; persistence rules (one writer, items move never copy, `SAVE_FIELDS` round-trip test)
  — `16-TECH.md` §4–§12.
- Layers / phasing / instance rules and party-first layer placement — `15-SOCIAL-ONLINE.md` §4–§5.
- 5-player focus; world bosses as the one open-group activity; Normal / Challenge + **Depth** dungeons.
- The owner's round-2 rulings as defaults: **no raids, no dailies/weeklies, no rested XP, no binding,
  gold only, personal loot**. (Raids are re-asked in §15, because the player count is now bigger.)
- Dungeon Finder only for dungeons you have discovered.
- **Not taken:** Wildmarch's always-daylight rule (an open-world RPG wants night — re-asked in §15),
  its 11 hand-written regions (we need hundreds, so they are generated + overlaid), its 60-level cap
  (Farhold's ladder already supports 50; see §5).

---

## 1. The name

**Fellreach** — *fell* (an old word for a high wild hill) + *reach* (a stretch of land). Plain, says
"big wild country", not used anywhere else in the playground, not a known game title we found, and avoids
ember/veil/muster. The continent is also called the Fellreach. Folder: `prototypes/thousandvale/`.

---

## 2. The world

### 2.1 Size and shape

| Number | Value | Why |
|---|---|---|
| Zone size | **1,024 m × 1,024 m** (~1 km²) | Walk across in ~3 minutes, ride in ~90 s. Big enough for a town, farms, a fort, a dungeon entrance and wilds; small enough to fill. |
| World grid | **24 × 18 cells = 432 cells**, of which **~300 are land zones**; the rest is sea, lakes and impassable peaks that give the coast and borders their shape | "Hundreds of zones"; ~300 km² is ~8× the map of the Elder Scrolls game the owner named — big, but only fun if every zone is dense (§2.4). |
| Provinces | **12 provinces of ~25 zones** each + **1 capital city zone** (the crown city, its own hub) | A province is the unit of authoring (§2.3) and of server processes (§9). |
| Levels | **1–50** (Farhold's default ladder, `rpg.js` `MAX_LEVEL` 50) | Each province spans a band ~6–8 levels wide and overlaps its neighbours; within a province, zones step up by hops from its gateway (Farhold `zones.js` `buildZones`). |
| Start | 3 starting provinces at level 1–8 on different coasts (owner picks which to open first) | Spreads new players so no single zone is a crowd. |

### 2.2 How the land is made (the bake)

1. **World bake** (`tools/bake-world.mjs`, once per world seed): World Forge (`worldgen/`) generates the
   continent at 24×18 macro resolution — height, rainfall, biomes, rivers, coast — then the province
   borders (cheapest-path regions, as worldgen already does), roads between settlements (A*), and a
   **zone graph**: which zones touch, where the passes are, where water blocks a crossing. Output:
   `data/world/world.json` (≈ 300 zone records), checked into git so everyone sees the same world.
2. **Zone bake** (`tools/bake-zone.mjs <zoneId>`): from the zone's record + its province sheet + the seed,
   produce a **513 × 513 heightmap at 2 m spacing** (`height.u16`, ~0.5 MB), `surface.u8` (grass, dirt, rock,
   sand, snow, road, mud, farmland), `nav.u8` (walkable, slope class, water, road) and `placements.json`
   (every town, building, dungeon door, chest, spawn, rare, node). Edges are made by sampling the *world*
   heightfield across the border, so two neighbouring zones meet exactly (assert it in a test — the Farhold
   water-staircase lesson: drawn and measured geometry must be the same numbers).
3. **One heightmap, read by everything**: client terrain mesh, grass, scatter, water, the server's movement
   check and the monsters' pathing all read the same baked file (highdef-3d rule).
4. Baked files are cached and versioned by a hash of their inputs; a changed province sheet re-bakes only
   that province.

### 2.3 How 300 zones stay distinct (authored overlays)

Three layers of authoring, from big to small:

| Layer | How many | Written by | Holds |
|---|---|---|---|
| **Province sheet** `data/provinces/<id>.json` | 12 (+ capital) | hand (agents + owner), ~1 page each | name, culture (proctown's 7 cultures, extended), palette/sky/weather mix, level band, capital town, 1 main questline (5–8 steps across the province), 1 world boss + arena zone, 6–10 named rares, 3–6 **landmark set pieces** with fixed positions, holding factions + warband, music/ambience set, enemy family weights |
| **Zone hook** `data/hooks.json` | ~150 hooks, one per zone | hand-written library; assigned by the bake with "never twice in a province, never within 6 zones of itself" | the one memorable thing in a zone: a giant's ribcage you walk through, a red lake, a town on a bridge, a sunken bell tower, a stone circle that hums at night, a burning forest, a petrified army… Each hook is a small data recipe: props + one encounter + one note/lore line + optional quest |
| **Zone recipe** (generated) | ~300 | the bake, from budgets (§2.4) | everything else: towns, farms, forts, caves, ruins, camps, chests, rares' spawn points, radiant job anchors |

Names come from Name Forge (`namegen/`) per province culture, so zones, towns and rares sound like the
province they are in. Lore lines come from Lingo/Item Vault.

**Sameness tests** (fail the bake): a zone fingerprint (counts of each feature, biome mix, hook, palette)
must differ from every neighbour by a threshold; the longest walk with no point of interest in sight must be
under ~250 m; a reachability bot walks from the zone's entry to every point of interest (Lanternfall's
`room-check` pattern).

### 2.4 What every zone contains (budgets)

| Feature | Per zone | Made by (reuse) | Notes |
|---|---|---|---|
| Settlement **or** fort | 1 (hamlet/village/town); ~1 in 5 zones has a **fort** instead | `proctown/` (7 cultures, one connected street network), Farhold `town-plan.js`, `sites.js` strongholds | Towns have the Farhold roles: smith, merchant, elder, inn, healer, Unbinder, broker. Province capitals are cities (proctown's largest size). |
| **Farms** | 2–5 around each settlement | **new**: farm plot generator in `proctown/` (fields, barn, fences, scarecrow, animals) | Farm animals already exist as creatures (sheep, hen, pig, cow, scarecrow). Farms carry radiant jobs (wolves in the pasture, a missing farmhand). |
| **Dungeon** (multi-tier, instanced) | 1 every ~2 zones (~150 total) | Farhold `dungeon-plan.js` + `data/instances.json` (20 types) | Tiers = floors; each floor +2 levels and a mini-boss, last floor the boss + reward room + loop-back exit. 2–4 floors normally. Endgame **Depth** dial (§6.4). |
| **Caves / small burrows** | 1–2 | dungeon-plan, single floor, open-world (not instanced) | 3–5 minute places with a chest and a note. |
| **Ruins, camps, shrines, wrecks** | 3–6 | Farhold `encounters.js` (11), `eventprops.js` (22 events), territory landmarks | Points of interest that fill the "something every 45 s" rule. |
| **Hidden treasure** | 1 chain per zone | **new** `treasure.js` | A torn map / riddle note found in the zone points to a buried cache (dig with a tool) or a hidden chest; some chains cross 2–3 zones. Per-character, so everyone can find it. |
| **Rare enemies** | 2 | Farhold champions/rares + `named-enemies.json` | Named, long respawn (20–60 min) per zone copy, roams a path, announced in zone chat when it spawns. Guaranteed good drop. |
| **World boss** | 1 per province (in its arena zone) | Farhold `data/worldbosses.json` (9) + warlords | Scheduled event (§6.3). |
| **Roads, bridges, signposts** | the network | Farhold `roadplan.js`, `road-fold.js`, `bridge-plan.js`, `roadside.js` | Signposts name the next town down each branch (R27). |
| **Harvest nodes** | many | Farhold tools/harvest | Per-character nodes, so nobody steals your ore. |
| **Radiant jobs** | live | Farhold `jobgen.js` (22 frames) | Add the rule "prefer a place you have not discovered". |

Rough totals for the world: ~300 settlements/forts, ~900 farms, ~150 multi-tier dungeons, ~450 caves,
~1,350 ruins/camps, ~300 treasure chains, ~600 rares, 12 world bosses.

### 2.5 How zones connect

- **Inside a province: seamless.** You walk across a zone edge with no loading screen. The client streams the
  next zone's terrain when you are within 200 m of an edge; on the server, all zones of a province live in one
  process and an entity within 150 m of an edge is mirrored into the neighbour as a read-only "ghost" so
  players on both sides see each other. Crossing hands the entity to the neighbour room (just moving an
  object inside one process).
- **Between provinces: a pass, a bridge or a ferry**, with a short fade (~1–2 s) when the provinces are in
  different processes. Placed where geography already gives a choke point.
- **Instances (dungeons, story scenes): a door** with a loading fade.
- **Fast travel**: discovered **waystones** (one per settlement), carts/boats on fixed routes between towns
  (Wildmarch's "Travel Methods" idea), a recall stone. Fast travel costs a little gold (a gold sink, §8).

### 2.6 Splitting the load: copies, instances, phasing

| Place | Rule |
|---|---|
| Open zone | One shared copy until **80 players** (soft cap) → a second copy opens; hard cap 100. Copies merge when quiet (both < 40% for 5 min). |
| Towns and the capital | Part of their zone, but the zone's cap rises to **250** while the player is inside a town's bounds; the capital zone is **400**. Towns are the last thing split. |
| Starter zones | Lower caps (60/75) to keep quest monsters from being over-camped. |
| World boss zone during the event | Cap 160; copies merge before the boss spawns where possible. |
| Dungeons | Always an instance per party (1–5). |
| Party rule | Party members always go into the leader's copy (out of combat, 3 s fade). Guild then friends then fullest copy for lone players. Copy hopping limited to once per 60 s, never in combat. |
| Phasing | Quest outcomes you caused (a cleared fort flies your banner, a burned farm) are per-character flags; at most 8 phase flags per zone. |
| Per-character | Chests, harvest nodes, treasure chains, discovery — all per-character, so a crowd never "uses up" a zone. |

---

## 3. Classes, skills, talents, items (reused from Farhold)

Reuse as data + pure modules (verified importable in Node, `research.md` §7): 30 classes, 180 skills with 4
talent tiers each and the `skillmech.js` rule language, 47 statuses, the 203-node perk forest, affixes with
units/caps/tiers, 189 uniques + 36 Emberveil uniques + 54 sets, weapons-as-patterns, followers.

**What changes for multiplayer:**

| Area | Change |
|---|---|
| Authority | All maths runs on the server (`rpg.strike`, skillmech, effects). The client runs the same modules only to predict its own cooldowns/resources and draw tooltips. |
| Healing and buffs | Farhold healed mostly yourself. Add **ally targeting** to every heal/shield/buff skill and the talents that touch them (an audit list in M2), plus revive on allies (Farhold R20 revives are already a rule). |
| Threat | Monsters get a **threat table** and taunt (Farhold R22 added companion targeting; extend to players): damage and healing make threat, tank skills multiply it. |
| Party roles | Each class keeps Farhold's role; the group finder reads role + the hybrid-role list from Wildmarch where it fits. |
| Followers | Allowed for solo/small groups in the open world and Normal dungeons; a follower takes a party slot; none in Challenge/Depth. |
| PvP | None in the open world. Duels later (Wildmarch W-rulings). So damage numbers never need PvP flattening. |
| Pure-client feel | Hit-stop, screen shake, stagger visuals (`combat-feel.js`) stay client-side and cosmetic. Knockback on monsters is server-side. |
| Item rolls | Server-seeded per drop; items get a unique `uid` (§10). Farhold's shared-file rule stays: anything only Fellreach understands is injected at load, never written into `emberveil/data/items.json`. |
| Level cap | 50 (ladder exists). If the world wants more room, Farhold's `setLevelCap` already supports 100. |

---

## 4. Combat over the network

**Model: Farhold's action combat with a soft target.** Melee is Farhold's three-part swing (wind-up /
damage / recovery) with `arc`/`slam`/`lunge`/`pierce` shapes; bows draw; staves charge; monsters telegraph
on the ground. Add **Tab targeting** for spells that need a target (heals, single-target bolts) — the owner
accepted Tab targeting in Wildmarch.

| Concern | Rule |
|---|---|
| Who decides a hit | The server. The client sends `cast {slot, aim, target?, clientTime}`. |
| Lag | The server rewinds other entities to the client's view (≤ 200 ms) to test melee shapes and skillshots. Monster telegraphs resolve on server time; the client draws them against the synced clock. |
| Feel | The client plays the swing/cast animation and effect at once (prediction) and shows damage numbers when the server answers (~50–150 ms later). Hit-stop waits for the answer. |
| Your movement | Predicted locally, corrected by the server with replay (no rubber-banding on good connections). |
| Others | Drawn 100 ms in the past, interpolated. |
| Dodge | Server grants the invulnerable window; the client plays the roll at once. |
| Monster AI | Server only. AI far from any player sleeps; near players thinks every tick; under load, every 2nd tick (never the movement). |
| Kill-stealing | Personal loot + shared tagging: everyone who did meaningful damage (or healed someone who did) gets credit and their own loot roll. Party members share credit. |

---

## 5. Progression and endgame

- **Levels 1–50** with Farhold's XP curve; kill XP falls off for grey monsters (`killXpFor`); quests and
  discovery pay well (exploration should level you — Elder Scrolls feel). Discovering a new place pays XP.
- **Unlock ladder** (borrowed shape from Wildmarch, numbers re-cut for 50): sprint 2, dodge 5, group finder 8,
  mount 10, talents 3/8/18/28 (Farhold R22), second loadout 25.
- **Perk forest** and **per-skill talents** as in Farhold; the Unbinder retrains for gold.
- **Faction standing**: 12 factions (Farhold `territory.js`), each with a short authored questline and a
  quartermaster.
- **Endgame at 50**: (1) **Depth** — any cleared dungeon can be re-entered at Depth 1–∞, each depth harder
  with new affixes every 5 (Wildmarch / Emberveil "Infinite Depths"); (2) **world bosses** in every province;
  (3) **Challenge** mode dungeons; (4) **unique and set hunting** (each rare and world boss has a short
  signature loot table); (5) **zone war grip** — warbands hold zones and the server-wide community pushes
  them back (Farhold R27 `warGrip`, shared per zone); (6) **collections**: bestiary, map discovery %, treasure
  chains found, uniques found.

---

## 6. Groups and events

### 6.1 Parties
Up to 5. Shared copy, shared quest credit, personal loot, party frames with health/mana, party chat, ready
check, follow. Level sync ("walk with me") so a level-40 can play with a friend at 12 — optional (§15).

### 6.2 Group finder
Queue for any **discovered** dungeon by role; fills with players, then (Normal only) followers if the queue is
slow. One realm, so no cross-realm matching yet.

### 6.3 World events
- **World bosses**: one per province, every ~2–3 hours on a schedule plus a random offset; a warning 10 min
  before in zone and province chat and on the map; anyone can join; credit per contribution; personal loot.
- **Town attacks**: occasionally a warband or a dragon-kind creature attacks a settlement (Elder Scrolls
  dragon-attack feel); the town's guards fight; players nearby join.
- **Zone events**: Farhold's 22 events (caravans, rescues, sieges) run per copy.

### 6.4 Raids
Not planned (Wildmarch ruling). Asked again in §15 because the target player count is now higher.

---

## 7. Social
Chat channels (say 30 m, yell 150 m, zone, province, party, guild, whisper, trade in cities), friends and
ignore, guilds (roster, ranks, chat, message of the day; bank later), emotes (Chibi 2 emote clips), mail,
trade window, market (§8). Names filtered; rate limits; report button.

---

## 8. Economy
- **Gold only.** Monsters drop gold and items; vendors buy items at a fraction of their price.
- **Faucets** (gold in): drops, vendor sales, quest rewards. **Sinks** (gold out): fast travel fares,
  retraining (Unbinder), crafting fees, market listing fee + sale tax (5% + 5%), mounts, cosmetics (dyes,
  mount looks), guild founding, follower hire. **No repair bills** (they ration play).
- **Crafting**: Farhold's salvage-to-craft bench (`craft.js`) + harvesting; per-character nodes.
- **Market hall** in the capital and province capitals (one shared market listing, picked up anywhere
  in a capital). Trade window and mail for direct trades.
- **Anti-inflation basics**: the server logs every faucet and sink per hour; a dashboard shows gold created
  vs destroyed per level band; sinks are tuned, not drops. Items carry a `uid` and move in one transaction
  (§10), so duplication bugs can't create items from nothing.

---

## 9. Server architecture

### 9.1 Process layout

```
 Browser ──https──► static client (index.html, js/, data/, baked zones)   ← served by the game server itself
         ──wss────► Game server (Node 22 + ws)
                      ├─ gateway: login, character select, routing, version check
                      ├─ world: province processes (worker_threads), each holding its zone rooms + copies
                      │          (20 Hz; empty zones sleep; AI budgeted)
                      ├─ instances: dungeon rooms, created on entry, closed 30 min after empty
                      ├─ services: chat, party, guild, market, mail, group finder, world-event scheduler
                      └─ save queue ──► Postgres (characters, items, mail, market, guilds, world deltas, economy log)
```

- **Stage 1 (M1–M2)**: everything in **one Node process**.
- **Stage 2 (M4)**: one `worker_thread` per group of provinces; the gateway and services stay in the main
  thread; messages between them are structured-clone posts. A province move is a save-and-hand-off.
- **Stage 3 (later)**: separate processes / machines per province group behind the gateway, with Redis or
  Postgres LISTEN/NOTIFY as the bus. Not needed for one realm of 1,000 if Stage 2 holds — the load tests decide.

### 9.2 Code layout (no build step)

```
prototypes/thousandvale/
  index.html, css/, js/client/**        ← browser only (Three.js, UI, audio, prediction)
  js/rules/**                           ← pure, shared by server and client (wraps Farhold/Emberveil modules)
  js/net/**                             ← protocol table, transports (WebSocket + loopback), clock
  server/**                             ← Node only (ws, pg): gateway, rooms, AOI, persistence, services
  tools/bake-world.mjs, bake-zone.mjs, bot-client.mjs, sim-*.mjs
  data/world/, data/provinces/, data/hooks.json, data/zones/<id>/ (baked, cached)
  tests/ (node + Playwright + load)
```

`js/rules/**` follows Bannerline's purity test: no `three`, `document`, `window`, `localStorage`, `fetch`,
`Date.now` or `Math.random` (seeded streams from Bannerline `rng.js`). Server npm dependencies (`ws`, `pg`)
live in `server/package.json`, never imported by shared code.

### 9.3 Numbers

Tick 20 Hz. Snapshots 20/10/4 Hz by distance. AOI on 32 m cells: players 150 m, monsters 110 m, cap 150
entities per client. Interpolation 100 ms. JSON protocol first; binary snapshots (~21 bytes per entity) by
M2. Budgets: ≤ 8 KB/s average, ≤ 24 KB/s town, ≤ 48 KB/s world boss per client; tick ≤ 30 ms of 50 at peak.

### 9.4 Accounts and sign-in
Guest play in M1 (a name + a token in the browser). M3: our own accounts (username + password hashed with
Node's built-in `scrypt`, a session token) so local and production are identical; Supabase Auth or a Google
sign-in can be added later without changing the game server's check.

### 9.5 Hosting decision and migration path

| Step | Where | Public? | Cost |
|---|---|---|---|
| 1. Develop (M1–M2) | **This VM**: `node server/main.mjs` on **port 8490** (dev, live tree) and **8491** (stable worktree). Postgres installed with apt (local). | LAN: `http://192.168.1.34:8490/` | $0 |
| 2. First public link (M3) | **This VM + Cloudflare Tunnel** (`cloudflared`) → `https://play.<domain>` forwarding to 8491 | Yes | $0 + a domain |
| 3. Real playtest (M4–M5) | **One VPS** (4 vCPU / 8 GB, ~$48–100/mo depending on provider and 2026 prices) running the same `node` + Postgres (or Supabase Pro $25 as the database), Cloudflare DNS/proxy in front; deploy by `git pull` + a systemd service (a GitHub Action later) | Yes | ~$50–125/mo at 1,000 peak |
| 4. If it grows | More province processes, then a second machine; or Cloudflare Containers | Yes | as needed |

Why not Cloudflare Durable Objects / Vercel / Supabase / Cloudways as the game server: `research.md` §6.
Docker is not installed on this VM; plain `node` + systemd is enough. A Dockerfile is optional and only
needed for step 4 if we choose Containers.

---

## 10. Persistence

Postgres tables: `accounts`, `characters` (key columns + versioned JSON blob, `session_lock` + heartbeat),
`items` (one row per item that left a character's pack: market, mail, trade escrow, guild bank — `uid`
unique, `owner`), `mail`, `market_listings`, `guilds`, `guild_members`, `world_state` (zone deltas: war grip,
cleared strongholds, boss timers), `economy_log`. Rules from Wildmarch `16-TECH.md` §12: one writer per
character; save every 60 s if dirty, on zone change, logout, and important events; items move in one
transaction; a `SAVE_FIELDS` table that both snapshot and restore loop over, with a test that touches every
field and round-trips it (Farhold lost `world`, `quests`, `skillTalents`… to missing save fields).

---

## 11. Client

Three.js (vendored), **Chibi 2** characters (Chibi 3 stays shelved until the owner's verdict), creature
bodies merged per Farhold `mesh-merge.js`. LOD: nearest ~30 players at full detail, the rest LOD 1, beyond
that instanced stand-ins with nameplates. Terrain: per-zone baked heightmap meshed in rings around the camera
(Farhold `terrain.js` pattern) + streaming of neighbour zones near an edge. Graphics options from Farhold
R23 (`graphics.js`, bloom, light shafts, sky palettes, GPU grass/rain) behind a setting. UI: Farhold's sheet,
tooltips, `hud.itemCard`, plus party frames, chat, map with fog of discovery. Sound: `sfx/`; voices:
formant (`shared/voices.js`). Budgets as Wildmarch `16-TECH.md` §17.

---

## 12. Content pipeline

1. Bake world → `data/world/world.json` (git).
2. Write province sheets (12) and the hook library (~150) — agent work with owner review.
3. Bake zones (cached, deterministic) → `data/zones/<id>/`.
4. Checks: sameness fingerprint, longest boring walk, reachability bot, banned-names test (convention 9 list +
   ember/veil/muster), every placement binds to real data, every build cost obtainable (Farhold R13 rule).
5. Library export: every new enemy/NPC look is filed in `library/` so other games can read it.

---

## 13. New models needed (into avatar-3d / proctown / library — usable by Farhold and Bannerline)

| Need | Where it goes | Notes |
|---|---|---|
| **Farm kit**: barn, haystack, crop rows (wheat, cabbage, vines), fences, windmill, well, silo, scarecrow | `proctown/js/buildkit.js` + `drawkit.js` parts; `proctown` farm-plot generator | Farm animals exist already (sheep, hen, pig, cow). |
| **Fort kit**: palisade fort, stone keep, gatehouse, watchtower, barracks | proctown buildkit (Farhold R27 wall kinds are a start) | |
| **Townsfolk outfits**: farmer, innkeeper, smith, guard tabards per province, noble, beggar, miner | `avatar-3d/data/class-outfits.json` style file `npc-outfits.json` + new part ids in `avatar-2d/js/parts/chibi2-parts.js` (or the shared normaliser drops them) | |
| **Player races**: human, elf, dwarf, halfling (Farhold body presets) — orc/goblin playable is a question (§15) | `avatar-3d/js/chibi2-races.js` (exists) | |
| **New monsters** (original names, generic myth only): hill brute (big club-wielder), harpy-like "shriekwing", wyvern, ogre, barkwalker (walking tree), basilisk, river serpent, bog lurker, stone sentinel, carrion beetle swarm | `avatar-3d/js/creature-types.js` + `creature-variants.json` (body plans exist: quad, biped, snake, bat, float) | Each filed in `library/` as `enemy_<id>`. |
| **World boss bodies** (12): reuse dragon/titan/bone colossus where possible; 3–4 new | avatar-3d | |
| **Mounts**: horse/pony/courser/elk exist; add a few looks (barding, saddles) | avatar-3d | |
| **Dungeon dressing** per province culture | Farhold `dungeon-plan.js` `DUNGEON_LOOKS` (11) + new | |

Every new part id is registered in `chibi2-parts.js`; every new creature in `creature-types.js` (which has no
Three.js, so node tests and Farhold/Bannerline read it); a node test checks the library has an entry for each.

---

## 14. Testing

| Kind | What |
|---|---|
| Node unit | `js/rules/` purity (Bannerline pattern); protocol table (every sent type known, fields checked); `SAVE_FIELDS` round-trip; zone edge heights agree; AOI grid correctness; item move transaction (two concurrent moves → exactly one wins); bake determinism (same seed → same bytes). |
| Playwright (against 8490) | Two browser contexts log in, see each other, party up, enter the same dungeon instance; desktop + mobile viewport for menus. |
| Headless sim | `tools/sim-fellreach.mjs`: bots level 1–50 with real rules — time to level, deaths, gold per hour, damage share by skill (flag any skill > 2× class average). |
| **Load tests** | `tools/bot-client.mjs` opens N real WebSocket clients that log in, walk, fight, chat, party and enter instances. **100 bots** (M2 gate): tick ≤ 20 ms, ≤ 8 KB/s each. **1,000 bots** (M4 gate) on this VM's 12 cores split as server vs bot machine: tick ≤ 30 ms at peak, memory, DB writes ≤ 50/s, reconnect storm (all 1,000 drop and rejoin). |
| Chaos | Kill the server mid-trade → no item lost or doubled; network loss/jitter via the loopback transport. |

---

## 15. Open questions for the owner (with my recommendation)

1. **Raids?** Wildmarch said no. With 1,000 players, a 10-player raid becomes possible. *Recommend:* still no
   for v1; world bosses are the big-group content. Revisit after the 1,000-bot test.
2. **Day and night?** Wildmarch had always-daylight. *Recommend:* a day/night cycle (an Elder Scrolls feel,
   and Farhold already has torches and night spawns), ~2 hours per day.
3. **Seamless province borders?** *Recommend:* seamless inside a province, a short fade between provinces.
4. **Playable races** beyond human/elf/dwarf/halfling (orc, goblin)? *Recommend:* the four for v1; others stay
   warband enemies (Farhold R26).
5. **Level cap 50 or 100?** *Recommend:* 50.
6. **Housing?** *Recommend:* parked (wishlist).
7. **Stealth / lockpicking / pickpocketing?** *Recommend:* lockpicking chests only (single-player-safe); no
   pickpocketing.
8. **Level sync with friends?** *Recommend:* yes, down-sync only.
9. **Which starting province(s)** open first? *Recommend:* one in M1–M3, three by M4.
10. **Hosting step 3 provider**: DigitalOcean (owner's Cloudways already runs on it) vs Hetzner (cheaper,
    availability patchy in 2026). *Recommend:* DigitalOcean droplet, decided at M4 with current prices.
11. **Domain** for the public link (a subdomain of radleysustaire.com or zingmap.com?).

---

## 16. Milestones (vertical slices)

Each milestone is playable on this VM at the end, with tests green, before the next starts.

| M | Slice | Done when |
|---|---|---|
| **M1 — One zone, together** | Node server on 8490 serving the client + `wss`; guest login; **one baked zone** (heightmap from World Forge) with **one town** (proctown), wilds with 3 monster families + 1 rare, **one 2-floor dungeon instance**; 4 classes playable end to end (one per role + one caster) using the real skill/talent/item modules; personal loot; party of 2–5 that enters the same instance; Postgres save/load of position, level, inventory | **Two browsers on two machines on the LAN** see each other move, fight together, party, clear the dungeon together, log out and back in with their loot. 20 bots in the zone with tick < 10 ms. |
| **M2 — One province** | 25-zone province, seamless edges with ghosts, copies at the cap, AOI grid, binary snapshots, all 30 classes, farms, forts, caves, ruins, hidden treasure, rares with timers, radiant jobs, waystones, Tab targeting + threat + ally heals | 100 bots across the province, ≤ 20 ms tick, ≤ 8 KB/s each; sameness + reachability tests pass for all 25 zones. |
| **M3 — Social + public** | Accounts, chat channels, friends, guilds, mail, trade, market hall; group finder; one world boss event; day/night; Cloudflare Tunnel public link | The owner sends a public link; strangers can join; 300 bots + real players together. |
| **M4 — The whole Fellreach** | All 12 provinces (sheets + hooks), ~300 zones baked, travel network (carts/boats), worker-thread per province group, 3 starting provinces | 1,000 bots across the world, ≤ 30 ms tick; reconnect storm passes. |
| **M5 — Endgame + VPS** | Depth, Challenge mode, world bosses everywhere, war grip, crafting/harvesting, collections, economy dashboard; deploy to one VPS with backups and an admin page | A full 1–50 bot run; a week-long public test on the VPS. |
| **M6 — Polish** | Graphics options, sound, voices, music per province, onboarding, settings, accessibility | Owner's play-test list cleared. |

---

## 17. Parallel workstreams and file ownership

One owner per folder, so agents never edit the same file at once. Shared files (marked ★) change only through
their owner.

| Stream | Owns | First job (M1) |
|---|---|---|
| **A. Server core** | `server/**`, `js/net/**` ★ protocol table | gateway, zone room + 20 Hz loop, AOI, instance rooms, save queue, Postgres schema |
| **B. World bake** | `tools/bake-world.mjs`, `tools/bake-zone.mjs`, `data/world/**`, `data/zones/**`, `js/rules/terrain-read.js` ★ | bake one zone from World Forge + one proctown town + one dungeon placement; edge-agreement test |
| **C. Rules port** | `js/rules/**` ★ (adapters over Farhold/Emberveil modules; never edits Farhold files) | server-side `cast`/`strike`/loot/XP for 4 classes; threat table; purity test |
| **D. Client** | `index.html`, `css/**`, `js/client/**` | connect, predict, interpolate, draw zone + Chibi 2 actors + monsters + dungeon; HUD, sheet, party frames |
| **E. Content** | `data/provinces/**`, `data/hooks.json`, `data/quests/**`, `data/names/**` | the first province sheet + 30 hooks + the M1 zone's quests |
| **F. Models** | new files in `avatar-3d/js/`, `avatar-3d/data/npc-outfits.json`, `proctown/js/` farm/fort kit (coordinate with proctown owner), `library/data/defaults.json` (append only) | farm kit, townsfolk outfits, 2 new monsters, library entries |
| **G. Tests + load** | `tests/**`, `tools/bot-client.mjs`, `tools/sim-fellreach.mjs` | 2-browser Playwright spec, 20-bot load test, purity + protocol tests |

Rule for all streams: Farhold, Emberveil, avatar-3d and proctown are **shared** with live games. Never change
their behaviour; add new files or opt-in options, and run their test suites after touching anything.
