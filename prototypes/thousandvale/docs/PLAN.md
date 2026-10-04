# Thousandvale — the plan (refined, final for the build)

**Status:** v2 (refined), 2026-10-04. Replaces [`plan-v1.md`](plan-v1.md). Built from plan v1, the roast
([`roast.md`](roast.md)) and the independent review ([`review.md`](review.md)); every numbered change and
blocking issue from both is answered in **§1 Responses**. Research: [`research.md`](research.md).
Design only — no game code yet. Claude-facing; third-party names appear only in §1 and §2 where a name check needs them.

**Folder note.** The game is renamed **Thousandvale** (§2). The folder stays `prototypes/thousandvale/` until the
coordinator says to rename it; every new name inside this plan uses Thousandvale (`prototypes/thousandvale/`,
user `thousandvale`, databases `thousandvale_dev` / `thousandvale_stable`).

**Pitch.** A huge walkable world of a couple of hundred big zones — every one with towns, farms, a fort, a
dungeon several floors deep, rares, a boss event and hidden treasure — shared online by up to a thousand
players, with Farhold's 30 classes, skills, talents and loot. Click a link, and in a minute you are standing
next to your friend.

---

## 0. The rules this plan never breaks

### 0.1 Owner must-keeps (re-read from `~/claude/agent/mmo-checklist.md`)

| # | Must-keep | Where this plan keeps it |
|---|---|---|
| K1 | Classes and items like Farhold; reuse Farhold data and systems | §6 (30 classes, 180 skills, talents, perks, affixes, uniques, sets — shared formulas, forked orchestration) |
| K2 | Farhold/Emberveil characters and elements; **no Skyrim/WoW IP or names** (conv. 9 list + "muster", no new "ember"/"veil") | §2 rename, §16 banned-names test with this plan's additions |
| K3 | One huge world, no planets, **hundreds of zones**, each a full region: cities, towns, forts, farms, multi-tier dungeons, world boss events, rares, hidden treasure, more | §3: ~200 zones of 2×2 km, each with a **floor** of all of these (§3.4), archetypes adding texture on top |
| K4 | Server; 100–1,000 players; parties; instances/copies to split load **except shared hubs like towns** | §8: province copies, **towns are hub rooms that never copy**; dungeons are instances |
| K5 | A public link anyone can join; one server now, more later | §10 (tunnel then VPS), §5.5 join link, guests forever; `realm` id everywhere |
| K6 | Runs on this VM first | §10.1: Node + Postgres on this VM, ports 8490/8491 |
| K7 | New models go into avatar-3d (or another experiment), usable by **Farhold and Bannerline** | §14 |

### 0.2 Genre feel no later pass may trade away

(From memory *genre feel over paper balance*: never ration the core verb to tidy a spreadsheet; bound it the
genre's way.) Anything that proposes cutting one of these goes to the owner first.

- **Go anywhere.** Nothing on the map is locked by level, key or quest. Danger is the only gate.
- **Something new every ~45 seconds of walking**, and new *kinds* of things, not the same ruin again.
- **Open every chest.** Plentiful personal loot; no open-world loot caps; nobody can take your drop.
- **Dungeons always end in a reward room**; no lockouts on normal runs.
- **Kill it, take its stuff, sell it, buy better.** Gold only; everything but quest items trades.
- **Towns feel full** — they never split into copies.
- **Your character feels powerful.** Farhold's big numbers, uniques and builds stay. Party balance is fixed
  by **monster health and mechanics**, never by flattening players (there is no open PvP to balance for).
- **The world feels lived in even at 50 players** (§5).

### 0.3 Owner rulings carried from Wildmarch (defaults; re-asked only where noted)

No raids · no dailies/weeklies · no rested XP · no binding · gold only · personal loot · group finder only
for discovered dungeons · 5-player focus with world bosses as the big open activity. **Not carried:**
always-daylight (we recommend day/night, §17), its 11 hand-made regions (we generate + overlay).

---

## 1. Responses to the roast and the review

Legend: **A** = accepted as written · **A~** = accepted with a change (reason given) · **R** = rejected (reason given).

### 1.1 Roast — numbered changes (`roast.md` §7)

| # | Change | Call | Where / why |
|---|---|---|---|
| 1 | ~12 zone archetypes with their own budgets; neighbours differ | **A~** | §3.3. Change: every zone still carries the owner's full list as a *floor* (the review's B6 reading of "each zone a full region"); archetypes set weights and extras above it. Neighbours may not share an archetype. |
| 2 | ~120-template point-of-interest library + "5 zones ≥ 40 distinct" test | **A** | §3.5 "vignettes", stream E; test in §16. |
| 3 | New multi-tier dungeon generator, 8 layout families | **A** | §3.6 `dungeon-tiers.js`. |
| 4 | Legible treasure clues, more cross-zone chains | **A** | §3.4 + §3.7. |
| 5 | Anti-emptiness: population-scaled events + free travel, auto groups, player traces, one starting province | **A** | §5. |
| 6 | Write the first hour, test it with a bot | **A** | §5.6 + `tools/first-hour-bot.mjs`. |
| 7 | Party join link + guests forever; accounts only for abusable verbs | **A** | §5.5, §9.4. |
| 8 | Level sync both ways | **A** | §6.4 (M5). Up-sync scales stats only; loot rolls at your own level. |
| 9 | Province = simulation room, no ghosts, copies per province, sleep by AOI cell | **A** | §8.2. |
| 10 | Server sim in a Web Worker + loopback first | **A** | §8.6, M0. Same module runs under Node `ws`. |
| 11 | Binary snapshots from M1, encoded once per AOI cell | **A** | §8.4 (field-level deltas, per-cell encode). |
| 12 | Defer lag-compensation rewind; tolerance windows | **A** | §7. |
| 13 | Ally heals, threat, taunt, Tab target in M1 | **A** | §7, M1. |
| 14 | Price the combat port honestly; extract AI/status, fork castSkill + parity test | **A~** | §6.1. Change: we **fork both** the cast pipeline and the AI brain and **edit no Farhold file** — formulas stay shared; parity fixtures guard drift. Reason: Farhold is a live, released game; this gets the same safety with zero risk to it. Back-porting the clean AI brain into Farhold stays an option for later. |
| 15 | Split M1 into M0 / M1 / M1.5; JSON saves before Postgres | **A~** | §15. Change: Postgres from **M0** (the coordinator asked for a DB in M0, and one save path from day one is simpler than two). The `SAVE_FIELDS` table is identical either way. |
| 16 | Security wall before any public link | **A** | §11. |
| 17 | Admin page + nightly backups to S3 in M3, restore drill | **A~** | §11, §9.6. Change: backups start at **M1.5** (first build friends touch), not M3. |
| 18 | Supabase Auth (JWT) for accounts | **R** | §9.4. Guest token + optional claim with username/password (`scrypt`) needs no outside service, works identically on this VM and a VPS, and stores no emails. Supabase Auth / a magic-link login can be added later behind the same token check if the owner wants account recovery. |
| 19 | Fencing token on the writer lock; versioned cross-character transactions | **A** | §9.2. |
| 20 | Chibi 2 look cache + build queue + animation LOD; mobile cap | **A** | §12. |
| 21 | Bake World Forge at ~192×144 | **A~** | §3.2: 16 samples per zone edge → **288×224** for the 18×14 grid (review B6). |
| 22 | Load tests from a second machine at 1,000; herds; p99; evil client; conservation | **A** | §16. |
| 23 | Rename Shriekwing, drop "Dungeon Finder", rename the game; banned-names test | **A** | §2. |
| 24 | Cut lockpicking from v1; defer Challenge mode and the market hall | **A** | §6.5, §6.6, §13. Lockpicking parked; "Challenge" renamed **Trial** and moved to M5; market hall M5, trade window M3. |

### 1.2 Review — blocking issues (`review.md` §2)

| # | Issue | Call | Where |
|---|---|---|---|
| B1 | Farhold combat is importable but not server-ready; singletons; `Math.random` defaults | **A** | §6.1: headless combat core (`js/rules/cast.js`, `monster-ai.js`, room context adapter swapping skillmech's `world` + `setMechEnv` per room step, leak test, parity fixtures). Purity rule = "no three/DOM/window/storage/fetch in `js/rules/**`" plus a seeded rng passed everywhere; lockstep-grade determinism is **not** required. |
| B2 | Stage 2 puts every socket on one thread | **A** | §8.1: province processes own their sockets; gateway hands out signed tickets; reconnect behind a fade on province change. |
| B3 | Zones and copies are the wrong units; towns split | **A** | §8.2: province copy = room; towns/cities = hub rooms that never copy. |
| B4 | No security model for the public link | **A** | §11, all eight points. |
| B5 | Crash loss, trade dupes, backups, separate DBs | **A** | §9: journal saves (≤ 2 s loss), version + fencing, atomic trades, backups from M1.5, `_dev` / `_stable` databases. |
| B6 | World resolution and zone size | **A** | §3.1–3.2: 2×2 km zones, ~200 land zones, world bake at 16 samples per zone edge. |

### 1.3 Review — traceability notes and non-blocking issues

| Item | Call | Where / why |
|---|---|---|
| R1 continent-wide story arc | **A** | §4.2: a 8–10-step arc through 5 provinces. |
| R3 NPC schedules; far horizon | **A** | §4.3 (day/night positions for town roles); §12 far-terrain ring from the world bake. |
| R4 the world bake is new code over `worldgen/`, not `planet.js` | **A** | §3.2 says so. |
| R7 a dungeon entrance per zone | **A** | §3.4 floor. |
| R8 a zone event boss in every zone + 12 province world bosses | **A** | §3.4, §5.2. |
| R13 Shriekwing; "Challenge mode"; "group finder" | **A~** | Shriekwing renamed; "Challenge" renamed Trial anyway (cheap, safer); the group finder's in-world name is **the Callboard**. |
| R16 towns split with zones | **A** | B3. |
| R20 Postgres not installed | **A** | §10.1: the lead installs it with sudo at M0. |
| R21 Bannerline reads looks through `unit-looks.js`; proctown kits are Farhold-only | **A** | §14: headless `createCreature` test for every new type + `creatures.html` listing; kits noted as Farhold-usable only. |
| NB1 far horizon | **A** | §12. |
| NB2 flow fields + leashed steering + path budget | **A** | §8.5. |
| NB3 rewind history only inside AOI | **A~** | No rewind at all for now (roast 12); if added later, only for entities in a player's AOI. |
| NB4 fast travel erodes density | **A~** | Waystones need discovery; carts/boats are fares; recall stone from level 10. Free travel only to a live realm event (§5.2). |
| NB5 rares invite camping | **A** | Per-copy spawns, personal loot, 20–60 min respawn. |
| NB6 followers fill slots | **A** | §6.3. |
| NB7 readable nights, telegraphs always visible | **A** | §4.3. |
| NB8 log faucets/sinks from M1 | **A** | §13. |
| NB9 desktop-first 3D | **A** | §12. Menus are tested at mobile size; the 3D game is desktop-first. |
| NB10 add to `projects.md` + docs | **A** | Done when the folder gets code (ops stream, M0). |
| NB11 "12 cores" is 12 threads, 10 GB RAM | **A** | §16.3 uses it. |
| Review §4: 8490 stable / 8491 dev | **A** | §10.1. |
| Review §4: client served only by the game server | **A** | §10.1. GitHub Pages carries only a landing page with the link. |
| Review §4: `/status` from M0/M1 | **A** | §11.4, M0. |
| Review §5: compositional vs bespoke hooks; viewers; schemas; bake headers | **A** | §3.5, §3.8. |
| Review §6: stream H ops; streams own their unit tests; library via merge script | **A** | §18. |

---

## 2. The name

"Fellreach" is out: **Fallow Reach** is a live one-world sandbox MMO with a near-identical sound; "Fel" reads as
WoW's fel magic; "the Reach" is a Skyrim region.

Five candidates, each web-checked on 2026-10-04 (searches for the exact name + "game"):

| Candidate | Meaning | Check result | Verdict |
|---|---|---|---|
| **Thousandvale** | "a thousand valleys" — says *huge world of many regions* | No game found under this name. Nearest: *Thousand Ward* (tactics RPG), *Towervale* (book-game) — different words. | **Chosen.** Plain, says what the game is, no ember/veil/fel/reach, nothing banned inside it. |
| Broadwold | broad + *wold* (open upland) | No game found. Nearest: *Broadsword*, *Broadland* (board game). | Runner-up 1 — good, a bit flat. |
| Wealdmark | *weald* (old forest) + *mark* (borderland) | No game found. "Weald" alone is common (Darkest Dungeon area, *The Weald* horror game). | Runner-up 2. |
| Wanderwold | wander + wold | No game found. Nearest: *Wanderfolk*, *WanderWorld* mobile app. | Runner-up 3 — reads close to "Wander World". |
| Wendmark | *wend* (to travel) + mark | No game found. LinkedIn's *Wend* puzzle and *Wardenmark* exist. | Runner-up 4 — likely confusion. |

Checked and **dropped**: *Wayholm* (an existing horror game), *Greywold* (one letter-group from *Greymoor*, an
Elder Scrolls Online chapter — Elder Scrolls IP), *Hollowmere* (an existing free browser RPG with other
players at hollowmere.gg), *Thornhallow* (a browser Three.js open-world RPG called *Thornhollow* exists).

The continent is **the Vale** in player text only where it reads naturally; provinces carry their own names
from Name Forge. Folder rename `fellreach → thousandvale` waits for the coordinator.

**Other names fixed:**

| Was | Problem | Now |
|---|---|---|
| Shriekwing (plan-v1 monster) | WoW raid boss | **Screelhag** |
| Bog lurker | likely a WoW mob | **Mire stalker** |
| Dungeon Finder | WoW feature name | **the Callboard** (in-world board in every town; UI says "Callboard") |
| Challenge mode | WoW dungeon mode | **Trial** runs |
| "layer", "phasing" | WoW-flavoured | Internal only; players see "copy" |
| Trading Post (Wildmarch) | WoW feature name | **Market hall** |

All of these go into the banned-names fixture (§16).

---

## 3. The world

### 3.1 Size

| Number | Value | Why |
|---|---|---|
| Zone | **2,048 m × 2,048 m** (~4 km²) | Big enough for a town with farms, a fort, a dungeon entrance, wilds and 8–12 small sites. ~6 min to walk across, ~3 min to ride. |
| World grid | **18 × 14 = 252 cells**, **~200 land zones**; the rest is sea, lakes and peaks that shape coasts and borders | "Hundreds of zones"; ~800 km² — huge, but every zone is dense. |
| Provinces | **12 provinces of ~16 zones** (~8 × 8 km) + **the crown city** | The unit of authoring and of simulation (§8). |
| Levels | **1–50** (Farhold ladder) | Each province spans ~6–8 levels, overlapping neighbours; zones step up by hops from the province gate (`zones.js`). |
| Start | **One starting province** until ~300 players are online at peak; then two more open as start options | §5.1. The whole world is open and walkable from day one. |

Why not v1's 1 km zones: a 1 km² zone can hold a town *or* a fort, never "cities and towns and forts and
farms" (review B6). Why not bigger than 2 km: the floor in §3.4 already fills 4 km² at one site per ~45 s
of walking; bigger zones dilute density.

### 3.2 The bake (new code over `worldgen/`, not Farhold's `planet.js`)

1. **World bake** `tools/bake-world.mjs`: World Forge at **288 × 224** (16 samples per zone edge; worldgen
   handles this size — its default is 256 × 128): height, rain, biomes, rivers, coast, province borders,
   settlement sites, A* roads, passes. Output `data/world/world.json` (zones, provinces, graph, roads) +
   `data/world/height.u16` (the macro field), in git.
2. **Zone bake** `tools/bake-zone.mjs <zone>`: refine the macro field (noise only *adds detail*, never moves a
   river or a coast) to a **1025 × 1025 heightmap at 2 m** (~2 MB), `surface.u8`, `nav.u8`, and typed
   `placements.json` records `{kind, id, x, z, yaw, data}` where every `id` resolves to real data.
3. **Edges agree by construction** (both zones refine the same macro samples with the same seeded noise at
   world coordinates) and **by test** (the Farhold water-staircase lesson: drawn and measured geometry are the
   same numbers).
4. **One heightmap, read by everything**: client mesh, grass, scatter, water, server movement check, monster
   steering.
5. Every baked binary has a **header** (magic, version, size, input hash) so a stale bake is refused, not misread.
   Bakes are cached by input hash; editing one province sheet re-bakes only that province.
6. Memory: ~200 zones × ~3 MB ≈ 600 MB if everything were loaded; only awake provinces are loaded.

### 3.3 Zone archetypes (12)

Each archetype is a content mix layered **on top of the floor** (§3.4). Neighbouring zones may not share an
archetype; every archetype appears at least once per province where the biome allows.

| Archetype | Feel | On top of the floor |
|---|---|---|
| **Heartland** | Rolling farmland, mills | 2 villages, many farms, mill, bandit camps, harvest festival event |
| **Crown ring** (city zone) | A walled **city** and its suburbs | City hub room (market hall, Callboard, trainers), city sewers as an extra dungeon, outlying hamlets |
| **Frontier** | Contested border | A second fort, siege camps, warband patrols, burned farmsteads |
| **Wilds** | Few people, best treasure | Lairs, beast dens, an extra treasure chain, hermit hamlet |
| **Ruinfield** | One huge old ruin | Ruin complex with 2 extra dungeon doors, scavenger camps, cursed vignettes |
| **Lakeland** | Lakes, fishing hamlets | Stilt villages, ferries, drowned sites, lake serpent rare |
| **Pass** | Mountain road | Toll fort, cliffs, switchbacks (`road-fold.js`), avalanche event |
| **Blight** | Corrupted, warband-held | Warband stronghold, corrupted farms, war grip front (§6.6) |
| **Holy ground** | Shrines, pilgrims | Monastery, shrines, pilgrim road, relic treasure chain |
| **Mine country** | Hills and shafts | Mining town, shafts as small caves, ore-rich harvest, collapse event |
| **Coast** | Cliffs, harbours | Port town, smugglers' coves, wrecks, sea-cave dungeon |
| **Marsh** | Fen and mist | Stilt hamlet, sunken chapel, mire stalker dens, will-o'-wisp lights |

### 3.4 What every zone has (the floor)

The owner's list, in **every** zone. Archetypes add more; none removes any of this.

| Floor item | Per zone | Made by |
|---|---|---|
| Settlement | **1 town + 1–2 hamlets** (or a **city** in Crown ring zones, ~1 in 6) | `proctown/` (7 cultures + new), Farhold `town-plan.js` |
| Farms | **≥ 2 farmsteads** (archetype may add many; Coast/Lakeland farms include fishing plots) | new farm-plot generator in proctown (§14) |
| Fort | **≥ 1** fortified place: fort, keep, watchtower garrison or warband stronghold | proctown fort kit (§14), Farhold `sites.js` strongholds re-implemented as data |
| Multi-tier dungeon | **1 entrance per zone** (~200), 2–4 floors | `dungeon-tiers.js` (§3.6) |
| Caves / small sites | 1–2 single-floor caves | dungeon-plan |
| Vignettes | **8–12** hand-designed small sites (§3.5) | vignette library |
| Zone hook | 1 memorable thing (§3.5) | hook library |
| **Zone event boss** | 1 rotating elite set piece (warlord, siege leader, beast) | Farhold events/warlords as data |
| **World boss** | the province's world boss lives in one arena zone; it can roam/attack others (§5.2) | `worldbosses.json` + new bodies |
| Rares | 2 named rares, 20–60 min respawn per copy, roaming paths, called out in zone chat | champions/rares + Name Forge |
| Hidden treasure | 1 chain per zone; ~1 in 4 chains crosses 2–3 zones | `treasure.js` (§3.7) |
| Roads | network + signposts + bridges | `roadplan.js`, `road-fold.js`, `bridge-plan.js`, `roadside.js` |
| Harvest nodes | many, per-character | Farhold harvest/tools |
| Radiant jobs | live | `jobgen.js` + "prefer undiscovered places" |

World totals: ~200 towns + ~300 hamlets + ~33 cities, ~400+ farmsteads, ~200 forts, ~200 multi-tier dungeons
(+ extras from archetypes), ~300 caves, ~2,000 vignette placements, ~200 hooks, ~200 zone event bosses,
12 world bosses, ~400 rares, ~200 treasure chains.

### 3.5 Vignettes (~120) and hooks (~85)

**Vignettes** are the main content deliverable (stream E). Each is a small, hand-designed JSON recipe: props
from kits + one encounter + one lore line (Lingo) + optional loot, note or quest. Examples: a hanged-man tree
with a note, a collapsed mine with a trapped miner, a giant's cookfire, a drowned chapel, a smugglers' cellar
under a farm, a broken caravan with one survivor, a duel site with two corpses and one sword, a witch's
garden, a toppled statue with a hidden compartment. Each carries tags (biome, archetype, level band,
culture) so the bake places it only where it fits.

Rules: no vignette twice in a zone; not within 3 zones of itself; **variety test**: a bot walking any 5
neighbouring zones meets **≥ 40 distinct vignettes**; "templates met per hour of play" is reported by the
first-hour bot.

**Hooks** (one per zone, never twice in a province, never within 6 zones of itself): **~60 compositional**
(built from kit parts and parameters — a red lake, a town on a bridge, a burning wood, a stone circle that
hums at night) and **~25 bespoke** (each needs a model task in stream F — a giant's ribcage, a petrified army,
a fallen sky-ship). 85 hooks cover ~200 zones under those rules.

### 3.6 Multi-tier dungeons — a new generator

`js/rules/dungeon-tiers.js` (new, pure) wraps Farhold's `dungeon-plan.js` room generator per floor and adds:
floors linked by stairs, **a shortcut back up** from each floor, a key/lever room, a mini-boss per floor, a
**boss room**, a **reward room** (always has something good), and a **loop-back exit** to the entrance.
Each floor is +2 levels. **8 layout families**: crypt spiral, mine descent, flooded cistern, fortress keep
levels, cave river, tower climb, barrow maze, sunken temple. Province culture picks the dressing
(`DUNGEON_LOOKS` + new). M1 ships 2 families; M2 4; M4 all 8. A dungeon floor viewer tool ships with it.

### 3.7 Hidden treasure that players can find

Every chain starts with a **physical clue** found in the zone (a torn map piece you hold over the minimap, a
riddle on a gravestone, a carved arrow on a rock, a drunk's story in the inn), each step points to the next,
and the cache **shimmers within 15 m**. Dig with a tool or open a hidden chest. Per-character, so everyone can
find it; server-checked (you must be within reach, §11.3).

### 3.8 Tools that ship with the content

World map viewer (provinces, zones, bands, archetypes, hooks, roads) · zone viewer (top-down heightmap +
placements + fingerprint diff against neighbours, like the proctown tuning page) · dungeon floor viewer ·
fly-cam inspect mode in the client · JSON schemas + validator for province sheets, vignettes, hooks,
placements, quests (run by `npm run test:unit`).

---

## 4. Story, factions and a living world

### 4.1 Provinces
12 province sheets (`data/provinces/<id>.json`): name, culture, palette/sky/weather mix, band, capital, a
**5–8 step questline**, the world boss and its arena zone, 6–10 named rares, 3–6 landmark set pieces, holding
factions + warband, music set, enemy family weights. Characters and elements come from Farhold/Emberveil
(classes, bestiary, warbands, named enemies with original names).

### 4.2 The continent arc
One **8–10 step main story** that sends players through 5 provinces and ends at the crown city — the
"main quest" an open-world RPG needs (review R1). Its beats are authored; its fights reuse zone content.

### 4.3 A world that feels lived in
Town roles from Farhold (smith, merchant, elder, inn, healer, Unbinder, broker) with **day and night
positions** (shop by day, inn by night); caravans, patrols, wanderers (Farhold `territory.js`,
`wanderers.js`) on the roads; guards greet by standing (R27). **Day/night**, ~2 hours per day; nights are
readable (torches, moonlight floor) and **telegraphs are always visible**.

### 4.4 Factions
12 factions with standing (`territory.js`), each a short questline and a quartermaster.

---

## 5. Population: a big world that never feels empty

1,000 players over ~200 zones is 5 per zone; 80 players is 0.4. So people must **converge**, and the world
must feel inhabited when they don't.

### 5.1 One starting province
Everyone starts in the same province until peak population passes ~300; the first-week crowd overlaps there.
Its starter towns and their zones copy earlier (§8.2).

### 5.2 Events sized to who is online, with free travel
A realm **event director** runs **one big event at a time** (world boss, a town under attack, a dragon-kind
flyover, a warband siege), choosing its size from the number online and in band: boss health and adds scale
with the players who join. It is announced realm-wide 10 minutes ahead, and **waystone travel to it is free
while it runs**. Smaller **zone event bosses** run on their own per zone copy. Credit is by contribution;
loot is personal.

### 5.3 Open groups that form themselves
Two or more players damaging the same monster within 40 m share credit and get a one-click **"Group up"**
toast. Zone events auto-enrol anyone nearby into a temporary event group (shared credit, an event frame), no
invite needed.

### 5.4 Signs of other players
Persistent, cheap traces: **graves** where a player fell (click: name, level, what killed them; fade after
an hour), **campfires** a player lit, a **banner** on a fort or dungeon door ("cleared by Aldra's party, 4
minutes ago"), a zone deed feed on the map ("3 rares slain here this hour"), **footprints** on busy paths.
Plus NPC traffic on roads (§4.3).

### 5.5 "Join my party" link and guests forever
Any party leader can copy `https://<host>/?join=ABCDE` (Bannerline's `CODE_ALPHABET` / `cleanRoomCode`).
A friend who opens it makes a guest character (or picks one) and lands **in the party, in the leader's copy,
next to them**. Guest accounts **never expire**: the server issues a 256-bit token, stores only its hash; the
browser keeps the token. "Claim" adds a username + password so the character survives a cleared browser.
Guests can do everything that cannot be abused — play, party, loot, dungeons, say/party chat. **Trade, mail,
market and public channels** need a claimed account at level 5+ (stops spam bots without rationing play).

### 5.6 The first hour (scripted, and tested)
- **0:00** Open the link. No sign-up. Pick from 30 Farhold classes (a "good first character" strip of 6
  first), a body preset (human/elf/dwarf/halfling), a name. Under 60 s to standing in the world.
- **0:02** The starter town is under warband attack, guards fighting, other new players there. First kill
  in under a minute, first drop in two.
- **0:10** The elder sends you to a farm, then a cave. A level every 3–4 minutes.
- **0:20** First 2-floor dungeon, soloable with a follower, or the Callboard pops with other new players.
  Reward room with something good.
- **0:40** A rare is called out in zone chat; a realm event starts in the province; you see 20 players.
- **0:60** Level ~8, waystones found, a treasure clue in your pack, a party invite.
`tools/first-hour-bot.mjs` plays it and fails if any gap between kills, drops, level-ups or discoveries
exceeds its limit.

---

## 6. Classes, skills, items — and the combat core

### 6.1 Combat extraction (the biggest M0/M1 job)

Verified by both reports: Farhold's *formulas* import in Node (`rpg.js`, `skills.js`, `skillmech.js`,
`effects.js`, `affixes.js`, `uniques.js`, `perks.js`, `weapons.js`, …), but the *fight* is not in them:
`castSkill` is a ~730-line closure in `main.js` (11,040 lines) using `THREE.Vector3`, the HUD and the
controller; enemy AI lives in `actors.js` mixed with meshes; `skillmech.js` exports module-level
`world = { placed, corpses, walls }` and a private `ENV`; `rpg.js` keeps `LEVEL_CAP` global; several modules
default to `Math.random` / `Date.now`.

**Decision: share the formulas, fork the orchestration, edit no Farhold file.**

| Piece | Approach | Why |
|---|---|---|
| Formula modules (`rpg`, `skills`, `skillmech`, `effects`, `affixes`, `uniques`, `perks`, `weapons`, `followers`, `zones`, `jobgen`, …) | **Shared**: imported in place by path from `js/rules/` adapters | One copy of every number (the playground's *one multiplier, two owners* lesson). They already run in Node. |
| `castSkill` + `fireBolt` + `reportHit` + rewards (main.js) | **Forked** into `js/rules/cast.js` over plain `{x,y,z}` and a room context (~1,500 lines) | Entangled with HUD, controller and Three.js; extracting it inside Farhold risks a released game. |
| Monster brain (actors.js) | **Forked** into `js/rules/monster-ai.js` (no meshes) + a **threat table**, taunt and leash | Same reason; Farhold has no threat table (R22) and MMO needs one. Back-porting into Farhold is a later option. |
| skillmech's global `world` lists + `setMechEnv` | **Room context adapter**: before a room steps, swap in that room's lists and call `setMechEnv(room.env)`; rooms step one after another in a process, so the swap is safe | No Farhold edit; a test proves two rooms never see each other's corpses, traps or walls. |
| `LEVEL_CAP`, `Math.random`/`Date.now` defaults | Always call with explicit cap, seeded rng and room clock | No Farhold edit; a test greps `js/rules/**` call sites. |
| Drift | **Parity fixtures**: the same character, skill, seed and target give the same damage, statuses and talent effects in Farhold's runtime and in `cast.js` — for every class as it is ported | If Farhold changes a rule, the fixture goes red in Thousandvale's suite. |

Budget honestly: M0 ports one class's basic attack and one monster family's brain; M1 ports the cast
pipeline for 4 classes (the pipeline once — after that a class is mostly data); M2 the other 26. Micro-bench
in M0: casts per second one core resolves.

### 6.2 What changes for multiplayer
Server owns all maths; the client runs the shared formulas only to predict its own cooldowns/resources and
draw tooltips. **Ally targeting** on every heal/shield/buff skill and talent (audit list, M1 for the 4
classes, M2 for all) + revive on allies. **Threat** from damage and healing, tank skills multiply it, taunt.
Hit-stop, shake, stagger visuals stay client-side; monster knockback is server-side. Item rolls are
server-seeded with a `uid`. Anything only Thousandvale understands is injected at load — never written into
`emberveil/data/items.json` (shared with Emberveil and Farhold).

### 6.3 Followers
Allowed for solo and small groups in the open world and normal dungeons (they take a party slot); the
Callboard backfills slow normal queues with followers; none in Trial or Depth.

### 6.4 Party scaling and level sync
Dungeon and event monsters scale **health and add mechanics** by party size from a formula checked by a
party-scaling sim (every role mix of 1–5 through every dungeon family; flag wipes and walkovers). Player power
is never cut. **Level sync both ways** (M5): down-sync caps your stats to the zone; up-sync lifts a low
friend's stats to the leader's zone band; loot always rolls at your own level.

### 6.5 Progression and endgame
Levels 1–50, Farhold's curve, grey-con falloff (`killXpFor`); discovery and quests pay well. Unlock ladder:
sprint 2, dodge 5, Callboard 8, mount 10, recall stone 10, talents 3/8/18/28, second loadout 25. Perk forest
and per-skill talents as Farhold; the Unbinder retrains for gold. Endgame at 50: **Depth** (re-enter any
cleared dungeon at Depth 1–∞, new monster affixes every 5), **Trial** runs (M5), realm events and world
bosses, unique/set hunting, war grip (§6.6), collections (bestiary, discovery %, treasure chains, uniques).

### 6.6 War grip
Warbands hold Blight/Frontier zones; the server-wide community pushes them back (Farhold R27 `warGrip`, one
shared value per zone, saved in `world_state`). M5.

---

## 7. Combat over the network

Farhold's action combat (three-part swing, `arc`/`slam`/`lunge`/`pierce`, bow draw, staff charge, monster
ground telegraphs) **plus Tab targeting** for spells that need a target. The client sends
`cast {slot, aim, target?, clientTime}`; the server resolves.

| Concern | Rule |
|---|---|
| Lag | **No rewind** for now (PvE, wind-ups). Melee range tolerance +0.5 m; a dodge's invulnerable window starts at `clientTime` clamped to ≤ 150 ms ago. Add rewind only if playtests ask, and then only for entities in a player's AOI. |
| Feel | Client plays the swing/cast at once; numbers and hit-stop when the server answers. |
| Movement | Own character predicted and reconciled; others interpolated ~130 ms behind (15 Hz snapshots). |
| AI | Server only; sleeps by AOI cell (§8.5). Leash 40 m or 8 s with no damage (no training onto low levels). Players never collide with each other (no body blocking). |
| Credit | Shared tagging: anyone who did meaningful damage or healed someone who did gets credit and their own loot roll. |

---

## 8. Server architecture

### 8.1 Processes that own their own sockets

```
 Browser ──https──► static client (allow-listed published copy)     ┐
         ──wss /gw──► Gateway: login/guest token, character select,  │  one Node process at first,
                     party/guild/chat/Callboard/mail services,       │  the same code split later
                     issues a signed ticket {char, room, process}    │
         ──wss /p/<n>──► Province process n (owns its sockets):     │
                          province copies + hub towns + instances    ┘
                          20 Hz tick, AOI, combat core, save journal ──► Postgres
```

- The **gateway** logs in and hands out a short-lived signed ticket naming the process; the client opens its
  game socket **straight to that process** (`/p/<n>` path, routed by the tunnel's or Caddy's ingress rules).
  Province processes never route game traffic through the gateway.
- **Changing province** = save, new ticket, reconnect behind a 1–2 s fade.
- **Services** (party, guild, chat fan-out beyond say/yell, Callboard, mail) live in the gateway; processes
  talk to it over a small message bus — in-process calls in stage 1, **Postgres LISTEN/NOTIFY** in stage 2
  (no new dependency).
- **Stage 1** (M0–M1.5): one process does gateway + all provinces — same code, `processes: 1`.
  **Stage 2** (M2+): gateway + N province processes on one box (N ≈ 4–6 for 12 provinces, grouped by load).
  **Stage 3**: a second box behind the same gateway; config only.

### 8.2 Rooms: province copies, hub towns, instances

| Room | Rule |
|---|---|
| **Province copy** | One room, one AOI grid over the whole ~8 × 8 km province. Zones are labels inside it (name, band, archetype, music), so walking between zones is seamless with **no ghost mirroring**. A second copy opens at **~300** players in the open world (starter province **~150**); hard cap +20%. Copies merge when both are under 40% for 5 min. Party → leader's copy; then guild, friends, fullest under cap. Copy hop once per 60 s, never in combat. |
| **Hub town / city** | Its **own room shared by every copy of the province — never copied**. Hard cap 400 (crown city 1,000); the 150-entity AOI cap keeps clients sane. Walking through the gate is a seamless handoff inside the same process (the client already has the town's buildings). From outside the walls you see the town and its NPCs; players inside appear once you step in. |
| **Instance** | A dungeon (normal, Trial, Depth) or story scene for one party (1–5). Created on entry, kept 30 min after empty; a disconnected member can rejoin the same instance for 5 min. |
| **Spill** | If one province exceeds one process's budget (~350 players), its extra copies move to another process; entering the town from a spilled copy is a reconnect-fade. Towns stay in the province's home process. |
| **Phasing** | Per-character world changes you caused (your banner on a cleared fort, a burned farm), ≤ 8 flags per zone. |
| **Per-character** | Chests, harvest nodes, treasure chains, discovery — a crowd never uses up a zone. Chests reset on a per-character **timer**, never on relog. |

### 8.3 Tick and send rates

Simulation **20 Hz** (50 ms). Snapshots **15 Hz** near (≤ 40 m), 7.5 Hz mid (40–90 m), 3 Hz far (90–150 m);
interpolation 130 ms. AOI on 32 m cells: players 150 m, monsters 110 m, cap 150 entities per client;
party members always sent (2 Hz, health + position). Clock sync ping every 2 s. WebSocket ping every 30 s
(Cloudflare closes idle sockets at ~100 s).

### 8.4 Snapshots: field-level binary deltas, encoded once per cell

- Each tick, each AOI cell encodes **one** delta buffer of what changed in it (enter/leave, position, yaw,
  anim, hp, flags). A client's snapshot is the concatenation of its cells' buffers at its rate band — no
  per-client serialisation.
- **Field-level deltas**: idle entities send nothing; a moving entity sends ~8 bytes (local id u16, flags u8,
  dx/dz quantised to 1/16 m as i16 each, yaw u8); hp/anim changes add 2–3 bytes when they change. Full
  state (~24 bytes) on enter.
- JSON stays for everything else (chat, inventory, casts, quests). Binary snapshots from **M1** (~200 lines).

**Bandwidth budget per client** (TCP/IP + WebSocket ~40 B per message):

| Scene | Moving entities in view | Down |
|---|---|---|
| Wilds, typical | ~40 | 40 × 8 B × 15 + 600 B ≈ **5.4 KB/s** |
| Busy town | ~75 | 75 × 8 B × 15 + 600 B ≈ **9.6 KB/s** |
| Realm event, 120 players + adds | ~140 + effects | ≈ **20 KB/s** |
| Targets | | avg ≤ 8, town ≤ 24, event ≤ 48 KB/s; up ≤ 4 KB/s |

Realm-wide: 1,000 × ~7 KB/s ≈ 56 Mbit/s sustained, event peaks ×2–3 — far beyond a home uplink (§10).

### 8.5 Monster thinking
Monsters in AOI cells with no player within 200 m don't think. Near players they steer straight with leashes;
camps use cached **flow fields**; real pathfinding goes through a per-tick budget queue. Under load, far
monsters think every 2nd tick (never their movement).

### 8.6 Development order: Worker first
The server sim (`js/sim/**`, pure) runs first **in a Web Worker behind Bannerline-style loopback transport**,
so M0 is debuggable in browser devtools; the same module runs under Node with `ws`. Transport interface,
`{t:...}` messages, loopback harness and named rng streams come from Bannerline's `js/net/` and `js/sim/rng.js`.

### 8.7 Tick arithmetic

Unit costs are Node 22 estimates (review §3) to be replaced by M0 micro-benchmarks. 70% of players in the
wild, 30% in towns; ~12 thinking monsters per wild player.

**100 players — one process** (stage 1):

| Work per 50 ms tick | Count | Unit | ms |
|---|---|---|---|
| Monster AI | ~840 | 4 µs | 3.4 |
| Pathfinding (budgeted) | 20 | 50 µs | 1.0 |
| Player intents | 100 | 3 µs | 0.3 |
| Casts/hits | ~5 casts × 10 targets | 50 µs | 0.3 |
| Status/DoT ticks | ~840 | 0.2 µs | 0.2 |
| AOI refresh (staggered) | 1,000 entities | — | 0.4 |
| Snapshot cells + concatenation | ~250 cells, 100 clients | — | 0.6 |
| `ws.send` | 100 × 0.75 (15 Hz) | 6 µs | 0.5 |
| **Total** | | | **~6.7 ms** of 50 (≈ 13%) |

**1,000 players — gateway + 4 province processes** (stage 2; ~250 players each):

| Work per tick, per process | Count | Unit | ms |
|---|---|---|---|
| Monster AI | ~2,100 | 4 µs | 8.4 |
| Pathfinding | 30 | 50 µs | 1.5 |
| Intents | 250 | 3 µs | 0.8 |
| Casts/hits | ~13 × 10 | 50 µs | 0.7 |
| Status ticks | ~2,100 | 0.2 µs | 0.4 |
| AOI refresh | 2,500 | — | 0.9 |
| Snapshot cells + concat | ~600 cells, 250 clients | — | 1.5 |
| `ws.send` | 250 × 0.75 | 6 µs | 1.1 |
| **Total per process** | | | **~15 ms** of 50 (≈ 30%) |

For comparison, **one thread at 1,000** with per-client JSON snapshots is ~130 ms (impossible); with binary
deltas ~53 ms (over budget) — which is why processes own sockets (B2). **Budgets** (measured, not assumed):
p99 tick ≤ 30 ms, **worst tick in any 10-minute window < 50 ms** (no overrun), heap stable, DB write queue
drains within 2 s. A starter province with 600 players spills copies to another process (§8.2).

---

## 9. Persistence

### 9.1 Tables (Postgres)
`accounts` (guest token hash, optional username + scrypt hash), `characters` (key columns + compressed
versioned JSON blob, `version`, `lease_owner`, `lease_fence`, `lease_until`), `char_journal` (seq, kind,
payload), `items` (rows only while an item is in escrow: mail, market listing, guild bank), `mail`,
`market_listings`, `guilds`, `guild_members`, `world_state` (war grip, boss timers, cleared strongholds),
`economy_log` (faucets/sinks per hour), `chat_log` (30 days), `reports`, `bans`.

### 9.2 No loot loss beyond a couple of seconds
- Every gain or loss that matters — item gained/lost, gold change, level-up, quest step, unlock — appends a
  small **journal** row; the process **group-commits the journal every 2 s** (one insert per batch). The full
  blob is saved every 60 s if dirty, on province change and on logout, and records the last journal seq it
  includes. On load: blob + journal rows after its seq. **Worst-case loss on a crash: ~2 s.**
- **Immediate blob save** on rare-or-better drops, trades and level-ups.
- **One writer**: a lease with heartbeat, plus a **fencing token** (`lease_fence` increments on every take);
  every save is `UPDATE … WHERE id=$1 AND version=$2 AND lease_fence=$3`, so a frozen process that wakes can
  never overwrite a newer save. Leases older than 2× heartbeat expire at boot.
- **Trades are atomic**: both characters' blobs (pack and gold live inside them) and any escrow rows change in
  **one transaction** with both versions and fences checked; either everything moves or nothing does. Mail and
  market move items into `items` rows inside the same kind of transaction. Every item has a `uid`; a uid in
  two places fails a unique check.
- `SAVE_FIELDS` is the one table both snapshot and restore loop over; a test touches every field to an odd
  value and round-trips it, another fails if the live character object carries a field not in the table
  (Farhold lost `world`, `quests`, `skillTalents`… this way).
- Clients auto-reconnect with their token and resume from the last save.

### 9.3 Two databases
`thousandvale_dev` (8491, bots, broken builds) and `thousandvale_stable` (8490, real players). Never shared.

### 9.4 Accounts
Guest token (256-bit, hash stored) by default, never expiring; optional claim with username + password
(`scrypt`, Node built-in). **Cloudflare Turnstile** on guest creation and claim; guest creation rate-limited
per IP; name filter. No database keys, service keys or secrets ever reach the client — it talks only to our
server. A one-paragraph privacy note (what is stored; chat is logged 30 days) before the first public link.

### 9.5 World state
The world is seed + data; only deltas are stored (`world_state`).

### 9.6 Backups (from the first build friends touch — M1.5)
Hourly local `pg_dump -Fc` kept 48 h; **nightly off-machine** copy to S3 or Cloudflare R2 (owner already uses
S3), 14-day retention; a **weekly restore drill** (restore into a scratch database, boot the dev server on it,
run the conservation check). The restore drill is a test, not a promise.

---

## 10. Hosting

### 10.1 On this VM (development, then the first public link)

| Port | What | From |
|---|---|---|
| **8490** | **STABLE** game server (client + `/gw` + `/p/<n>` + `/status`) | `~/claude/playground-stable` worktree via `publish-stable.sh` (Thousandvale's node tests added to its gate); for the public build, a **published allow-listed copy** under `/srv/thousandvale` run by user `thousandvale` (§11) |
| **8491** | **DEV** game server | live working tree, `thousandvale_dev` |
| 8492 | admin (stable), `127.0.0.1` only | never tunnelled |

Matches the playground's stable-lower / dev-higher rule (8400/8401); documented in `tools/README-servers.md`.
LAN URL for the owner: `http://192.168.1.34:8490/`. **Postgres**: the lead installs the server package with
sudo at M0 (only `psql` clients are installed today), listening on `127.0.0.1`, a game role with no superuser.
Plain `node` + systemd; Docker not needed. The client is **always served by the same server as its socket**
(the protocol handshake refuses a mismatched build with "reload"); GitHub Pages carries only a landing page
with the link. Restarts are graceful: 60 s warning, save everyone, exit; clients reconnect with their token.

### 10.2 Options and monthly cost (2026 list prices — re-check on purchase day)

| Option | ~100 CCU | ~1,000 CCU | Notes |
|---|---|---|---|
| **This VM + named Cloudflare Tunnel** | **$0** + a domain on Cloudflare | **not viable** (56+ Mbit/s sustained upload, uptime, the owner's home network) | First public link; good to ~50–100 players. |
| **DigitalOcean** | Basic 2 vCPU/4 GB $24 + backups ≈ **$29** | CPU-Optimized 8 vCPU/16 GB ~$168 + traffic over 5 TB (~$40) + backups ≈ **~$230** | Dedicated cores; US/EU regions; same systemd units. |
| **OVHcloud VPS** | ~$10–15, unmetered | VPS 8 vCore/24 GB ~$23–40, unmetered | Cheapest; shared cores — benchmark tick jitter first. |
| **Hetzner dedicated** (EU) | — (cloud prices rose up to ~170% in Jun 2026) | AX41-class ~€49–57, unmetered | Best value **if** players are mostly in Europe. |
| Cloudflare Durable Objects | ~$25–65 | ~$500–900 | Rejected as the game loop (always-ticking objects bill wall-clock; 128 MB each). |
| Vercel / Supabase Realtime / Cloudways | — | — | Rejected as the game server (research §6). |
| Supabase Pro as hosted Postgres (optional) | +$25 | +$25 + compute | Only if the owner prefers managed DB to local Postgres + dumps. |
| Off-box backups (S3/R2) | < $1 | ~$1–3 | Always. |

### 10.3 Migration path
1. **VM dev** 8491 / stable 8490 (M0–M2).
2. **VM + named tunnel, public** (M3, ≤ ~100 CCU). Owner picks the domain (must be on Cloudflare DNS, e.g. a
   subdomain of radleysustaire.com).
3. **One VPS with dedicated cores** in the players' region (M5, owner picks provider): same systemd units,
   restore last night's dump, flip DNS at Cloudflare (minutes, announced).
4. **More province processes**, then a second box behind the same gateway (config, because of §8.1).

---

## 11. Security for the public link

Required before **any** public link (M3 entry criteria), designed in from M0:

1. **Separate Linux user** `thousandvale`, systemd unit with `User=thousandvale`, `ProtectHome=yes`,
   `NoNewPrivileges=yes`, `ProtectSystem=strict`, `ReadOnlyPaths=/srv/thousandvale`, `PrivateTmp=yes`. It
   cannot read `/home/radgh` (already `drwxr-x---`), so `~/claude/secrets/` is out of reach. Its own secrets
   (DB password, ticket signing key, Turnstile secret) live in `/etc/thousandvale/env`, mode 0400, owned by
   that user — never in the repo, never in `~/claude/secrets/`.
2. **Approved-copy file serving only.** `tools/publish-thousandvale.sh` builds an allow-listed public folder
   (like `publish-pages.sh`: the client, its imports from Farhold/Emberveil/avatar-3d/shared, data, baked
   zones) into `/srv/thousandvale/public`. The server serves **only** that folder: no `..`, no dotfiles, no
   `.git`, no `server/`, no `tools/`. **Never** point it at the playground root, and **never** put
   `tools/serve.py` behind the tunnel — it accepts POSTs that write files (`/api/library/sync`, `/api/inbox/*`).
3. **Named tunnel, one route**: `play.<domain> → http://127.0.0.1:8490` and a catch-all `http_status:404`.
   No playground port, no Postgres, no SSH, no admin port. Not a Quick Tunnel (200 in-flight cap, no SLA).
   Kill switch in the README: `systemctl stop cloudflared`.
4. **Bind to 127.0.0.1**: stable game server and Postgres; the dev port reaches the LAN only through `ufw`.
5. **Limits**: `maxPayload` 16 KB; per-message-type token buckets; ≤ 4 sockets per IP (trust
   `CF-Connecting-IP` only when the peer is the local `cloudflared`); Origin check; protocol version
   handshake; Cloudflare rate-limiting rule on the hostname.
6. **Turnstile** on guest creation and claim; per-IP creation limits; name filter.
7. **Admin off the tunnel**: admin page on `127.0.0.1:8492`, reached by SSH tunnel (or Cloudflare Access).
   Online players, kick, timed mute, ban (account + IP hash), rename, last hour of chat, reports. The public
   `/status` is read-only numbers.
8. **Server never trusts the client**: speed vs mount table and heightmap, cooldowns, mana, range, line of
   sight, **loot/harvest/treasure reach checks**, uid ownership on every item intent; every field validated
   against the protocol table; malformed messages dropped and logged.

### 11.4 Observability (from M0)
`/status` (JSON + small page): CCU total and per room, tick p50/p95/p99/max over the last minute and worst in
10 min, awake rooms, open instances, messages/bytes per second, journal queue depth and last commit latency,
heap, uptime, build hash. Structured JSON logs to journald. `tools/status.mjs` prints it for agents.

---

## 12. Client

Three.js (vendored), **Chibi 2** (Chibi 3 stays shelved). **Look cache** keyed by a hash of the avatar JSON;
builds queued a few per frame off the hot path, a stand-in until ready; materials share shader programs (count
`linkProgram` calls — memory note on recompile stutter). LOD: nearest ~30 players full detail (fewer on
low-end), then LOD 1, then instanced stand-ins + nameplates; **animation LOD** (far mixers at 10 Hz or a frozen
pose). Creatures merged per `mesh-merge.js`. Terrain: baked heightmap meshed in rings around the camera +
neighbouring-zone streaming near edges + a **far-terrain ring** of the whole province from the world bake so
mountains several zones away are visible ("see it, walk to it"). Zones cached in IndexedDB by bake hash.
Graphics options from Farhold R23 behind a setting. UI: Farhold's sheet, tooltips, `hud.itemCard`, plus party
frames, chat, Callboard, map with discovery fog, one-key screenshot stamped with the zone name. Desktop-first;
menus tested at phone size.

---

## 13. Economy
Gold only. Faucets: drops, vendor sales, quest rewards. Sinks: waystone/cart fares, retraining, crafting fees,
market listing + sale tax (5% + 5%), mounts, cosmetics (dyes, mount looks), guild founding, follower hire.
**No repair bills.** Trade window (M3), mail (M3), **market hall** in the crown city and province capitals (M5).
Crafting from salvage + harvesting (Farhold `craft.js`). Faucet/sink log from **M1**; a dashboard per level band.
Botting is bounded the genre's way — sinks, account-gated trading, flags for 12 h+ sessions with identical
paths — **never** lockouts or loot caps.

---

## 14. New models (avatar-3d / proctown / library — usable by Farhold and Bannerline)

| Need | Where | Notes |
|---|---|---|
| Farm kit: barn, haystack, crop rows, fences, windmill, well, silo | `proctown/js/buildkit.js` + `drawkit.js`, farm-plot generator | Farhold can use it; Bannerline does not import proctown. Farm animals exist (sheep, hen, pig, cow, scarecrow). |
| Fort kit: palisade fort, keep, gatehouse, watchtower, barracks | proctown buildkit | Farhold-usable. |
| Townsfolk outfits: farmer, innkeeper, smith, guard tabards per province, noble, beggar, miner, pilgrim, fisher | `avatar-3d/data/npc-outfits.json` (+ loader like `class-outfits.js`); new part ids registered in `avatar-2d/js/parts/chibi2-parts.js` | Both games build Chibi 2 bodies from it. |
| New monsters (original names): **hill brute**, **Screelhag**, wyvern, ogre, **barkwalker**, basilisk, river serpent, **mire stalker**, stone sentinel, carrion beetle swarm | `avatar-3d/js/creature-types.js` + `creature-variants.json` (existing body plans) | Filed in `library/` as `enemy_<id>` via a merge script. |
| World boss bodies (12): reuse dragon/titan/bone colossus; 3–4 new | avatar-3d | |
| Bespoke hook models (~25) | avatar-3d / assets | Stream F tasks, M2–M4. |
| Mount looks (barding, saddles) | avatar-3d | horse/pony/courser/elk exist. |

**Tests**: every new creature type builds through `createCreature` headlessly and appears in
`avatar-3d/creatures.html`; every new Chibi 2 part id is in `chibi2-parts.js`; every new enemy/NPC has a
library entry. avatar-3d and proctown are shared: add files or opt-in options only, run their suites after
any touch, never change existing looks.

---

## 15. Milestones (each a playable vertical slice with tests)

| M | Slice | Done when (gate) |
|---|---|---|
| **M0 — Skeleton** | Server sim in a Worker + loopback, the same code under Node `ws` on 8491 serving the client; guest token; **Postgres installed** and saving position + XP; one heightmap from worldgen (no bake tool yet); Chibi 2 players moving with prediction + interpolation; **one class's basic attack and one monster family server-side** through combat core v0 (room context adapter, threat stub); `/status`; ops: systemd unit for dev, `projects.md` + docs entries. | **Two browsers on two LAN machines** see each other move and hit a wolf together. Tests: protocol table, room-context leak test, parity fixture for the basic attack, 2-context Playwright, 20 bots tick < 5 ms, `kill -9` + reconnect, micro-bench of casts/s and snapshot bytes. |
| **M1 — One zone** | Bake tool v1 + **one 2×2 km zone** with **one town as a hub room**, wilds with 2–3 monster families + 1 rare + 1 zone event boss, **one 2-floor dungeon instance** from `dungeon-tiers.js` (2 families); **4 classes** (tank, healer, melee, caster) through the forked cast pipeline; **ally heals, threat, taunt, Tab target**; party + **join link**; personal loot with item uids; **binary delta snapshots**; logout/login keeps loot; say/party chat; faucet/sink log; 8 vignettes, 2 archetypes. | 2–5 players on the LAN clear the dungeon together and keep their loot. Tests: parity fixtures for 4 classes, `SAVE_FIELDS` round-trip, 50 bots incl. 30 in the town, p99 tick < 10 ms. |
| **M1.5 — Safe to share** | Journal saves (≤ 2 s loss), version + fencing, trade window (atomic), evil-client suite, persistence chaos (`kill -9` × 500 with item/gold conservation), backups + restore drill, separate dev/stable DBs, stable on 8490 from a published copy as user `thousandvale` (LAN only), first-hour bot v1, Turnstile wired (test keys). | All chaos/conservation/evil tests green; restore drill passes; a friend on the LAN plays the first hour. |
| **M2 — One province** | ~16-zone starter province: province room + copies + hub towns, **gateway + province processes owning sockets** (stage 2 shape on one box), all 30 classes (ally targeting audit), all 12 archetypes available, 40 vignettes, 20 hooks, 4 dungeon families, farms/forts/caves/treasure chains, rares, radiant jobs, waystones, event director, open groups, player traces, far horizon, day/night, NPC schedules. | 100 bots incl. herds (100 in one town, 60 at one event) on this VM, p99 ≤ 20 ms, worst < 50 ms, ≤ 8 KB/s avg; variety + reachability + sameness tests green for every zone. |
| **M3 — Public play** | Claimed accounts, chat channels, friends/ignore, guilds (roster, chat, MOTD), mail, Callboard, the province world boss as a realm event, admin page (127.0.0.1), offsite backups live, privacy note, **named tunnel on the owner's chosen domain**. Owner picks domain here. | Owner sends the public link; strangers join; security checklist §11 signed off; 300 bots (from a second machine) + real players. |
| **M4 — The whole Vale** | 12 provinces (sheets), ~200 zones baked, 120 vignettes, ~85 hooks, 8 dungeon families, continent arc, travel network (carts/boats, recall stone), second and third starting provinces (when peak > 300). | 1,000-bot rehearsal from a second machine/cloud box against a VPS-sized setup; login storm and reconnect storm pass. |
| **M5 — Endgame + VPS** | Depth, Trial runs, war grip, crafting/harvesting, market hall, collections, level sync both ways, party-scaling sim tuned; **VPS migration** (owner picks provider by player region). | 1,000-bot gate re-run **on the VPS**; full 1–50 bot run; a week-long public test. |
| **M6 — Polish** | Graphics options, sound, voices, music per province, onboarding polish, settings, accessibility. | Owner's play-test list cleared. |

---

## 16. Testing

| Kind | What |
|---|---|
| Node unit (each stream, `tests/<stream>/`) | `js/rules/` purity (no three/DOM/window/storage/fetch; seeded rng); protocol table + **fuzz** (wrong types, huge strings, NaN, negative counts, other players' ids); room-context leak; parity fixtures vs Farhold; `SAVE_FIELDS` round-trip + unknown-field check; zone edges agree; bake determinism + header check; AOI correctness; delta encoder round-trip; item/trade transactions (two concurrent moves → one wins); **banned names** (conv. 9 list + ember/veil/muster + Shriekwing, Dungeon Finder, Challenge mode, Trading Post, Fellreach, bog lurker) over every player-facing string and data file. |
| Content | Schema validation; vignette variety (5 zones ≥ 40 distinct); sameness fingerprint between neighbours; longest boring walk ≤ 250 m; reachability bot to every site; every placement id resolves. |
| Playwright (against 8491) | Two contexts: log in, see each other, party via join link, enter the same instance, trade. Menus at desktop and phone size. |
| Headless sims | `tools/sim-thousandvale.mjs` (levels 1–50, deaths, gold/hour, damage share by skill — flag > 2× class average); **party-scaling sim**; **first-hour bot**. |
| **Load** (`tools/bot-client.mjs`, stream G) | Real WebSocket bots that log in, walk, fight, chat, party, trade, enter instances. **Crowd scenarios**: 300 in one town; 150 arriving at a realm event within 60 s; 1,000 logging in within 2 min after a restart; all dropping and reconnecting at once. **Metrics**: tick p50/p95/p99 and **worst tick in each 10-minute window**, heap, bytes/client, journal commit latency, DB writes/s. |
| Evil client | Speed hack, teleport, cast off cooldown / out of range, loot a chest 300 m away, trade an item you don't own, replay a uid, oversized and malformed messages, 1,000 msgs/s from one socket — all rejected and logged, server stays up. |
| Persistence chaos | `kill -9` at random points in trade, mail, loot, logout and province change, 500 times; **total items and gold conserved**; **fencing test** (frozen lease holder's save is refused); weekly **restore drill**. |

### 16.3 Where the load tests run
This VM has 12 threads (6 cores) and 10 GB RAM. Bots on the same machine steal CPU and memory from the server,
so **same-VM bots can prove ~100–300 players, never 1,000**. On this VM: server pinned to 8 threads, bots as 4
processes pinned with `taskset` to the other 4. For 1,000: bots from a **second machine** — the owner's Windows
PC on the LAN (Node runs there), or an hourly cloud box (a CPU-optimised droplet for an hour or two, a few
dollars) — and the gate is repeated on the actual VPS in M5.

---

## 17. Decisions on the open questions

| # | Question | Decision (recommended; owner may overrule) |
|---|---|---|
| 1 | Raids | **No** for v1; realm events + world bosses + zone event bosses are the big-group content. |
| 2 | Day/night | **Yes**, ~2 h day, readable nights, telegraphs always visible. |
| 3 | Seamless borders | Seamless **inside a province** (one room); 1–2 s fade between provinces. |
| 4 | Playable races | Human, elf, dwarf, halfling; orc/goblin/others stay warband enemies. |
| 5 | Level cap | **50**. |
| 6 | Housing | Parked. |
| 7 | Stealth / lockpicking | **Parked** for v1 (roast cut; cheap to add later on chests only). |
| 8 | Level sync | **Both ways** (M5). |
| 9 | Starting provinces | **One** until peak > 300, then three. |
| 10 | Zone size | **2 × 2 km, ~200 zones.** |
| 11 | Copies | **Per province; towns never copy.** |
| 12 | Auth | **Guest forever + optional claim** (own scrypt), Turnstile. |
| 13 | Ports | **8490 stable / 8491 dev**, 8492 admin (local only). |
| 14 | Client hosting | **Game server only**; Pages has a landing page. |
| 15 | Hosting provider | **Owner, at M5** — US players: DigitalOcean CPU-Optimized (or OVH after a jitter benchmark); EU: Hetzner dedicated. |
| 16 | Domain | **Owner, at M3** — a subdomain on a Cloudflare-managed domain (e.g. `play.radleysustaire.com`). |
| 17 | Final name | **Thousandvale** (runners-up: Broadwold, Wealdmark, Wanderwold, Wendmark). |

---

## 18. Workstreams and file ownership

One owner per path; a shared file (★) changes only through its owner. Each stream writes its own unit tests
under `tests/<stream>/`. Farhold, Emberveil, avatar-3d, proctown and Bannerline are **shared** with live games:
add new files or opt-in options only, and run their suites after any touch.

| Stream | Owns | First job |
|---|---|---|
| **A. Server core** | `server/**` (gateway, processes, rooms, AOI, delta encoder, journal/saves, services), `js/net/**` ★ (protocol table, transports, clock) | M0 Worker + Node server, guest token, Postgres schema v0, `/status` |
| **B. World bake** | `tools/bake-world.mjs`, `tools/bake-zone.mjs`, `data/world/**`, `data/zones/**`, `js/rules/terrain-read.js` ★, world/zone viewers | M0 heightmap reader; M1 one baked zone + town placement + edge test |
| **C. Combat core** | `js/rules/**` ★ except terrain-read and dungeon-tiers (adapters over Farhold formulas, `cast.js`, `monster-ai.js`, room context, threat) | **The B1 extraction — the largest M0/M1 job** |
| **D. Client** | `index.html`, `css/**`, `js/client/**` | connect, predict, interpolate, draw terrain + Chibi 2 + monsters; HUD, party frames, Tab target |
| **E. Content** | `data/provinces/**`, `data/vignettes/**`, `data/hooks.json`, `data/quests/**`, `data/names/**`, `js/rules/dungeon-tiers.js` ★, dungeon floor viewer | M1: 8 vignettes, 2 archetypes, the zone's quests, 2 dungeon families |
| **F. Models** | new files in `avatar-3d/js/` + `avatar-3d/data/npc-outfits.json`, new parts in `avatar-2d/js/parts/chibi2-parts.js` (append), proctown farm/fort kit files, `tools/merge-library.mjs` (the only writer to `library/data/defaults.json`) | farm kit, townsfolk outfits, hill brute + mire stalker, library entries |
| **G. Tests + load** | `tests/e2e/**`, `tests/load/**`, `tools/bot-client.mjs`, `tools/first-hour-bot.mjs`, `tools/sim-thousandvale.mjs`, evil-client + chaos harness | M0 2-context spec, 20-bot load test, chaos harness |
| **H. Ops** | `ops/**` (systemd units, tunnel config template, ufw notes), `tools/publish-thousandvale.sh`, `tools/backup-*.sh`, `tools/status.mjs`, `tools/README-servers.md` section, `~/claude/docs/` entries | M0 dev unit + Postgres install script (lead runs sudo); M1.5 stable user, published copy, backups, restore drill |

Coordination files: `docs/PLAN.md` (this page, lead only), `docs/CHANGELOG.md` (append), the build checklist at
`~/claude/agent/mmo-checklist.md` (lead only).
