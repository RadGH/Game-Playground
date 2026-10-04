# Fellreach — research notes (step 1)

**Status:** 2026-10-04, design phase. Claude-facing. Third-party game and company names are allowed on this
page only (playground convention 9). Nothing here is player-facing.

Prices were checked on 2026-10-04 and **moved a lot this year** (server hardware costs rose industry-wide;
Hetzner raised cloud prices twice in 2026). Re-check before buying anything.

Contents
1. What makes a big open-world RPG fun (Elder Scrolls-style)
2. What makes a fantasy MMO fun (WoW-style)
3. The tension between the two, and how to keep both
4. Browser MMO architecture for 100–1,000 players
5. Procedural vs hand-authored for hundreds of zones
6. Hosting options (cost at 100 and 1,000 players, limits, local parity)
7. What already exists in the playground (verified)
8. Sources

---

## 1. What makes a big open-world RPG fun

The Elder Scrolls games (Skyrim most of all) are loved for a handful of things. None of them is a number.

| Thing | What it means in practice | What it means for us |
|---|---|---|
| **"See that mountain? You can climb it."** | Anything on the horizon is reachable. No invisible walls except the world's edge. | Zones are open terrain, not corridors. Cliffs slow you, they do not wall you off (Farhold R27 already has a 3 s escape climb). |
| **Density of discovery** | Skyrim's map is small (~37 km²) but packed: you rarely walk 60–90 seconds without a new point of interest (a cave, a camp, a shrine, a cart wreck, a body with a note). Designers call it the "rule of the next thing on the horizon". | Density matters more than size. A budget per zone of points of interest per km², with a test that measures the longest walk between them. |
| **Hand-made-feeling places** | Each dungeon has a story told by its layout and props (a note, a skeleton holding a key). Caves loop back to the entrance at the end. | Authored "set pieces" laid over generated land; dungeons with a short story card, a loop-back exit, and a reward room. |
| **Freedom of build** | No class lock; you become what you do. | We keep Farhold's 30 classes (owner's must-keep), but the perk forest and per-skill talents give the "become what you do" feel inside a class. |
| **Loot that tells a story** | Named artefacts with lore, chests at the end of every dungeon, a reason to open every barrel. | Farhold's 189 uniques + sets + affixes, Name Forge artifact names, Item Vault lore. |
| **Radiant quests** | An endless generator of "go to place X, do Y" jobs bound to real places. Loved when it sends you somewhere new, hated when it repeats the same cave. | Farhold's `jobgen.js` (22 frames, only offers a job when every slot binds to something real). Add a "send me somewhere I have not been" rule. |
| **Living world** | NPCs with schedules, towns with a smith, an inn and a guard who comments on your gear. | Lingo + conversations + memory; town roles from Farhold `town.js`; guards greet by standing (R27). |
| **Dragon attacks** | A random world event that interrupts whatever you are doing and is a spectacle. | World boss events that land on a zone (or attack a town) on a schedule with a warning. |
| **Factions and guilds you join** | Questlines with a beginning, middle and end per faction. | Farhold territory.js has 12 factions with standing; give each a short authored questline. |
| **Stealth, lockpicking, pickpocketing** | Optional "other ways to play". | Parked as an open question — expensive to make work in multiplayer. |

**What players dislike** (worth avoiding): copy-paste caves, quest markers that do all the thinking, a
level-scaled world where nothing feels dangerous or safe, inventory weight micromanagement.

## 2. What makes a fantasy MMO fun

| Thing | Why it works | For us |
|---|---|---|
| **Other people in the world** | Seeing someone fighting the same beast; a stranger healing you; towns full of people. | Towns and cities are never split into copies until they are very full. |
| **Parties and dungeons** | A 5-person group with roles (tank, healer, damage) beating a hand-made dungeon with boss mechanics. | 5-player focus, like Wildmarch. Instanced dungeons for one party. |
| **World bosses** | A big open fight anyone can join; the "everyone runs to the zone" moment. | One open-group activity per province, scheduled + announced. |
| **Rare enemies** | A named monster with a long respawn and a good drop; people camp and call it out. | Per-zone rares with timers and roaming paths; chat announcement on spawn. |
| **Progression you can see** | Levels, gear, talents, reputation bars, a map that fills in. | Farhold's level ladder, perk forest, talents, faction standing, discovery %. |
| **Towns as social hubs** | The market, the bank, the place you show off. | One capital city + province capitals, shared by everyone. |
| **Endgame loops** | Something to do at the level cap: harder dungeons, gear hunts. | Depth dial on dungeons (Wildmarch), world bosses, uniques, crafting mastery. |
| **Guilds** | Belonging; a reason to log in. | Guilds with chat and a roster in M3+. |

**What players dislike**: chores (dailies, weeklies), forced long queues, kill-stealing, gear locked to
one character, loot fights. The owner's Wildmarch round-2 rulings already removed dailies/weeklies,
rested XP, binding, extra currencies and raids — this design carries those rulings forward as defaults.

## 3. The tension, and how to keep both

| Open-world RPG wants | MMO wants | Resolution |
|---|---|---|
| A world that reacts to *you* (cleared a fort → it stays cleared) | A shared world everyone sees the same | **Phasing**: personal world changes are per-character flags; shared zone state (a warband's grip) is per zone and changes slowly through everyone's actions. |
| Every dungeon chest is yours | Many players in one place | **Personal loot** and **instanced dungeons**: a dungeon is your party's private copy. Open-world chests are per-character (everyone gets their own). |
| Solo freedom | Group content | Everything in the open world is soloable at its level (followers from Farhold help); dungeons scale 1–5 players. |
| A dangerous world | Low-level players near high-level ones | Level-banded zones (Farhold zones.js): the world is NOT scaled to you; danger is a direction on the map. |
| Pause, save anywhere | Persistent shared world | Save is automatic on the server; logging out in the wild is allowed (you appear where you left). |

## 4. Browser MMO architecture for 100–1,000 players

### 4.1 Why lockstep does not scale to an MMO

Bannerline uses **lockstep**: every player's browser runs the *whole* simulation, and each step waits for
every player's input for that step. That is perfect for an 8-player RTS and wrong for an MMO, for five reasons:

1. **The slowest player sets everyone's speed.** A step cannot run until all inputs for it arrive. With
   1,000 players somebody is always on bad wifi, so everyone stalls.
2. **Every browser must simulate the whole world.** A thousand players across hundreds of zones is far
   more than one browser tab can run at 20 steps a second, and every tab would have to hold all of it.
3. **Joining means downloading the whole world state** and catching up — fine for a lobby, impossible for
   people dropping in and out all day.
4. **Inputs fan out to everyone**: each player's input goes to every other player, so traffic grows with
   the square of the player count (1,000 players → ~1,000,000 input deliveries per step).
5. **Cheating is trivial**: every client holds the full state (no fog of war that can't be read), and a
   tampered client can't be overruled because there is no referee.

An MMO instead uses an **authoritative server**: the server runs the world, clients send *intents*
("move this way", "cast slot 3 at that target"), the server decides, and each client is sent only what
is near it. Bannerline's net code still gives us the **transport interface, the `{t:...}` message style,
the loopback test harness, the seeded rng and the purity test** — just not lockstep.

### 4.2 Server-authoritative model, in plain words

- **Tick**: the server steps every zone 20 times a second (50 ms). Action combat needs at least this;
  30 Hz costs 50% more CPU for little visible gain once the client smooths motion. (Most MMOs run 10–20 Hz;
  shooters run 60–128.)
- **Client prediction**: your own character moves the instant you press a key; the server confirms or
  corrects. Corrections replay your unconfirmed inputs so you don't rubber-band.
- **Interpolation**: other characters are drawn ~100 ms in the past, smoothly between two server updates.
- **Lag compensation**: when you swing or shoot, the server checks the hit against where targets *were* on
  your screen (rewinds up to ~200 ms). Enemy telegraphs (ground warnings) resolve on server time and the
  client draws the fill against a synced clock, so a dodge that looked good on your screen counts.
- **Area of interest** (AOI): the zone is cut into a grid (32 m cells). Each player is only sent entities in
  nearby cells (~150 m for players, ~110 m for monsters), with nearer things updated more often
  (20 / 10 / 4 Hz bands). A cap (~150 entities per client) keeps a crowded town from flooding anyone.
- **Bandwidth**: target ≤ 8 KB/s average and ≤ 24 KB/s in a busy town per player, which needs **binary
  snapshots** (fixed 20-ish bytes per entity) and "only what changed" deltas. JSON is fine for everything
  else and for the first builds.

### 4.3 Zones, instances, layers (copies), phasing, shards

| Term | Meaning | Use here |
|---|---|---|
| **Zone server / zone room** | One zone's simulation. Many can live in one process. | Every zone is a room object inside a "world process". Empty zones sleep. |
| **Instance** | A private copy for one party (a dungeon). | Dungeons, caves with bosses, some fort interiors, story scenes. |
| **Layer (copy)** | A second running copy of a busy open zone; people in different copies can't see each other. | Opens when a zone passes its soft cap (~80). Towns have a much higher cap (~250) so they stay shared. |
| **Phasing** | What one player sees differently inside the same zone copy, because of their quest progress. | A burned farm after a quest; a fort you cleared shows your banner. Kept small (≤ 8 flags per zone). |
| **Shard / realm** | A whole separate world. | One realm for now (owner); the database and code carry a `realm` id so a second realm is a config change later. |
| **Seamless vs portals** | Walking across a zone edge with no loading vs a gate/load screen. | Seamless inside a province (all its zones in one process; entities near an edge are mirrored to the neighbour as "ghosts"); load screens only for instances and long-range travel. |

### 4.4 Process layout and scaling

```
 browsers ──wss──► Gateway (login, routing, chat fan-out) ──► World process(es)
                                                               ├─ zone rooms (open world, 20 Hz, sleep when empty)
                                                               ├─ layers of busy zones
                                                               ├─ instance rooms (dungeons, created on entry)
                                                               └─ services: party, guild, chat, market, mail
                              Postgres ◄── save queue (one writer per character)
```

- **One process first.** Node runs one thread; at 20 Hz a tick has 50 ms. A world of 1,000 players spread
  over ~100 awake zones is roughly 30–60k entity updates a tick, which fits one modern core *if* the AI is
  budgeted (monsters far from any player think every 4th tick or not at all). Measure with bot clients
  before believing it.
- **Then split by province.** Node `worker_threads` or separate processes, one per group of provinces;
  the gateway routes a player's socket to the process holding their zone. Cross-province moves are a
  handoff (save → load in the other process, ~1 s fade). Chat/party/guild go through a small message bus
  (in-memory first; Redis or Postgres LISTEN/NOTIFY when there is more than one process).
- **WebSocket libraries**: `ws` (pure JS, the standard) is enough for 1,000 sockets. `uWebSockets.js` is
  several times faster per message and worth it only if the profiler says sockets are the bottleneck.

### 4.5 Persistence

- **Characters**: one row each with key columns (name, level, zone, position) + a versioned JSON blob for
  everything else (Farhold's save shape, migrated per version). Saved every 60 s if changed, on zone
  change, on logout, and at once on important events.
- **Items that move between players** (trade, mail, market) are rows with a unique id and owner. A move is
  one database transaction that fails if someone else moved it first — this is the whole anti-duplication
  defence.
- **World state**: the world is seed + data. Only *deltas* are stored (a zone's war grip, which strongholds
  were taken this week, world boss timers).
- **One writer**: while a character is online only the process holding it writes it (a lock column with a
  heartbeat), so a crash can't produce two diverging copies.

### 4.6 Anti-cheat basics

Never trust the client with a result. The client sends intents; the server checks speed against the
mount/sprint table and the heightmap (no flying, no wall walking), cooldowns, mana, range, line of sight,
and rolls all damage and loot with its own seeded generator. Rate-limit every message type; validate
every field against a protocol table; drop and log malformed messages; tokens expire; names are filtered.
Bots (automated players) are the long-term problem — watch for 24-hour sessions and identical paths.

### 4.7 Chat, parties, guilds

All three are cheap compared to the simulation. Chat channels: say (30 m), yell (150 m), zone, party,
guild, whisper, trade (cities only). Parties of 5 share a copy (party members are always placed in the
leader's layer). Guilds are a roster + chat + a message of the day first; a guild bank and housing later.

## 5. Procedural vs hand-authored for hundreds of zones

Hand-authoring hundreds of zones is out of reach (a big studio spends ~4–8 person-months per open MMO zone).
Pure procedural zones feel samey within an hour ("seen one, seen them all"). The well-known middle path,
used by games like Daggerfall (huge procedural map), No Man's Sky, Diablo (generated layouts + authored
set pieces) and Valheim (seeded biomes + hand-made structures), is:

1. **Seeded macro geography** (World Forge): continents, mountains, rivers, biomes, roads — generated once,
   baked, then frozen. Everyone gets the same world.
2. **Authored overlays at the province level** (a dozen hand-written province sheets, not hundreds): a
   capital, a culture, a questline, 3–6 landmark set pieces, named rares, a world boss, a palette and
   weather mix. That is where identity comes from.
3. **One "hook" per zone**: each zone gets one memorable unique thing from a hook library (a fallen giant's
   skeleton you can walk inside; a lake that is red; a town built on a bridge). With ~150 hooks and the rule
   "no hook twice in a province, no hook within 6 zones of itself", 300 zones stay distinct.
4. **Content budgets per zone**, filled by generators that already exist: a town or fort (proctown), farms
   around settlements, 1–2 dungeons (dungeon-plan), caves, ruins, a treasure chain, rares, encounters.
5. **Tests against sameness**: a "zone fingerprint" (counts of each feature type, biome mix, hook, palette)
   and a check that no two neighbouring zones are within a similarity threshold; a "longest boring walk"
   check; a reachability bot that walks to every point of interest (Lanternfall's room-check pattern).

What keeps zones from feeling samey, ranked by how much it helps: (1) silhouette landmarks visible from
afar, (2) a different palette/sky/weather per province, (3) culture-specific architecture (proctown has 7
cultures), (4) distinct enemy families per zone (warbands, bestiary), (5) a written story beat per zone,
(6) music/ambience changes.

## 6. Hosting options

Assumptions for the cost lines: **average** concurrent players is ~30–40% of the peak; per player ~8 KB/s
down on average with binary snapshots; JSON-only builds can be 3–5× that.

Bandwidth matters more than CPU at 1,000 players: 1,000 × 8 KB/s ≈ **20 TB a month** if they were all
online all month; with 35% average occupancy it is **~7 TB**. At 100 peak it is **~0.7 TB**.

| Option | Fits a 20 Hz authoritative MMO? | Cost ~100 peak | Cost ~1,000 peak | Local testing = production? | Notes |
|---|---|---|---|---|---|
| **Plain Node (+ `ws`) on a VPS** | **Yes** — a long-lived process with a game loop is exactly what it is. | One 2 vCPU / 4 GB VPS ≈ **$20–30/mo** (DigitalOcean $24; Hetzner's cheap CX line was listed but not orderable in Oct 2026, its CPX21 is €20 EU). | One 4–8 vCPU / 8–16 GB VPS ≈ **$48–100/mo** + bandwidth over the included 4–6 TB (DigitalOcean $0.01/GB → ~$10–40). | **Yes, identical**: the same `node server.mjs` runs on this VM. | No lock-in. Manual scaling (bigger box, then more processes). |
| **This VM + Cloudflare Tunnel** | Yes (same Node server) | **$0** + a domain | Not for 1,000 (home upload, uptime, the owner's network) | It *is* production | `cloudflared` gives a public `https://` / `wss://` link to a local port, free, with WebSockets. Best way to get the first public link. |
| **Cloudflare Workers + Durable Objects** | Possible: a DO per zone/instance holding sockets and ticking. | $5 plan + ~$20–60 | Each always-ticking DO bills wall-clock at 128 MB ≈ **$4/mo**; ~100–150 awake zones/instances ≈ **$400–600** + incoming messages (1 M/mo free then $0.15/M, WebSocket messages counted 20:1) ≈ **$100–300**. Egress free. | Close (`wrangler dev`), not identical. | 128 MB memory per object (a zone's heightmap + entities must fit), single-threaded per object, soft limit ~1,000 requests/s per object, cross-zone things become messages between objects, hibernation can't be used while ticking. Great for chat/market later. |
| **Cloudflare Containers** | Yes (runs a Docker image, fronted by a Worker/DO) | ~$15–40 | ~$100–250 (billed per 10 ms of running; standard-4 = 4 vCPU/12 GB) | Yes if we ship a Dockerfile (Docker isn't installed on this VM yet) | Newer product; adds Docker + Cloudflare-specific routing. A reasonable step 3. |
| **Vercel** | **No** for the game server. WebSockets entered public beta 2026-06-22, but a connection is pinned to one function instance, **max 300 s (Hobby) / 800–1,800 s (Pro)**, and in-memory state is not shared across instances. | — | — | — | Fine for static hosting of the client and an account website. |
| **Supabase** | **Not as the game server.** Realtime is broadcast/presence over Postgres changes: Free 200 connections + 100 msg/s; Pro 500 connections + 500 msg/s (10,000 / 2,500 with no spend cap). A 20 Hz world for 1,000 players is ~20,000+ msg/s. No server-side game loop. | Free | Pro $25 + compute add-ons | Partly (local Supabase CLI needs Docker) | **Good as the database + optional sign-in** (Postgres, backups, table editor). |
| **Cloudways** | **Poor fit.** It is a managed stack built around PHP apps (Apache/Nginx/MySQL). A long-lived Node WebSocket process is not its supported use. | DO 2 GB ≈ $24–28 | DO 4 GB ≈ $46–54 | No | Fine for a WordPress site about the game. |
| **Colyseus (framework, self-hosted)** | Yes — Node rooms, delta state sync, matchmaking, per-client state views (0.16), Redis for multi-process. | as VPS | as VPS | Yes | Saves ~2 weeks of plumbing; costs us control over the snapshot format and AOI; its schema system is a build-time decorator style that fights the "no build step, shared plain modules" rule. **Borrow ideas, don't adopt.** |
| **Nakama (framework)** | Yes (Go server, authoritative matches in TS/Lua/Go, accounts, chat, groups, leaderboards). | as VPS + Postgres/Cockroach | as VPS | Yes with Docker | Strong social features out of the box; game logic runs in its embedded JS runtime (goja), not Node — our shared modules would need to run there. Too heavy a second platform for one developer. |

**Recommendation (carried into the plan):** our own Node server (`ws`) + Postgres. Develop on this VM; first
public link from this VM through a Cloudflare Tunnel; then one VPS behind Cloudflare DNS when the playtest
grows; split into per-province processes only when bot load tests say so. Static client on GitHub Pages
(already used) or Cloudflare Pages. Supabase is the hosted Postgres for production if the owner wants
backups without running Postgres himself — the server talks plain Postgres either way, so local and
production run identical code.

## 7. What already exists in the playground (verified 2026-10-04)

| Piece | Verified facts | Server-safe? |
|---|---|---|
| Farhold classes | `data/classes.json`: 30 classes | data |
| Farhold skills | `data/skills.json`: 180 skills (6 per class, unlock 1/3/6/12/18/24), 4 talent tiers each, 47 statuses; `js/skillmech.js` interprets the talent `mod` language | **pure, imports in Node** |
| Combat maths | `js/rpg.js` (`strike`, `killXpFor`, level caps 30/50/100) using Emberveil `loot.js` + `rng.js` | pure |
| Items | Farhold loads `prototypes/emberveil/data/items.json` (affixes, 36 uniques, 54 sets) + `data/uniques.json` 189 uniques via `js/uniques.js`; `js/affixes.js` units/caps/tiers | pure |
| Perks | `js/perks.js` `buildForest()` → 203 nodes over 8 arms | pure |
| Zones | `js/zones.js` `buildZones()` level bands by border hops | pure |
| Dungeons | `js/dungeon-plan.js` (layout, 11 looks) pure; `js/dungeon.js` Three.js builder; `data/instances.json` 20 instance types | plan pure |
| Encounters / warbands | `js/encounters.js` (11), `js/warbands.js` (5 warbands, 5 warlords) | pure |
| Enemies | `data/enemies.json` 46 enemies, 6 bosses, 22 modifiers; `data/worldbosses.json` 9 | data |
| Towns / roads | `js/town-plan.js` → `proctown/js/townplan.js`; `roadplan.js`, `road-fold.js`, `bridge-plan.js` | pure |
| Followers | `js/followers.js` (companion / mercenary / summon) | pure |
| Radiant jobs | `js/jobgen.js` + `data/job-frames.json` (22 frames, binds only to real things) | pure |
| World | `js/planet.js` builds a world via universe + worldgen; `M_PER_CELL` 640 m; **no chunk streaming** (terrain rings around one viewer) | pure |
| Bannerline net | `js/net/transport.js` interface (loopback / channel / PeerJS / stub WS relay), `{t:}` messages, `tests/net/harness.js`, `js/sim/rng.js` (named streams), `hash.js`, `tests/sim-purity.test.js` | reusable patterns |
| Wildmarch | design bible incl. `16-TECH.md` (Node + Supabase + Cloudflare, 20 Hz, AOI table, protocol, persistence rules) and `15-SOCIAL-ONLINE.md` (layers, phasing, parties, finder, guilds, chat, anti-cheat) | mined heavily, see plan §0 |
| Models | Chibi 2: 9 races; `class-outfits.json`; creature types incl. farm animals (sheep, hen, pig, cow), horse/pony, dragon, drake, golem, titan, ghoul, bone colossus… | client |
| Tooling | Node v22.22.3 installed; **Docker not installed**; ports 8400/8401 (playground), 8441/8442, 8460, 8471 in use | — |

## 8. Sources

- Cloudflare Durable Objects pricing — https://developers.cloudflare.com/durable-objects/platform/pricing/
- Cloudflare Durable Objects limits — https://developers.cloudflare.com/durable-objects/platform/limits/
- Cloudflare Containers pricing — https://developers.cloudflare.com/containers/pricing/
- Vercel Functions limits — https://vercel.com/docs/functions/limitations
- Vercel WebSocket support (public beta, pinning, durations) — https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections
- Supabase Realtime limits — https://supabase.com/docs/guides/realtime/limits
- Colyseus scalability / presence — https://docs.colyseus.io/scalability , https://docs.colyseus.io/server/presence
- Hetzner 2026 price adjustments — https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/ , https://agentdeals.dev/hetzner-pricing-2026
- Cloudways 2026 pricing — https://cloudpipelines.com/reviews/cloudways-pricing-2026/
- General architecture (prediction, interpolation, lag compensation, AOI) is standard practice; see Gabriel
  Gambetta "Fast-Paced Multiplayer" and Valve's "Source Multiplayer Networking" articles, and Glenn Fiedler's
  "Networked Physics" series.
- Wildmarch `docs/16-TECH.md` and `docs/15-SOCIAL-ONLINE.md` (in this repo) — the owner's earlier, related design.
