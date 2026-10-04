# Fellreach — independent review of plan v1 (step 4)

**Status:** 2026-10-04. Claude-facing (third-party names allowed here only). Reviewer: an independent agent,
staff-engineer + lead-designer pass, written without seeing the roast. Inputs: the owner's verbatim request in
`~/claude/agent/mmo-checklist.md` (binding), `playground/CLAUDE.md`, [`research.md`](research.md),
[`plan-v1.md`](plan-v1.md). Facts below were checked on this VM and on the web today; where the plan's facts
were wrong or incomplete it says so.

**Verdict:** greenlight the *direction* (own Node server + Postgres, VM first, tunnel for the first public link,
generated land + authored overlays). **Do not start M1 as written.** Six blocking issues below, two of which
change the architecture (who owns the sockets; what a "zone" and a "copy" are) and one of which is most of
M1's real work (Farhold's combat is not actually server-ready).

---

## 1. Requirements traceability

| # | Owner asked for (verbatim intent) | Where plan v1 answers it | Rating | Note / fix |
|---|---|---|---|---|
| R1 | Roast, review, refinement; fun elements survive | §0 "genre feel" list; checklist steps 3–5 | OK | The §0 list is good. Add one thing it is missing: a **continent-wide story arc** (Skyrim's main quest) — only province questlines exist. |
| R2 | Classes and items similar to Farhold | §3 (30 classes, 180 skills, talents, perks, affixes, uniques, sets) | **Weak** | Data reuse is real; *rules* reuse is overstated — see B1. |
| R3 | "Everything else like Skyrim" | §0, §2, §5 (go anywhere, density, open every chest, faction lines) | OK | Missing: a main story; NPC schedules; "see it, walk to it" depends on view distance across zone edges (§2.5 streams only within 200 m of an edge — horizon will be empty past one zone; add a low-res far-terrain ring from the world bake). |
| R4 | No more planets; one huge world | §2.1 one continent, 24×18 grid | OK | Farhold's `planet.js` is a sphere/planet pipeline; the bake must be new code on top of `worldgen/` (plan implies this; make it explicit). |
| R5 | **Hundreds of zones** | ~300 land zones | OK | |
| R6 | **Each zone a full explorable region with cities, towns, forts, farms** | §2.4: one settlement **or** a fort per zone; cities only in 12 province capitals | **Weak** | A 1 km² zone cannot hold "cities and towns and forts and farms". Owner's words describe each zone as a region. See B6 for the zone-size fix. |
| R7 | Multi-tier dungeons | §2.4 one per ~2 zones, 2–4 floors; Depth | Partial | Owner lists dungeons per zone. They are generated, so one entrance **per zone** costs little; do it. |
| R8 | World boss events | §6.3 one per province (12) | **Weak** | Owner lists them per zone. Keep 12 big province world bosses, and add a rotating **zone event boss** (elite set-piece from the 22 events / warlords) to every zone. |
| R9 | Rare enemies | 2 per zone, timers, roaming, chat call-out | OK | |
| R10 | Hidden treasure | 1 chain per zone, `treasure.js` new | OK | |
| R11 | "And more" | caves, ruins, camps, shrines, hooks, radiant jobs, events, harvest | OK | |
| R12 | Farhold/Emberveil characters and elements | §0, §3, §13 | OK | |
| R13 | No Skyrim/WoW IP or names | §0 + banned-names test §12 | **Bug** | **"Shriekwing" (§13) is a WoW raid boss name** (Castle Nathria). Rename. "Challenge mode" was a WoW dungeon mode too, but the owner already accepted Normal/Challenge in Wildmarch, so it stays. "Group finder" is generic enough; "party board" would be safer. Add these to the banned-names test fixture. |
| R14 | Server, runs like an MMO, 100–1000 players | §9, §14 load gates | **Weak** | The 1,000 figure does not fit the stage-2 design (see B2 and §3 arithmetic). |
| R15 | Parties, "etc." | §6.1–6.2, §7 | OK | |
| R16 | Instances to split load, **except towns** | §2.6 zone copies at 80; towns raise the cap to 250 | **Weak** | Towns live *inside* zones, so when a zone splits, its town splits with it. Contradicts the owner. Fix in B3. |
| R17 | Public link anyone can join | §9.5 step 2 (Cloudflare Tunnel at M3) | Partial | No security model for exposing this VM (B4). No sign-up abuse control. |
| R18 | One server for now, multiple later | §4.3 `realm` id | OK | |
| R19 | Host: CF / Vercel / Supabase / Cloudways / other | research §6, plan §9.5 | OK | Conclusion holds; provider choice for 1,000 CCU should change (§4 here). |
| R20 | Works on this machine for testing first | §9.5 step 1 | OK | Postgres **server is not installed** (only `postgresql-client-16/17`); plan says "installed with apt" — it is a to-do, not a fact. |
| R21 | New models into avatar-3d (or another experiment), usable by Farhold **and Bannerline** | §13 + library test | Partial | Farhold path is right (`chibi2-parts.js`, `creature-types.js`). Bannerline imports `chibi2.js`, `creatures.js`, `class-outfits.js`, `creature-poses.js`, `mesh-merge.js` but picks looks through its own `js/view/unit-looks.js` — add a test that every new creature type builds through `createCreature` headlessly and appears in `avatar-3d/creatures.html`, and note that the proctown farm/fort kit is usable by Farhold only (Bannerline does not import proctown). |
| R22 | (Order) Finish Bannerline and others first, release, shelve ideas | checklist step 1 | n/a | Out of this plan's scope; tracked in the checklist. |

---

## 2. Blocking issues (fix in plan v2 before any build)

### B1. Farhold's combat is importable but not server-ready — the "rules port" is really an extraction
Verified today: `rpg.js`, `skills.js`, `skillmech.js`, `perks.js`, `effects.js`, `uniques.js`, `zones.js`,
`dungeon-plan.js`, `jobgen.js`, `planet.js` all import in Node 22 without error. But:
- **The cast pipeline lives in `main.js`** (11,040 lines): `castSkill` (from line 1588, ~730 lines) and
  `fireBolt` (line 1438) use `THREE.Vector3`, the HUD and the player controller. `skills.use()` only returns a
  plan; what a plan *does* is in main.js.
- **Enemy AI lives in `actors.js`**, which imports `three`, `createChibi2Character`, `createCreature` and
  `mesh-merge` — AI and meshes are one object. `player.js` (movement) imports `three` too.
- **Module-level singletons**: `skillmech.js` exports `world = { placed, corpses, walls }` and a private
  `ENV` set by `setMechEnv()`; `rpg.js` keeps `LEVEL_CAP` global. A server running many rooms would share
  corpses, traps and walls across every zone and instance.
- `Math.random` / `Date.now` defaults remain in `affixes.js`, `skillmech.js`, `effects.js`, `zones.js`,
  `followers.js`, `uniques.js`, `skills.js` (callers can pass `rng`, but defaults leak).

**Fix:** make "headless combat core" an explicit M0/M1 deliverable owned by stream C:
`js/rules/cast.js` (port of castSkill/fireBolt over plain `{x,y,z}`), `js/rules/monster-ai.js` (port of the
actors.js brain, no meshes), and a **room context adapter** that swaps skillmech's `world` lists and calls
`setMechEnv(room.env)` before each room steps (rooms step one after another in a process, so a swap is safe),
with a test that two rooms never see each other's corpses. Add **parity fixtures**: same skill, same seed,
same target → same damage in Farhold and Fellreach. Accept that Fellreach forks the orchestration (copying
~1,500 lines) rather than editing Farhold's main.js — say so in the plan. Drop the Bannerline-style purity
rule as a *determinism* requirement (an authoritative server does not need lockstep determinism); keep it only
as "no `three`/`document`/`window` in `js/rules/**`", and pass a seeded rng everywhere for tests.

### B2. Stage 2 puts every socket on one thread — 1,000 CCU will not fit
Node `worker_threads` cannot own a `ws` socket; in the plan's stage 2 the main thread still parses all input
and sends every snapshot. The arithmetic in §3 shows the socket + snapshot work alone is ~15 ms/tick at 1,000
players, on top of whatever simulation the main thread keeps.
**Fix:** design for **province processes that own their own sockets** from day one. The gateway only logs in
and hands out a signed short-lived ticket + the process address; the client opens its game socket straight to
that process (routed by path, e.g. `/p/3`, through `cloudflared` ingress rules or Caddy). Changing province =
save, new ticket, reconnect behind a 1–2 s fade (which the plan already accepts). Stage 1 is the same code
with one process. No shared memory, no structured-clone hop, scales to more machines unchanged.

### B3. "Zones" and "copies" are the wrong units; towns get split
Copies per 1 km² zone + ghost mirroring across every zone edge is the hardest part of the plan (entity
handoff, ghost consistency, a monster chasing you across an edge) and it still splits towns.
**Fix:**
- A **province copy** is the simulation unit: one room, one spatial grid over the whole province (~25 km² at
  current sizes). No ghosts inside a province — a zone is an authoring and level-band label, not a room.
- **Towns and cities are hub rooms** that never copy (hard cap 400, capital 1,000; the 150-entity AOI cap keeps
  clients sane). Entering through the gate is a seamless handoff inside the same process.
- Open-world crowding: open a second **province copy** at ~300 players in the open world (party and guild go
  together, as §2.6 says). Starter provinces copy earlier (~150).
This keeps "towns are shared" literally true and removes ghosts entirely.

### B4. No security model for a public link on this VM
This VM runs other servers on `0.0.0.0` (8400/8401/8430/8441/8442/8460/8471); `tools/serve.py` accepts
`POST /api/library/sync` and `/api/inbox/<name>` and **writes files**. `~/claude/secrets/` is on the same disk.
Required before M3:
1. **Named tunnel, one ingress rule**: `play.<domain> → http://127.0.0.1:<stable port>` and a catch-all
   `http_status:404`. Never route a playground port, Postgres (5432) or SSH. Quick Tunnels
   (`trycloudflare.com`) are capped at 200 in-flight requests with no SLA — fine for a 10-minute LAN-friend
   test, not for the public link.
2. Bind the game server and Postgres to `127.0.0.1` (LAN dev port separately, behind `ufw` to the LAN only).
3. Run the stable server as its own Linux user via systemd (`User=fellreach`, deploy copy under
   `/srv/fellreach`, `ProtectHome=yes`, `NoNewPrivileges=yes`). `/home/radgh` is already `drwxr-x---`, so that
   user cannot read the secrets or the agent tree.
4. Static file serving from an allow-listed directory only (no `..`, no dotfiles, no `.git`, no `server/`,
   no `tools/`).
5. WebSocket limits: `maxPayload` 16 KB; per-message-type token buckets; ≤ 4 sockets per IP (read
   `CF-Connecting-IP` only when the peer is the local `cloudflared`); Origin check; ping every 30 s
   (Cloudflare closes idle sockets at ~100 s); a protocol version handshake.
6. Account abuse: guest creation rate-limited per IP and gated by **Cloudflare Turnstile** (free); name filter.
7. Admin and debug endpoints on a separate `127.0.0.1` port, reached by SSH tunnel or Cloudflare Access —
   never on the public hostname. The public status page is read-only numbers.
8. A kill switch documented in the README: `systemctl stop cloudflared`.

### B5. Persistence: crash loss and trade duplication are under-specified
- "Save every 60 s if dirty" loses up to a minute of loot on a crash. **Fix:** a save is triggered at once by
  rare-or-better drops, level-ups, quest turn-ins, trades and any gold move over a threshold; the 60 s timer is
  the floor, not the rule.
- The character row needs a **`version` column** (optimistic concurrency: `UPDATE … WHERE version = $n`) on top
  of the session lease, so a stale process can never overwrite a newer save after a handoff.
- Trade: both characters' rows (pack and gold are inside the JSON blob) and any item rows change in **one
  transaction** with both versions checked. Today the plan only protects items "that left a pack".
- Crash recovery: on boot, expire leases older than 2× heartbeat; clients auto-reconnect with their token and
  resume from the last save. Test: `kill -9` mid-trade and mid-loot, then assert no item doubled or lost
  (the plan's chaos test, made concrete).
- **Backups from M3, not M5**: once strangers have characters, nightly `pg_dump` (compressed) to off-machine
  storage (S3 or Cloudflare R2) with 14-day retention, plus a weekly restore test into a scratch database.
- **Separate databases for dev and stable** (`fellreach_dev`, `fellreach_stable`) so bots and broken builds
  never touch real players.

### B6. World resolution and zone size don't produce "full regions"
- §2.2 bakes the continent at **24×18 — one sample per zone**. Coasts, rivers and biome borders at that
  resolution are blocks, and neighbouring zone bakes would have nothing shared to agree on. **Fix:** bake the
  world at ≥ 16 samples per zone edge (e.g. 384×288, a size `worldgen` already handles — its default is
  256×128), store it, and have zone bakes refine that field (noise detail only adds, never moves rivers).
- Owner's wording needs each zone to carry a settlement cluster, a fort, farms, a dungeon and wilds. **Fix:**
  **2 km × 2 km zones** (~4 km², ~6 min to walk across, ~3 min to ride), **~200 land zones** (still "hundreds"),
  each budgeted: 1 town + 1–2 hamlets with farms, 1 fort, 1 dungeon entrance, 1–2 caves, 6–10 minor points of
  interest, a treasure chain, 2 rares, a zone event boss; a city in ~1 zone of 6 (province capitals plus a few
  regional cities). Heightmap 1025×1025 at 2 m (~2 MB u16) per zone — ~400 MB for all 200 on the server, fine
  on a 16 GB box, and only awake provinces are loaded. Generated content means 4× area is generator time, not
  writer time; the density test (§2.3 "longest boring walk") still gates it.

---

## 3. Tick budget arithmetic (1,000 players, 20 Hz, one Node thread)

Assumptions: 30% of players in towns, 70% in the wild; monsters spawn lazily and only those within ~80 m of a
player think; costs are typical Node 22 figures for this kind of loop and must be replaced by measured numbers
from `bot-client.mjs`.

| Work per 50 ms tick | Count | Unit cost | ms |
|---|---|---|---|
| Monster AI (target scan on grid + steering) | ~6,000 active (≈12 per wild player, overlap) | 4 µs | **24** |
| Pathfinding (budgeted queue) | 100 requests | 50 µs | 5 |
| Player intents (parse, validate speed vs heightmap) | 1,000 | 3 µs | 3 |
| Casts / hits through skillmech + strike | ~50 casts × up to 10 targets | 50 µs | 2.5 |
| Status/DoT ticks | ~6,000 | 0.2 µs | 1.2 |
| AOI grid rebuild + interest refresh (staggered at 4 Hz) | 7,000 entities, 250 clients/tick | — | 3 |
| Snapshot build, **binary** deltas | ~54 entity writes × 1,000 clients | 0.15 µs | 8 |
| Snapshot build, **JSON** (for comparison) | same | 1.5 µs | *80* |
| `ws.send` (no TLS at origin — the tunnel terminates it) | 1,000 | 6 µs | 6 |
| **Total (binary)** | | | **~53 ms → over budget** |

Readings:
- **One thread tops out around 400–500 CCU** with binary snapshots; JSON snapshots are fine only up to ~100.
- With B2's design (4 province processes, each owning its sockets) each process carries ~250 players
  → ~13–15 ms/tick, leaving GC and burst headroom. That is the 1,000 CCU answer.
- Per-client bandwidth: 54 writes/tick × 21 bytes × 20 Hz ≈ **22 KB/s** with the plan's fixed 21-byte entity
  record — **3× the 8 KB/s target**. Needs field-level deltas and quantised positions (idle entities send
  nothing; a moving one ~8 bytes) to land near 8 KB/s, and sending snapshots at **15 Hz** with 130 ms
  interpolation saves 25% of sends and per-packet TCP/IP overhead (~40 bytes per message).
- Load-test caveat: this VM has 12 threads (Ryzen 9 5900X) and **10 GB RAM**, not "12 cores" of headroom.
  1,000 bot clients decoding snapshots will steal CPU from the server; run the bots as 4 processes pinned
  with `taskset` to 4 threads and the server to the others, and repeat the 1,000-bot gate on the VPS.

---

## 4. Hosting — confirm with one change

**Confirmed:** own Node + `ws` + Postgres; VM + named Cloudflare Tunnel for the first public link; not
Vercel (WebSockets are beta and time-limited per connection), not Supabase Realtime as the game server, not
Cloudways (PHP-stack host), not Durable Objects as the main loop (wall-clock billing for always-ticking
objects, 128 MB per object). Supabase is optional as a hosted Postgres; a local Postgres on the game box with
`pg_dump` to S3/R2 is simpler and keeps database writes off the network.

**Challenged:** the home VM is fine for ~100 CCU (≈1 MB/s up) but not for 1,000 (≈8–24 MB/s sustained, i.e.
64–190 Mbit/s of home upload, plus uptime). And at 1,000 CCU the tick wants **dedicated cores**, not shared
vCPU (a noisy neighbour shows up as tick spikes). Pick the provider by where the players are: a US audience
should not be served from Hetzner's EU dedicated boxes (+90 ms).

| | ~100 CCU | ~1,000 CCU |
|---|---|---|
| **This VM + named tunnel** | $0 (domain already owned) | not viable (upload, uptime) |
| **DigitalOcean** | Basic 2 vCPU/4 GB $24 + backups ~$5 = **~$29** | CPU-Optimized 8 vCPU/16 GB ~$168 + ~4 TB over the included 5 TB × $0.01/GB ≈ $40 + backups ≈ **~$230** (4 vCPU/8 GB CPU-Opt is $84 but leaves no room for 4 processes + Postgres) |
| **OVHcloud US VPS** | ~$10–15 (unmetered traffic) | VPS-4 8 vCore/24 GB ~$23–40 unmetered — cheap, but shared cores; benchmark tick jitter before trusting it |
| **Hetzner** (EU only for dedicated) | cloud prices rose up to 173% on 15 Jun 2026 (CCX23 now ~€86) | AX41-class dedicated ~€49–57, unmetered — best value **if** players are mostly EU |
| Supabase Pro (optional DB) | +$25 | +$25 + compute add-on |
| Off-box backups (R2/S3) | < $1 | ~$1–3 |

Ranges are 2026 list prices from search results today; re-check on the day of purchase.

**Migration path:** (1) VM dev 8490/8491 → (2) VM + named tunnel, public, ≤ ~100 CCU → (3) one VPS with
dedicated cores in the players' region, same `systemd` units and the same Postgres dump restored, DNS flipped
at Cloudflare (minutes of downtime, announced) → (4) province processes split across a second box behind the
same gateway (B2 makes this a config change). Containers/Docker stay optional.

**Ports:** the playground convention is *stable = lower port* (8400) and *dev = higher* (8401). Plan v1 has
8490 dev / 8491 stable — swap to **8490 stable / 8491 dev** to match, and document it in
`tools/README-servers.md`. Stable runs from the existing `~/claude/playground-stable` worktree and is only
moved by `publish-stable.sh` (add Fellreach's node tests to its gate). Restarting stable must be graceful:
broadcast a 60 s warning, save everyone, exit; clients reconnect with their token. The **client is always
served by the same server as the socket** (no GitHub Pages copy of the client — a version mismatch would be a
silent protocol break); the protocol handshake refuses mismatched builds with "reload".

**Observability (M1, not M5):** `/status` (public, read-only, JSON + a small page): CCU total and per
province/instance, tick p50/p95/p99/max over the last minute, awake provinces, open instances, messages and
bytes in/out per second, save queue depth and last save latency, heap, uptime, build hash. Structured JSON
logs to journald. A `tools/status.mjs` that prints it for agents.

**Auth (recommended, simple and safe):** guest by default — the server issues a random 256-bit token, stores
only its hash, the browser keeps the token in localStorage; optional "claim this character" sets a username +
password (`scrypt`) so it survives a cleared browser. Turnstile on guest creation. No database keys, service
keys or secrets ever in the client; the client talks only to our server.

---

## 5. Content pipeline realism

Works: seed + bake + province sheets + per-zone budgets filled by generators that exist (proctown, dungeon-plan,
encounters, eventprops, jobgen, warbands, namegen). That is the only realistic way to fill hundreds of zones.

Gaps:
- **Hooks are not "small data recipes" when they need new geometry.** A giant's ribcage, a petrified army or a
  town on a bridge are model work. Split the library: ~60 *compositional* hooks built from kit parts and
  parameters (cheap, M2–M4) and ~20–30 *bespoke* hooks that each carry a model task in stream F. With ~200
  zones and "not within 6 zones of itself", 80–90 hooks are enough.
- **Tools the plan needs and does not list:** a world map viewer (provinces, zones, bands, hooks, roads); a
  **zone viewer** (top-down heightmap + placements + fingerprint diff against neighbours, like the proctown
  tuning page); a fly-cam "inspect" mode in the client; a dungeon floor viewer; JSON schemas + a validator run
  by `npm run test:unit` for province sheets, hooks, placements and quests.
- **Data formats:** baked binaries need a small header (magic, version, size, input hash) so a stale bake is
  detected rather than misread. `placements.json` should be typed records (`{kind, id, x, z, yaw, data}`) with
  every `id` resolving to real data (the Farhold R13 "every cost obtainable" lesson as a test).
- **Story:** province questlines are hand-written (12 × 5–8 steps ≈ 80 quest steps) — achievable. Add one
  short continent arc (6–10 steps) that sends players through 4–5 provinces.

---

## 6. Milestones and workstreams

**M1 is too big for a first slice** (bake, town, 3 families, rare, 2-floor instance, 4 classes, party,
Postgres). Insert **M0 — walking skeleton**, and keep every later milestone a playable slice with tests:

- **M0 (must exist before anything else):** server on 8491 serving the client and `/ws`; guest token;
  one heightmap from `worldgen` (no bake tool yet); two browsers on two LAN machines see each other move with
  prediction + interpolation; one class's basic attack and one monster family running **server-side** through
  the B1 combat core; Postgres saves position + XP; `/status` live. Tests: protocol table, room-context leak
  test, 2-context Playwright, 20 bots with tick < 5 ms, `kill -9` + reconnect.
- **M1 (minimum to prove the core loop with 2+ real players on the LAN):** the M0 world + one baked zone at the
  B6 size with one proctown town as a hub room; 4 classes; 2 monster families + 1 rare; loot with personal
  rolls and item uids; a party of 2–5 entering the same 2-floor dungeon instance and clearing it; logout/login
  keeps loot. Tests: parity fixtures vs Farhold for the 4 classes, SAVE_FIELDS round-trip, trade/loot crash
  test, 50 bots.
- M2–M6 as planned, with: binary deltas and the B2 process split moved to **M2** (they shape the protocol);
  security (B4) and backups (B5) as **M3 entry criteria**; the 1,000-bot gate re-run on the VPS in M5.

**Workstream fixes:**
- Stream C's first job is the B1 extraction (largest M1 task) — size it honestly.
- Stream G should own the **harness, bots, load and end-to-end** specs only; each stream writes its own unit
  tests under `tests/<stream>/`, otherwise G becomes a bottleneck and the owner of every file.
- Add **stream H — ops**: systemd units, tunnel config, backups, status page, deploy/graceful restart scripts.
- `library/data/defaults.json` is "append only" for stream F but is modified in the working tree right now by
  other work — F should add entries through one script that merges, not by hand edits.
- Shared-file rule stands: Farhold, Emberveil, avatar-3d and proctown are edited only by new files or opt-in
  options, and their suites run after any touch.

---

## 7. Non-blocking issues

1. Far horizon: add a low-res whole-province terrain ring from the world bake so mountains several zones away
   are visible (the "see that mountain" promise).
2. Pathfinding on a 2 m grid for thousands of monsters: use leashed straight-line steering + cached flow fields
   around camps, and a per-tick path budget (in the §3 table).
3. Lag compensation of 200 ms rewind on every melee arc is costly; store 10 history frames per entity only for
   entities inside any player's AOI.
4. Fast travel via waystones + carts + recall stone erodes "density beats size"; price it and require discovery
   (plan does), and consider "no recall stone until level 10".
5. Rares "announced in zone chat" invite camping; fine for MMO feel, but use per-copy spawns and personal loot
   (plan does) and a long respawn.
6. Followers taking party slots + group finder backfill with followers: good for low population — keep.
7. Day/night 2 h cycle: make nights readable (Farhold torches); never let night hide a telegraph.
8. Economy: a 5% + 5% market fee is fine; log faucets/sinks from M1 (cheap) rather than M5.
9. Mobile: Playwright mobile viewport for menus is listed; say plainly that the 3D game is desktop-first.
10. Fellreach is not in `~/claude/docs/projects.md`; add it (sandbox) and a `~/claude/docs/fellreach.md` line
    when the folder gets code.
11. `research.md` §7 says "12 cores" — it is 12 threads on 6+6 cores and 10 GB RAM; plan bot tests accordingly.

---

## 8. Recommended decisions for plan v1's open questions (§15)

| # | Question | Plan says | This review recommends |
|---|---|---|---|
| 1 | Raids | No for v1 | **Agree.** Province world bosses + zone event bosses cover big-group play. |
| 2 | Day/night | Yes, ~2 h | **Agree**, with readable nights and telegraphs always visible. |
| 3 | Seamless borders | Seamless in a province, fade between | **Agree on the player experience**, but implement as one room per province copy (B3), so "seamless" needs no ghosts. |
| 4 | Playable races | Human/elf/dwarf/halfling | **Agree.** Others stay warbands. |
| 5 | Level cap | 50 | **Agree.** |
| 6 | Housing | Parked | **Agree.** |
| 7 | Stealth | Lockpicking chests only | **Agree.** |
| 8 | Level sync | Yes, down-sync | **Agree.** |
| 9 | Starting provinces | 1 in M1–M3, 3 by M4 | **Agree.** |
| 10 | VPS provider | DigitalOcean | **Decide by player region at M5**: US → DigitalOcean CPU-Optimized or OVH US (benchmark first); EU → Hetzner dedicated. Dedicated cores either way. |
| 11 | Domain | ? | A subdomain of a domain whose DNS is already on Cloudflare (named tunnels need the zone on Cloudflare) — e.g. `play.radleysustaire.com`. Owner's call. |
| new | Zone size | 1 km, ~300 zones | **2 km, ~200 zones** with full regional budgets (B6). |
| new | Copies | per zone | **Per province; towns never copy** (B3). |
| new | Auth | guest, then accounts in M3 | **Guest token + optional claim with password, Turnstile** (§4). |
| new | Ports | 8490 dev / 8491 stable | **8490 stable / 8491 dev** to match 8400/8401. |
| new | Client hosting | game server or Pages | **Game server only** (version-locked to the protocol). |

---

## Sources (checked 2026-10-04)

- Cloudflare Quick Tunnels: 200 in-flight request cap, no SLA, WebSockets work — https://flaviocopes.com/cloudflare-quick-tunnels/ ; https://github.com/splatterfacegames/godot-phone-mass-controllers/issues/3
- DigitalOcean droplet pricing (Basic 4 vCPU/8 GB $48, CPU-Optimized 4 vCPU/8 GB $84, 5 TB, $0.01/GiB overage) — https://www.digitalocean.com/pricing/droplets ; https://onedollarvps.com/pricing/digitalocean-pricing
- Hetzner 15 Jun 2026 price adjustment (CCX23 to ~€86; AX41-class ~€49–57) — https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/ ; https://bex.co/blog/2026/09/17/hetzner-server-auction-dedicated-vs-cloud-fleet-nodes
- OVHcloud VPS (unmetered traffic, VPS-4 8 vCore/24 GB) — https://www.ovhcloud.com/en/vps/unmetered-vps/ ; https://us.ovhcloud.com/vps/
- Local verification: `nproc`=12, 10 GB RAM, Ryzen 9 5900X, no Postgres server package, no Docker/cloudflared;
  Node import test of Farhold modules; grep of `main.js`/`actors.js`/`player.js`/`skillmech.js`.
