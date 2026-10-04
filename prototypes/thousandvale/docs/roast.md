# Fellreach — roast of plan v1 (step 3)

**Status:** 2026-10-04. Claude-facing (third-party game names allowed on this page only, convention 9).
Reviewer stance: a harsh MMO / open-world designer. Inputs read in full: `research.md`, `plan-v1.md`, the
owner's request and must-keeps in `~/claude/agent/mmo-checklist.md`, and the memory note *genre feel over
paper balance*. Every reuse claim below that says "verified" was checked by opening or importing the file on
this VM today.

**Ground rules this roast obeys.** The owner asked for: hundreds of zones, each a full region (cities, towns,
forts, farms, multi-tier dungeons, world boss events, rares, hidden treasure); 100–1,000 players; parties;
instances except hubs; a public link; one server; runs on this VM; Farhold classes and items; new models
shared with Farhold and Bannerline. **Nothing on that list is cut here — at most simplified.** And nothing
here rations the core verbs (exploring, looting, fighting, grouping). Where I push on economy or load, the
fix is always "more supply" or "smarter plumbing", never "less fun per hour". The plan's own *genre feel*
list (§0) is good and I keep every line of it.

Verdict in one paragraph: the **architecture choice is right** (own Node server, `ws`, Postgres, tunnel
then VPS — not Durable Objects, not Vercel, not Supabase Realtime). The **content plan is the real risk**: a
uniform budget stamped onto 300 identical-shaped zones is the textbook recipe for procedural filler, and with
1,000 players spread over 300 km² the world will feel **empty**, which is the one thing an MMO cannot
survive. The **reuse claim is half true**: Farhold's *formulas* import cleanly in Node, but Farhold's
*combat* — the cast pipeline and monster AI — lives in an 11,000-line browser file and must be ported, which
the plan prices as "adapters". **M1 is not a vertical slice, it is a whole game.** And hosting from this VM
through a tunnel is **a security incident waiting to happen** unless the server is walled off from
`~/claude/secrets`.

---

## 1. Fun

### 1.1 Will a zone feel handcrafted or like filler?

The density *count* is fine. One zone gets: a settlement or fort, 2–5 farms, 1–2 caves, 3–6 ruins/camps,
a treasure chain, 2 rares, half a dungeon. That is 10–17 points of interest per km², roughly one per 45 s of
walking. The plan's "something every 45 s" rule passes on paper.

The problem is **variety, not count**. What fills those slots today:

- `encounters.js`: 11 set pieces. `eventprops.js`: 22 events. `instances.json`: 20 dungeon types.
  `dungeon-plan.js`: **one** rooms-and-corridors layout generator (145 lines, 6–11 rooms, single floor).
- ~150 hooks, one per zone — the only hand-written thing at zone scale.

So a player crossing five zones in their first hour sees ~60 points of interest drawn from ~35 templates.
By hour three they have seen every ruin, every camp, every event. Skyrim gets away with 37 km² because
almost every cave is authored. Daggerfall had a map the size of Britain and nobody remembers a single place
in it. **Count of templates per hour of play** is the metric that matters, and the plan does not measure it.

Worse, every zone has the **same shape**: exactly one settlement-or-fort, farms around it, a dungeon
every other zone. Uniform budgets are what make generated worlds read as generated. Real regions are lumpy:
a city zone, three empty moors with one terrifying ruin, a lake district of fishing hamlets, a burned
frontier with two forts and no farms.

**Fixes (no content is cut; zones get more distinct):**

1. **Zone archetypes, ~12 of them, each with its own budget.** "Heartland" (2 villages, many farms, mills,
   bandits), "Frontier" (fort + siege camps, no farms), "Wilds" (no settlement, many lairs, the best
   treasure), "Ruinfield" (one huge ruin complex with 3 dungeon doors), "Lake district", "Pass" (a fortified
   road, cliffs, a toll fort), "Blight" (a corrupted zone held by a warband), "Holy ground", "Mine country",
   "Coast", "Marsh", "Capital ring". Every owner-listed feature still appears in every province, just not in
   every zone — that is how a province gets texture. The sameness test then compares archetype + hook +
   palette, and two neighbouring zones may not share an archetype.
2. **A point-of-interest template library is the main content deliverable**, not the hook list. Target
   **~120 micro-sites** (a hanged-man tree with a note, a collapsed mine with a trapped miner, a giant's
   cookfire, a drowned chapel, a smuggler's cellar under a farm…) each a small JSON recipe: props + one
   encounter + one lore line + optional loot or quest. Kit these from what exists (proctown kit, creature
   bodies, eventprops) so each one is data, not code. Add a test: **a bot walking any 5 neighbouring zones
   must meet ≥ 40 distinct templates.**
3. **Multi-tier dungeons need real work.** The owner asked for multi-tier; `dungeon-plan.js` makes one
   floor. Budget a new `dungeon-tiers.js` (floors linked by stairs, a shortcut back up, a key room, a boss
   room, a reward room, a loop-back exit) and at least **8 layout families** (crypt spiral, mine descent,
   flooded cistern, fortress keep levels, cave river, tower climb, barrow maze, sunken temple). Wrap the
   existing generator, don't replace it.
4. **Hidden treasure must be legible.** A buried cache with no clue is invisible content. Every chain gets a
   physical clue (a torn map piece you can hold up against the minimap, a riddle on a gravestone, a
   carved arrow on a rock) and a "you are close" shimmer within 15 m. Treasure chains that cross 2–3 zones
   are the best exploration hook in the plan — make more of them, not fewer.

### 1.2 Do 300 zones dilute the players?

Yes, badly, and this is the plan's biggest fun problem. 1,000 concurrent players over ~300 zones is **3.3
per zone**. At a realistic early population of 50–100 it is **0.2–0.3 per zone**. An MMO with nobody in it
is a lonely single-player game with lag. The plan tackles the opposite problem (crowds, copies at 80) in
detail and the empty-world problem not at all.

The world must stay huge (owner). So make people **converge**, and make the world feel inhabited when they
don't:

1. **Gravity wells.** Province capitals and the crown city are where you bank, sell, craft, retrain and
   meet the group finder. Everyone passes through them several times an hour. Good — the plan has that.
2. **World events scaled to the population, announced realm-wide, with free travel to them.** Twelve
   province world bosses every 2–3 h is ~5 an hour realm-wide; at 80 players online, each fight gets 6
   people and a boss tuned for 40 is a wipe. Instead the scheduler picks **one** big event at a time
   (world boss, town under attack, a dragon-kind flyover) sized to who is online, and the waystone fare to
   it is free for the event's duration. This *adds* spectacle — it does not ration it.
3. **Open-world groups that form themselves.** When two players fight the same thing within 40 m they get
   shared credit and a one-click "group up" toast. Zone events auto-enrol anyone nearby. Most MMO grouping
   happens this way, not through menus.
4. **Fill the roads with life the server already has.** Farhold's caravans, patrols, wanderers and town
   folk (`territory.js`, `wanderers.js`) make a quiet zone feel lived-in. Plus **traces of other players**:
   recent graves where a player fell (click for their name and what killed them), a camp fire someone left,
   a "a player cleared this fort 4 minutes ago" banner. Cheap, persistent, and makes 100 players feel like
   1,000.
5. **Start everyone in one province** until the population passes ~300 concurrent (plan §15 Q9 already
   leans this way). The whole world is still open and walkable from day one — nothing is locked — but the
   *starting* towns are in one place, so the first-week crowd overlaps.

### 1.3 The first hour

The plan never describes it. It has to, because it decides whether the public link works.

- **0:00** Click the link. **No sign-up.** Pick one of 30 classes from Farhold's preview cards (with a
  "suggested for your first character" strip of 6, so 30 isn't a wall), a body preset, a name. Under 60 s
  to standing in the world.
- **0:02** An authored opening in the starter town — the town is under attack by a warband, the guards are
  fighting, other new players are there too. You get your first kill in under a minute and your first item
  drop in two. (Skyrim's dragon at Helgen, Diablo's first zombie: the game proves itself immediately.)
- **0:10** The town elder sends you to a farm, then a cave. First level-ups every 3–4 minutes.
- **0:20** First small dungeon (2 floors), soloable with a follower, *or* the group finder pops with other
  new players. A reward room with a chest that always has something good.
- **0:40** First rare spawns in zone chat; you go see. First world event in the province; you see 20 other
  people for the first time.
- **0:60** Level ~8, a discovered waystone network, a treasure clue in your pack, a party invite.

Write this as a **scripted onboarding test** (`tools/first-hour-bot.mjs`): a bot plays the first hour and
the test fails if any gap between kills, drops, level-ups or discoveries exceeds a limit.

### 1.4 The 20th hour

Around level 28–35. Fine on paper: perk forest, talent tiers, uniques, Depth on cleared dungeons, world
bosses. The risk is that **talents and perks are Farhold's, tuned for a solo player with followers**, and
in a party of five they compound (five people each with Farhold's big numbers against a monster tuned for
one). The dungeon "scales 1–5 players" line needs a real formula and a sim, not a sentence. **Do not
flatten player power to fix it** (the plan's *your character feels powerful* rule) — scale monster health
and add monster mechanics instead.

### 1.5 Grouping vs solo

Good: personal loot, shared tagging, party-first copy placement, followers fill empty slots, everything
outdoors soloable. Two holes:

- **Level sync both ways.** The plan offers down-sync only. Up-sync (a level 12 tagging along with a level
  40 gets temporarily scaled up, with loot for their own level) is what lets a friend who clicked your link
  *today* play with you *today*. That is the share mechanic. Do both.
- **Healers and tanks are new jobs.** Farhold's classes heal themselves. Ally targeting and threat are not
  "M2 polish" — the moment there is a party in M1, a healer class that cannot heal its party is broken.
  Move ally heals, threat and taunt into M1 for the M1 classes.

### 1.6 What makes someone send the link to a friend?

**"It's an MMO in a browser tab. Click this and you're standing next to me in 60 seconds."** Nothing else
in the plan is as strong. So:

- **A party link**: `…/?join=<code>` drops the friend straight into your party and your copy, as a guest.
  Bannerline already has room codes (`transport.js` `CODE_ALPHABET`, `cleanRoomCode`).
- **Guest play forever**, not just M1. Guests can do everything that cannot be abused (play, party, loot,
  dungeons). They need an account only for the abusable things (trade, mail, market, public chat channels).
- **Moments worth screenshotting**: a dragon-kind attack on a town with 30 people, a world boss, a
  five-person clear. A one-key screenshot that stamps the zone name.

---

## 2. MMO reality

### 2.1 Where 100–1,000 actually breaks

| Layer | Plan's assumption | Reality |
|---|---|---|
| **Server CPU** | "30–60k entity updates a tick fits one core if AI is budgeted." | Probably true for movement. **False for combat until measured**: Farhold's cast pipeline is 733 lines per cast with statuses, talent mods, uniques, effect hooks; 1,000 players casting every ~1.5 s is ~670 casts/s plus monster attacks and status ticks. Bake a micro-benchmark into M0: casts/s one core can resolve. |
| **Snapshot encoding** | JSON first, binary by M2. | JSON snapshots at 20 Hz × 150 entities × 1,000 clients is ~3M object serialisations a second — Node will spend its whole tick in `JSON.stringify`. Encode **once per AOI cell per tick** into a shared binary buffer, and give each client the concatenation of its cells. Do binary from **M1**, it is ~200 lines. |
| **Bandwidth** | ≤ 8 KB/s per client. | 1,000 × 8 KB/s = **64 Mbit/s upload sustained**, world boss peaks 3–6×. A home uplink cannot do it. The tunnel is good for ~50–100 players, then it must be the VPS. Say so in §9.5. |
| **Memory** | — | 300 zones × (0.5 MB height + 0.25 MB surface + 0.25 MB nav) ≈ 300 MB baked data if all loaded. Fine on a 16 GB VPS; load zones lazily on this 10 GB VM. |
| **DB writes** | ≤ 50/s. | 1,000 characters every 60 s ≈ 17/s plus events. Fine for Postgres. The risk is blob size: a Farhold save with inventory, perks, talents, journal, markers can be 50–200 KB. Measure it; compress (`zlib`) the blob. |
| **GC pauses** | — | A 1 GB Node heap with millions of small objects can pause 50–150 ms — a full tick or three. Reuse objects in the hot path, use typed arrays for positions, run with `--max-semi-space-size`, and log tick p99, not average. |
| **Seamless ghosts** | Zone rooms mirror entities near edges. | This is the most complex piece in the plan and the owner never asked for it. See 2.2. |

### 2.2 The cheapest architecture that truly holds 1,000

Keep the plan's shape (gateway + world + services + Postgres) and change one thing:

**Make the province the simulation room, not the zone.** A province of ~25 zones is ~5 × 5 km. One room
holds one AOI grid over the whole province; "zones" become content regions inside it (name, level band,
archetype, music). Then:

- **No ghost mirroring at all.** Walking from zone to zone inside a province is just moving inside one grid.
  Seamless for free.
- Empty areas sleep by **AOI cell** (monsters in a cell with no player within 200 m don't think), which is
  finer and simpler than sleeping whole zones.
- **Copies are per province** (soft cap ~250, hard ~300), with per-cell density limits so a town can hold
  its crowd. Towns stay unsplit until the whole province copy is full.
- **12 provinces ≈ 12 rooms ≈ 12 worker threads** later, which maps 1:1 to a 12-core box. Province
  borders keep the fade the plan already has.

**One Node process** holds 100 players without question and very likely 300–500. 1,000 in one process
is plausible but unproven; the plan is right to make the load test the judge. Put the province rooms behind
a `postMessage`-shaped interface from day one so moving them into `worker_threads` is a config change, not a
rewrite.

**Take Wildmarch's best idea that plan v1 dropped** (`16-TECH.md` §1): run the server simulation **in a
Web Worker behind the loopback transport first**. M0 is then playable as a single-player game in the
browser with the real client/server split, and the same module runs in Node with `ws` the day you add it.
Every server bug is debuggable in browser devtools.

**Lag compensation (rewinding entities 200 ms)** is a shooter technique. In PvE at 20 Hz with monsters
that wind up, it is not needed for M1. Resolve melee on the server with a generous range tolerance (+0.5 m)
and let dodges grant a server-side window that starts at `clientTime` clamped to 150 ms ago. Add rewind only
if playtests complain.

### 2.3 Cheating

Covered well in research §4.6 (intents, speed checks, server rolls, item uids in transactions). Add:

- **Auto-loot radius and harvest/treasure checks on the server** — a bot that teleports to every chest is the
  first cheat anyone writes for a game with per-character chests.
- **Per-character chest respawn is a farming loop.** Personal chests that reset per player are generous on
  purpose (keep it). Just make sure they reset on a timer per character, not on relog, or a script relogs
  forever.
- **Protocol fuzz test** in CI: every message type with wrong types, huge strings, NaN, negative counts,
  other players' ids.

### 2.4 Griefing, chat, moderation — the owner is one person

There is no PvP, which removes most griefing. What remains: offensive names, chat spam and slurs, monster
training onto low-levels, body blocking, scam trades, gold-seller spam. Plan v1 has "names filtered; rate
limits; report button" and puts the admin page in **M5**. That is too late — the moment a public link goes
out (M3), you need:

- **Admin page in M3**: online players, kick, mute (timed), ban (account + IP hash), rename, read the last
  hour of chat, see reports. Behind a secret admin login, not on the public port without auth.
- **Players never collide with each other** (no body blocking). **Monsters leash** to their spawn after
  ~40 m or 8 s with no damage (no training).
- **Mute and ignore** client-side, server-enforced.
- **New-account friction only on abusable verbs**: public channels, trade, mail, market need an account
  and level 5–10. A guest can still play everything else. This stops spam bots without rationing play.
- **Chat logs kept 30 days**, so a report can be checked.

### 2.5 Accounts and auth on a public link

Rolling your own username + scrypt password is fine technically, but then the owner stores passwords and
has no account recovery. **Use Supabase Auth (email magic link + Google/Discord) for accounts** and verify
its JWT in the game server; keep **guest tokens** that can be "claimed" into an account later. Both work
on this VM (the server only verifies a signed token). Owner already uses Supabase. Add a one-paragraph
privacy note (what is stored, chat is logged) before the link is public.

### 2.6 Botting and economy abuse

Infinite dungeons with no lockouts + personal loot + gold-only trading = a gold-farm magnet. That is fine —
it is the genre (the plan's *kill it, take its stuff* rule stays). Bound it the genre's way: **strong gold
sinks** (the plan has them), **account-gated trading**, an hourly faucet/sink log that already exists in the
plan, and **flag sessions over 12 h with identical paths**. Do not add lockouts or loot caps.

### 2.7 Data loss

Backups are not in the plan until "VPS with backups" (M5). From the first public link: **nightly
`pg_dump` to S3 (owner already uses S3), 14 days retention, and a restore drill test** that restores
yesterday's dump into a scratch database and boots the server against it. Also the one-writer lock needs a
**fencing token** (a counter that increments on each lock take), so a server that freezes and wakes up
cannot overwrite a newer save.

---

## 3. Scope

### 3.1 Value / effort ranking

| Feature | Owner asked? | Value | Effort | Call |
|---|---|---|---|---|
| Server + prediction + interpolation + AOI | yes (MMO) | essential | high | **KEEP** (M0) |
| Farhold combat on the server (cast pipeline port) | yes (classes) | essential | **very high** (see 4.1) | **KEEP**, start with 4 classes, port as a pipeline not per class |
| Hundreds of zones | yes | essential | high | **KEEP**, archetypes (§1.1) |
| Towns, cities, forts, farms | yes | essential | medium (proctown + new farm/fort kits) | **KEEP** |
| Multi-tier dungeons | yes | essential | medium-high (new tiers generator) | **KEEP** |
| World boss events | yes | very high | medium | **KEEP**, population-scaled scheduler |
| Rares | yes | high | low | **KEEP** |
| Hidden treasure | yes | high | low-medium | **KEEP**, with legible clues |
| Parties | yes | essential | medium | **KEEP**, in M1 |
| Instances / copies | yes | essential | medium | **SIMPLIFY**: copies per province, not per zone |
| Public link | yes | essential | low | **KEEP**, but behind the security wall (§4.6) |
| New models into avatar-3d | yes | high | medium | **KEEP** |
| Seamless zone edges with ghosts | no | medium | **very high** | **SIMPLIFY**: province = room (no ghosts) |
| Lag compensation rewind | no | low for PvE | high | **DEFER** until a playtest asks |
| Ally heals, threat, taunt, Tab target | implied by parties | essential | medium | **MOVE INTO M1** |
| Party join link, guest play | implied by public link | very high | low | **ADD to M1** |
| Level sync (both ways) | no | high (friends) | medium | **KEEP**, M3 |
| Group finder | no | high | medium | **KEEP**, M3 |
| Chat, friends, ignore | MMO staple | essential | low | **KEEP**, M1 say/party, M3 rest |
| Guilds | MMO staple | medium | medium | **SIMPLIFY**: roster + chat + MOTD only |
| Mail | no | medium | medium | **KEEP** M3 |
| Market hall | no | medium | high (escrow, dupes) | **SIMPLIFY**: trade window first (M3), market in M5 |
| Challenge mode dungeons | no | medium | medium | **DEFER** to M5 (Depth covers endgame) |
| Zone war grip, shared | no | medium | medium | **KEEP** M5 (Farhold has it) |
| Collections | no | medium | low | **KEEP** cheap |
| Day/night | no | high (feel) | low (Farhold has it) | **KEEP** M3 |
| Lockpicking | no | low | medium | **CUT** from v1 (park) |
| Raids | owner said no (Wildmarch) | — | — | stays parked |
| Admin/moderation page | implied by public link | essential once public | low-medium | **MOVE to M3** |
| Backups | implied by persistence | essential once public | low | **MOVE to M3** |

### 3.2 Is M1 a small vertical slice?

**No.** M1 as written is: a Node server, `wss`, guest login, a zone baker driven by World Forge, a proctown
town baked to disk, three monster families and a rare, a two-floor dungeon instance (the generator for which
does not exist), four classes over the real skill/talent/item modules (the cast pipeline for which must be
ported out of `main.js`), personal loot, parties, instances, Postgres persistence, and a client that does
prediction, interpolation, terrain, Chibi 2 actors, a HUD and a character sheet. That is ten weeks of work
labelled "M1", and the first time anything is fun is at the end of it.

**Split it:**

| M | Slice | Fun at the end? |
|---|---|---|
| **M0 — two players, one field** (days) | Server sim in a Web Worker + loopback, then the same code in Node with `ws` on 8490. One heightmap tile (reuse Farhold's terrain sampling), Chibi 2 players moving with prediction and interpolation, **one** class's basic attack and **one** monster family with Farhold's real `strike`. Binary snapshots. Two browsers on the LAN. Micro-benchmarks: casts/s, snapshot bytes/client. | "We hit a wolf together." |
| **M1 — one zone, together** | The plan's M1 minus Postgres (save to a JSON file per character first, same `SAVE_FIELDS` table) and with ally heals, threat, Tab target, party link and guest play added. One town, one 2-floor dungeon from the new tiers generator, 4 classes, personal loot, rare. | "We cleared a dungeon and got loot." |
| **M1.5 — persistence** | Postgres schema, one-writer lock with fencing, item transactions. | — |

The rest of the plan's milestones can stay in order, with the moves in §3.1.

---

## 4. Tech risk

### 4.1 Farhold modules in Node — verified, with a big catch

I imported each module the plan names in Node 22 on this VM. **All of these load**: `rpg.js` (34 exports),
`skillmech.js` (67), `skills.js` (20), `effects.js` (22), `affixes.js`, `uniques.js`, `weapons.js` (58),
`perks.js`, `zones.js`, `dungeon-plan.js`, `jobgen.js`, `encounters.js`, `warbands.js`, `followers.js`,
`town-plan.js`, `roadplan.js`, `road-fold.js`, `bridge-plan.js`, `territory.js`, `craft.js`, `planet.js`;
plus `proctown/js/townplan.js`, `worldgen/js/world.js` + `regions.js`, `namegen.js`, Bannerline's
`net/transport.js` + `sim/rng.js`, and `avatar-3d/js/creature-types.js`. None of them `fetch` data (they take
it as arguments). Data counts check out: 30 classes, 189 uniques in `data/uniques.json`.

**The catch:** the parts that turn those formulas into a fight are not in those modules.

- **`castSkill` is a 733-line closure inside `main.js`** (lines 1588–2321 of an 11,040-line file), using
  `THREE.Vector3`, `hud`, `control`, `aim()` and many locals. `fireBolt`, `reportHit`, `rewards` live there too.
- **Monster AI is in `actors.js`** (1,894 lines), which imports Three.js, the Chibi 2 and creature builders,
  and mixes meshes with `state = 'chase'` logic. R22 notes it has no real threat table.
- `sites.js` and `eventprops.js` import Three.js (set pieces are geometry + logic together).

So stream C ("adapters over Farhold modules, never edits Farhold files") is really **a port of Farhold's
combat runtime into a pure sim**. Pick one of two honest options and write it down:

- **(a) Extract** the cast pipeline and the AI brain out of `main.js`/`actors.js` into pure modules that
  *both* Farhold and Fellreach import, behind Farhold's test suite. Most work up front, no drift, and Farhold
  gets a cleaner codebase. Needs the owner's OK to touch Farhold.
- **(b) Fork** them into `fellreach/js/rules/` and accept drift. Faster to start. Add a **parity test**:
  the same seeded cast from the same character against the same target gives the same damage in Farhold's
  runtime and Fellreach's.

I recommend **(a) for the AI brain and status ticking** (small, contained) and **(b) with a parity test for
`castSkill`** (big, entangled with UI). Either way, price it as the largest single job in M1.

### 4.2 Client performance with many players and Chibi 2

Chibi 2's budget is ~8,500 triangles and two skinned meshes per character, plus held gear. A busy town with
150 entities in view is ~1.3M triangles, 300+ draw calls and 150 animation mixers ticking on the CPU — fine
on the owner's desktop, a slideshow on a phone or a school laptop. Also: **Chibi 2 builds geometry in code**,
so 40 strangers walking into view means 40 builds in a frame — a visible hitch.

- **Look cache keyed by a hash of the avatar JSON**, built off the main frame (a few per frame, a stand-in
  until ready).
- The plan's LOD (30 full, then LOD1, then stand-ins) is right; add **animation LOD** (far mixers update at
  10 Hz or freeze on a pose) and a hard cap on full-detail players that drops on mobile.
- Count shader recompiles (the memory note on three.js recompile stutter): every new player's materials must
  share programs.

### 4.3 World streaming and zone edges

Farhold has no chunk streaming (terrain is rings around one viewer from one function). The plan's baked
513 × 513 per zone at 2 m is fine, and the "edges agree" test is the right lesson from the water staircase.
Two cautions:

- **Bake at a usable macro resolution.** World Forge's defaults are 256 × 128 cells. Running it at
  24 × 18 to get one cell per zone throws away coastlines, rivers and mountain ranges (they need many cells
  to exist). Run World Forge at e.g. **192 × 144** and let each zone own an 8 × 8 block of cells; the zone
  bake upsamples from that.
- Neighbour streaming: 9 zones of height + surface ≈ 7 MB raw per area; serve gzipped and cache in
  IndexedDB by bake hash so a returning player downloads nothing.

### 4.4 Instances

Dungeon instances in the same process as the open world are fine. Close them 30 min after empty, as
planned — but **persist the party's progress through a disconnect** (a party member who drops reconnects into
the same instance for 5 minutes), or a wifi blip throws away a 30-minute run.

### 4.5 Persistence schema

The plan keeps the pack in the character blob and moves an item to the `items` table only when it leaves
(trade/mail/market). **The duplication bug lives exactly at that boundary**: blob saved with the item still
in it, escrow row also written, crash between them. Two clean options: (1) **all items are rows** (simplest
to reason about, more writes), or (2) items stay in blobs and every cross-character move is **one
transaction that rewrites both blobs with a version check** (optimistic lock). Pick (2) for v1 — it matches
Farhold's save shape — and write the "kill the server between every pair of statements" test for it.

### 4.6 Hosting from this VM through a tunnel — security

This VM holds `~/claude/secrets/` (sudo password, `.env` API keys, site credentials). A public link into a
Node process on this VM means **anyone on the internet can talk to code running as `radgh`**. One path
traversal bug in the static file server, or an RCE in a dependency, reads the sudo password.

Required before the first public link:

1. **Run the game server as a separate Linux user** (`fellreach`) with no read access to `/home/radgh`.
   systemd unit with `ProtectHome=yes`, `NoNewPrivileges=yes`, `ReadOnlyPaths=` for the client files.
2. **Serve a published copy, not the working tree.** The client imports from `../../avatar-3d`,
   `../../farhold`… so the server must not be pointed at the playground root (that would also serve `.git/`
   and `library/synced/`). Build an allowlisted public folder the way `tools/publish-pages.sh` does and serve
   only that. **Never** put `tools/serve.py` behind the tunnel — it has POST endpoints that write files.
3. The tunnel forwards **only** the game port. Admin page on a separate port, never tunnelled (or behind
   Cloudflare Access).
4. Cloudflare rate limiting on the hostname; per-IP connection cap and max WebSocket message size in the
   server.
5. Postgres listens on localhost only, game role has no superuser.

Tooling facts on this VM: `psql` 17 client is installed but the **postgresql service is inactive**;
**`cloudflared` is not installed**; Docker is not installed. 12 cores, **10 GB RAM**.

### 4.7 Cost

The plan's numbers are reasonable. Add the honest line: **the tunnel is $0 but caps out around 50–100
players on a home uplink**; past that the VPS (~$50–125/mo) is not optional. Supabase Pro as the DB is $25
and buys managed backups — worth it at the VPS stage.

---

## 5. Names and IP

| Name | Problem | Fix |
|---|---|---|
| **"Shriekwing"** (plan §13, new monster) | **The first boss of Castle Nathria in World of Warcraft.** Direct WoW name. | Rename, e.g. "Screelhag" or "Wailmother". |
| **"Dungeon Finder"** (plan §0) | The name of WoW's group queue feature. | The plan already says "group finder" in §6.2 — use only that, and pick an in-world name (e.g. "the Callboard"). |
| **"Fellreach"** (game name) | (1) **"Fallow Reach"** is an existing one-server, one-world sandbox **MMORPG** (fallowreach.com) — near-identical sound, same genre. (2) "Fel" is strongly WoW-coded (fel magic). (3) "The Reach" is a Skyrim region. Three soft hits on the two IPs the owner banned and a live competitor. | Rename before anything player-facing is built. Ask the owner, offer 3–4 options (e.g. "Hollowmere", "Wendmark", "Thornhallow", "Greywold") and check each with a web search. Folder name can stay until then. |
| "Bog lurker" | Generic, but I believe it is also a WoW mob name (not checked). Cheaper to avoid than to verify. | Pick another ("mire stalker"). |
| "Carrion beetle", "world boss", "rare", "quartermaster", "layer", "phasing" | Genre terms; `layer`/`phasing` are WoW-flavoured but stay internal. | Fine; keep "layer"/"phasing" out of player text ("copy" is better, as the plan already says). |
| "Recall stone" | Function of a Hearthstone, name is fine. | Keep. |
| "Infinite Depths" | Emberveil's own term (Claude-facing here). | Fine. |

Add the names above to the banned-names test along with convention 9's list.

---

## 6. Tests

The plan's test table is good. What is missing or wrong:

1. **Load tests on the same VM as the server are not valid at 1,000.** 1,000 bot sockets + their decode +
   their AI will eat the same 12 cores and 10 GB as the server and make the server look worse (or, with
   lazy bots, better) than it is. Run bots from **another machine** (the owner's Windows PC over the LAN, or
   an hourly cloud VM). At 100 bots, the same VM is fine.
2. **Bots must herd, not spread.** Uniformly spread bots are the easy case. Test the real killers: **300
   bots in one town**, **150 bots arriving at a world boss within 60 s**, **1,000 bots logging in within 2
   minutes** after a restart, and the reconnect storm the plan already lists.
3. **Measure tick p99 and the worst tick in 10 minutes**, not the average. GC shows up there.
4. **Evil client suite**: speed hack, teleport, cast off cooldown, cast out of range, loot a chest 300 m
   away, trade an item you don't own, replay a uid, oversized messages, malformed JSON/binary, 1,000
   messages/s from one socket. Each must be rejected and logged, and the server must stay up.
5. **Persistence chaos**: `kill -9` the server at random points during trade, mail, market, logout and
   zone change, 500 times; total items and gold across all characters must be unchanged (an **item and gold
   conservation check** after each run).
6. **Restore drill**: restore last night's dump into a scratch DB and boot against it.
7. **Fencing test**: freeze a process holding a character lock past the heartbeat, let another take it,
   unfreeze the first — its save must be refused.
8. **First-hour bot** (§1.3) and **template variety bot** (§1.1).
9. **Parity test** Farhold vs Fellreach damage for the same seeded cast (§4.1).
10. **Party scaling sim**: five-player parties of every role mix through a dungeon; flag any dungeon
    that is a wipe or a walkover for a full group. Fix with monster health/mechanics, never by cutting
    player power.

---

## 7. Numbered concrete changes for plan v2

1. **Zone archetypes (~12) with their own budgets**; neighbouring zones may not share one. Every owner-listed
   feature still appears in every province.
2. **A ~120-template point-of-interest library** is a named deliverable with its own stream; test "5
   neighbouring zones ≥ 40 distinct templates".
3. **New multi-tier dungeon generator** (`dungeon-tiers.js`, 8 layout families, shortcut back up, reward
   room, loop-back exit) wrapping `dungeon-plan.js`.
4. **Legible treasure clues** and more cross-zone treasure chains.
5. **Anti-emptiness package**: population-scaled realm-wide events with free travel to them, auto-forming
   open-world groups, player traces (graves, camps, cleared-banners), one starting province until ~300 CCU.
6. **Write the first hour** and test it with a bot.
7. **Party join link + guest play forever**; accounts only for abusable verbs.
8. **Level sync both ways.**
9. **Province = simulation room**; drop ghost mirroring; copies per province; sleep by AOI cell.
10. **Server sim in a Web Worker + loopback first** (Wildmarch §1), same code in Node.
11. **Binary snapshots from M1**, encoded once per AOI cell per tick.
12. **Defer lag-compensation rewind**; server tolerance windows instead.
13. **Ally heals, threat, taunt, Tab target move into M1.**
14. **Price the combat port honestly**: extract AI/status ticking into shared pure modules (owner OK
    needed), fork `castSkill` with a parity test.
15. **Split M1 into M0 / M1 / M1.5**; JSON-file saves before Postgres.
16. **Security wall before any public link**: separate Linux user, systemd hardening, serve a published
    allowlisted copy, only the game port tunnelled, admin off the tunnel.
17. **Admin/moderation page and nightly backups to S3 move to M3**, with a restore drill.
18. **Supabase Auth (JWT) for accounts**, guest tokens claimable; a privacy note.
19. **Fencing token on the one-writer lock**; cross-character moves as one versioned transaction.
20. **Chibi 2 look cache + build queue + animation LOD**; cap full-detail players on mobile.
21. **Bake World Forge at ~192 × 144** and give each zone a block of cells.
22. **Load tests from a second machine at 1,000; herd scenarios; p99 ticks; evil client; conservation
    checks.**
23. **Rename** Shriekwing, drop "Dungeon Finder", rethink the game name (Fallow Reach collision + "fel" +
    "the Reach"), add these to the banned-names test.
24. **Cut lockpicking from v1**, defer Challenge mode and the market hall (trade window first). Nothing the
    owner asked for is cut.

---

## 8. The five biggest risks

| # | Risk | Why it kills the project | Mitigation |
|---|---|---|---|
| 1 | **Procedural sameness** | 300 zones built from ~35 templates on a uniform budget read as filler by hour three; the owner's "each zone a full explorable region" promise fails even though every box is ticked. | Archetypes (1), template library with a variety test (2), multi-tier dungeon families (3), hooks, province palettes and cultures. Measure templates per hour, not points of interest per km². |
| 2 | **An empty world** | 0.2–3 players per zone. MMO feel needs to see people. | Gravity-well hubs, population-scaled realm-wide events with free travel, open-world auto-groups, player traces, one starting province, party join links. |
| 3 | **The combat port is much bigger than planned** | Farhold's cast pipeline and AI are browser-bound (`main.js` 733-line `castSkill`, Three.js in `actors.js`). Underpriced, it eats M1 and nothing is fun for months. | M0 with one class and one monster on the real `strike`; extract AI brain, fork `castSkill` with a parity test; port the pipeline once, then classes are data. |
| 4 | **Public exposure of this VM** | The VM holds the sudo password and API keys; a path traversal or dependency hole on a public link leaks them. | Separate user, systemd hardening, allowlisted published client, game port only through the tunnel, admin off the tunnel, move to a VPS before the population grows. |
| 5 | **Load tests that lie** | Bots on the same 10 GB VM, spread evenly, averaged ticks — the server "passes" and then falls over at the first world boss. | Bots from a second machine, herd scenarios (town, world boss, login storm), p99/worst tick, binary snapshots encoded per cell, province rooms ready to move into worker threads. |

Sources for the name checks (2026-10-04): [Fallow Reach](https://www.fallowreach.com/) ·
[Shriekwing — Wowpedia](https://wowpedia.fandom.com/wiki/Shriekwing) ·
[Shriekwing — Wowhead](https://www.wowhead.com/npc=172145/shriekwing)
