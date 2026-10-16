# Thousandvale — changelog

Append-only, newest at the bottom, prefixed with the stream letter.

## 2026-10-04 — streams B, H, G (M0)
- **B** `js/rules/terrain-read.js` ★: pure terrain reader (height/normal/slope/water/biome/walkable, heightGrid/waterGrid, `gridIndices` with the same triangle split the reader uses — drawn = measured). File format `terrain.bin` v1 (magic/version/input hash, refused if wrong).
- **B** `tools/bake-test-zone.mjs` + `data/zones/test/terrain.bin` (6 MB): one 2×2 km zone at 2 m from World Forge seed 1000 — grassland/forest/marsh, 3 rivers, a village + 2 hamlets + a ford, spawn by the village. `tools/terrain-viewer.html`. `docs/world.md`. 10 node tests in `tests/B/`.
- **H** `ops/`: `start-dev.sh` + systemd user unit `thousandvale-dev.service` (8491) + `install-dev-unit.sh`; `postgres-setup.{sh,sql}` (role `thousandvale`, db `thousandvale_dev`, localhost; env in `~/.config/thousandvale/dev.env`); `SECURITY.md` checklist from PLAN §11. Thousandvale section in `tools/README-servers.md`; entries in `~/claude/docs/projects.md` + `playground.md`.
- **G** `tools/bot-client.mjs` (real WebSocket bots over `js/net/client.js`: login, wander, chase + swing at wolves, stats), `tests/load/server-harness.mjs`, `tests/load/bots20.test.js` (20 bots, tick p99 < 5 ms), `tests/load/reconnect.test.js` (kill -9 + restart + reconnect), `tests/e2e/two-players.spec.js` (2 contexts: see each other move, hit a wolf together).

## 2026-10-04 — stream A (M0 server core)
- **A** `docs/protocol.md` + `js/net/protocol.js` ★ (v1): message table with types/rates, binary snapshot v1 (8-byte walkers, idle = 0 bytes, FULL on enter/cell cross/band change), shared enums, events, the room <-> rules interface for C (`createRules(host)`), the client API for D.
- **A** `js/net/`: `snapshot.js` (encode once per AOI cell, concatenate per client), `client.js` (gateway + province sockets, guest token, auto-reconnect forever, clock sync), `sockets.js` (ws / worker / loopback, one shape), `clock.js` (virtual clock, drift-corrected ticker), `mirror.js` (entity table + samples for interpolation).
- **A** `js/sim/` (pure, runs in a Worker, under Node and in-process): `world.js` (gateway + province 0, tickets, leases, saves every 10 s / level-up / logout, 5 s linger, takeover, abuse kicks, /status numbers), `room.js` (20 Hz, input budget against speed hacks, 32 m AOI, 15/7.5/3 Hz bands, 150-entity cap, awake cells, camps, event routing), `entity.js`, `aoi.js`, `movement.js` (`stepMove`, shared with client prediction), `terrain.js` (B's baked zone or a stand-in), `rules-v0.js` (STAND-IN until C's `js/rules/index.js`: one swing, wolves, threat stub, leash), `store-memory.js`, `save-fields.js` (`SAVE_FIELDS`), `worker.js`, `loopback.js`.
- **A** `server/`: `main.mjs` (port 8491: allow-listed static files, `/gw` + `/p/0` over `ws` with 16 KB frames, Origin check, per-IP limit, `/status` + `/status.html`, SIGTERM saves everyone), `static.js`, `db/schema-v0.sql` + `migrate.js`, `db/pg-store.js` (lease + fence + version), `db/json-store.js`. `package.json` (ws, pg) in the game folder.
- **A** tests/A: 41 node tests (protocol table + fuzz, snapshots, AOI, movement parity, room views/bands/cap/leak/speed hack, rules errors, SAVE_FIELDS + leases, pg store, loopback e2e, crash/reconnect/takeover/linger, 20 bots p99 ~1.1 ms, real kill -9 on json + pg) + `worker.spec.js` (Playwright). G's tests/load pass against the server (20 bots p99 1.4 ms over real sockets).

## 2026-10-04 — stream C (combat core, M0 + M1)
- **C** `js/rules/index.js` `createRules(host, opts)` (protocol.md §7): Farhold's numbers in A's room, tested in the real `createRoom` (tests/C/room-rules). Slot 0 = basic attack, 1..6 = skill bar; refusals carry protocol codes + a sentence; kills pay through `host.award` + `loot` events with item uids; `levelFor/xpFor` = Farhold's curve; `serializeGear/restoreGear` for the save (char.gear).
- **C** Combat core (pure): `farhold.js` (the one import door), `engine.js`, `room.js` (per-room skillmech world/ENV/status hooks), `field.js`, `monster-ai.js` (EnemyField fork + threat targeting + leash + think radius), `threat.js`, `character.js`, `cast.js` (melee/bow/crossbow/wand/staff basic attacks, rewards), `cast-skills.js` (castSkill/fireBolt/skillrun fork, ally targeting, links, revives, placed objects, pools, kill rules), `targeting.js` (Tab). See `js/rules/README.md`.
- **C** tests/C (57 node tests): PARITY with Farhold's real runtime for warrior/rogue basic attacks, the moor hound brain, every skill of knight/cleric/warrior/pyromancer, staff/wand/bow/crossbow basics; room-context leak test; threat; party (ally heals, heal threat, taunt hold, link, revive); Tab targeting; purity; drift guard over 17 Farhold blocks; micro-bench (~35k swings/s, ~3 µs per monster think).
- **C** Farhold findings (not fixed in Farhold): stealth was never read (controller passed as `player`); the staff's charged mortar is identical to a plain bolt; melee skills borrow the last swing's strike shape.

## 2026-10-04 — stream A (M1 server side)
- **A** protocol **v2** (`docs/protocol.md` §10–§12): `party`, `chat` (party), `ignore`, `use`, `item`, `play.join`, `cast.held`; `joined.handoff`, `room.kind/area/town/dungeon`, `you.bag/equipment/ignore/opened`; `bag`, `equip`, `used`, `targetR`, `partyState`, `partyInvite`, `partyFrames`, `ignored`; `castR.text`.
- **A** rooms (`js/sim/world.js`, `realm.js`): the zone's town as a **hub room that never copies**, **wilds copies** (open at `copyCap`, close when empty), **dungeon instances** per party (`js/sim/dungeon.js`: 2 floors, stairs, mini-bosses, boss, reward chest once per character, loop-back exit; STAND-IN layout until E's dungeon-tiers.js), handoffs that keep hp/mana/rules state, login placement (join link → next to the leader; saved room; lost instance → the door).
- **A** parties (`js/sim/party.js`): invite/accept/decline/join-by-code/leave/kick/lead, 5 max, join link `?join=CODE`, party chat, 2 Hz party frames, `e.data.partyId` for the rules.
- **A** loot: personal, straight to the bag, server-wide uids (`<process>-<nonce>-<n>`), rare+ saves at once, bag cap 120 (overflow → gold), chests per character, item ops with ownership checks; SAVE_FIELDS + `bag`, `equipment`, `opened`, `ignore`, `exit`, `mutedUntil`.
- **A** chat: say (40 m) + party, cleaned text, ignore lists, admin mute + filter hooks. Tab-target validation (`targetR`) + `js/net/tab.js`.
- **A** faucet/sink log (`js/sim/economy.js`, schema v1 `economy_log`, `/status.economy`).
- **A** fixes: Node 22 refused ws → close (G's find), `--process` lease prefix (G/H caution), over-rate messages no longer count toward the abuse kick.
- **A** tests/A: 55 node tests + worker.spec — new m1-rooms, m1-social, m1-crules (real combat core in the M1 world), tab, bots50 (50 bots / 30 in town, C rules: p99 5.5 ms on a quiet VM, town 3.8 KB/s, wilds 1.3 KB/s down per client).
- **G** (later 2026-10-04): bots handle protocol v2 (start in the town hub, walk out to the wilds, re-read ids after a handoff); `nodeSafeWsFactory` works around Node 22's WebSocket never firing `close` on a refused connection (reported to A). 2-context spec green. bots20: steady p99 ~3.3 ms, but one 49–101 ms tick when many players hand over town → wilds at once (reported to A; the test stays red on max until fixed).
- **B**: `groundAdapter(t)` — the Farhold ground.js walker shape stream C asked for.
- **H**: dev unit installed and running on Postgres (`systemctl --user status thousandvale-dev`).
- **C** (perf + A's M1 asks) Room handoff reuses the player's sheet (`e.r.unit`: statuses, cooldowns, mana kept; `field.detach` + runtime `forget` in the old room): **4.5 ms -> 0.025 ms** per handoff. A fresh build caches its skill-bar descriptions per process (`character.js buildSkillBar/fillSlots`, drift-guarded): 4.5 ms -> ~0.5 ms. No description text is generated in the tick (profiled). bots50: p99 5.5 -> 2.6 ms. Loot goes through `host.award({xp, gold, items, from})`; `equip/unequip/gear/saveGear/rollLoot/onParty` on the rules object, gear restored from `char.equipment` (stand-in items ignored); `e.rank` elite -> champion + 1 modifier, boss -> rare + 2 modifiers that never leashes (or a real boss def); `host.safeZones` honoured; B's `groundAdapter` used when the room exposes its reader.
- **C** ENCOUNTER ENGINE (owner request: telegraphs, boss mechanics): `js/rules/encounter.js` + `telegraph.js`, data `data/encounters/` (format `docs/encounters.md`). Telegraphs (circle/ring/donut/cone/line/cross; target/self/home/random/each/farthest/scatter/object; chained, rotating, growing, follow-the-player) resolve at the end of their wind-up — step out and you take nothing. Every ordinary monster gets telegraphed specials by family/role, scaled by rank. Boss scripts: phases by health, NEW health bars, adds, shields, call-outs, cast bars, interrupts, tank-swap stacks, stack/soak/safe-spot mechanics, line of sight behind pillars and fallen rocks, braziers/levers/pools as arena objects with triggers, soft + hard enrage, wipe reset. Three examples: packleader (elite), briar_colossus (zone boss), barrow_warden (M1 dungeon boss). Events `tele/teleR/castbar/castX/phase/say/enrage/obj`. 15 new tests (dodge, phases, enrage, mechanics, determinism, room isolation, 300 telegraphs x 40 players = 0.4 ms/tick, data validation, real-room integration).

## 2026-10-04 — stream A (encounters on the wire, E's dungeons, crowd handoffs)
- **A** protocol: encounter events `tele teleR castbar castX phase enrage say obj boss` + `EVENT_FIELDS`, `TELE_SHAPES`, `OBJ_STATES`, `OBJ_TYPES` (protocol.md §6); the room fills `x, z` from `id`.
- **A** arena objects: rules-owned objects (`data.rules`) — `use` → `rules.useObject`; `host.objState` (state in `info` for late joiners + `obj` event); objects spawned by the rules are registered like the room's own.
- **A** dungeons now come from stream E's `js/rules/dungeon-tiers.js`: plan name/look, monster types + encounter scripts per pack, gates that block until the floor's lever is pulled, shortcut stairs.
- **A** `host.terrain` (B's reader for C's `groundAdapter`); realm reads B's `sites[].radius` and a `dungeon` site when present.
- **A** town-edge handoffs queued 3 per tick (G's 101 ms crowd tick → worst 4.9 ms for 20 at once).
- **A** tests/A: 60 node tests + worker.spec green (new m1-encounter; m1-crules pulls the real scripted boss).

## 2026-10-04 — stream E (content, M1)
- **E** `js/rules/dungeon-tiers.js` ★ (pure): multi-floor dungeon generator returning protocol §10.3. 8 families registered, 2 ready (`crypt_spiral`: a ring of rooms spiralling into a central vault; `mine_descent`: a switchback shaft with galleries), planned ones fall back. 1–4 floors, +2 levels a floor, entry/arrival, ≥3 fight rooms, a key room with a **lever** that opens a **gate** in front of the mini-boss (or boss) room, a mini-boss per floor, boss + reward room + loop-back exit on the last, **shortcut up** on deeper floors, encounter id + body per boss pack, dungeon `name` and Farhold `look`. `opts.arenas` lays an encounter's arena objects into its room as `props`.
- **E** `tools/dungeon-viewer.html` (floors side by side, rooms by kind, packs by rank, gate/lever/stairs/exit/chest/shortcut, arena objects, "behind the gate" shading, hover readout, seed stepping, phone layout).
- **E** encounters (C's format, listed in `data/encounters/index.json`): crypt — `mb_marrowgnaw`, `mb_gallowmother`, `boss_hollow_abbot`; mine — `mb_rustjaw`, `mb_seep_mother`, `boss_deep_foreman`; wilds — `elite_hobb_gallowsby`, `rare_grisel_thornhide`, `rare_sallowmaw`, zone event boss `event_grandmother_skein`; `specials_torbor.json` = telegraphed specials for all 14 M1 monster types (needs C's type lookup). Mechanics: tank cones, spread, stack, soak, safe spots in candlelight, line-of-sight cover that breaks, interrupts (hymns, lullabies, bandages, stamping out fuses), shields broken by lighting braziers/fuses/egg sacs, collapsing floors that leave pits, prop-breaking charges, levers, healing seep pools, enrage (soft + hard), new health bars, call-outs with personality.
- **E** `data/provinces/archetypes.json` (12 named, heartland + marsh ready), `data/provinces/torbor_downs.json` (starter province sheet, zone `test` = The Torbor Fields), `data/vignettes/m1.json` (8) + `placements/test.json` via `tools/place-vignettes.mjs`, `data/quests/test.json` (12 quests, 7 NPCs), `data/hooks.json` (The Singing Ford), `data/names/torbor.json`.
- **E** tests/E (32 + 1 todo): dungeon invariants over 232 dungeons (reachability, floors connected, gate isolates the guarded room, lever reachable, A's stand-in helpers accept the plan, arena objects fit their rooms), every encounter FOUGHT in C's engine (phases, bars, shields, triggers, enrage, death), content rules, banned names (found "Maul" and "Fury" in my own names — renamed; C's `specials.json` still has "Maul"), references resolve, placements on real ground.
- **B** M1 bake v1: `tools/bake-world.mjs` (World Forge 288×224 → `data/world/world.json` + `macro.bin`: 18×14 zone grid, rivers with surfaces, lakes with levels, nodes, roads) and `tools/bake-zone.mjs` (any zone → `data/zones/<id>/{terrain.bin, placements.json, zone.json}`; world-fixed quantisation + apron so edges match bit for bit; hub town moved inward, levelled and planned with proctown, buildings facing streets; door/event/camp sites). M1 zone `z03_02` (Torborhold). Test zone gained settlement radii, a dungeon door with facing, and E's event + camp sites (heights unchanged). `tests/B/zone-bake.test.js`; viewer draws placements and zooms to the town.
- **G** M1: `tests/load/bots50.test.js` (30 bots in the town, 20 fighting): p99 5.0 ms, max 15 ms, 2.6 KB/s per player. bots20 green again after A's handoff queue. Bot `town` mode.

## 2026-10-04 — stream A (M1.5 server: safe to share)
- **A** save journal (`js/sim/journal.js`, schema v2 `char_journal` + `journal_seq`): deltas/add-removes group-committed every 2 s with fence checks; blob every 60 s / logout / rare drop / level-up, pruning the rows it contains; load = blob + newer rows. ≤ 2 s loss.
- **A** trade window (`js/sim/trade.js`, `trade` / `tradeAsk` / `tradeState`): ask → accept → offers → lock → confirm → one all-or-nothing store transaction (`tradeChars`); offered items locked; one trade per character.
- **A** human check: Turnstile verifier (`server/turnstile.js`, env `TV_TURNSTILE_*`, test keys in `server/env.example`), `welcome.human`, `guest {human}`, 20 guests/network/hour.
- **A** server: `--env dev|stable` with a DB-name guard, `--public <dir>`, `/healthz`, `--journal-ms`; snapshot copies for every store write.
- **A** content: zone sheet camp mix, named encounters (elite + escort, rares with 20–60 min respawns, event boss) at B's sites with `data.encounter` + names, dungeon family from the sheet, `hub: true` town, camps off every settlement.
- **A** bugs found by the chaos test and fixed: a pending journal row and a loaded character shared objects with live state (an `equip` row changed after it was queued; the memory store's blob was mutated by play), and `bagAdd` was journalled before the `equip` row that freed the item.
- **A** tests/A: 74 node tests (new: m15-journal-trade, evil, chaos ×500) + worker.spec green; pg store test covers journal + trade transactions.
- **C** M2 milestone 1 — ALL 30 CLASSES in parity: `tests/C/parity-classes.test.mjs` runs every class's bar (minus 12 follower skills) against Farhold's real runtime, 2 seeds, every frame. Ported for it: counter, ward, afterBolt (ricochet/split/returns), afterimage/echo, again, empowerRepeat, imbue (+ its burst/splash events), channels (start, ticks, break on move, end on re-press), rewind (room-clock history). Fixed on the way: timers now fire in due order; fear ending mid-tick keeps a target; a turned monster hard-taunts its own side without lifting threat; taunts hold their last tick (Farhold order); per-player last-strike shape for arrows/echoes. Shared harness `tests/C/parity-kit.mjs`. E's asks done (type specials, object names, scripted monsters skip Farhold phases/modifiers and take the script's name, "Maul" renamed). Arena objects use `host.objState`.

## 2026-10-04 — stream E (content, M2 starter province)
- **E** `js/rules/dungeon-tiers.js`: all **8 layout families** ready. The six new ones (`flooded_cistern` lattice snake with channel loops, `fortress_keep` paired halls up an axis, `cave_river` caverns along a meandering river with wide winding tunnels, `tower_climb` rooms round a square storey that narrows each floor, `barrow_maze` scattered barrows with winding loops and dead ends, `sunken_temple` cross-shaped nave/transept/apse) share one CHAIN builder: rooms placed, then joined by A* corridors with 2 tiles of clearance; corridors before the gate may loop and cross, the corridor into the guarded room and everything after it touch nothing, so the gate is a clean cut. **Encounter sets**: 2 per crypt/mine/cistern/keep, the other four borrow by theme; `set` option; `plan.encounters.setName`.
- **E** encounters (+49, 59 E scripts in index): crypt set B (Bell-Ringer, Chained Saint, Lantern Bishop), mine set B (Old Smoky the Firedamp, Glimmerback, The Hungry Cart), cistern A/B (Sluicegrip, Old Murkfin, The Drowned Reeve / The Drowned Lamp, Pipewalker, The Sunken Coffer), keep A/B (Sergeant Wark, Drummer Ossa, Castellan Odrun / Greycoat, The Spit-Imp, Warlord Hask), 30 zone rares (2 per zone), province world boss **Grimtallow, the Siege-Husk** (4 phases, 2 new bars, 4-player soaks, 5-player stack, signal fires, ballista levers). Every script carries a `party` note for M5 scaling.
- **E** province: `data/provinces/torbor_downs.json` 16 zones on a 4×4 grid (all 12 archetypes, neighbours never alike, bands 1-10 rising from the start, a dungeon family, 2 rares, a hook and a quest file each); `archetypes.json` all 12 ready; `rares.json`; `sites.json` (forts, farms, caves per archetype).
- **E** vignettes 8 → 85 (m2.json 51, m2b.json 26; the variety rule needed ~80), hooks 1 → 20 (6 bespoke model briefs for F); `tools/assign-vignettes.mjs` + `tools/province-graph.mjs` (which vignettes each zone gets; coordinates wait for B's new world).
- **E** quests: 15 zone files (90 quests, 56 NPCs), `province.json` story chain (10 steps through 10 zones, ends at the world boss), `jobs.json` (20 radiant frames), `treasure.json` (a chain per zone, 4 cross zones).
- **E** tests/E: dungeon invariants over all 8 families × sets, every script fought in C's engine, province rules, variety rule, quests/jobs/treasure/sites references, banned names (caught Fury, Rage, Rake, Blink in fork output — renamed).
- **A** perf: each client's frames in a tick leave in one socket write (cork/uncork), periodic blob saves start at most 4 per tick; G's real-socket 50 bots: p99 12.5 → 5.2 ms.
- **B** World re-chosen (coordinator ruling): pangea seed 1001, sea level 0.20 → 202 land zones in 12 provinces; starter province Petbeck Basin; E's Torbor Downs mapped onto zones x11-14 y1-4 (`data/world/province-map.json`), all 16 baked; starter zone `z12_02`, its town renamed Torborhold (hub). Banned words swapped at bake time. Zone bake v2: every settlement placed, levelled and planned (proctown, culture by province), roads graded/painted/stopped at town rims with links into high streets, bridges, `nav.bin`, `scatter.bin` (world-aligned, edge-safe). `z03_02` removed. tests/B 20 green.

## 2026-10-04 — stream D (client, M0 → M1 + owner's telegraph/boss request)
- **D** switched to A's stack: `js/net/client.js` (two sockets, guest token, reconnect, binary snapshots), `js/net/mirror.js`, `js/sim/movement.js` `stepMove` for prediction (inputs rounded before the local step so client and server run identical numbers: 0 corrections over 10 s of play in tests/D), `js/net/tab.js` for Tab. Stand-in server deleted.
- **D** ground: B's `terrain.bin` meshed in 64-cell chunks with 3 detail levels + skirts on the reader's diagonal (drawn = measured), biome-tinted splat (grass/forest floor/rock/sand/dirt), water from the water layer; a cheap Lambert path auto-picked on software renderers (headless 4 → 12 fps). Kit trees/rocks/bushes scattered by biome, a waystone camp at the town.
- **D** characters: Chibi 2 players from `{race, seed, cls}` (class outfits), humanoid monsters (brigands, cultists…) as Chibi 2 bodies from Farhold's bestiary looks, beasts as creatures (mesh-merged), elites/bosses scaled; nameplates with rank styling, speech bubbles, cast bars.
- **D** handoffs without reloading: town ↔ wilds keep the ground; dungeon instances drawn from `room.dungeon` (instanced flagstones + wall blocks, torches with 6 roaming lights, a carried lantern, gates that open when the lever is pulled), dark mood; objects (door, stairs, exit, chest, lever, brazier…) with gold highlight rings and an "E  Enter …" prompt → `use`.
- **D** party: frames (2 Hz, other-room/offline/dead states, click to target an ally), party menu (invite by name, copy the join link), invite pop-up, `?join=CODE` → lands next to the leader (verified two contexts: 1.8 m), party chat `/p`, `/invite /leave /kick /lead /ignore /link /help`.
- **D** bag + gear panel (B): rarity-coloured slots, item cards, click to wear/remove, right-click to destroy; loot lines and toasts by rarity.
- **D** OWNER REQUEST — telegraphs (`js/client/telegraphs.js`, geometry in `telegraph-shape.js`): circle / ring / donut / cone / line / cross hugging the terrain, tinted floor + glowing rim + fill sweeping from where the blow starts and arriving exactly when it lands (timed from the event tick), marching stripes, a "now" pulse, landing flash + burst, cancel fade, element colours, follow-the-caster; red screen-edge warning while you stand in one, a hit flash when it lands on you. Test: every drawn vertex is inside the server's `inside()`.
- **D** OWNER REQUEST — boss UI (`js/client/boss.js`): boss bar with phase ticks, a NEW bar per phase (pips "bar 2 of 3", refill animation), phase name flash, cast bar (gold when interruptible, "Interrupted!"), enrage clock (pulses under 30 s) and enraged look (red bar glow + an aura on the boss), call-out banners (`say`), works from C's events and falls back to any rank:boss monster in a fight. `tv.demoEncounter()` plays a fake fight through the real handlers for screenshots/the owner.
- **D** tests/D: 14 node tests (prediction vs the real server sim, telegraph drawn = measured ×6 shapes, terrain mesh split, looks, camp). e2e two-players green.

## 2026-10-04 — stream C (combat core, M2)
- **All 30 classes, all 180 skills in parity** with Farhold every frame (tests/C/parity-classes), with the follower
  system (js/rules/followers.js: companions, summons, temporary summons, decoys, hirelings, druid shapes, songs, stances,
  tempers) running on both sides; channels, rewind, afterimages, echoes, `again`, imbue, ricochet/split/returns, clusters,
  corpse bursts all ported — `PENDING_KEYS` is empty.
- **Every unique (233) in parity** (tests/C/parity-uniques): unique attack powers through Farhold's own `resolveAttack`,
  kill powers, on-hurt powers, auras.
- **Ally-targeting audit for all 30 classes** (tests/C/ally-audit, list in js/rules/ally-audit.md): 2,301 casts (every
  skill, every talent node, every druid-shape skill, every song finale) at a hurt, poisoned party member. Fixed what it
  found: group effects reached party members anywhere in the room (now 30 m); Foresight/Warding Spirits wards, Martyr's
  Vow barriers, Quicken/Rally statuses and `allyStatus: all` reached only your own followers, never the party; a ward
  could not be aimed at an ally; War Cry's Might (and any personal status) moved to whichever friend was targeted.
- Monsters slide along nav.bin obstacles when the room hands over `terrain.nav` (tests/C/nav-block; waiting on A to load it).

## 2026-10-04 — Stream E: Torbor Downs placed on the baked world (M2)
- `tools/place-vignettes.mjs` now places a whole zone's content on stream B's bake: 10 vignettes, forts (template from the
  fort's name), farms near settlements (burned/blighted in frontier/blight zones), caves by steep ground, the sheet's
  camps (each twice, where their `where` text points), 2 rares with walkable roaming loops, waystones (every settlement,
  the dungeon door, Grimtallow's arena), quest NPCs (town square / fort / vignette), treasure clues and caches, the zone
  hook — for all 16 zones (`data/vignettes/placements/z11_01 … z14_04.json`). Rules in `tools/content-place.mjs`
  (distance fields on nav.bin; reachability from the hub over all 16 nav grids stitched; stream B's own site rule so a
  re-bake never moves a door or arena). `data/provinces/torbor_downs-places.json`: sheet names on B's settlements + 8
  settlement asks for B.
- `tools/assign-vignettes.mjs`: pinned vignettes (quest/NPC/treasure references), measured biomes, no wet-only vignette in
  a dry zone, 10 per zone; variety worst 5-zone set 42 (≥ 40).
- 4 new vignettes (fen_witch_hut, tinker_wagon, hunters_hide, cult_cellar) so M2 quests no longer reuse the starter
  zone's vignettes within 2 zones; vignette biome tags widened to savanna/badlands/mountains (B's world has them).
- New data: `data/quests/events.json` (event director: Grimtallow fixed-time world boss, 3 more realm events, one zone
  event per zone), `data/provinces/schedules.json` (NPC day/night), `data/names/traces.json` (player traces), `camps` on
  every zone sheet, `farm`/`cave` job frames.
- `tests/E/placement.test.js` (15 tests): on land, reachable, off roads/plots/settlements (also checked independently
  against B's polylines and footprints), spacing, variety + sameness on the placed world, B's sites untouched, events,
  schedules, traces.

## 2026-10-04 — stream C (combat core, M2 follow-up)
- **Monster pathfinding** (js/rules/pathfind.js): weighted A* on a 2 m grid aligned to nav.bin samples, over
  nav obstacles, cliffs past 63° and deep water; only when the straight line is shut; per-room budget of 4,000
  expansions a tick; packs share paths; leashed monsters walk home round walls (snap home after 12 s); a
  monster following a path that reaches its target is not "stuck" for the leash while it gets closer.
  tests/C/pathfind: round a 50 m wall, round a cliff band, home round the wall, an unreachable target gives up,
  100 hounds in a maze (planner ~0.2 ms mean a tick, 100/100 reach their players). On the real z12_02 nav:
  0.36 ms per 30-80 m query cold. Flat terrains (Farhold parity) get no planner.
- **Warbands** (js/rules/warband.js, warbands.json installed into the bestiary): a leader spawns 2 of each escort
  type + its standard-bearer as room entities; the leader aura (×1.15, folded in once); the bearer's death ends
  it; the leader's death ends it and routs the escort (≥1 runs 6 s, comes back); sieges through a room's
  `structures`/`strikeStructure` hook (none provides it yet). tests/C/warband.
- **Party calls**: non-companion `command` orders reach party followers within 30 m; `empowerNext.pets` puts the
  rider on party members' next skill. Added to the ally audit.

## 2026-10-04 — streams B / G / H (world bake M2, tests + load, ops M1.5)
- **B bake size**: terrain.bin / nav.bin file version 2 — deflated, heights as planar-predictor residuals; new pure
  `js/rules/inflate.js` (sync RFC 1951 decoder, ~40 ms a zone). Readers open v1 and v2, API unchanged, bake hashes unchanged.
  17 zones 122 MB -> 14 MB. Bake tests compare checked-in files decoded (`sameLayerFile`).
- **B nav fix**: bridge decks were DEEP water in nav.bin, cutting the east column of Torbor Downs off (28–55 % reachable); decks
  are now stamped walkable in every zone they reach.
- **B E's places**: settlement/ford renames imposed at bake time (`wfName` kept), the 8 asked settlements placed exactly, the hub
  = the sheet's town, Saltmouth grown to a town; fords snap onto their river (Fitockpi Ford); a renamed town keeps its plan.
- **B theme terrain** (lead ruling): `data/world/zone-themes.json` + `tools/lib/zone-theme.mjs` — Brackwater fen (Black Mere +
  14 wadeable pools, marsh biome), Saltmouth's Salt Mere with a beach, Coldwater + Reflection meres; new placement kinds `lake`, `fen`.
- **B far horizon**: `tools/bake-horizon.mjs` -> `data/world/horizon.{bin,json}` (world at 32 m, exact in baked zones),
  `js/rules/horizon-read.js` (`parseHorizon`, `horizonRef`).
- **B M2 gate tests**: `tests/B/zone-reach.test.js` (reachability of 115 targets over the stitched province nav; sameness
  fingerprints, no repeated ground patch, no twin town plans; bridge decks walkable), `tests/B/horizon.test.js`;
  `tools/lib/province-reach.mjs`, `tools/lib/zone-fingerprint.mjs` (both CLIs). tests/B 34 green.
- **G**: first-hour bot v1 (`tools/first-hour-bot.mjs`, `tests/load/first-hour.test.js`): town -> party -> wilds -> fight + loot ->
  dungeon together -> fight inside, green. `tests/load/herds.test.js`: 100 real-socket bots, spread / town herd 100 / event herd 60.
  bot-client: `script` mode (goals from a driver, unstick sidestep), socket byte counting, party/used/loot/zone/realm/travelR.
  Harness: `TV_GAME_DIR` runs a frozen copy.
- **H**: `ops/setup-stable.sh` rewritten short + re-runnable (installs only what differs, restarts only on change, `--dry-run`
  without sudo), `ops/lib/check-stable.sh`, `ops/thousandvale-lan-only.conf` (kernel IP filter), `ops/stable.env.template`
  (Turnstile off until the client widget), unit no longer pins a single zone; backup/drill scripts path-overridable;
  `ops/scratch-pg.sh` (throw-away cluster, unix socket only); `ops/drill-local.sh` (backup -> restore -> boot -> conservation ->
  row counts, no sudo: PASSED); `tools/chaos-kill9.mjs --scratch`; publish gate now also runs `*.test.mjs` (stream C's tests).

## 2026-10-04 — stream A (M2 server: one province)
- **A** protocol **v3** (docs/protocol.md §15): province rooms (`room.zones/province/towns/waystones/horizon/clock`),
  waystones + `travel`, realm `text` + reminders, `zoneEvent`, richer `eventFrame`, `quest`/`quests`/`questR`, object
  `info.site/trace/banner/treasure/shimmer/waystone`, `you.waystones/treasure/quests`. client.js: `net.quest`,
  `net.gamePath`, unknown message types emitted under their own name.
- **A** stage 2 for real: `server/main.mjs --procs N` = gateway + N province processes owning their sockets (fd passing),
  restart on exit; `tests/A/stage2.test.js` (pg): relocate /p/0 → /p/1 by free event travel, kill -9 a child → the client
  comes back. Province status every second (was skipped at random).
- **A** the province: Torbor Downs as one room over 16 stitched zones (world metres, sparse AOI), 13 hub towns, starter
  copy cap 150; B's `nav.bin` stitched into `terrain.nav` for stream C. Dev unit switched to it (`torbor_downs` default).
- **A** stream E's placements as content (`js/sim/placements.js`): vignettes, camps (replace the ring guesses), rares with
  roaming paths, friendly/hostile forts (garrison NPCs or camps + chest), warband stockades as one leader row, farms +
  pests, caves as doors to 1-floor instances of the cave's beasts (instances now keyed per door), waystones, quest NPCs,
  hooks, treasure clues + caches (saved per character). Anything inside a hub town goes to that town's room.
- **A** events (`js/sim/events.js`, director rewrite): events.json picking (fixed schedule, minOnline, minInBand, weights,
  cooldowns, 5/1-min reminders, sizing 1 + 0.12·(n−1)), runner with waves → boss, flyover landings, enrolment and personal
  rewards; zone events in every copy (only while someone is in the zone); a town attack runs in the hub town's room.
- **A** quests + radiant jobs (`js/sim/quests.js`): E's 90 zone quests, the story chain, 23 job frames bound to what is in
  the giver's zone; kill credit shared (killer + 30 s of hitters + party in 60 m), visit by position, clear floors/bosses,
  rewards by level share; saved (`quests` in SAVE_FIELDS).
- **A** town folk from E's schedules.json over B's plots (forge/market/inn/home; guards at gates), barks within 6 m;
  traces.json lifetimes (graves 60 min/40, campfires 30 min/20, banners 30 min), footprints in 8 m cells by steps.
- **A** tests/A: 89 node tests (new placements, events, quests, stage2, bots100-real; m2 schedules). Gates: in-process
  100 bots p99 7.7–10 ms / worst 11–18 ms, real sockets p99 5.0–11.6 ms / worst 23 ms, bandwidth 2.3 KB/s spread, 8.0 town
  herd, 3.8 event herd — measured before C's 378fbbb, which took the spread phase to p50 14 / p99 23 ms (C's per-monster
  loops over ~1,300 monsters). Fixed on the server side with **dormant camps** (room.js `dormantCamps`, on for province
  copies): only camps within 200 m of a player exist; a calm camp left alone 30 s is parked with its escort and comes back
  whole. After: in-process p50 3.6 / p99 9.2 / worst 18.6 ms; real sockets (stage 1) p99 11.5 / 13.0 / 8.2, worst 30.6 ms.

## 2026-10-04 — stream D (client, M2: the province, the living world)
- **D** the province in world metres: `js/client/world-stream.js` streams the zone you stand in + any neighbour within 450 m (kept to 900 m, max 4), each with its own ground (terrain-view, shared textures, road paint from the bake's `road` biome), trees/rocks/bushes/reeds from `scatter.bin` (`scatter-view.js`: 128 m buckets, 3 tree LODs, ~700 m), the town from `placements.json` (`town-view.js`: proctown `describeBuilding/partsFor` in 8 instanced unit meshes, lit windows, lamp posts along main streets, the square's well + stalls, bridges, the barrow mouth at the door) and vignette props (`vignette-props.js`, the server's vignettePoint formula). Seams are bit-exact (tested), zone loads resolve on the ground so you never wait for trees.
- **D** far horizon (`horizon.js`): the whole world from `macro.bin` (288 × 224, 128 m) as one mesh, cut away under loaded zones with its border vertices pulled to the zone's edge height; settlement lights from world.json at night. Camera far 22 km, fog by time of day.
- **D** day/night (`daynight.js` + scene.js): the realm clock (`net.timeOfDay()`), 9 sky keyframes, sun by day, a moon + stars by night, nights blue and readable (hemisphere floor ≥ 0.72), leaves stop glowing at night, windows and lamps light up, the HUD clock. `?tod=` / `tv.setTime()` hold a time.
- **D** living world UI (`world-ui.js`, `css/world.css`): town folk (kind `npc`, Chibi 2 dressed by role) with E to talk; waystones (discover toast, travel panel with fares like the server's, travelR); realm event announcement with countdown, "Travel there free", the event frame; "Group up" from `groupHint`; zone deed feed + footprints from `zone.heat` (`traces.js`); graves/campfires (`C` makes camp); vignette lore on walk-in, notes, `use` objects, hidden caches that shimmer within 15 m; "Cleared by …" labels on doors (waits for A to put `banner` in `info`). Companions (non-folk `npc`) are drawn as their creature.
- **D** dungeon looks (`dungeon-view.js LOOKS`): all 8 families (crypt, warren, flooded, ruin, cave, vault, barrow, hollow) — surfaces, light colour, fog, wall height, props along the walls, tombs, mine beams, pools, glowing growths; `floor.river` drawn when sent. `tv.demoDungeon(family)`.
- **D** performance (100-player town): only the 30 nearest players get a Chibi 2 body (12 on low), the rest are one instanced draw call tinted by class; bodies far for 30 s are freed; mixers past 25 m tick at 10 Hz; nameplates capped (40/24) with no DOM writes when nothing moved. `tv.crowd(100)`: 100 wanderers in Torborhold = ~180 draw calls on low.
- **D** skill bar: keys 1–6 cast slots 1–6 (F = strike), from `you.bar` when the server sends it, else Farhold's skills.json (all 30 classes, unlock 1/3/6/12/18/24); friendly skills target your friendly target or yourself.
- **D** input clock keeps real time down to 4 fps (slow machines used to walk at a third of the speed); autoplay connects while the title scene loads; title screen in Torborhold's square (z12_02).
- **D** demo hooks: `tv.demoLiving()`, `tv.demoUsed({...})`, `tv.demoDungeon(f)`, `tv.crowd(n)`, `tv.fly(...)` (inspect camera), `tv.view()`, `tv.setTime()`, `tv.hud(false)`, `tv.world()`; `tv.state().stats` has `fps` + `lod`.
- **D** tests/D: 25 node tests (new world.test.js: zone choice + hysteresis, seam heights across a border, horizon vs zone means, every baked building faces its street and fits its plot, scatter art + bucketing, day/night vs the server's night window, fares, dungeon looks + dressing beside walls, crowd LOD, footprints, skill bars for all 30 classes).
- **D** (same day, after A's protocol v3 landed) quests: NPC/note `used.offers/ready` -> Accept / Hand in in the dialog (`net.quest`), a quest tracker from `quests {active}`, `questR` toasts; `zoneEvent` soon/start/end call-outs + the event frame. A's `info.banner` / `info.trace` are read (door labels, grave cards). Verified live on the restarted dev unit (8491, torbor_downs): Elder offers three jobs, accept -> tracker. e2e two-players green (1.4 min). Screenshots: tests/D/shots/.
- **H/G chaos x500 vs Postgres PASSED** (2026-10-04, `tools/chaos-kill9.mjs --kills 500 --db pg --scratch`, run inside a frozen
  `--build-only` release so live-tree edits cannot break a restart): 500 real `kill -9`s, 8 bots incl. a trading pair, 1,881 monster
  kills, 727 items at the end, 177,840 settled-item checks — 0 lost, 0 duplicated, gold never fell; 20 database conservation checks
  green; worst rejoin 1.55 s. (An earlier live-tree run died when a half-saved `js/sim/save-fields.js` stopped the restart; a second
  earlier run was clean for 266 kills, then one bot did not rejoin within 30 s — not reproduced in 500 more, and the tool now prints
  the bot's state + the server log tail if it happens again.)
- **A** (later) B's 32 m horizon in `joined.room.horizon` (`bin, hash, step` from data/world/horizon.json); `floor.river` in
  dungeon descriptions; `zoneName` on realm/zone event views; stage-2 `/status` lists every child's rooms + bytes out.
  Event frames are serialised once per distinct set and shared by a crowd (room.js `send`).
  G's tests/load/herds.test.js on a quiet VM (load ≤ 1.1): stage 1 p99 5.6 / 6.1 / 5.8 ms (worst 29), stage 2 (`--procs 2`,
  pg) p99 5.2 / 6.5 / 6.4 ms (worst 30); bandwidth 1.9 / 10.0 / 9.9 KB/s per player.

## 2026-10-04 — Stream E: re-placed on B's re-bake + the boring-walk gate
- Re-ran assignment + placer on B's re-bake (names imposed, 8 asked settlements, theme water, fords on rivers, new hubs/doors).
  Every hook's need is now met except the_long_stair, pinned beside `road_138` in z11_01 for B to cut the cliff.
- `tools/boring-walk.mjs`: PLAN §16 "longest boring walk ≤ 250 m" (road: 235 m, cross-country: 240 m). The placer fills
  empty pockets with `wayside` dressing (new `data/vignettes/wayside.json`, 14 kinds) and extra camps (`filler: true`).
- `torbor_downs-places.json`: rename keys follow B's `wfName`; baked asks stay listed. tests/E: 113 pass (placement 16).
- **A** (follow-up to E's ad99280) placements' `features[]` hooks (Singing Ford, Bridge City, Thorn Wall with its `pts` line),
  the new `wayside` dressing as objects with their lore (data/vignettes/wayside.json, 405 of them), filler camps (915 camps a
  copy now — dormant camps keep only the near ones alive: empty tick 0.16 ms); hostile fort garrisons by zone archetype.
  Gates with the fillers: in-process p99 7.0 / 4.6 / 5.4 ms (worst 9.1); G's real-socket herds p99 6.2 / 6.2 / 6.0 (worst 37).

## 2026-10-04 — stream C (combat core, A's M2 province asks)
- `rules.bar(e)` for `you.bar`: Farhold's live skill bar with `ally` (aim at a friend) and `group` (reaches the party)
  flags from js/rules/ally.js — the same reading the ally audit checks.
- Rares walk their placement loop (`data.path`) when not fighting; event bosses take `data.scale` as a health multiplier.
- Province perf: sleeping monsters skipped by the push-apart and by syncOut; nearest player from a bucket grid; a
  per-tick monster index (`field.eachMonsterNear`) for players' fighting flags and followers' prey search; one
  "who is being fought" pass a second instead of one per player. 1,300 monsters + 70 players: 1.6 ms a rules step;
  bots100 (TV_PERF) spread phase p99 7.0 ms, worst tick 11.4 ms.
- A monster removed without dying (dormant camps) can no longer be killed afterwards by a held reference (no death,
  no reward). tests/C/province-rules.
- **B final round**: the_long_stair cliff (`cutCliff`, z11_01 road_138); door/event/camp sites pinned (`data/world/site-pins.json`)
  so re-bakes cannot move what E placed around; province-reach reads E's world-zone files (1,603 targets reached); H: dev unit on
  `--procs 1`. Full unit gate 390/393 pass, 3 perf skips.

## 2026-10-04 — stream D (M2 follow-ups from the lead)
- **D** E's placed content (`js/client/site-view.js`, from `data/vignettes/placements/<zone>.json` + `data/provinces/sites.json` + `data/hooks.json`): forts (watchtower, palisade ring with a gate facing yaw, stone keep with corner towers and curtain walls, warband stockade with tents, ruined walls, toll gatehouse) + their template props; farms (proctown farmhouse + barn, crop rows — burned/corrupted tints —, sheep/pig pens, orchard rows, a mill with sails) + props; cave mouths by template (hillside, barrow mound, old shaft); hooks from their `parts` (lines by `spacing`, or round the spot) and the Thorn Wall as brambles every 3 m along its `pts`; vignette props in the same pass. The server already sends the usable side (A's js/sim/placements.js): NPCs, camps, chests, cave doors, waystones, and new object kinds the client now draws — `clue` (read: chain + step dialog), `cache` (hidden, shimmers within its radius, "dig up"), `fort`/`farm`/`hook` markers (hook lore on walk-in).
- **D** camera collision (`js/client/solids.js` + controls `setBlocker`): buildings, fort towers/keeps/halls, mounds and big rocks (rock_large, boulder) stop the camera; it pulls in at once and eases back out (no popping past a corner). ~900 solids in the starter zone, an 8 m grid.
- **D** far players are low-poly chibi stand-ins (big head with hair and eyes tinted by people, tunic tinted by class, legs, arms, boots, a walking bob) — two instanced draw calls for up to 400.
- **D** dungeons on low quality: a faint glow in floor/wall stone, 4 brighter torch lights with longer reach, a brighter hemisphere, a bigger carried lantern, fog pushed out.
- **D** no stepping onto undrawn ground: if the next 2.5 m lie in a zone whose ground is not loaded yet, movement holds ("The land ahead is still loading…") and that zone loads at once, so prediction never runs on the horizon's rough heights (`tv.state().stats.edgeHolds`).
- **D** tests/D 28 (new: camera solids, every fort/farm/cave/hook in all 16 zones draws something near its spot, the far stand-in's proportions). Shots: tests/D/shots/m2b-*.png. e2e two-players green (1.9 min).

## 2026-10-05 — stream A (you.bar + D's asks closed)
- **A** `you.bar` (D ask 5 / C's `rules.bar(e)`): on `joined` (every room change too) and as a `you {bar}` patch after a level-up, a form/stance change (`fx kind:'form'`) or `room.barChanged(e)` (for a future talent op); queued per player and sent once after the rules tick (`js/sim/room.js` `barFor`/`barChanged`/`flushBars`, `js/sim/province.js` `joined`). protocol.md §15.10. tests/A/bar.test.js.
- **A** D's other asks were already live (checked): `info.shimmer` (entity.js), `room.dungeon.floors[i].river` (dungeon.js), `ev.zoneName` on realm/zone events.


## 2026-10-05 — stream H (ops, M3 "Public play" — scripted, nothing started, nothing public)
- **Going public plan** `ops/tunnel/README.md`. Owner decision: first a free trycloudflare **quick tunnel** for friends
  (`ops/tunnel/quick.sh` + user unit `thousandvale-quick-tunnel`: one origin 127.0.0.1:8490, no `[Install]`, `--start` refuses
  without a fresh check-public pass for the live build), Turnstile OFF for that test (random hostname cannot be pinned in a
  widget; written down, check-public prints it as WARN) and the lan-only drop-in stays. The **named** path for later:
  `ops/tunnel/named/` (config template validated by cloudflared, DynamicUser unit with LoadCredential, `go-named.sh` swaps
  lan-only for `public-egress.conf` = LAN + Cloudflare ranges only, `TV_HOST=127.0.0.1`). `ops/tunnel/rollback.sh` back to LAN.
- **Gate** `ops/lib/check-public.sh --mode quick|named` (PLAN §11 as a script) + `ops/lib/probe-public.mjs` live probes. Against
  the live stable 8490 today: 25 server-side/dotfile/traversal paths 404, POST refused, `/status` clean, 20 KB frame -> 1009,
  foreign Origin 403, 4 sockets per tunnel visitor, forged CF-Connecting-IP from the LAN ignored. Only red: the privacy page is
  not in the published build yet.
- **Offsite backups** `ops/lib/offsite-upload.mjs` (SigV4 PUT, no dependencies, optional openssl encryption; passes AWS's
  published signing example) + `thousandvale-offsite.{service,timer}` (own env file the game never loads; skips until the
  owner's bucket exists); `setup-stable.sh` installs them. **Privacy note** `public/privacy.html` (+ `ops/lib/delete-account.sh`).
- **Load kit** `ops/load/` (load server 8495 on the published release + scratch Postgres, `run-300.mjs`, `pack-bots.sh` -> a 7-file
  zip for the owner's PC). Same-VM rehearsal (server cpus 0-7, bots 8-11, other streams busy, load 3-9): **spread 300 PASSED**
  (p99 19.3 ms, worst 42.3, 5.2 KB/s a client, 300/300 joined in 4 s); **town herd 300**: p99 16.5, worst 52.2 (gate < 50) and a
  login storm of 300 in 4 s hit 124 ms — reported to A. tests/H: 10 green + 1 skipped until cloudflared is installed (it validates the named config).

## 2026-10-05 — streams G + D (sturdy e2e, bots that fight, fine far horizon, server skill bar)
- **G** `tests/e2e/two-players.spec.js` made sturdy without proving less (still: two players see each other move, are handed town -> wilds, land hits on the same pack and each sees the other's hit). It now waits on conditions, not clocks: the handoff (re-issuing the walk at ~4 fps headless), a LIVE monster in view from `tv.state()` (walking on outward in 40 m steps when none is), then both GATHER 28 m short of it and REST to 75% health (out-of-combat regen) before the fight, rising if killed; 150 s fight window, 8 min test cap. The town exit bearing had used world metres as zone metres. 5/5 green in a row.
- **G** `tools/bot-client.mjs` fight mode HUNTS: with nothing in its 30 m reach it walks to the nearest monster it can see (`opts.hunt`, 260 m) — E's camps sit ~140 m out of town, so bots20 had been 5 casts / 0 hits. Unstick (sidestep after 2.5 s against a wall) now runs in every walking mode, and a bot stuck at a town wall picks another exit bearing every third try. `tests/load/bots20.test.js` walks the bots out first (waits for 80% in the wilds, up to 60 s) and now asserts >= 60% made it out and casts >= BOTS/2: 285 casts, 94 hits, 7 kills, p99 2.25 ms. `tools/first-hour-bot.mjs` had gone red for the same reason (2 kills in 90 s, red on HEAD too): its search ring now heads for the nearest monster in sight first — green, 150 s, 7 kills. tests/load: bots20, bots50, reconnect, first-hour green; herds' timing gate skips without TV_PERF=1.
- **D** far horizon from B's `data/world/horizon.bin` (32 m, exact in baked zones) instead of macro.bin (128 m): `js/client/horizon-grid.js` (pure: prepare, chunk builder with skirts + cut-outs, LOD rings, budget helpers), `js/client/horizon-worker.js` (inflate + every chunk off the main thread), `js/client/horizon.js` (chunk streaming, `update(camera)` each frame, `stats()`). Chunks = one zone on high/medium (strides 1/2/4/8 by distance), four zones on low (strides 2/4/8/16). A chunk wholly under loaded zones is hidden; one partly under them is rebuilt with those cells left out — dropping the fragment discard is what made low as fast as the old macro mesh (software GL A/B: 11.4/8.1/17.7 fps vs 11.1/7.9/16.5). Falls back to the macro mesh if horizon.bin cannot be read, or with `?horizon=macro`. Shots: `tests/D/shots/horizon-{before,after}-{high,low}-{west,north,east}.png` (`tests/D/horizon-shot.mjs`). 7 new node tests (`tests/D/horizon-grid.test.js`: zone border vs horizon < 5 cm, counts, skirts, holes, LOD hysteresis, budget: high ~211k tris / low ~69k).
- **D** skill bar reads the server's bar (`joined.you.bar`, refreshed on `you {bar}`, protocol §15.10) through `barFromServer()` — `ally` sends a friendly target or yourself, `empty` slots say why — and falls back to Farhold's data only when the field is absent.

## 2026-10-05 — stream A: M3 "Public play" server (protocol v4)
- **Accounts** (`js/sim/accounts.js`, `server/passwords.js`): claim a guest with a username + password (scrypt N=2^15, off the
  tick thread; email optional, only for the reset stub), log in from any browser (fresh session token, only its hash kept),
  log out (that browser's token deleted; guests cannot), change password / reset with a one-hour code shown ONLY on the admin
  page (no email) — both end every other session. Limits: 5 bad passwords a username per 15 min, 10 an address per 10 min.
  Bans by account and by salted address hash. Tokens moved to `account_tokens` (old guests are carried over on first use).
- **Chat channels** (`js/sim/chat.js`, `chatfilter.js`): party, guild, zone, trade (5 s slow), world (10 s slow), whispers with
  an echo; public channels and whispers to strangers need a claimed account at level 5 (a guest whispers its party, guild,
  friends and answers whoever whispered it). Ignore works everywhere (offline names too), mute everywhere, a filter hook
  masks a short word list and checks names, `report` files the player's last 20 lines; three claimed accounts in 10 min =
  a 10-min auto-mute. Chat log 30 days (`chat_log`), a 5,000-line ring for the admin page.
- **Friends** (`friends.js`): 100 per character, offline names, `friendState` pushes (online / level / zone).
- **Guilds** (`guilds.js`): roster + 4 ranks + MOTD + guild chat, saved; founding costs 10 gold (taken by the province over the
  bus — a sink); invite / accept / kick / promote / demote / lead / leave / disband with rank rules; ops on one guild run in turn.
- **Mail** (`js/sim/mail.js`, province side): text + up to 6 items + gold, 1 gold postage; sending moves items and gold out of the
  blob and into escrow (`items`, uid = primary key) in ONE transaction, taking does the reverse; town only for send/take; 30-day
  expiry returns untaken letters (returned mail keeps); `return` / `delete`; `mailNew` on the gateway.
- **The Callboard** (`callboard.js`): the group finder at level 8 — 1 tank + 1 healer + 3 damage per dungeon (or 'any'), pop +
  30 s ready check, one party, everyone moved INTO the same instance (another province = a relocation that lands inside);
  declines requeue the rest in place; after 5 min a queue pops with `backfill: n` (followers: `rules.backfill`, asked of C).
- **Grimtallow as the realm event**: on-demand rule (E's prose parsed, or `schedule.onDemand`), the director's last runs kept in
  `world_state` across restarts, roaming to a neighbouring arena (E's `roam`), credit by CONTRIBUTION (damage / healing / killing
  blow; idle onlookers get nothing, fallen contributors still do), a World cache only contributors open, first kill of the day
  rolls one extra reward (`char.daily`, new SAVE_FIELD).
- **Admin page** (`server/admin.mjs` + `admin-page.js`): 127.0.0.1 ONLY (8492 stable / 8493 dev, `--admin-port`), token from
  `TV_ADMIN_TOKEN` or `<STATE_DIRECTORY|.data>/admin-token` (0600, never logged), Host check, JSON-only POSTs: online players,
  rooms, kick, timed mute, ban (+ address), unban, rename, last hour of chat, reports, reset codes, economy log, stats,
  announce, start a realm event.
- **Public mode** (`--public`): binds 127.0.0.1 unless `--host`, security headers, loopback peers NOT trusted (the tunnel arrives
  over loopback; visitors count by CF-Connecting-IP, believed only from loopback and only when it looks like an address).
  `/privacy.json` (`server/privacy.json`) lists what is stored. H's flags: `--guests-per-ip-hour`, `--guests-per-hour`
  (default 200 on stable), `--unlimited-ip`.
- **DB**: `schema-v3.sql` (account_tokens, ip_bans, friends, guilds, guild_members, mail, items, reports, chat_log, world_state,
  account columns) and `schema-v4.sql` (deleting an account cascades through escrow and chat lines; reports keep, unlinked).
- **Tests** (tests/A, all green): m3-accounts 5, m3-social 6, m3-mail 4 (incl. conservation over 200 random letters + a crash),
  m3-callboard 3, m3-worldboss 3, m3-admin 2, m3-pg 2.

## 2026-10-05 — stream D: M3 "Public play" client (protocol v4)
- **D** Title screen: **New adventurer** (guest, no questions) / **Log in** tabs (`connect({ login })`; the browser's guest key is set aside in `<token key>.guest`, not lost), **Forgot password** (resetAsk + reset on a signed-out gateway socket, `anonAccountOp` — the code comes from the keeper), **your characters** as chips when the browser already has an account (early connect), a **Privacy** link to `public/privacy.html`. `js/client/account.js`.
- **D** Account window (person button): claim a guest (username, password twice, optional email), change password, log out (claimed only; a guest is told why) -> clean title screen. **Turnstile** (`js/client/turnstile.js`): drawn only when `welcome.human` is present — Cloudflare's script is never fetched otherwise; token goes out as `guest.human` (connect's `human` fn) and `account claim.human`.
- **D** Chat window (`js/client/chat.js`): tabs All/Say/Party/Guild/Zone/Trade/World/Whispers with unread counts, the sending channel in front of the box, `/s /p /g /z /t /world /w Name /r`, `/invite /leave /kick /lead /link /friend /unfriend /ignore /unignore /ginvite /gleave /motd /report /mute /claim /help`; a **menu on every name** (whisper, party invite, add/remove friend, guild invite for officers, mute here (local, they are not told), ignore (server), report with a reason). `chatGate` refusals offer the claim form; `slow`/`muted`/`ignored`/`notFound`/`muted {until}` explained in plain words. Takes over `hud.chat`, so every system/combat/loot line lands on All.
- **D** Friends (O, `friends.js`): online first, level/class/zone, add by name, whisper/invite/remove, "X is online" lines. Guild (G, `guild.js`): found (claimed, level 5, 10 gold), invite pop-up with timeout, roster by rank with promote/demote/hand on the lead/kick exactly as `js/sim/guilds.js` allows (a test restates the server rule for all 16 rank pairs), MOTD editor, leave/disband, guild chat. Mail (M, `mail.js`): inbox (unread first, attachments, when it goes back), read, Take all, Return, Delete, Reply, compose with up to 6 bag items + gold and the postage shown, the town rule explained, `mailNew` badge. Callboard (J, `callboard.js`): role chips (default from class), dungeon list with fits/too low/too high and who is waiting, queue with a waiting clock, the **pop** with members, roles, ready ticks, hired-follower seats and a 30 s bar; formed -> the dungeon handoff.
- **D** Window buttons down the right edge (`menubar.js`) with key letters and badges (party size, friends online, guild online, unread mail, bag count, a "!" on a guest account); draggable windows that remember their place, cascade, and close with Esc (`ui-panel.js`); a confirm box in the HUD instead of `confirm()` (which froze the frame loop). **Help overlay** (F1 or ?) from `SHORTCUTS` in `social-core.js`; `/` starts a chat command.
- **D** World boss: `fx {kind:'shield'}` turns the boss bar into a barrier ("Shielded") with a blue shell on the boss (Grimtallow's "wall of blight"); the realm event shows its own announcement text and "has broken out to …" when `ev.roamed`; `tv.demoWorldBoss()` plays the phases, shield, cast bar and its four telegraph shapes through the real handlers.
- **D** Fonts served locally: `css/fonts/` (Cinzel + Alegreya Sans, OFL 1.1, Latin + Latin Extended woff2, licences beside them) — the page makes no Google request.
- **D** Pure rules `js/client/social-core.js` (+ `names.js` zone names from E's sheets through B's province map); tests/D/m3-social.test.js (11) — tests/D 47/47. Playwright `tests/D/m3-social.spec.js` (2 tests, green): title tabs + privacy + no remote fonts; two contexts claim, befriend, whisper + /r + world chat, name menu, found a guild + invite + MOTD + guild chat, mail an item and 5 gold and take it, Callboard + help, log out and log back in from the title with the item and guild intact. Its server is `tests/D/m3-server.mjs` (A's `startServer` + a loopback-only test hook for level/gold/items). `tests/D/m3-shot.mjs` adds a real Callboard pop (4 Node bots + the browser) into the dungeon. e2e two-players still green.

## 2026-10-05 — streams C, E, G, H (M3 follow-ups)
- **C** `rules.backfill(entity, n, { roles })` (js/rules/index.js): Callboard seat-fillers of the missing roles (tank Shield Warden, healer Field Mender, damage Blade for Hire / Longshot / Hedge Burner from Farhold's mercenaries.json) on the normal follower brain; outside the follower-slot gate; the hired healer heals the most hurt party member; dismissed when the owner leaves the room (js/rules/followers.js `gate`/`backfill`/`partyPatient`/`release`). Exports `missingRoles`, `roleOfClass`, `BACKFILL`.
- **C** `rollLoot(e, { tier })`: a rarity name means "at least this rarity" (`LOOT_TIERS`: uncommon/magic, rare, epic = rare+ and magic+, legendary). tests/C/backfill-loot.test.mjs (6); tests/C 128/128.
- **E** Grimtallow `schedule.onDemand {minInBand 12, quietMinutes 90}`; every Torbor Downs zone dungeon has its own `dungeon.name` (e.g. "The Windlass Spire", "The Ploughman's Crypt"). A still has to let `dungeon.name` win in `callboardDoors()` (requests.md). tests/E +2 (115).
- **G** first-hour bot: the red run was NOT stream A's change — the old build (71b3e05) failed 2 of 3 runs the same way (a level-1 warrior + cleric pair died to L3-L4 packs, then lost the clock walking back from town; inside the dungeon the bot walked straight at monsters through walls). Bot now plays like a new pair: uses the skill bar (`bot.skills`, from `you.bar`), heals each other, B assists A (`bot.focus`), leaves elites/bosses/4+ levels up alone (`bot.avoid`), rests between pulls (rest time not counted against the 90 s of fighting), and chases along the dungeon floor route (`bot.route`). Same proof, same thresholds (>= 3 kills + loot, same instance, hits inside). Opt-in `trace` log in `firstHour()`. Test timeout 420 -> 600 s.
- **H** public/privacy.html follows server/privacy.json (a `data-privacy` row per stored entry; optional email; reports; salted ban hash; Google Fonts paragraph gone — fonts are vendored); tests/H/privacy.test.js. probe-public.mjs: public-mode headers, /privacy.json, bare loopback + junk CF header capped at 4, admin page 127.0.0.1 only (401 / 421 / LAN closed). stable.env.template + setup-stable.sh generate TV_IP_SALT + TV_ADMIN_TOKEN on a fresh install and add them only if missing on a re-run; check-stable.sh checks both.
- **A follow-ups (same day)**: login storms queue (placed by the tick within a budget: `JOINS_MAX_PER_TICK` 4, `JOIN_BUDGET_MS`
  8), the combat core warmed at boot for every class, the skill bar reused across room changes, `info` JSON cached per entity —
  300-bot rehearsal: town worst 25.9 ms (was 52.2), spread worst 28.6, login-phase worst 18.7-20.4 ms (was 124). `--dev-hooks`
  (test servers only), `net.accountsOn`/`net.privacy`, Callboard wall-clock `since` + `waitedMs`, `rules.backfill(e, n, {roles})`
  with a fresh fill when the owner leaves, E's `dungeon.name` on the Callboard/door/instance, privacy.json + Save journal /
  Account times / Friends-guild-mail / backups.

## 2026-10-05 — H: VPS hosting kit (P29/P30)
- `docs/HOSTING.md` (owner, plain language): which VPS (DigitalOcean / Vultr / Hetzner, rough prices), why classic Cloudways
  does not fit (Velocity noted, untested), DNS A record steps + check, HTTPS through Caddy + Let's Encrypt, who does what.
- `ops/vps/`: `install.sh` (VM -> VPS as root, uploads + runs `bootstrap.sh`), `bootstrap.sh` (fresh Ubuntu 24.04: ufw 22/80/443,
  users thousandvale + tvdeploy, node 22 checksum-verified, Postgres 18 PGDG + small-box tuning, Caddy, units, backups/drill/offsite,
  key-only SSH, `--dry-run`), `deploy.sh` (ships a published release by rsync, content-compared so unchanged files are hard-linked,
  resumable, verify + automatic switch-back), `rollback.sh`, `check-vps.sh`, `Caddyfile.template`, `thousandvale.service`
  (127.0.0.1, `--max-per-ip 4 --guests-per-ip-hour 6 --guests-per-hour 30`), `thousandvale-localhost-only.conf`, `postgres-small.conf`.
  Caddy overwrites `CF-Connecting-IP` with the real peer, so the per-address limits work behind it with no server change.
- `tests/H/vps.test.js` (6): templates, bootstrap dry run, real Caddy proxy (forged header replaced, WebSocket, /admin 404),
  deploy/rollback against a fake VPS. The real 179 MB release shipped to a fake VPS folder and booted.

## 2026-10-05 — D-UI: Skills & Talents window + Perk Forest (play-test P6)
- `js/client/ui/talents.js` `createTalentsUi({ net, hud, me })`: **Skills & Talents** (K) — the class's six skills in unlock order
  (level badge, what you have, the NEXT one dashed with its level, locked ones greyed "unlocks at N", a green count of talent picks
  waiting), each skill's tree: four tiers (levels 3/8/18/28), 2–3 nodes that change how the skill works, one pick per tier, spent
  tiers stay spent (Unbinder rule), hover cards on the shared tooltip. **Perk Forest** (N) — `js/client/ui/perk-forest.js`, a canvas
  graph: drag/wheel/pinch, arm buttons that fly to an arm, "Whole forest", click a glowing node next to your path, right-click / hold
  the end of a path to hand it back (a node in the middle of a path is refused with the names it would cut off), points left, totals.
- `js/client/ui/talent-model.js` (pure): the adapter — C's `data/rules/talents.json` / `perks.json` when they hold content
  (placeholders are ignored), else Farhold's skills.json rows + `perks.js buildForest()`; ladder, tier gating, path rule, refunds.
- PREVIEW until A adds `net.talent` / `net.perk` + `you.talents/perks/perkPoints` (requests.md "D (Client) -> A/C, play-test P6"):
  picks are kept in this browser and a banner says so; the windows switch to the server by themselves when those exist.
- Tests: `tests/D/talents.test.js` (7), `tests/D/talents.spec.js` (3, shots `tests/D/shots/p6-*.png`). `css/talents.css`.

## 2026-10-05 — stream E (owner play-test 1: P14, P17, P19, P26)
- **E** P26 level ramp (`tools/content-place.mjs` `levelField`/`campLevels`): every camp, stray, roaming pack, rare, fort, farm, cave and vignette takes the level of its SPOT — 1 by Torborhold's gate, +1 per ~550 m, never above its zone's band; weaker types are placed nearer town. Zone bands in `torbor_downs.json` lowered where the ramp reaches (delvers 2-6, saint_orrins 2-5, wychwood 2-7, ashcombe 3-6, hollin 3-8, brackwater 4-7, blackthorn 6-10); event levels capped at ramp + 2 (the Torborhold raid 4 → 3). Within 900 m of Torborhold: nothing ordinary above 3, 60+ groups at level 1-2. Hobb Gallowsby's encounter file says level 4 (A reads it on request). Stream C's starting-area rules applied: solos/pairs within 400 m of the start hub, trios at most to 900 m (no escorts), no crag hyena / frost stalker / brigand captain where the ramp is under 4; vignettes carry `levelBase`, `levelCap` (ramp + 1) and `countCap` near the start for A to apply.
- **E** P19 living world (`tools/content-living.mjs`): `fillDensity` keeps placing until open ground is within 50 m of something (roads 45 m) — ~650 things per zone (was ~100): curios (NEW `data/vignettes/curios.json`, 61 mini vignettes with a use/chest/note), 18 new wayside kinds, strays and roaming packs from the zone's mix, folk at work in the wilds. `routesFor`: 85 traveller routes (206 km) on B's roads → `data/provinces/torbor_downs-routes.json`; NEW `data/provinces/travellers.json` (12 kinds, 14 folk roles) and `data/names/chatter.json` (67 line pools: the day, weather, recent kills/banners/deaths/events, the world boss, the road, roles, archetypes).
- **E** P14: door waystone 10-30 m from the door (inside A's 40 m rule), named after the zone's dungeon; hub-town stones inside the town circle; never two stones within 60 m (A's layout: 61 stones, no duplicates).
- **E** P17: "The Carter's Crates" asks for Dunnet's crates back from any brigand instead of the 3 you already killed at his cart; every quest step has `text` + `where`; job frames a `where` template; `data/quests/marks/torbor_downs.json` gives a map mark for every giver and step; `ash_wisp` added to Delvers' Hill (its lamp-oil quest had no wisps anywhere). Events: `blurb` + generated `where` + `map` for all 20.
- **E** Pinned B sites (site-pins.json) no longer push our things away. tests/E: NEW `living.test.js` (13: A's real layout — waystones, level ramp, density measured independently, routes/chatter/curio/folk references, quest marks, events); province/quests/placement tests updated for ramps, pinned sites, strays. tests/E 127 pass + 1 TODO (A: encounter `level`).

## 2026-10-05 — C: owner play-test 1 (P4, P6, P8, P11, P12, P20, P23, P26, P28)
- **P4** No companion at level 1: a class companion comes at level 10 (second body at 20), sooner by quest (`rules.unlock`) or the Early Bond keystone (js/rules/progression.js, data/rules/progression.json).
- **P6 talents**: every one of the 180 skills has 4 tiers (3/8/18/28) of 2-3 rule nodes; no node is a plain number or inert on its shape (333 plain/inert shared nodes dropped, 293 working ones substituted, 59 number-only bespoke nodes rewritten). Pick/Unbinder API, saved as `char.build` (js/rules/talents.js, data/rules/talents.json).
- **P6 perk forest**: 12 arms, every arm branching into 2-4 paths ending in keystones ("Cornerstones" in game), 382 nodes (Farhold 169), 41 keystones, 20 new rules with readers (js/rules/perk-forest.js, perk-rules.js, data/rules/perks.json). Owner guide docs/talents.md.
- **P8** A knock never slides a body the hit killed; the rules never move a dead player.
- **P11** Followers: sight + reach for targets, path round walls (dungeon walls now block), regroup by path, teleport only when stuck far away.
- **P12** Telegraph wind floors by rank (1.0/1.1/1.2 s, +0.5 big hits, +0.6 mechanics); a cast-bar ability's zone appears at cast START; an interrupt withdraws it.
- **P20** Every cast emits `fx spell` geometry; every landed hit an `fx impact` with element + skill id (Farhold drew none for a skill without a knock); `hit` events carry `ab`.
- **P23** Range/target refused before mana or cooldown is spent, every skill (code `range`).
- **P26** Level-gap softening for monsters 1-3 levels above you (js/rules/level-gap.js); the only parity exclusion (tests/C/setup.mjs parityEngineFor). Two crag hyenas +2 levels: 17% -> 78% wins at level 2.
- **P28** Bog slime is damageable by every class (no immunity); its "no damage" was the level gap + client picking.
- Also: `xpFind` was inert when the room awards experience (now applied in cast.js onKill).
- Tests: tests/C/talents (7), perks (14), playtest1 (15).

## 2026-10-05 — stream B (play-test 1: P21, P24, P2/P25, P3, P19) — details in docs/world.md §9
- **B P21** rivers meet their banks: one continuous cross-section to the nearest river line (bank raised to surface + 0.4 where the land was low — it used to be lower than the water), the river owns its bed, an 8-connected skirt ring whose ground is raised to surface + 0.15 so the sheet's edge is always buried and the shoreline is the smooth channel edge (not 2 m steps); world lakes are a bicubic contour instead of 128 m square pits. Zone apron 1 → 6 samples. `tests/B/water-edge.test.js`.
- **B P2/P25** `RIVER_DEPTH` [0, 0.5, 1.3, 2.6]: streams 0.8 m deep at the centre (wadeable; the invisible wall was 1.5 m > WADE_DEPTH), rivers swum in the middle. Reader: `moveAt` (walk/wade/swim/steep/out), `passable`, `groundAt`, `deckAt`, `DRY_FOOT_DEPTH`; groundAdapter `moveAt/passable/surfaceAt`.
- **B P24** bridges: `crossingsOf` walks every road (world roads, spurs, link trails, town streets) at 1 m against river half-widths; flat decks at surface + clearance from abutment to abutment (chains of straight pieces through bends), road graded to exactly the deck height at both ends; decks in `terrain.bin` meta and the reader stands walkers on them (heightAt = max(ground, deck)); spurs now meet their road at its height (a 6 m step at junctions). `tests/B/bridges.test.js` (all 16 zones: no road point in water off a deck, every road/street walkable, deck = road ± 0.15 m at both ends, clearance 0.9–6.5 m, streams wadeable).
- **B P3** `tools/bake-map.mjs` → `data/world/map/`: `world.png` (32 m/px, 1153×897), `zones/<id>.png` (4 m/px, 512²), `map.json` (zones with E names + level bands, provinces, labels with min zoom, roads, rivers), ~2 MB. `tests/B/map.test.js`. `tools/lib/png.mjs` (PNG writer).
- **B P19** scatter in open country about doubled (forests unchanged); footpaths (`tools/lib/zone-paths.mjs`, placement kind `path`) from every door/arena/camp and E fort/farm/cave/waystone to the road net, painted not graded; world link trails (`link_<name>`) for E's settlements the World Forge net missed (Brackwater, Burnt Barns, Coldwater, Deepdene, Gorsehold, Gull Steps, Last Lantern, Lowmoor, Netherby). Fixed a Float32 rounding bug that stopped both Dijkstras after one ring.

## 2026-10-05 — D-UI: map, minimap, markers, Journal, Party menu, tooltips, inventory (play-test P3/P5/P7/P13/P15/P16/P17/P18/P27)
- **Map (M)** `js/client/ui/worldmap.js` + `map-render.js` + `map-data.js` (pure) + `map-load.js` + `map-image-worker.js`: the whole
  world (12 provinces, the closed ones dimmed "not open yet"), Torbor Downs' 16 zones with names and LEVEL BANDS coloured for your
  level, towns, roads, rivers, dungeons, caves, forts, farms, event arenas, live events, quest goals, waystones (Travel when you stand
  at one), party, pins (right-click). World / Province / Region / Around me, drag, wheel, pinch, double-click. Terrain pictures
  drawn in a worker from horizon.bin (32 m) and each zone's terrain.bin (4 m); town streets + buildings at close zoom. Fog of the map:
  128 m cells you were near, saved per character, plus the server's `discover`. Hover card on every marker and every zone (band,
  "hard for you", % explored, town, dungeon). In a dungeon it is the dungeon's map from the tiles, with its own fog.
- **Minimap** `minimap.js`: top-right, north-up or turning with you, zoom, click for the map, rim arrows with distance for the tracked
  quest, live events, party and pins; the dungeon floor inside a dungeon.
- **Atlas** `atlas.js`: one source for map/minimap/journal — quests located (`locateQuest`, server `at` first), events, pins, fog.
- **Journal (J)** + HUD tracker `journal.js`: goal, where (place, distance, direction), steps, rewards, giver, Track / Abandon, finished list.
- **Party menu (P)** `party-hub.js`: Party / Friends / Guild / Mail / Group Finder tabs (the old windows docked inside); "Callboard" is
  "Group Finder" in the interface; O / G open their tabs.
- **Tooltips (P5)** `tips.js`: every native `title` replaced by the shared engine (opt-in `keepOnPress` added to shared/tooltip.js so
  a tip stays while a button is held); a safety net converts any `title` set later; skill bar cards are rich.
- **Inventory (P7/P15/P16)** (`bag.js`, `ui/inv-core.js`, `ui/item-card.js`, `ui/item-icons.js`, `css/inventory.css`): paper doll +
  bag, filters, sort, search, compare cards, upgrade arrows, required level (red when too high; also on loot lines), icons rendered
  once from the Chibi 2 models and cached.
- Tests: `tests/D/ui-map.test.js` (12), `tests/D/ui-map.spec.js` (2, shots `tests/D/shots/ui-*.png`), inventory/talents tests + specs;
  m3-social spec updated for the new keys (M = map, J = journal, mail + Group Finder in the Party menu).

## 2026-10-05 — stream D-world (play-test 1: rendering, performance, actors, effects)
- **D** P1 freezes, measured with a new frame watchdog `js/client/perf.js` (named spans, long-frame log, GL link counter,
  `stalls()` = page work blocking the main thread; `tv.perf()`, `tv.state().stats.longFrames/worstFrameMs`). Root causes, worst first:
  the water normal map was regenerated for every zone through a canvas read-back (**20.1 s** on the test VM when a neighbour
  streamed in; now one `quickWaterNormals` DataTexture for the page, 16 ms); point lights added/removed/hidden by campfires,
  objects, town lamps at night, dungeons and the lantern (every lit material recompiled) — replaced by `js/client/lightpool.js`,
  a fixed set of always-visible lights handed to the nearest sources; the first sight of a creature family compiled its shaders
  on its first draw (1.5-4 s) — `js/client/warmup.js` builds, compiles and keeps one body of every bestiary creature type and
  humanoid look behind the title screen, and new bodies/zone pieces are compiled before they are shown (`compileBeforeShow`,
  KHR_parallel_shader_compile where present); per-zone rebuilds of dungeon surfaces, site trees, decor props and glow/flame
  textures are page caches now; zone streaming yields a frame between parse, ground, town, scatter and sites; every scatter kit
  piece is pre-built in idle time (`prewarmScatter`). Spec `tests/D/freeze.spec.js`.
- **D** P10 `js/client/transition.js`: travel veil over waystone / door / respawn / relocate jumps (not over walking out of town),
  destination ground preloaded on `travelR`, shaders compiled before it lifts.
- **D** P9 grounded entities stand on `heightAt` (decks included) unless STATE airborne/swimming; P8 self dead flag synced on
  `joined`, corpses stay where they fell, standing up drops the corpse pose at once.
- **D** P20 `js/client/spell-looks.js` (a distinct look for all 180 skills of the 30 classes) + `js/client/spells.js` (avatar-3d
  SpellFx from the rules' cast / fx bolt-arrow-shot-burst-pool-place-arc-link-status-impact-orbs-wall / hit events; spell lights
  through the pool). `tv.demoSpells()`.
- **D** P21 `extendWaterSurface`: the water sheet runs up to where the bank rises out of it — smooth shoreline, no gap.
- **D** P22 `js/client/gear-look.js`: in the world a character wears plain shorts + shirt plus exactly its gear (self:
  `equip`/`joined.you.equipment`, others: `info.gear`); the class outfit only on the title preview.
- **D** P25 swimming: predictor terrain carries `waterAt`/`moveAt`, the Chibi 2 swim clip, ripples, beasts float.
- **D** P28 click volume = the body's real size (Box3 at build); P12 verified by test (telegraphs from cast start, fill timed to impact).
- **D** tests: `tests/D/playtest1.test.js` (11 node), `tests/D/freeze.spec.js`, `tests/D/playtest1.spec.js`; m3-server test hook
  `/teleport`, `/kill`.

## 2026-10-05 — A (Server core): play-test 1 (protocol v5)
- P2/P25 swimming: js/sim/movement.js `moveKind` (B's moveAt, or walkable+waterAt with the same thresholds) — deep water is swum
  (2.7 m/s, floats at surface − 1.1 m, no jump), wading ×0.8; STATE.swimming + y on the wire; no attacks while swimming (castR
  'swimming'); `rules.onSwim`. Province terrain forwards waterAt/moveAt/passable/deckAt/groundAt.
- P9: mirror keeps y only for airborne/swimming entities (stale FULL-record y floated/sank monsters); heights = B's heightAt incl.
  bridge decks. P8: a dead body never moves (Entity.moveTo), respawn revives first, revive clears combat. Root cause of "never
  stands up" is D's onJoined (request filed).
- P14: realm.js `dedupeWaystones` (60 m merge, aliases for discovered keys, door stones named after their dungeon), door-stone test 90 m.
- P17: quest views carry step `at`/`where`/`kind` (E's marks file wins), `turnIn`, `giverName`, `zoneName`; kills/event wins/clears
  of the last 15 min count on accept (`questR.credited`).
- P22: new characters keep only the class weapon (+off-hand), `kitV`; player info carries `gear`; kit items get uids (unequippable).
- P28: vignette camps avoid prop footprints (`avoid`); slimes verified hittable at level 2.
- P6: `talent`/`perk` messages -> C's rules.talent/perk; build saved as `char.build`; bar/build resent; respec only by an Unbinder,
  priced by rules.retrainPrice; build view cached across handoffs.
- P3/P27: `map {op:'get'}` -> mapData (zones+bands, towns, found places, live events), `discover` pushes, `seen` saved; events carry
  E's where/blurb.
- P19: js/sim/travellers.js — groups on E's 85 routes, folk at work, chatter from data/names/chatter.json with deeds context; crews
  exist only near players, sliced 1/4 per tick.
- P10/P1: waystone/event travel preloads (travelR.at/delayMs, 1.5 s) — server room changes measured 0.1–1 ms, instances 5–25 ms;
  stable/dev tick worst10m 3–8 ms (the freezes are client-side).
- E's P26 reads: vignette levelBase/levelCap/countCap, farm pest countCap, encounter file level, doorGuard replaces our door guard,
  roaming camp paths, curios (curios.json + recipe lookup), folk placements.
- Tests: tests/A/pt1-*.test.js (+ pt1-helpers.js real-world harness), m2/protocol updated. tests/A 137 pass / 8 skip / 0 fail.
- **E** Re-placed on B's final bake (d562a44): `tools/place-vignettes.mjs --keep=z12_02` — every zone re-placed except the M1 zone, whose checked-in file is the input B's M1 bake was made from (tests/B "fresh bake" compares against it); it still feeds routes/events/marks. 94 traveller routes (219 km), no settlement without a road now. Assignment unchanged (minSet 42). tests/E 128 + 1 TODO (A), tests/B 47/47, tests/A placements/quests/m2/vignettes green. Road coverage check: >= 90% per zone (some zones hold only a few dozen road samples), >= 95% over the province.

## 2026-10-05 — C: perf pass for A's 100-bot gate
- Profiled the spread phase: the spikes were a level-up's build view formatting ~70 talent cards (up to 38 ms/tick) and first-time pathfinding cells sampling the terrain (15 ms/tick). Talent card text is cached; first-time cells are paid from the pathfinder's per-tick budget (`PATH.EVAL_COST`) and take the slope/water test once per cell; idle monsters with nobody within 70 m think every 4th tick (rooms only, `field.lod`; parity unaffected).
- tests/A/bots100 (TV_PERF, quiet VM): spread p99 22 -> 11.4-11.7 ms, worst 37.5 -> 18-21 ms; all three phases pass. bots100-real passes (spread p99 13.6). tests/C 165/165, tests/A 137/137.
- **D-UI follow-up (same day)**: gear icons no longer freeze the game (D-world's profile: 3–4 s an icon from `toDataURL` just
  after joining): icons render only while the character window is open, one per idle period, 96 px Lambert, read back with
  `drawImage` + async `toBlob`, cached in IndexedDB (the localStorage data: URL cache is deleted); `tests/D/inventory.spec.js`
  "no freeze" measures every synchronous icon step (≤ 100 ms even on this VM's software renderer). The "[object Object]" menu
  badge was C's `perkPoints` object; badges are numbers only and the Skills/Perk windows read `talentTree` + `perkPoints.left`
  (picks go to the server; refunds say "an Unbinder in town"). The m3-server test hook levels a character through real XP so
  the rules' sheet levels too.

## 2026-10-05 — stream C (play-test 2: Q1, Q8, Q16, Q26, Q28, Q3/Q4)
- **C** Q1 `js/rules/cast.js`: a draw weapon's click (no `held`) is no longer refused "not drawn" — the server draws to full and looses on its own at Farhold's held cadence (draw.full + afterShot), aimed at the target it was drawn on; a short `held` keeps drawing to the nock (Farhold "a click still shoots"). Slot-0 `cast` events carry `every` (ms) + `clip` draw/shoot. tests/C/playtest2: 12 ranged/caster bases land damage in a real room; parity-ranged's "not drawn" assertion updated (deliberate divergence: a short draw shoots weak instead of refusing — Farhold's controller already does this client-side).
- **C** `js/rules/index.js` intent: a self/ally-targeted skill no longer turns you to face north (`atan2(0,0)`) — found by the class-quest trials (a knight with Sworn Guard up whiffed every swing).
- **C** Q8 `index.js`: statuses + barrier end on death (players and monsters) with `fx status on:false` per status; respawn / revive come back clean; `rules.statusesOf(e)` for A's `info.st`.
- **C** Q26 `js/rules/perk-forest.js`: every arm's nodes inside angle ± sector/2 (forks narrowed + staggered); `arms[i].half` for the client's wedge (it drew ± π/8 over ± π/12 wedges).
- **C** Q3/Q4 `js/rules/loot-rules.js` (rank ladder incl. set/unique, thresholds magic/rare/legendary/unique + `epic` alias, splitLoot, rollWinner); `cast.js onKill` one drop per party per corpse when the room offers `host.partyLoot`.
- **C** Q16 `js/rules/mount.js`: riding rules (call 1.5 s, refusals, dismount triggers, Calm vs hits, DoTs never throw you, remount lockout, speed clamp).
- **C** Q28 `rules.unlock(e, 'talents1')` (first talent tier at level 1) and `rules.unlock(e, 'perk', { source })` (once per quest); `tests/C/class-quests.test.mjs` runs every kill step of E's 30 class quests with a bot of that class — all winnable (table in js/rules/README.md).

## 2026-10-05 — stream D-UI (play-test 2: menus, HUD, windows)
- **D-UI** `js/client/ui/pt2.js` assembles the play-test-2 interface (main.js creates/wires/ticks it, plus `ui2.pass()` after the render); `window.tvui2` test hooks (state of every window, `fake(ev, msg)` through the real handlers).
- **D-UI** Q2 `ui/context-menu.js`: right-click a friendly body (or Shift + right-click an enemy) -> Target · Follow · Inspect · Whisper · Invite · Trade · Add friend (players), Talk (town folk), Attack/Loot (beasts); `/follow [Name]`, `/unfollow`, `/tradewith Name`, `/settings`; following walks behind the leader, any movement key / ground click / attack ends it; `follow {id}` -> followR. Inspect window (worn gear from `info.gear`).
- **D-UI** Q3/Q4 `ui/loot.js`: `lootable` corpses, E / click to open, the loot window (take / take all / gold / party leftovers), `lootR` refusals; Need/Greed/Skip cards with a 30 s bar, results to chat (`lootRolled`); the party loot threshold (leader only; magic/rare/legendary/unique) in the Party tab.
- **D-UI** Q5/Q6 `ui/banner.js`: one centre column (pop-ups, the area banner, call-outs, toasts) so nothing overlaps; the banner has a hierarchy province > zone > place with a short queue; vignette lore is a place banner; the party invite and trade asks sit top centre.
- **D-UI** Q11 `ui/shop.js`: Buy / Sell / Buy back over A's `shop`/`shopView`/`shopR`; "Browse wares" / "See the mounts" in a trader's dialog (world-ui `npcButtons`).
- **D-UI** Q12: a click on a second ring sends `slot:'ring2'`; a drag onto the first ring slot sends `ring1`.
- **D-UI** Q13 `ui/portraits.js`: LIVE portraits (self + target) drawn with the game's renderer on layer 1 (lights on layer 1 too, nothing compiled), read back through a pixel-pack buffer + fence (no GPU stall: 3 ms worst vs 440 ms with drawImage); STATIC portraits (title characters, friends, party frames) on a small renderer of their own, toBlob + IndexedDB.
- **D-UI** Q14 `ui/trade.js`: the trade window on §13 (offer from your bag, gold, lock, accept), asks at the top centre, friends-only declines client side too.
- **D-UI** Q15/Q22 `ui/settings.js`: Esc (nothing open, no target) -> pause menu (Resume, Settings, Help, Log out); Settings: graphics quality (after reload), volumes (saved; no sound in the game yet), interface size, key list, "Only allow trade requests from friends" (gw settings), Show equipment / Show helm (`pref`; your own figure follows at once).
- **D-UI** Q20/Q21 `ui/appearance.js` + `ui/appearance-core.js`: one character editor (people on the title, skin, height/build/head/roundness, every face part + colours) — "Customize appearance" on the title, the barber's chair in the world (`barber {npc, look}`); `look.avatar` holds only face/body and `looks.js avatarFor` lays it over the seeded body, so class outfits and worn gear still apply.
- **D-UI** Q23/Q26 perk forest: a search box (rings + zooms to matches by name or card text); each arm's area is C's `angle ± half` slice, widened only if a node centre would fall outside (`talent-model.js armSectors`).
- **D-UI** Q24: an XP bar over the action bar and in the character window, numbers on hover only. Q25: target frame and character list name the calling (never "Adventurer"). Q1 (C's ask): bows/crossbows/wands fire from range (24 m until A sends `you.attackRange`), the swing pace from the cast event's `every`, draw/shoot clips played.
- **D-UI** tests: `tests/D/pt2.test.js` (12 node tests, incl. every real perk node inside its arm's slice), `tests/D/pt2.spec.js` (real server + a bot player). The test hook's `/give` takes `slot`/`rarity`.

## 2026-10-05 — Stream E: play-test 2 content (Q27 Q28 Q9/Q11 Q10 Q16 Q18 Q20)
- **Q27 starting chain** "The South Road" (data/quests/start.json, included by test.json, 7 quests): auto-granted; Elder Maud -> the south
  road -> the Pail and Plough -> two branches in either order (Orrinsford + Prior Wendel / Greyfletch Camp + the mini boss
  **Old Gristle**, data/encounters/mb_old_gristle.json, level 4) -> home -> the province story. New quest field `requires`.
- **Q28 class quests** (data/quests/classes.json): 30 (one per class, `classes`, levels 2-4) from 12 trainers (4 in Torborhold houses, 8 at set pieces);
  rewards: a named rare + the companion now (13 classes) or a perk point (17). Winnable per C's table and tests/E.
- **Q9/Q11/Q16/Q20 shops** (data/provinces/shops.json): 15 trader kinds with gear categories, fixed goods (potions, food,
  torches, recall charm, buff consumables, mounts, quivers, lights) and services (barber price list, first change free);
  per-town flavour; `roles` generated for A's runtime by tools/content-shops.mjs. Role names follow B's town offices.
- **Q10 offices** (data/provinces/offices.json, tools/content-offices.mjs): one building per working NPC in all 16 hub towns
  (237), from B's role-tagged plots; quest NPCs keep the office of their role (one body) or a home; doors >= 2.5 m apart.
  schedules.json: `office` anchor + 9 new roles.
- **Q18 set pieces** (data/vignettes/setpieces.json, tools/content-setpieces.mjs): 12 hand-designed places near Torborhold,
  each with NPCs/monsters/objects/lore/chatter/quests; 6 bound onto B's baked ground pieces (renamed via places.json
  setPieces/lanes), 6 on their own; 50-model catalog for D; workers at every B set-piece slot. B's set pieces/fields/buildings
  are keep-clear discs. Chatter: 20 new pools.
- Placer: road coverage last pass (`patchRoads`, the independent measure); NPCs with an office stand at its door.
- tests/E/playtest2.test.js (15): class quest per class, chain order + reachability + winnable boss (all classes), shop stock,
  barber, unique offices, set pieces placed. tests/E 145 green.

## 2026-10-05 — stream A, play-test 2 (protocol v6, docs/protocol.md §18)
- **A** Q3/Q4 `js/sim/corpses.js`: kill gold + items wait on the corpse (personal shares, `lootable`/`loot`/`lootWin`), the body
  is kept while loot is on it (5 min cap, room `hooks.keepBody`); party threshold (gw `party {op:'loot'}`, default rare, C's
  `js/rules/loot-rules.js` ladder) -> Need / Greed / Skip 30 s (`lootRoll`/`lootRolled`, C's `rollWinner`), all skip -> free on
  the corpse for anyone; C's one-drop-per-party `host.partyLoot` -> a party pile + rolls.
- **A** Q8 room `info.st` (C's `rules.statusesOf`), cleared + `fx status off` on death/revive, 1 Hz sweep.
- **A** Q10 town NPCs from E's `offices.json` (one body per office, quest NPC keepers merged, staffed day and night, `info.office`);
  schedules.js gives every service NPC a unique plot where E has no entry; no two folk on one spot (slots).
- **A** Q11 `js/sim/shops.js` over E's `shops.json` (kinds, town caps/mults, categories via the rules' engine, goods, pricing,
  buyback); `shop` ops + `used.shop`.
- **A** Q12 equip with the item's own slot lets Farhold pick the free ring / off hand. Q14/Q15 gw `settings` (account, world
  state `settings:<account>`), friends-only trade requests (`social` bus push). Q16 `js/sim/mounts.js` (Farhold ids, calm) with
  C's `js/rules/mount.js` (1.5 s call, dismount rules, remount delay), `speedMul` in stepMove, starter at 5, stable sells.
- **A** Q20/Q21 `js/sim/looks.js` (avatar-2d catalog check, `custom` parts), gw `look` (title screen), `barber` (E's prices,
  first visit free). Q22 `pref` showGear/showHelm trims `info.gear` for all. Q25 `clsName` on charList + you. Q2 `follow`,
  `inspect`. Q1 castR dedupe (2 s per slot/why, `need`). `you.reach` = basic attack range (C's ask).
- **A** Q27/Q28 quests: `auto`, `cls`/`classes`, `requires`, `minLevel`, `order:'any'`, `autoComplete`, `visit {town}`,
  quest file `include`, `reward.unlock` / `reward.perks` -> C's `rules.unlock`.
- **A** tests: pt2-loot (5), pt2-services (6), pt2-real (2), pt2-quests (3); m1-social / m2 / placements updated to the new rules;
  tools/bot-client.mjs bots loot corpses (first-hour bot green again). 100-bot gate green (spread p99 8.9, herd 7.7, event 10.0 ms).

## 2026-10-05 — stream B, play-test 2 (Q18 bespoke areas, Q10 town offices) — docs/world.md §10
- **B** Q18 `tools/lib/zone-setpieces.mjs` + `data/world/set-pieces.json`: graded farm lanes, crossroads inn + signpost,
  walled graveyards with grave rows and chapels, farms with hedged/fenced field patchworks, orchards in rows, mill ponds + mills,
  clearings, stone circles, sheepfolds, copses; automatic field belt + graveyard for every planned settlement in all 16 zones;
  z12_02 + its 8 neighbours authored by hand. Stream E's set pieces levelled/painted from their placements (`ground`), E's
  overrides via places `setPieces`/`lanes`. New surfaces (field crop pasture yard graveyard orchard gravel, before `road`),
  scatter kinds `tree_fruit` + `hedge`, placements set_piece/field/hedge/fence/wall/set_building/signpost. Levelling fades out
  beside roads (fixed a 51-degree step on road_101 by E's Pail and Plough). ZONE_BAKE_VERSION 4; zones, horizon, map re-baked.
- **B** Q10 proctown opt-in `trades` option (+ `assignTrades`, wantBases for 11 new wants; proctown + Farhold suites green) and
  `data/world/town-offices.json`: every service role gets its own plot round the square; building placements carry
  office/role/lit/label.
- **B** tests/B/setpieces.test.js (8); tests/B 55/55.
- **A** (later) B's role-tagged plots claimed first; E's `requires`, `questBoss` out of jobs, setpieces.json + `scale`, named
  class-quest items; `you.attackRange`. tests/A 158+ green incl. pt2-quests (7); worker.spec green; 100-bot gate green
  (spread p99 9.2, town 7.8, event 7.9 ms). Dev unit restarted.
- **A** potions + food usable (lead's call): `item {op:'use', uid | 'id:<kind>'}` -> `itemR`; `js/sim/consumables.js` (shared
  30 s potion cooldown, heal/mana/group tonic/antidote; food/drink regen out of combat, ended by a hit); minimal C hooks
  `rules.restore` / `rules.cleanse` in js/rules/index.js (noted for C); `net.useItem`. tests/A/pt2-consumables (3).
- **C** (lead's follow-up) `js/rules/buffs.js` + `rules.useItem` / `rules.itemBuffs`: shop items that said "does nothing yet" work — whetstone, armour oil, silver dust, fletching kit, oats, hearty stew's after-buff (timed self-buffs, one per kind, survive zone change + logout, end on death), torches (light radius flag + night bonus vs undead/beasts), herb poultice, recall charm (5 s channel -> bound/nearest town), revive flask (a fallen party member within 10 m). Wired: `js/sim/consumables.js` kind `rules` (minimal), `js/sim/province.js useItem` branch + `recall(o)` (minimal). tests/C/buffs.test.mjs (8).
- **A** C's follow-up asks: reviewed C's useItem/recall edits (torch charge decrement now journaled); room `host.isNight()`;
  `bind {npc}` at a town innkeeper saves `char.bind` (respawn + recall go home); oats riding speed via `rules.itemBuffs`
  (rechecked 1 Hz); `net.bind`. tests/A/pt2-consumables (4).

## 2026-10-05 — streams C + E + A (one agent), owner play-test 3 (round-playtest3.md R2-R5, R7, R6+ server side)
- **C R4** `js/rules/encounter.js`: telegraph floors a human can read and beat — `MIN_WIND` 1.6 s normal / 1.7 champion / 1.8 rare+boss,
  + 0.25 s latency, + 0.4 s big, + 0.8 s for a MECHANIC (`isMechanic`: stack/soak/safe, ring/donut "get inside", line-of-sight hide);
  call-outs already go out with the cast bar; four mechanic specials without words got them. Pack leader's frenzy ring inner radius
  3 -> 4 m (2.8+ s warning). `addSpot`: adds are called onto floor (no wall tile / nav-blocked sample, straight-line reachable from
  the caller), every script with adds tested in all 8 dungeon families' corners. `js/sim/events.js` waves likewise.
- **E R7** The Chained Saint: four "Chained pillar"s (`look: chained`, `tether: true` -> chain to the Saint), call-out "hide behind a
  pillar", the plinth flood says "get into one of the two dry circles". Audit of every call-out: Drowned Reeve / Sunken Coffer (no
  plinths/ledges -> dry circles), Drowned Lamp (a line-of-sight flash with nothing to hide behind -> two broken columns), Sluicegrip
  (no walkway -> between the channels), Briar Colossus pillars named "Great stone". tests/E/playtest3 checks every script.
- **C R5** every basic attack is drawable: `cast` carries `wk/wt/el/wind/reach/arc`, new `fx attack` (melee swing at impact; staff
  spell shape incl. charged forms), `fx bolt`/`arrow` carry the weapon, `fx impact` carries `src`. All 57 bases tested.
- **C R2.1** experience: kills x1.5 (balance xp.kill 0.2 -> 0.3), quests and events x1.25 (data/rules/progression.json `xp`;
  `engine.xpCfg`, `rules.xpMult`). Level curve unchanged. The starting chain now takes a new character to ~L5 by Home with News.
- **E R2.2** `tools/content-living.mjs fillHunting` -> `data/vignettes/placements/<zone>.hunt.json` (B never reads it): 633 solo/pair
  camps (a third roaming) where the level ramp is <= 3.5 — z12_02 259 (95 -> 258 camps within 1 km of Torborhold); A's
  `content.js` merges them; dormant camps wake them (tests/A/pt3-hunt).
- **E R2.3/2.4** Old Gristle level 4 -> 2, hpMult 4.5 -> 3.5 (~144 hp at L2); "Old Gristle" and "Signs of the Beast" are level-2
  quests; the Ploughman's Crypt (Barrow entrance) is a level-2 dungeon (`floorStep 1, eliteStep 0, bossStep 1`: mini-boss L2, last
  boss L4) — new planDungeon options, passed by province.js. Chain winnable: Gristle L2 30/30 bots, every kill step's pair >= 27/30.
- **A R3** events start when someone comes near: zone events armed -> 15 s countdown (`zoneEvent soon {at, inMs}`) -> waves; walking
  away calls it off; 3-5 min rest with `next`; `states` + `zone.events`. Realm director `startOn:'near'` (E's events.json): weighted
  events only via `eventNear` from the province (in band, min level, cooldown, 3 min gap), 15 s countdown; the world boss keeps its
  real-time schedule (`at`) and starts on demand after 60 quiet minutes; sizing capped at 5 players.
- **A R6+** other players' mana: `info.mpMax`, `ev mp {id, n, max}` (<= 2 Hz), party frame columns 9-10.
- Tests: tests/C/playtest3.test.mjs, tests/E/playtest3.test.js, tests/A/pt3-hunt.test.js, tests/A/pt3-events.test.js.
- **D-UI** (play-test 2, later): client re-pointed to A's landed v6 (§18): looks sent as `custom`; shop categories / labels / sell prices
  from `shopView`; `inspectR`; `you.reach` for ranged auto-attack; barber bill from E's shops.json price list (only changed parts sent,
  first visit free); innkeeper "Make this inn your home" (`bind`); potions and food — a bag click uses them, hotbar keys 7 8 9 0
  (`ui/hotbar.js`, shared potion cooldown sweep, "Eating…"); recall channel cast bar + buff icons with time left (`ui/buffs.js`);
  quest offers / journal use `rewardText`.
- **D-UI** (play-test 3): **R1** the title is a front page — your characters + "New character"; step 1 name/people/calling, step 2 the
  appearance editor with the figure in starting clothes and a "Show class gear" toggle, "Create character" enters the world (the separate
  Customize button is gone). **R3** events never say just "starting soon": a seconds countdown in the event frame, the call-out and the map
  (`soonText`/`eventStateText`: ready / soon / live / cooldown "Ready again in 3:40"). **R6** a mana bar under health (the frame's XP bar is
  gone — the one XP bar is under the action bar), target and party mana (`ev mp`, `info.mpMax`, party rows), numbers on hover.
  **R8** beards use their own colour (`avatar-3d/js/chibi2-face.js`, opt-in by data: only avatars that set `facialHair.color`).

## 2026-10-05 — stream D-world: play-test 2 (Q7 Q8 Q10 Q16 Q18 Q19 Q20/21 Q22) + play-test 3 (R4 R5 R7) + play-test 4 (S4 S20 S23)
- **D-world Q7** the "floating tiny lanterns" were lit window boxes stamped at two fixed spots on each footprint's front edge (`town-view.js`): on round huts, L-shaped and set-back houses (18 of Torborhold's 90) they hung in the air. Glass now IS the building kit's own window parts (`buildingLook()`), in two glowing instanced meshes: bright on shops, dim on homes.
- **D-world Q10** `proctown/js/offices.js` (new, reusable): office dressing for 23 trades — open forge shed with hearth fire + anvil + quench trough, striped awnings and goods tables, inn tankard sign + lanterns + benches, stable paddock, barber's pole, hall banners/steps/flag, temple steps/candles/statue, apothecary herbs, jeweller case, mill sails… each with a hanging picture sign and a `fascia` name board. Lanterns + light-pool sources only on lit offices (B's `data.lit`, A's `office.lit`). `js/client/sign-text.js`: every office name (B's label, "The Wheel and Wether") painted into one canvas atlas, one draw call per town. `WS.claimOffice(info.office)` dresses a house a service NPC took over. proctown/tests/offices.test.js.
- **D-world Q8** `js/client/status-sync.js`: auras follow `info.st` (late arrivals see them), cleared on death / revive / room change (kept body), a grace window so a stale snapshot never undoes a fresh event; `STATUS_LOOK` covers every Farhold status id. C's `item:torch` = a carried 14 m pool light; `fx channel` (recall charm) draws a cast circle + pillar.
- **D-world Q16** mounts in avatar-3d (`js/mounts.js` + pure `js/mount-types.js`, `mounts.html`; horse/pony/courser/warhorse/stag/new `ram`/drake with tack and a seat; `CHIBI2_MOUNT_ANIMS` ride/rideGallop). Client: `actors.setMount` seats the body (cached mounts, compiled before shown), gait follows speed, `H` key / `tv.mount()`, predictor uses `you.speedMul`, everyone sees riders via `info.mount`.
- **D-world Q18/Q19** `proctown/js/propkit.js` (89 set-piece models incl. all 50 of E's ids + `grave_slab`, `cropField` 23 crops, `fenceLine`; `propkit.html` gallery). `js/client/setpiece-view.js` draws B's set pieces (graveyards with grave rows by style + lych-gate, fields by crop, hedges/fences/drystone walls, set buildings with office dressing, signposts, mill wheels, stone circles, sheepfolds, farmyards) and E's set-piece recipes (models, parts, buildings, fields, props, scaled into B's pieces) — one instanced set per zone, planned in slices. Terrain shows B's new surfaces (`SET_GROUND`); scatter draws `tree_fruit` and `hedge`.
- **D-world Q20/21/22** a changed `info.look` (custom) re-dresses that body; others' hidden gear verified (`info.gearOff`).
- **D-world R5** `js/client/weapon-fx.js`: every basic attack is seen — a crescent trail along the swing's arc in the element's colour (thrust slivers, upright smashes with a ground slam, wider two-handers), staff spells by shape (nova ring, cone/jet breath, dome pillar, wall), muzzle flashes, and a client-drawn arrow/bolt when a point-blank shot sends no projectile. `weaponLook()` tested against every weapon type in items.json + Farhold uniques.
- **D-world R4** a call-out said at a cast's start is held for the whole wind-up (was 2.8 s max); a boss cast with no line names the attack. **R7** `info.look:'chained'` pillars wear an iron band and hang a sagging chain of links to `info.tether` (dropped when broken); arena `obj` events now read `otype` (they were drawn as type 'obj').
- **D-world S4** rares/champions drawn bigger (`rankScale`, giants ×1.35), a gold/blue ring under them, a war-banner on pack leaders, affix auras (burning, frozen, venomous…) from `info.mods`, a bigger gold health bar for rares. **S20** eating/drinking sits the body down (`you.regen`, `info.eat`). **S23** `js/client/loot-marker.js`: a corpse with loot for you sparkles, tinted by best rarity, with a light column for rare+, and does not fade while it has loot.
- Tests: tests/D 113 node (playtest2.test.js 9 new), tests/D/playtest2.spec.js (browser: towns, set pieces, looks/gear, mounts, statuses, weapons, call-outs, chains, rares, loot, eating); proctown 65; avatar-3d 38.

## 2026-10-05 — Play-test 4 S17/S18 (streams C+E, fork F2 of the A+C+E agent)
- **C** `js/rules/loot-pool.js` (new, pure) + `data/rules/loot-pool.json`: one wrapper round `rpg.rollDrop` picks group (weapon .40 / armour .36 / jewellery .08 / off-hand .16) -> family -> base by level; Farhold's lootTiers bases merged in at their minLevel. Drops at L1-8 before: swords 34.8% of weapons, axes/maces/spears/polearms/crossbows/javelins/shields/orbs/tomes 0%; after: 15 weapon families at 2-7% of weapon drops each (sword family 6.9%), shields 6%, foci ~7%. Bosses with `dropBases` keep theirs. Parity engine nulls `engine.lootPool`/`engine.armourTiers` (tests/C/setup.mjs).
- **C/E** `data/rules/armour-tiers.json` (S18): second armour tier from level 15 — 11 themes (flame, storm, venom, frost, dawn, umbral, thorn, rune, bone, clockwork, fang) with emblem/trim/glow, one theme + set name per class (all 30), themes rolled from the pool of the classes wearing that weight. A themed piece: `tier:2`, `theme`, name prefix, armour x1.12, `themeLook`; uniques/sets/legendaries never. `js/rules/data.js` loads both files, `js/rules/engine.js` installs.
- **E** `data/provinces/shops.json`: smith sells every melee family (13 bases), bowyer bows/crossbows/javelins/spears, apothecary "Staves, wands & rods" (wand/staff/scepter/orb/tome/quarterstaff), tailor 6 foci, market wider; `roles` regenerated (tools/content-shops.mjs). `js/sim/shops.js` takes bases IN TURN from a random start so every base shows before repeats.
- **A** (2 lines) `js/sim/province.js` gearLook: `info.gear.<slot>.theme`.
- Tests: `tests/E/playtest4-gear.test.js` (5). Requests: D-world base list + theme table (docs/requests.md "PLAY-TEST 4 (S17/S18)").

## Play-test 4 S14 — kill quests point where the monster really spawns (streams E + A, 2026-10-05)
- **A** `js/sim/hunts.js` (new, pure): the camps the server spawns grouped per monster type into hunting AREAS (`huntAreas`, camps < 90 m apart join; centre weighted by head count, `r` covers every camp and roam path, `n`, `zone`, `lv`), `pickArea` (quest zone -> the place the step's `where` names -> nearest the giver, a thin area counts as 500 m further).
- **A** `js/sim/quests.js`: every kill / collect step's marker is recomputed from those areas at load (`huntMark`; E's marks can no longer point at an empty field), `near` steps show only the areas where kills count, radiant kill jobs too; quest views carry per step `areas: [{x, z, r, n, zone, lv}]` (up to 4, best first). `book.hunt` = the live areas.
- **E** `tools/content-hunts.mjs` (new; run after `tools/place-vignettes.mjs`): adds copies of camps already standing in a quest's circle wherever it held fewer of the monster than the step needs (count, capped at 4) -> `data/vignettes/placements/<zone>.quest.json` (54 camps over 15 zones; `js/sim/content.js` merges it like `.hunt.json`), writes `data/quests/marks/torbor_downs-hunts.json` (35 types' areas) and re-points E's marks. Before: 63 of 117 kill/collect steps pointed at fewer monsters than they asked for (several at 1), and "the fairy ring"'s croakers "at Tench Pool" were marked 1.4 km away; after: 0.
- Tests: `tests/E/playtest4-hunts.test.js` (6): every kill/collect step in every quest file holds its monster where it counts (>= min(count, 4)), areas hold the type, files current, pickArea rules, jobs, the quest log sent to the client carries areas.

## Play-test 4 S11/S19 (streams A+E, 2026-10-05) — more people in every settlement, titles, real names, the Unbinder's offer
- S11: the 28 villages/hamlets stream B planned outside the hub towns had 0-2 NPCs each ("towns with only 1 NPC"). js/sim/realm.js
  now spawns their people from schedules.json `perTown.village` / `perTown.hamlet` over B's plan (js/sim/schedules.js townFolk):
  a trader (General goods), an innkeeper, a smith + provisioner in villages, farmer/miller/residents, guards — 7-11 people each.
  Their day/night schedules tick in the wilds copies too (province.js npcTick, a cached list per copy). `perTown.town`/`city`
  gained traders (market, armourer, apothecary, provisioner…) for the two towns without an offices.json entry (Mill End, Three Wheels).
- S11 Unbinder: every town room (18, all size town/city) has one; talking to it sends `unbind {prices, has, ops}` (province.js
  unbinderOffer) — the reset itself was already the `talent clear` / `perk reset|refund` ops (tested end to end now).
- S19: js/sim/npc-names.js — every NPC gets `info.title` (data/names/titles.json: shop kind > role > the trade in its name) and
  a seeded real name when it only had a job for one; applied once in room.spawn. data/names/torbor.json pools 12 -> 42 each.
- tests/A/pt4-npcs.test.js (5): merchants + crowd per town, an Unbinder per town, trader + folk per village/hamlet, titles +
  real names for all ~700 NPCs, seeded names, Unbinder end to end (perks + talents back for gold).

## Play-test 4 S13/S16 (stream C, 2026-10-05) — bolt zones land on the target; lightning (and arcane/nature) in the perk forest
- S13: a BOLT's zone (Forked Bolt's Grounding, Toxic Bloom, Slow Burner, Seedling, Spilled Element, Junk Toss's bottle/pot pools
  and Booby Trap) was put down round the caster — afterCast runs as the bolt leaves the hand. js/rules/cast-skills.js: a bolt's
  `place`/`pool` now rides `plan._impactZones` to afterBolt and lands at the first impact. Self/around zones stay on the caster,
  ground zones on the aimed spot, beam pools along the beam (unchanged); a bolt's zone that only HELPS (Thornlash's Seedling heal ring)
  stays with the caster, where the friends are, and its `fx place` carries `helps: true`. Audit: every skill of every class, bare and with every
  talent node, cast at a target 12 m away (tests/C/playtest4.test.mjs) — 15 bolt variants were wrong, all fixed, 0 left.
- S16: two new perk-forest arms (data/rules/perks.json, ids of the old arms unchanged): **The Gathering Storm** (lightning: Static
  Charge, Live Wire, `shockPct` "+% damage to Shocked enemies", cornerstones Conductor / Thunderhead / Static Coat) and **The Old
  Lore** (arcane Spellwright, nature Rootbound). Readers: js/rules/perk-rules.js `landed()` (called from field.land on every hit,
  with a reentrancy guard), strikeMult (shockPct + the cornerstones' costs), afterHurt (Static Coat). js/rules/perk-forest.js
  `perkTags()` / `isTopTier()` say what a node is for. 382 -> 437 nodes, 12 -> 14 arms, 41 -> 46 cornerstones.
- Tests: tests/C/playtest4.test.mjs (7): Grounding on the target, the all-skills zone audit, every class's top-tier tree, lightning
  coverage >= fire/ice/poison, each new reader, and a real stormcaller fight with the storm arm (>15% more damage).

## Play-test 4 S5/S9 — road events and wanderers (streams A + E, 2026-10-05)
- js/sim/roadevents.js (new): random events near lone players in the wilds every 2.5-5 min — treasure chests (7 kinds, some guarded) opened in the
  corpse loot window via corpses.holdFor (personal shares), delivery / escort / rescue quests as job-shaped generated quests that pay themselves.
- data/provinces/road-events.json (new): chests, deliver/escort/rescue texts, rules, weights. data/provinces/wanderers.json (new): 7 wanderer
  traveller kinds (pedlar + rag-and-bone with a 'pedlar' shop kind, errand runners with deliveries, storytellers/scholars/soldiers with lore + tips),
  lore, tips, perRouteKm 1.25.
- js/sim/travellers.js: wanderer data on the lead crew member, `stopNear` (stand still while a player is close), stable `data.key`.
- js/sim/content.js: wanderer kinds merged into travel kinds + every route; the pedlar shop kind into shops; province.js hooks (use / talk /
  offers / accept / 1 Hz tick / 5 Hz move); quests.js `viewDef`.
- tests/A/pt4-events.test.js (6): scheduler drops events; chest guarded -> loot window -> bag -> packs up; delivery; escort; rescue; wanderers.

## 2026-10-05 — D-world (avatar-3d, fork R) play-test 4 S18: tier-2 class armour with iconography
- **D-world** `avatar-3d/js/chibi2-armour2.js` (new, opt-in): 24 emblem shapes (flame, bolt, drop, frost, sun, skull, leaf, rune, eye, claw, cog, blood, moon, hourglass, fist, note, arrow, sword, shield, cross, coin, feather, star, crown; snowflake/sunburst/gear aliases) in relief on chest, back/cape, shoulders and helm brow (`top.emblem`, `hat.emblem`), and five tier-2 decor kits `t2_pauldrons` / `t2_mantle` / `t2_harness` / `t2_vestments` / `t2_wildmantle` (registered in avatar-2d chibi2-parts.js). A look naming neither builds exactly what it did (tested over every tier-1 outfit + Emberveil class look).
- **D-world** `avatar-3d/data/class-outfits-t2.json` (built by `tools/build-class-outfits-t2.mjs`): a tier-2 outfit for all 30 classes, emblem/trim/glow from C/E's `data/rules/armour-tiers.json`; `class-outfits.js` `loadClassOutfits2`, `isTier2Item` (look.tier / theme / numeric tier / level >= 15), `tier2Dress`. Gallery `avatar-3d/armour2.html`.
- **D-world** hooks: `js/client/gear-look.js` `gearLook(eq, { tier2, themes })` (themed chest/head -> tier 2; themed off-hand carries `emblem` for the shield builder; `normItem` keeps the armour WEIGHT when a themed item carries `tier: 2`), `js/client/looks.js` loads the two tables. Tests: `avatar-3d/tests/class-outfits-t2.test.js` (6), `tests/D/armour-tier2.test.js` (3).

## 2026-10-05 — D-world (avatar-3d, fork W) play-test 4 S6 / S15 / S17: off-hand grip, second wands, a model for every base
- **S6** `avatar-3d/js/chibi2-motion.js`: a focus held in the off hand (orb, reliquary, effigy, ward, totem) gets a quarter grip turn
  and a level forearm, so it stands upright on the fist instead of lying back along the forearm (all clips start from it).
- **S15** `avatar-3d/js/chibi2-weapon-ids.js` (`HELD_WEAPON_IDS` keeps wands) + `js/client/gear-look.js` (off-hand wand no
  longer filtered out): a dual-wielding caster shows both wands.
- **S17** new `avatar-3d/js/chibi2-weapons-tv.js` (tv_scimitar, tv_warpick, tv_club, tv_glaive) and foci tv_ward / tv_totem in
  chibi2-gear.js, registered in avatar-2d chibi2-parts.js; `js/client/gear-look.js` `HELD_BY_BASE` / `OFFHAND_BY_BASE`: every
  weapon, shield, focus and quiver base in data/rules/loot-pool.json draws its own model (kite/tower/buckler shields are no longer
  all heater shields; foci are no longer blank; javelin/glaive bases are no longer quarterstaves).
- Tests: tests/D/weapon-models.test.js (5): every pool base builds a model in a hand and is registered, families never share a
  silhouette, every off-hand base builds, two wands, the focus points up and away from the forearm. tests/D/playtest1.test.js
  updated (it pinned kite shield/buckler -> heater shield).
- **D-UI** (play-test 4): **S1** the "Happening now" panel opens for every live event (realm AND zone, also from an event frame), tucks
  into a pulsing bubble by the minimap and back, and sits in ONE column under the minimap with the event frame ("1 fighter in range") and the
  quest tracker, so none covers another. **S2** tracking is a set: untracked quests leave the HUD tracker and the map/minimap (journal
  "Tracked ✓" untracks). **S3** shop rows that are only a category label are never for sale; categories are filter chips. **S4** ranked
  targets get a bigger frame/bar with the rank; rares near you (and announced ones) are marked on the map/minimap with a rim arrow.
  **S5/S12** chests and grouped corpses use the same loot window (`lootWin` with `chest` / `group`, rows carry their `corpse`).
  **S10** "Hand in" in the journal for ready quests. **S14** a tracked kill/collect step's `areas` shaded on the map/minimap within 400 m.
  **S19** NPC nameplates carry `<title>` from `info.title` / wanderer titles. **S20** "Eating — sit still" pill with seconds left.
  **S21** the mount call shows a cast bar (`mountR casting`, interrupted / done). **S23** a corpse with loot for you gets a star on its
  nameplate and a map/minimap mark, coloured by the best rarity (`lootable.best`). **S11** the Unbinder's dialog offers "Reset all talents /
  perks — N g". **S9** a wanderer's rumour tip can be pinned on the map. **S25** "Names" off silences every map label (provinces, zones,
  bands, settlements, places, markers; unit test counts zero fillText).

## Play-test 4 S3 S4 S8 S10 S12 S15 S20 S21 S23 S24 (streams A + C + E, 2026-10-05)
- **S3** "Wands & rods took 15 g and gave nothing": the shop's cached stock is shared, and `grant()` marked the row's item
  `_granted` — every buy of a row after the first was swallowed. Buys hand out a copy; a miss refunds; rows are always real
  items (`isProduct`); `data/provinces/refunds.json` pays the one victim (Stormy, 60 g, from the dev economy_log) once.
  `buildLayout({extra})` passes new province data files straight into L.
- **S4** champions (9%) and rares (2.5%) roll on wilds camp monsters from level 4 (`js/rules/affixes.js`,
  `data/rules/affixes.json`): Farhold's rank stats + modifiers, the new Pack-leader (brings its pack), a telegraphed special per
  modifier, a size floor, rares get their own names; `info.aff`/`info.sc`. 14 named rares are announced on nearby minimaps
  (`bossNear`/`rareNear`), 16 stay secret.
- **S8** waystones: home stone always known, a town's on entering, any within 15 m.
- **S10** remote turn-in: a finished quest pays where you stand unless `needsGiver` (13 class-companion quests).
- **S12/S23** one loot window over every corpse within 8 m; sparkles carry the best rarity for you.
- **S15** (server side) verified the off-hand wand is on `info.gear.offhand`.
- **S20** eating = sitting (`sit` anim, `info.sit`), mends out of combat, a step/jump/cast/hit/stand-up ends it.
- **S21** the mount call sends the channel start/end events.
- **S24** event rewards: the Torborhold raid had no boss in its data, so the runner raised a WOLF named after the event; now a
  raider captain. Every participant gets their own rare+ (on the boss body), bonus xp/gold scaled by level and length, and
  "Event complete: +N XP, +G gold".
- Tests: tests/A/pt4-{shop,waystones,loot,food-mount,quests,champions,event-rewards,gearlook}.test.js.

## 2026-10-05 — play-test 4 S22 (D-world, avatar-3d): mounts look like horses
- `avatar-3d/js/equine.js` (new): a body made for hoofed mounts — lofted barrel (croup, saddle dip, withers, deep chest,
  tucked flank), an arched deep neck out of the chest, a long head hung at the poll (jaw, muzzle, nostrils, eyes, ears),
  jointed legs (forearm/gaskin taper, knee/hock, fetlock, pastern, hoof; socks; feathering on heavy breeds), mane sheet,
  forelock, tail plume; elks with antlers + dewlap. Real gaits: four-beat walk, diagonal trot, rocking gallop, cadence from speed.
- `avatar-3d/js/mounts.js`: hoofed types ride it; tack cut from the body surface (blanket, saddle, girth, breastplate,
  stirrups, bags, bridle; warhorse caparison/crinet/chanfron; dray harness). Ram and drake unchanged.
- `avatar-3d/js/mount-types.js`: `breed` per type; new `dray` type (our `dray` mount id was falling back to a plain horse).
- No change in js/client (same createMount / seatRider / setGait API). tests/D/playtest2.spec.js Q16 green.
- 2026-10-06 screenshot pass: thicker necks (`neckK`) on horse/pony/courser/draft and slightly heavier legs so a mount
  reads as a stocky stylised horse under a Chibi 2 rider rather than a stick figure.

## 2026-10-06 — stream B (play-test 4, S7: town walls)
- **B** `tools/lib/zone-walls.mjs` (new): every planned settlement gets a perimeter by size + zone archetype from
  `data/world/town-walls.json` (stone curtain + towers + gatehouses / stockade / palisade / barricade / rail fence / hedge). Gates
  are cut where roads, lanes, streets and paths cross the ring (exact segment-circle crossings), turned to face OUT along the road;
  side-by-side roads share one gate and the others get painted approaches; openings that collide merge; a settlement with no road
  still gets a gate; narrow streams get a grate. `wallNav` stamps runs/towers/jambs/grates SOLID in nav.bin.
- **B** `tools/bake-zone.mjs`: walls planned after the footpaths, `town_wall` placements (replacing proctown's city-only record),
  approach paint, nav stamp; `placesFor` carries the sheet archetype. inputHash unchanged. `tools/bake-map.mjs` draws walls/towers.
- **B** `tools/lib/wall-checks.mjs` + `tests/B/walls.test.js` (8): every road crossing has a gate, gates face out along their road
  (<= 20 deg), no wall under a road/street/path/painted road, plot or E disc, walkable through every gate, solid elsewhere, every
  gate reaches the square over nav; planner cases (slanted road, grate, no-road ring); kit pieces; client part list.
- **B** `js/client/walls-view.js` (new) + hook in `js/client/world-stream.js`: instanced kit pieces, gatehouses widened to the road,
  doors standing open INTO the town, banners and gate torches (lit at night), posts + field gates, barricade frise dragged aside,
  grates; camera solids. `tests/B/walls.spec.js` + shots `tests/B/shots/s7-*.png`.
- **B** proctown `js/buildkit.js` (opt-in, WALL_KINDS unchanged): barricade wall/tower/gate pieces, `gateLeafParts`,
  `gatePostParts`, `grateParts`, `EXTRA_WALL_KINDS`/`ALL_WALL_KINDS`.
- Re-baked all 16 zones, horizon, map.

## Play-test 4 follow-up (stream A, 2026-10-06) — town walls stop players; tier-2 gear look on plain L15+ pieces
- `js/sim/movement.js`: a step may not cross B's nav SOLID/BUILDING (sampled every 0.5 m, slide along, never trapped);
  `province-terrain.js` stitched `nav.at`. tests/A/pt4-walls (4).
- `info.gear.<slot>.lvl` / `.tier`; `js/rules/loot-pool.js` stamps `dropLevel` (Farhold's rollDrop leaves `ilvl` at 1).
- **D-UI** walls/houses in client prediction: world-stream.js stitches each zone's nav.bin into `terrain.nav.at` (same shape as province-terrain.js); round 4 adds the eat "Stand up" button (`item {op:'stand'}`), `bossNear`/`rareNear` marks and the `eventDone` reward banner.
- **D-world (round 4 fold-in, 2026-10-06)** S4 reads A's `info.aff [{id, name, aura}]` (each affix's own aura) and `info.sc` (the server's scale); the rare's ring and pack-leader banner are attached to the body BEFORE its shader compile (added after the first draw they cost a 1.8 s compile on the test VM); swing crescents and loot sparkle/beam materials join the boot shader warm-up (`warmBodies({extras})`). S20 reads `info.sit` / `you.regen.sit`. R4: world-ui's event banners now go through boss.js's one call-out (two timers on one element let an event's timer wipe a boss warning mid wind-up).
- **D-world freeze**: tests/D/freeze.spec.js is red ONLY on D-UI's live portraits (`ui/portraits.js` getBufferSubData, 1.1-2.7 s on SwiftShader; request in requests.md). A/B with that read-back stubbed: zero long tasks while streaming and walking (max 25-29 ms a frame) with all of D-world's round 2-4 work on.
- **D-world e2e**: tests/e2e/two-players.spec.js leaves Torborhold through a wall gate (B's `town_wall` gates) instead of a straight line that now ends at the wall; green.
- **D-UI** (finishing pass): portraits never stall — on a software renderer they are 2D faces from avatar-2d (`ui/svg-portrait.js`,
  strict-XML SVG), on a GPU the live pass and the static renders read back through a pixel-pack buffer + fence; item icons read back
  the same way and up to 3 are in flight behind a stage lock (`ui/item-icons.js`); freeze.spec green. Consumables hang in their own
  group to the right of the action bar (the bar keeps its width, the chat box stays clickable). The entity menu has its own class
  (`.ent-menu`). The editor offers Accessory and Face marks, and a new character starts with neither (no rolled visor). `tv.cast`
  turns you to the target first (a swing lands in its arc — the e2e players were swinging at the air).

## Play-test 5 (stream X, 2026-10-06) — playground home page + the Armory (T1, T24, viewer half of T22/T23)
- **T1** the playground home page lists Thousandvale under Prototypes with TWO buttons: "Play on this network" (`http://<host>:8490/prototypes/thousandvale/`, hidden on github.io) and a separate "Live link" read from `data/live-links.json`; `tools/update-live-link.sh` rewrites that file from `ops/tunnel/quick.sh --url` (never starts/stops the tunnel).
- **T24** the home page is drawn from `data/experiments.json` (groups, status on every card, deprecated marks, search + status chips); new experiment `armory/` reviews every wearable/holdable Chibi 2 model (file + builder, measured triangles/size/bones, grip readout per hand, main/off/both hands, every clip, race/size, Thousandvale's own icon, flag notes with JSON export, deep links). Shared helper `avatar-3d/js/preview-kit.js` (new file, opt-in).

## 2026-10-06 — stream E, play-test 5 (T9, T10, T12, T15/T23, T25 content)
- **T9 crates**: `reward.crates [{slot, min}]` on 97 quest rewards in 19 files (tools/content-crates.mjs) — the start chain fills nine slots.
- **T10 rares**: measured (tools/content-rares.mjs): a newcomer's first half hour met 0.9 special monsters, because the rank roll needs level 4 and
  95% of what stands near the start is level 1-3. 62 fixed roadside champions placed (tools/content-hunts.mjs 1b) -> 5.9 on the same walk.
- **T12 events**: an `info` block (name, what, objective + count, durationSec, onSuccess, onFail, rewardText) on all 38 events
  (events.json realm 4 + zone 16, road-events.json 17 + the coded ambush) — tools/content-events.mjs, tests/E/playtest5-events.test.js.
- **T15/T23 gear**: tools/content-gear.mjs shelves F's new catalog rows in shops.json (64 of 66), band-gated by `minCap`.
- **T25 angling**: data/provinces/angling.json (46 fish, 12 junk, 16 legends, 12 meals + recipes, 3 rods, 3 baits, 16 anglers),
  data/provinces/angling-pools.json (308 pools on B's water, tools/content-pools.mjs), data/quests/angling.json (4 quests from Tam Sedgeley at
  Torborhold), 5 angler job frames, shops.json `kinds.angler`.

## Play-test 5 — D-UI (interface) — 2026-10-06
- **T5 starting equipment**: step 3 of making a character (`js/client/ui/kit-step.js`): three armour sets + the calling's weapon packs, worn by the
  3D title figure as you pick, each piece with its real numbers (and the bag's item card on hover). Kits come from A's `kits {cls}` (C's `kitsFor`);
  the choice goes in `create.kit`. A calling with no kits skips the step.
- **T9 crates / T20 gifts**: the item card says what a crate opens into and its lowest rarity; opening rattles the box, then reveals the item
  (`ui/reveal.js`). Quest reward rows read "Crate: boots (Magic or better)". Mail shows what a letter holds by name, checks bag room before the
  click (with the numbers), lets system letters be emptied anywhere, and unwraps a gift at once.
- **T11 / T12 events**: one tracker card per event (`ui/event-tracker.js`) — name, what is happening, objective + live progress, time left,
  reward; "Won / Failed: …" with what you got when it ends. Outside the event the card is a two-line notice (with free travel for a realm
  event); inside it the travel offer is gone. The old `.tv-event` panel and its bubble are retired.
- **T18 Character menu** (`ui/char-sheet.js`, key **V**): core stats, an Advanced switch, estimated damage a second per ability, a tooltip on
  every number. Docks to the left of the bag (under it on a phone); a change of gear marks every number that moved ▲ / ▼.
- **T3 / T4 / T7**: a note over the action bar says who your heals go to; pets and followers count as friendly targets; the death screen
  shows "X offers to raise you" with Accept / No thanks; the off hand takes a second two-hander with Doubled Grasp (drag or Shift-click) and
  says why not without it.
- **T19 / T21 feedback**: a Feedback button on the menu bar (`ui/feedback.js`): Suggestion or Bug report, "What will be sent with it"
  (character, place, build, the last 40 log lines), a confirmation. Admins get a Reports window (filter, read, approve / decline / trash).
- **T25 angling** (`ui/angling.js`): X casts, a bite prompt with a shrinking ring, a tension tug you hold with Space, the mouse or a finger,
  a catch card, the journal's **Catch** tab (species by water, biggest, legends), a cooking window at any fire, Angling on the Character menu.
- New: `css/pt5.css`, `js/client/ui/pt5.js` (hub) + `pt5-core.js` (pure), `tests/D/pt5.test.js`, `tests/D/pt5.spec.js`; `tv.fake(ev, msg)` plays a
  server message through every client handler (specs).

## Play-test 5 — A (server core) — 2026-10-06 — protocol v7, schema v5 (docs/protocol.md §21)
- **T12 events end, and say what they are.** Found the bug: a wave was spawned on a ring 32–40 m round the arena centre and each
  monster stood where it landed; a monster notices a player at ~26 m, so whatever nobody walked up to never came, the wave never
  cleared and the next one only arrived after 90 s (the old runner, run against the new test: "a wave monster 46 m away"). Waves
  now land 16–24 m from the players in the arena, from one side, with a path to them, and stragglers are re-aimed every second.
  A waves-only event (the Torborhold siege) no longer ends in a stand-in "wolf" boss named after the event. Every event ends:
  won, or lost with a reason (time, everyone left, everyone fell, the boss got away). `eventTrack` (1 Hz: name, what, objective +
  progress, stage, time left, reward, inside, credited), `eventDone` for everyone who was there, win or lose. Road events get the
  same tracker and E's time limits. A contributor who had left when it was won is paid by letter. (`js/sim/events.js`,
  `province.js` trackEvents / finishEvent, `roadevents.js`.)
- **T11** `eventAt` when you walk into / out of an event's area; `travel 'event'` answers `here` when you already stand in it.
- **T19 feedback** (`js/sim/feedback.js`): `feedback {kind, text, ctx}` on either socket; cleaned, capped, rate-limited; the server's
  own context added; stored in the `feedback` table / the memory store and appended to `<state>/feedback-<env>.jsonl`.
- **T20 system mail** (`js/sim/sysmail.js`): one `mailTo(...)` for letters with items, gold, a gift box or a crate; system letters
  are taken anywhere. The first feedback of a character posts a thank-you with a Gift Box that opens into a rare or better.
- **T21 admins**: `accounts.admin` (schema v5), set only by `tools/make-admin.mjs`; `admin {op:'reports'|'report'}` in the game,
  a **feedback** tab on the admin page, `tools/feedback-report.mjs` (Markdown; database or JSONL).
- **T9 crates** (`js/sim/crates.js`): crate / gift items open with `item {op:'use'}`; quests pay `reward.crates`.
- **T5 starter kits**: `kits {cls}`, `create.kit` validated against C's `kitsFor`, worn once on the first entry.
- **T4 revive**: `host.offerRevive` → `reviveAsk` → `revive {accept|decline}` → the body stands up where it lies; `rules.revived`.
- **T3 / T7 / T14 / T18**: friendly targets pass through; `itemR {op:'equip'}` with the refusal sentence, `you.dual2h`;
  `you.reach` on every bar change; the `sheet` message (queued, 2 a tick).
- **T25 angling** (`js/sim/angling.js`): cast / bite / hook / tug / land, pools that drain and move, the saved skill and catch
  journal, rods and bait from the bag, cooking at a fire, crate / legend / monster outcomes, `catch` / `cook` quest steps, quest
  `grant` and `reward.goods`, angler job frames; fish sell for their own price.
- **T10 rares** (E's ask): a placed camp's `rank` / `affixes` / `respawnMin` reach the spawned monster (`placements.js`, `room.js`).
- Tools: `tools/make-admin.mjs`, `tools/feedback-report.mjs`, `tools/lib/tv-env.mjs`. Server: `--feedback-file`.
- Tests: `tests/A/pt5-events` (4), `pt5-feedback` (6), `pt5-angling` (5), `pt5-play` (6).

## 2026-10-06 — stream C (combat rules), owner play-test 5
- **T2** every skill / talent / perk card says exactly who it touches (`js/rules/wording.js`; `bar[].who`, `bar[].targets`); `petsOnly` buffs and Farhold's `revive` are your own followers only; "all allies" is one list; a swap reaches your own follower. `js/rules/ally-audit.md` regenerated with the wording table.
- **T3** healers (cleric, priest, druid, shaman): key 1 or 2 is a direct heal on the party member you target, else you.
- **T4** six revives (`data/rules/skills-tv.json`): cleric mass, priest instant in combat, druid with a mend, paladin with a barrier, necromancer weakened, shaman long cast to full. `host.offerRevive` / `rules.revived`.
- **T5** `data/rules/starter-kits.json` + `js/rules/starter-kits.js`: 3 armour sets and 3-6 weapon packs per class; `kitsFor`, `validKit`, `starterGear`, `rules.applyKit`.
- **T7** Doubled Grasp: two two-handers go on and survive a login; the off hand now swings (it never did), alternating with the main hand.
- **T9 / T20** crates and gift boxes (`js/rules/crates.js`): `rules.makeCrate`, `rules.openCrate`.
- **T10** rares from level 2: champion 9% -> 5%, rare 2.5% -> 6% (E's first-30-minutes walk: 0.9 -> 14.7 special monsters).
- **T14** `rules.attackRange(e)` is the attack's real reach; out of reach is refused `range`. `rules.basic(e)`.
- **T15 / T16** 13 wand styles, 2 staff styles, 4 focus riders, off-hand wands, sceptres as elemental melee (`js/rules/caster-forms.js`); chained bolts really jump.
- **T17** conversion affix on 5.5% of magic / rare physical weapons (`js/rules/tv-gear.js`).
- **T18** the character sheet with measured ability damage (`js/rules/estimate.js`): `rules.sheet`, `rules.sheetWith`, `host.sheetChanged`.
- **T23** F's gear catalog becomes item bases (62), plus `cloth_gloves` / `cloth_shoes`; `rules.makeItem`.
- **T25** `js/rules/fishing.js` + `data/rules/fishing.json` (numbers); `rules.fishing`.

### Play-test 5 — D-world (2026-10-06)
- **T22** weapons are held by the handle: a held item's grip is turned relative to the HAND where it used to be aimed in the chest's frame (a blade pointing the way its forearm points hid its hilt in the wrist), and no clip leaves a weapon hand without a grip (every main-hand strike used to drop the off hand's). avatar-3d `chibi2-motion.js`; rule + audit in `tests/D/grips.test.js` (every model, both hands, every clip); `tests/D/pages/hands.html` to look.
- **T6** dual-wield strikes: `avatar-3d/js/chibi2-motion-dual.js` (new, opt-in) — `dualSlashR/L`, `dualCross`, `dualStabR/L`, `dualFlurry`, `twinChopR/L`, `twinCrash`; `actors.js` `swingClip` picks from both hands and from the event's `hand`.
- **T7** a two-hander in each hand is drawn in each hand (staves and polearms too), both shouldered at rest.
- **T4** `js/client/revive-fx.js`: six revive looks (choir, sunburst, bloom, aegis, grave, spirits) while casting and on landing; a revived body gets up (`standUp`).
- **T14** `js/client/reach.js`: the client walks inside the attack form's real reach and stops learning a longer one from far hits.
- **T15 / T16** `js/client/form-fx.js`: a look per caster attack form (beam lance, cone fan, nova ring, lob arc, burst / pool rings, fork splinters, chain jumps, fan flare, ward dome) and the sceptre's elemental swing — all from fixed pools, no new shader program.
- **T23** `gear-look.js` draws stream F's catalog models in every slot (gloves, rings, necklaces and belts are drawn for the first time).
- **T25** `js/client/angling-view.js`: rod in the hand, cast / wait / reel / show clips, the float and its line, bite and catch splashes, the catch held up, and fish pools (rings + a jumping fish) seen from the road.
- **T23 / T15 (stream F, models)**: 66 new Chibi 2 models with `g5_` ids — 20 armour (5 slots x cloth/leather/mail/plate; hands are drawn for the first time, as `top.gloves`), 29 weapons (one per weapon type + six wands and six staves, one silhouette per attack form), 12 off-hand (4 shields, 6 foci, hip quiver, cresset torch), 5 worn accessories (cloak, lantern, girdle, torc, signet ring). `avatar-3d/data/gear-catalog.json` (259 rows, every old and new model) + pure reader `avatar-3d/js/gear-catalog.js`; generator `tools/build-gear-catalog.mjs`; test `avatar-3d/tests/gear-catalog.test.js`. Docs: avatar-3d/CHIBI2.md "Gear catalog".
- (A, follow-up) `server/privacy.json` v2 + `public/privacy.html`: a **Feedback** entry — a report is stored with the account, the
  character, where it stood and up to 60 recent log lines, and is read by the game's admins. Dev's smoke-test report #1 trashed.
  T10 census on C's final dial (champion 0.05, rare 0.06): 21 champions + 14 rares among 371 monsters within 800 m of Torborhold.

### Play-test 5 — stream W, town geometry (2026-10-06)
- **T8a** fences: three recipes had `fence_rail` props turned 90 degrees to their posts (the Drill Field beside Torborhold, Turnwater Mill, the Spider Bridge toll) — fixed in `data/vignettes/{setpieces,m2b}.json`, rule in `data/vignettes/README.md`; a hamlet's field gate has its posts on the fence line and its leaves latched back instead of standing across the fence. `tests/B/fences.test.js`.
- **T8b** gates lie in the wall: `town_wall` gates gain `wallYaw` + `open`; jambs in nav follow the wall line; `walls-view.js` draws from them with proctown's new opt-in `gatehouseParts`. All 16 zones + the map re-baked. 31 of 78 gates were more than 3 degrees out of their wall (worst 54); now none (worst 1.2).
- **T13** buildings: `js/client/building-tune.js` + proctown's opt-in `describeBuilding({ tune })` — storeys 2.26 -> 3.59 m, doors 1.82 -> 2.80 m showing above ground (worst 0.79 -> 2.60), two-storey offices 99 -> 316 of 411, burrows no longer dug in. Plots and nav unchanged. `tests/B/buildings.test.js`.
- **Follow-up:** `back` / `waist` / `light` equipment slots (cloaks, belts, worn lanterns and torches; all 66 catalog rows are items); paladin / bard / oracle direct heals on key 2 (`mercy_touch`, `mending_verse`, `kind_omen`).
- (A, follow-up) C's new slots `back` / `waist` / `light`: equip, unequip, save + restore, mail and crates already carried any slot
  key (nothing is filtered by a slot list); `info.gear` rows now carry `g5` (the catalog model id) and crates name the three slots
  (a jewellery crate may hold them). tests/A/pt5-slots (2).

## 2026-10-06 — play-test 5, stream G: interface gallery (T26), controller + one binding table (T27)
- **`ui-gallery.html`** — every screen and menu as a deep-linkable scene in Desktop / Laptop / iPhone 15 Pro (both ways up, safe areas drawn) /
  Controller frames. The frame runs the game's REAL interface modules (index.html's markup and stylesheets fetched at run time, the same
  `create*()` calls as main.js) on a recorded server session (`tools/record-ui-fixtures.mjs` -> `js/client/gallery/fixtures/`). docs/UI.md.
- **One binding table** `js/client/input/bindings.js`: action -> key, gamepad button, touch control. The help window, Settings > Key bindings,
  every on-screen key hint, the controller and the gallery's Controls scene read it; `social-core.js` SHORTCUTS / PANEL_KEYS are built from it.
- **Controller support** (standard-mapping pads): sticks, face buttons + LT modifier, D-pad targeting (enemies and party), a quick wheel on LB,
  a focus ring in every window, a steered pointer on the map and the perk forest, an on-screen keyboard, glyphs by controller family, hints
  that flip between keys and glyphs by the last device used.
- **Keys can be re-bound** (Settings > Key bindings; saved in the browser; a key in use swaps).
- **Phone layout proposal** (`css/layout-phone.css`, `js/client/input/touch.js`) behind `<html data-layout="phone">` — OFF in the game
  (`PHONE_LAYOUT_ENABLED` in `js/client/input/layout.js`); the gallery shows it beside today's layout.
- Tests: `tests/G/bindings.test.js`, `tests/G/gallery.test.js` (node), `tests/G/gallery.spec.js`, `tests/G/gamepad.spec.js` (Playwright).
- (A, follow-up) D-world: `info.gear.*.el`, `g5` only when not the base, `info.pool.shelf`; fx `targets` pass through (tests/A/pt5-slots 3).

## 2026-10-07 — stream E, owner feedback 6 (U4, U8, U10, U12, U17)
- **U8**: every boss ward (19 scripts) has a life and a pool (`shield: {seconds, pool}`, 15-25 s) and a `ward` block with a call-out that says
  what to do and for how long; the raid on Torborhold got its own captain script (`ev_harl_vesk`) and a boss with no script falls back to a
  nameless, ward-less `plain_boss` instead of the Barrow Warden. tests/E/playtest6-wards.test.js.
- **U10/U12**: js/rules/dungeon-tiers.js — the way out stands only behind the last boss; floor 1 has a `door` (the way you came in); every floor has
  a name, a `landing` (where you arrive and where you get up after dying) and, below the top, a `lift` to every floor above; `shortcutUp` removed;
  the mine's reward room now opens off the boss room. Tests over 8 families x 4 depths x 6 seeds in tests/E/dungeon-tiers.test.js.
- **U17**: shops — Greater Healing from level 5 at apothecary and healer, inns sell a healing potion; `potionDrops` in shops.json. tests/E/playtest6-potions.test.js.
- **U4**: no data change — the "coffins" are stream B's oats field drawn as grain rows (docs/requests.md, for D-world).

## 2026-10-07 — stream C (combat rules), owner feedback 6
- U3 zones and telegraphs end with their caster (monsters and players). U6 shields block 20% (was 0.2%); `js/rules/item-text.js`; unit sweep test.
- U8 boss wards have a life (18 s default) and a breaking point (10% of the boss's health); `rules.wardOf`. U11 fallen party members are targetable.
- U13 `armorReduction` sheet row; low-ring armour perk +6 -> +10. U15 starter packs always fill both hands. U16 `rules.formOf` / `fx form.shape`.
- U17 potions heal 50% / 80% on a 20 s cooldown. U18 druid Moonpelt Shape (wolf) with the Wolf Pack talent.

## Owner feedback 6 — A (server core) — 2026-10-07 — still protocol v7 (docs/protocol.md §22)
- **U3**: a telegraph's end was routed by `teleR.x` — which is the "cancelled" flag, not a place — so cancels reached nobody and a dead
  caster's zone stayed drawn. Ends now go to whoever saw the telegraph; and the room ends every telegraph / monster pool the moment
  its source dies or is removed (`js/sim/room.js`).
- **U5**: consumables stack (`count`): grant, loot, shop buy / sell, mail, trade, cooking, quest goods, save, login (`consumables.js`, `province.js`).
- **U9**: `eventDone.got` / `story` and `realm eventEnd.text` are always real sentences. **U2**: feedback 2 s / 1000 an hour.
- **U10 / U12 / U14**: one way out behind the last boss, the way in is a `door`; respawn on the floor you died on; the stair up is a
  `lift` (asks which floor when there is a choice); `info.floor` / `info.portal` on dungeon objects (`dungeon.js`, `province.js`).
- **U11**: reproduced with two real WebSocket clients in The Ploughman's Crypt — the only refusal is "Greensap unlocks at level 3"
  (the owner's druid was level 2). Server side was fine; the unlock level is stream C's data. tests/A/pt6-dungeon.
- **U1**: `mailNew {unread}` after read / take / delete. C's asks: `info.form`, `info.ward`. E's: potion numbers + potion drops from shops.json.
- `tools/feedback-state.mjs`. Tests: tests/A/pt6-dungeon (5), pt6-misc (8), pt5-feedback (+1).
- (A, round 6 leftovers) potion cards written from the table + the holder's health (`potionText`, `item.restore`); U11 green at level 1 (C's data); `info.form` verified against rules.formOf for late joiners. tests/A 254: 246 pass / 8 skip / 0 fail.

## Play-test 5 (late) + owner feedback 6 — D-UI (interface) — 2026-10-07
- **T28 staged picks**: a click in the Perk Forest or on a talent only STAGES it (blue, dashed; "19 left, 3 staged"). Undo / Redo (Ctrl+Z /
  Ctrl+Shift+Z), Accept spends them in order, Cancel and closing the window ask first. `talent-model.js` createStage / stagedForest.
- **Slots**: Back, Waist and Light on the paper doll. Item cards print the rules' attack / focus / conversion lines.
- **Kit step**: one kits load at a time (a late empty answer used to wipe a good one and skip the step), a loading line, and a failed create
  goes back to step 1 with the reason showing.
- **U1 badges**: a red badge is news only (`js/client/ui/unseen.js`) — unread mail, a friend who came online or was added, new things in the
  bag — and clears when you look. Party size, friends online, guild online and "items carried" are no longer badges. Skill / perk points are a
  quiet gold number.
- **U5 stacks**: count on the cell, the 7-0 keys, the card and the shop's sell row. **U6**: item properties are the rules' `affixText`
  ("20% chance to block"). **U7 / U13**: the bag's armour and damage are the Character menu's rows; "35 (25.9%) armour" follows the sheet's
  `armorReduction`. **U17**: a potion's card says what it restores for you.
- **U8**: a ward bar on the boss frame (what is left to break, seconds until it fades). **U9**: a result card never prints a missing line.
  **U11**: a locked key shows "Lv N"; the heal's card says how to heal someone else. **U12**: the stair up asks which floor.
  **U14**: enemies, people, other players, doors, stairs and chests in your line of sight are on the minimap, in dungeons too.
  **U16 / U18**: your frame names the shape you are in.

### Play-test 6 — D-world (2026-10-07, owner feedback)
- **U3** a cancelled telegraph is removed at once; a body's telegraphs and ground zones go with its death or interrupted cast (`telegraphs.js` `dropSource`, `spells.js` `ownerGone` / `endZone`).
- **U4** grain fields are standing crops (new `sheaf` unit shape in proctown's kit, one instanced mesh and one swaying material per page) instead of one long pale box per row.
- **U16 / U18** a druid's shape changes the model: a creature body under the same name plate with its own walk and attack clips, and back (`actors.js` `setShape`); the Moonpelt wolf stands upright; pack wolves have their own look.
- **U19** the horse's nostrils are small matte slits (avatar-3d `equine.js`).
- **U8** a boss ward thins as it runs down, a ground ring drains like a clock, the frame counts the seconds and the break progress. **U10** the way in is a doorway, the stair up is a stair.

## Play-test 7 — D-UI — 2026-10-07
- **V5**: the character editor keeps its scroll position when an option changes (it rebuilt its rows and jumped to the top).
- **V11**: one scrollbar style for the whole game (`css/pt7.css`): thin, dark track, gold thumb — Firefox and WebKit.
- **V13**: the shop shows the thing on the shelf against what you wear (the bag's item card) with the price and a Buy button; on touch the
  first tap shows the card and Buy buys.

## Owner feedback 7 — A (server core) — 2026-10-07
- **V3 fish pools**: only 94 of 308 listed spots were open (3 of the 16 within 600 m of Torborhold), pools did not show across a town's
  edge, and a skill-gated pool blocked the water round it. Now 190 open, tier-1 and roadside first; every town with water in reach keeps a
  never-empty beginner pool; border spots are in both rooms; a gated pool's water can be fished (`js/sim/angling.js`).
- **V2 economy**: `js/sim/economy-knobs.js` — every gold number in js/sim reads stream E's `data/provinces/economy.json` (defaults unchanged).
- **V1**: one "Share your thoughts" letter at level 3 for a character that has never sent feedback (`char.flags.feedbackNudge`).
- Tests: tests/A/pt7.test.js (6).

## 2026-10-07 — stream C, owner feedback 7 (V2 gold)
- `js/rules/economy.js` + `data/rules/prices.json`: item price by level / slot / rarity (one function for buy, sell-back and the card), kill gold linear in level, gold find applied once. `fishing.json value`: fish worth by rarity and zone. Shop no longer applies the item level twice (js/sim/shops.js, two lines).

## 2026-10-07 — stream E, owner feedback 7 (V2 economy — lead; V3 fishing spots)
- **V2**: tools/sim-economy.mjs (gold per hour by activity at levels 1/5/10/20 + the price ladder, from the real rules; `--before`, `--set`), tables in
  docs/economy/README.md. data/provinces/economy.json (new), shops.json fixed prices, angling.json fish prices (62 species), quest purses at levels 1-2;
  tuned C's data/rules/prices.json and fishing.json `value` numbers. tests/E/playtest7-economy.test.js pins the ratios.
- **V3**: 385 pools (was 308), 257 of them tier 1, 238 open at once, a town pool beside 15 of the 16 hub towns with the angler standing by it.
- (A, D-UI's asks) stack split / merge (`item split|merge`), `kits` answered before sign-in and 40 at once with a complete or plainly-empty reply, friends `unseen` kept server-side (`friend seen`). tests/A/pt7-asks (4).
- **Stacks**: Shift-click a stack to split some off (a number box); drop one stack on another of the same thing to join them.
  **Friends badge**: the server's own unseen count (it is still there after a reload); looking at the list clears it for good.
  **Kits**: only the server's `kitsR`; when it has none the step is skipped and the reason is said in chat. The page no longer loads the rules.

## Owner feedback 8 — stream C (combat rules), 2026-10-08
- **W14 / W2 projectiles**: every bolt, arrow, thrown weapon and monster shot flies at a speed you can watch (spells 20-24 m/s, arrows 26-30; Farhold's 48 / 42 / 40 crossed a fight in 4-6 frames), homes on its target and deals its damage on arrival. `fx bolt | arrow | shot` carry `from`, `to`, `ms`, `speed`, `home`, `proj`, `skill`; a monster's telegraphed ranged special sends a cosmetic shot. `js/rules/projectiles.js`, `data/rules/projectiles.json`.
- **W4**: monsters up to level 6 pay x2.25 kill experience (was x1.5), fading to x1.5 by level 14: levels 1-10 take 108 kills / 76 minutes of killing instead of 155 / 109. `progression.json xp.killEarly`, `tests/C/xp-walk.mjs`.
- **W19 backpacks**: `sling_satchel` +4, `trail_rucksack` +6, `expedition_pack` +8 bag slots on the back, fewer properties than a cloak. `rules.bagBonus`, `rules.canUnequip`.
- **W22**: light items removed (bases, uniques, affixes, loot family, crate slot, the torch buff, the `light` slot); `LIGHT { radius 22, dungeonRadius 28, dungeonAmbient 0.4 }`; a worn light is paid back at list price on the first login.
- **W23 starter kits**: 4-6 packs a class with no near-duplicates (measure: hands / attack / reach / element / tempo, read off the items), `role` + `diff` text written by code, armour sets with a stat lean, two new starter weapons (Woodsman's Axe, Militia Sabre).
- tests/C/playtest8.test.mjs (14).

## 2026-10-08 — stream A, owner feedback 8 (protocol v8, schema v6)
- **W28/W29/W7 feedback**: state `completed` with a changelog note kept apart from the admin note (`done`, `doneAt`); `feedbackMine` (my own reports, by account); replies with `ref` + `#<id>`; an admin's own report is approved on arrival. `tools/feedback-state.mjs --state completed --note`, report + page + admin page print it. server/db/schema-v6.sql.
- **W11**: the level-5 gate on mail / public chat / whispers / guilds asks the account's highest character (`alv`, `you.acct`); refusals say whether the claim or the level is missing; `admin` / `username` no longer dropped on a border-crossing ticket.
- **W24**: road-event chests — own keepers only (E's `guardTypes`), the refusal names them, a chest opens only in its own loot window (a corpse's "take all" used to empty it), it stays 120 s or until everyone has looted, an unclaimed share is posted.
- **W26**: calling a mount holds you still server-side; moving cannot break it; `mount {op:'cancel'}`.
- **W27**: `info.title` only on NPCs placed for the player (`isTitled`, E's `titled`); filler sends `info.filler`.
- **W12**: per-player `questMarks` (offer / turnin / active / later / job), `book.mark`.
- **W19**: bag capacity = 40 + the worn backpack's slots (`bagCap`); the pack cannot come off while its room is in use (`itemR why:'bagSlots'`).
- **W22**: lanterns and torches in the bag are paid back at entry (and when one arrives later); the `light` slot leaves the save.
- **W21**: `meter {on}` -> `hits` rows for you, your party and their pets, 4 Hz, only for those who asked.
- **W5**: ox carts — js/sim/carts.js over E's carts.json: `cartList`, `cart go`, `cartRide`, held ride, arrival beside the other town's cart, `cart_token`, quest step `ride`.
- **W1**: newcomers (under level 3 or 10 minutes played, `char.played`): events with `clearOfNewcomersM` wait for them to leave (zone + realm); E's guards stand at their posts; a newcomer in a town with an event live is kept on their feet. Guards that FIGHT need a rules-side unit (asked of C).
- Tests: tests/A/pt8-{feedback,account,chest,marks,bag,meter,carts,newcomer}.test.js (21); older tests updated for W22 / W26 / W27 / W1; tests/A 283 = 279 pass / 4 skip.

## 2026-10-08 — stream E, owner feedback 8 (W1 W5 W27 W12 W24 W4 W22 W19)
- Town guards: `data/provinces/guards.json` (168 posts, 80 gates), `tools/content-towns.mjs`, `tools/sim-raid.mjs` (docs/economy/raid-guards.txt). Events: `director.newcomer`, `startOn.clearOfNewcomersM`, `raid.gates`.
- Ox carts: `data/provinces/carts.json` (46 stops, fare table), economy.json `cart`, wanderers.json `ox_carter`, quest `start_wheels_for_hire`, step kind `ride`, good `cart_token`.
- Titles: `titled` on every NPC record, titles.json `titled`, `tools/content-titled.mjs`. Quest marks: `data/quests/marks/givers.json` (`tools/content-givers.mjs`), `data/provinces/town-services.json`.
- Chests: road-events.json `rules.chest`, `guardTypes` / `guardFrom`; events.json `director.chest`.
- Quest experience x1.5 (economy.json `quest.xpMult`); `node tools/sim-economy.mjs --curve`.
- No light items in any shop; backpacks at the tailor and the general store.
- Tests: tests/E/playtest8.test.js (15); tests/E 235 green.
- **W1 town guards fight** (stream C): `js/rules/guards.js` — an NPC with `data.guard` is an ownerless friendly fighter built from E's guards.json (reference body +2 levels, health x4, hit x0.2, `vsBossMult` on the raid captain, 75 s down instead of dead, leash, heal after the fight, sergeant rally). Event monsters open on the nearest guard; a newcomer draws a quarter of the threat (`rules.newcomer`). Guard-only kills pay nobody. Two one-line hooks in js/sim/province.js. tests/C/guards.test.mjs (7).
- Farhold's `tool` / `mount` uniques no longer drop (no slot in Thousandvale).

## Owner feedback 8 — D-world (3D client) — 2026-10-08
- **W2 / W14 projectiles** (#23, #35): `js/client/projectile-kinds.js` (pure: which body flies) + `js/client/projectiles.js` — arrow, quarrel,
  javelin, knife, axe, stone, firebolt, orb, shard, spark; from the shooter's hand bone, the rules' own flight time, homing, impact on arrival.
  Pooled (fixed meshes per model), two materials warmed at boot, no lights. `spells.js` / `weapon-fx.js` route every `fx bolt | arrow | shot | thrown` through it.
- **W22 light** (#43): `daynight.js` `carriedLight` / `DUNGEON_AMBIENT`; `scene.js` `setCarryLight` (ONE PointLight, always in the scene, dimmed
  by day — 22 m at night, 28 m underground, C's `you.light`); dungeons: hemisphere 2.1, fog 16-72 m, a trace of glow in the stone. Every torch
  / lantern drawing path deleted (`gear-look.js`, `status-sync.js`, `actors.js`): no pool light rides a body.
- **W20 run by default** (#41): `controls.js` `wantsRun` (Shift walks; a stick under 60 % walks), auto-run on Num Lock (LT + stick click; quick-wheel
  slice on a phone); binding rows `walk` and `autorun` replace `sprint`.
- **W12 quest marks** (#33): `js/client/quest-marks.js` — A's per-player `questMarks`: gold "!", gold "?", grey "!" / "?", blue "!" for paid work;
  a sprite that grows with distance (40 px at 40 m). `thousandvale.questMarks.list()` / `.sprite(mark)` for the minimap.
- **W26 mount call** (#47): held still from the key press (`controls.hold`), a second press sends `mount {op:'cancel'}`, and held keys / a
  click-to-move goal / auto-run carry on the moment you are up.
- **W5 ox carts** (#26): `js/client/carts-view.js` — the parked cart by each gate (`info.type:'cart'`), a cart behind a roaming carter
  (`info.vehicle`), and the ride on `cartRide` (you sit on the bed, it pulls away, the veil closes 1.1 s before the arrival). The ox is the cow
  frame without the dairy, backed between the shafts. One cart is built and compiled at boot.
- **W19 backpacks** (#40): avatar-3d `js/chibi2-backpacks.js` (satchel, rucksack, frame pack, explorer's), catalog rows; `gear-look.js`
  `packLookId` / `packPart` draw C's three bases and the rare one on the back in place of a cloak.
- **W25 icon = worn model** (#46): `gear-look.js` `wornLook` / `wornPart` / `wornKey` and `looks.js` `gearOpts(cls)` — the one call bodies AND
  D-UI's icons use. `ARMOUR_BY_BASE`: a base draws the model its name says (War Helm = `war_helm`, Plate Helm = `plate_helm`, Leather Cap =
  `leather_cap`, Chain Coif = `chain_coif`, Chain Shirt = `chainmail`). The client now also loads Thousandvale's own bases (gear-tv.json).
- **W18 far trees** (#39): `horizon-grid.js` `treeCover` — a canopy tint by biome, height and slope on every horizon chunk (after the rock tint,
  so wooded slopes stay green to the 700-880 m tree line), and tree spires built into the nearest ring's chunks in the worker (High 2,400 a
  chunk, Medium 1,000, Low none; same mesh, same material). `?horizonTrees=0` turns it off.
- **W3 horse** (#24): avatar-3d `js/equine.js` rebuilt over three rounds of renders (crest-and-throat neck, real head, leaf ears, jointed legs);
  reins off a riderless mount. README "Mounts".
- **W1 guards** (C's half drawn): `fx guard` — down on one knee, up again, the sergeant's rally bark.
- Tests: `tests/D/playtest8.test.js` (12), `tests/D/playtest8-horizon.test.js` (4), `tests/D/playtest8.spec.js` (9); the three stale light / catalog tests rewritten.

## Play-test 8 — D-UI (interface), 2026-10-08 — reports #29 #31 #34 #36 #37 #38 #40 #42 #43 #46 #48 + W5 W12 W23 W28 W29
New files: `js/client/ui/pt8.js` (hub: `createUi8`, `window.tvui8`), `pt8-core.js` (pure rules, node-tested), `hidden-events.js`, `map-tools.js`,
`meter-window.js`, `cart-travel.js`, `css/pt8.css`. Wired in `main.js` and the gallery's `stage.js`; five new gallery scenes + four fixture moments.
- **W8 loot keys** (#29): with the loot window open, E takes the SELECTED row (the first to begin with; arrow keys or the pointer move it) and F takes
  everything. The two hints are `<kbd data-action>` on the `interact` / `strike` rows of the binding table, so a re-bound key or a controller glyph
  shows by itself; on a phone the hints are blank and the Take / Take all buttons are the controls. A pad's X on a row takes all.
- **W10 one badge per thing** (#31): unread mail is the yellow dot on the Party button and never a red number there; the number of letters is on the
  Mail tab inside the window. `ui/unseen.js badgePlan` is the one table (friends + guild news = the red number, mail = the dot, bag = its number).
- **W16** (#37): the minimap canvas has no tooltip of its own any more; the pins keep their cards.
- **W29 / W28**: Feedback has a "My reports" tab for signed-in accounts (state, the team's note — for Completed, how it was fixed); Reply opens a
  new report that starts `#<id> ` and carries A's `ref`. The admin's Reports panel has Completed (a note is required) and a Completed filter.
- **W13 hide an event** (#34): the crossed eye on an event's card (never on one you are standing in) takes it off the tracker, the minimap and its
  rim arrow for the session; a foot line "N events hidden · Show" and the map's Events list bring it back. Client only (`sessionStorage`).
- **W15 map** (#36): the map opens where you left it (zoom + position, per session); a service filter and a search box read `offices.json`,
  the placed NPCs, `carts.json` and E's `town-services.json` — zoomed out the towns that match are ringed (with a count) and the rest fade, zoomed in
  each match is a pin at its door; the side panel lists matches nearest first.
- **W17 quest zones** (#38): a zone's ring answers the pointer anywhere inside it with the quest and its objective and lights up, on the map and the
  minimap; a click inside tracks the quest.
- **W12**: A's per-player `questMarks` are drawn on the map and minimap as a bare gold / grey `!` or `?` (`job` is not drawn); the plain "someone in
  sight" dot gives way to the mark, and a mark never sits on top of the journal's own hand-in pin.
- **W21 damage meter** (#42): the playground's `meters/` experiment, unchanged, in a window. Settings -> Game -> "Damage meter" (default off), or
  `/meter`. Fed by A's `hits` (asked for with `net.meter(true)`, again after every join); falls back to the `hit` / `miss` events. Fights are cut by
  8 quiet seconds and named after the first enemy; only our side has bars under "done".
- **W5 ox-cart window**: stops nearest first with fare, road distance and ride time; a locked stop says why; a second press confirms.
- **W19 backpacks** (#40): the card's first line is "+N bag slots"; the bag draws exactly `you.bagMax` squares and follows `you {bagMax}`; a pack whose
  extra room is in use will not come off (or be swapped for a smaller one) and says how many squares to empty; the server's `why:'bagSlots'` is printed.
- **W22** (#43): no Light slot on the paper doll. **W27** (#48): a title line only for an NPC the server titles; filler folk and guards get none
  (`pt8-core.js npcTitle`; the role table that titled every woodcutter is gone from `pt2.js`).
- **W25 icon = model** (#46): `inv-core.js iconSpec` asks D-world's `gear-look.js wornPart(item, slot, gearOpts(cls))` — the call that dresses the
  bodies — and keeps no table of its own; `item-icons.js` no longer reads Farhold's look functions, waits for the look data, draws catalog (`g5_`)
  weapons with their own builders and frames cloaks / packs / belts on a body. Cache version v4 (old pictures are dropped).
- **W11** (interface half): chat / guild gates ask `you.acct.level` (`social-core.js accountLevel`); wording says which half is missing.
  **W23**: the kit step shows C's `role` tag and `diff` sentence. **P-client**: `sheet.addSection(id, title, draw)`, `journal.addTab(id, label, draw)`.
- Tests: `tests/D/pt8.test.js` (27 node tests), `tests/D/pt8.spec.js` (desktop 1366 x 800 + phone 393 x 852, 24 screenshots `tests/D/shots/pt8-*.png`).

## 2026-10-08 — play-test 8, stream W: gates lead onto main streets (W6, report #27)
- Every town re-planned: each world road that reaches a gate carries on as one clear main street to the square (proctown opt-in `highStreets`; `tools/bake-zone.mjs`, `tools/lib/zone-walls.mjs`). 67 road gates in 46 towns: 67 with a main street, 0 m blocked (before: 0 and 1,435 m). Plot ids and every office unchanged; 38 houses that stood in a main street removed.
- `town_wall.gates[].main` / `.road`, `street.data.high`, `town_square.data.stalls`; `js/client/town-square.js`; market stalls no longer drawn on buildings.
- New: `tools/gate-streets.mjs` (the table / `--check`), `tools/lib/gate-street-checks.mjs`, `tools/town-plan-png.mjs`, `tests/B/gate-streets.test.js`, `proctown/tests/highstreets.test.js`. All 16 zones, horizon and map re-baked; E's content-towns, content-givers, content-pools, content-hunts re-run.
- W18, the near half: the range the owner was looking at lies inside a LOADED zone (real terrain, where the bake scatters no trees on the Mountains biome), so `horizon-grid.js` `buildCanopy` adds tree spires there too (one extra mesh per chunk a loaded zone touches, the horizon's material; High 3,600 a chunk, Medium 1,600, Low none). Trees climb to 49-60 degrees and 780-940 m: a quarter of this world's mountain cells are steeper than 53 degrees.
- W5: the cart ride ends on its own (frame) clock, not a wall-clock timer.

## Round 8 — W9 Professions, server side (stream P-core, 2026-10-08)
- **Ten professions**, skill 1-100 each, all on the Character sheet (`you.professions`): Mining, Logging, Foraging, Skinning, Angling (gathering) and Smithing, Outfitting,
  Alchemy, Cooking, Tempering (making). Angling and the fish cooking are unchanged; cooking fish now also teaches Cooking.
- **2,978 gathering nodes** on the current bake (per zone: 64 ore boulders, 56 marked trees, 66 herb / mushroom / fibre patches; tiers by the zone's level band), never on a
  road, in a town, a field, water or a main street. Nodes are PER PLAYER: nobody can empty yours; they come back for you in 6-10 minutes. Copper and tin boulders stand within
  150 m of Torborhold's gate road.
- **A mini-game for every trade** (3-7 s, can be failed): the server seeds the pattern, the client sends raw input times, the server scores them — no score is ever sent.
- **125 recipes**: smelting, curing, weaving, tools, 80 semi-random gear patterns over C's catalog (you pick the base; level under yours and under the material's cap; never above
  rare), potions the game already drinks, campfire meals; **tempering** (quality up, promote to at most rare, reweave one property, brand a weapon) never harms the item.
- **First meeting**: Bram Delver, a prospector just inside Torborhold's main gate, teaches Mining at the first word and hands over a pick (a tool: no slot); a three-quest chain
  walks the copper, the forge and the tempering gauge. The town's trade folk teach the rest; the smith, apothecary, tailor and bowyer offer profession jobs.
- **Economy**: materials stack to 50 and sell at their own price; `tools/sim-professions.mjs` (printed by `tools/sim-economy.mjs`): mining / logging / foraging and
  gather-then-refine each earn 71-98% of an hour of questing at levels 1, 5, 10 and 20 (20 projected: no tier-4 nodes in this province); skinning adds 5-18% to hunting.
- Files: js/rules/professions.js, professions-games.js, professions-temper.js, data/rules/professions.json, js/sim/professions.js, tools/content-professions.mjs,
  tools/sim-professions.mjs, data/provinces/professions.json, professions-nodes.json, data/quests/professions.json, docs/professions.md, docs/protocol.md §25. tests/P/core-* (26).

## Round 8 — W9 Professions, client side (stream P-client, 2026-10-08)
- **In the world**: ore boulders are player-sized rocks with chunks of ore sticking out — the chunk's colour is the metal and its SHAPE is the tier (nuggets, slabs,
  crystals, shards, star clusters); marked trees wear a painted band; herb patches, mushroom rings and fibre stands. A node you have not worked twinkles so it reads
  from the road; one you have is bare (no ore and rubble at its foot, the band crossed out, stubble) until it comes back. All of it is instanced: a hundred nodes are
  about twenty draw calls, two shared materials, warmed at boot. A corpse you may skin carries a "Skin" prompt and a small glint.
- **Working**: seven new Chibi 2 loops (avatar-3d `js/chibi2-motion-prof.js`, opt-in) — pick swing, hatchet chop, stoop-and-pick, skinning on one knee, hammer on the
  anvil, stitching, stirring — with the tool in the hand (pick, hatchet, sickle, knife, hammer, needle, spoon). A smith has a forge with an anvil and a tempering
  bench beside him, a tailor or bowyer a workbench and loom, an apothecary a still.
- **Eight mini-games in one small frame** (`js/client/ui/prof-minigame.js`), a few seconds each, drawn from the server's pattern and scored by the server's own function:
  strike the vein (mining), chop in rhythm (logging), pick them ripe (foraging), follow the cut (skinning), strike while it glows (smithing), stitch the seam
  (outfitting), stop at the mark (alchemy, cooking), stop it in the band (tempering). One thumb, a keyboard, a mouse or a controller (binding rows `profWork` /
  `profLeft` / `profRight`); an input is stamped with the moment it was MADE, so a slow frame rate does not move your press. A result card (Botched / Rough / Sound /
  Fine / Perfect) with what you got, the skill gained and when the node is back. Sound for the first time in Thousandvale (the playground's Sound Lab, Settings > Audio).
- **Windows**: a craftsman's dialog gains "Learn: …" and "Use the forge"; one crafting window for every station (a tab per craft, each recipe with what it needs
  against what you carry, the fee, the pattern you want and what better work gives); tempering (pick the work, pick an item from your bag, the server's quote with
  the numbers); a Professions block on the Character menu and a Professions page in the journal (level, rank, tool, what the next band opens, who teaches what you
  have not learned); a material's card says "Crafting material · Mining · tier 1 — sells for 2 gold each".
- **Gallery**: 17 scenes in a new "Professions" group (every mini-game, the result card, every window), played from messages RECORDED from the real server
  (`tests/P/client-fixtures.mjs` -> `js/client/gallery/fixtures/professions.json`).
- Tests: `tests/P/client-games.test.js` (10) and `client-world.test.js` (9) — node; `client-minigames.spec.js` (all nine trades to a Perfect by a synthetic player with
  real keys at 60 and 10 fps and with one finger on a phone upright and on its side) and `client-world.spec.js` (the real game against a real server: learn from Bram,
  see the boulders, mine one end to end, the smith's forge and recipe list, the phone layout with real touches). Pictures: `tests/P/shots/`.

## 2026-10-08 — stream A, owner feedback 9 (protocol 8, schema v7)
- **X6**: `delete {char, name}` -> `deleted` (typed-name confirm, refused while online / leased, letters holding items or gold returned to sender, friends / guild / post tidied, name reserved a day — `char_tombstones`); character limit 20 as a server knob (`--char-limit`, `TV_CHAR_LIMIT`) sent as `charList.limit` / `authed.charLimit`.
- **X1**: `admin {op:'online'}` -> `adminOnline` (name, level, class, zone / town, room; admin accounts only); message of the day on every sign-in with players online and accounts in the past 24 hours (`data/ops/motd.json`, `TV_MOTD`); presence carries `where / zoneName / town / roomKind`.
- **X4**: `economy.json barber.mult` (0 = free).
- **X7**: raid waves spawn 35-55 m outside a gate E named and walk in (`js/sim/events.js`, `raid.gates` in world metres); `data.guard.level` = the town's raid level (else the zone band floor) + `tier`; carts.json `roaming.runs[]` are routes of their own; `mapData.places[].marks`; reports carry `server.env` / `server.server`, shown by the tools and the admin page.

## Play-test 9 — D-UI (interface), 2026-10-08 — reports S#49 S#51 D#14 D#16 (X3 X4 X6 X1) + the m3-social title flow
New: `js/client/ui/pt9-core.js` (pure), `js/client/ui/online-window.js`, `css/pt9.css`; gallery scenes `online`, `title-delete`.
- **X3 windows drag** (S#49): one helper, `ui-panel.js makeDraggable`, for every floating window and the bag — drag by the title bar, the whole
  window stays on screen (also after a browser resize), the place is kept for the session (`sessionStorage tv.panel.<id>`; it was `localStorage`
  for the panels and nothing for the bag), a double-click on the title bar puts it back. Off in the phone layout (windows are sheets).
- **X4 barber** (D#16): the button is "Save (Free)" when the cost is 0 and "Save (N gold)" otherwise (`pt9-core.js barberSaveText`); the editor
  takes the SERVER's quote (`used.prices`, all 0 while the barber is free) instead of the client's price list; the window cannot scroll sideways.
- **X6 characters** (D#14): the title's list is one row a character with a Delete button; the confirm asks you to type the name and says what goes
  with the character; `net.deleteChar` -> `deleted`, refusals printed; the list scrolls; "N of 20 characters" and a shut "New character" at the limit.
- **X1** (S#51): admin-only "Online players" window (`/online`, or beside Reports in the Feedback window): name, level, place, class; Refresh and
  click-to-sort. Chat lines wrap whole (the message of the day is one long system line).
- **Title flow:** signing in from the title's Log in form now lands on Your characters (the list sat on a hidden card for two rounds —
  `tests/D/m3-social.spec.js` step 7). **X7 (reading A):** `mapData.places[].npcs[].q` marks on the map; a report's `env` on the admin card.
- Tests: `tests/D/pt9.test.js` (6), `tests/D/pt9.spec.js` (desktop + 393 x 852; a real deletion against the test server).

## Play-test 9 — D-world — 2026-10-08
- **X2 (S#50) click-to-move marker**: `js/client/move-marker.js` — a gold ring with four chevrons and a closing pulse on the ground where you clicked or tapped, tilted to the slope; it follows `controls.moveGoal`, so arriving, steering by keys or stick, auto-run, attacking, Esc and dying all end it, and a new click moves it. Pooled, one material type, warmed at boot.
- Raid gate ping: `eventTrack` / `zoneEvent` / `realm` with `gate {id, x, z}` puts a red ring and a bobbing arrow at that gate for 10 s (the same module's `ping`).
- The shader links freeze.spec counted in its walk were two programs first drawn late: the selection ring under a target (unlit, transparent, no fog) and the night's point sprites (stars / settlement lights). Twins of both are in the warm-up pen (`warmup.js`); freeze.spec now logs the names of any program linked. Links: 0 / 0.
- Tests: `tests/D/playtest9.test.js` (3), `tests/D/playtest9.spec.js` (desktop + 393x852 touch).

## Round 9 — X5 Promote to legendary (stream P-core, 2026-10-08)
- Tempering's Promote now takes a RARE item to LEGENDARY: Tempering 60, one **Sovereign Core**, 6 of the item's tier material, 2 gems and a quarter of its list price. The item keeps
  everything and gains one legendary power that fits its slot. A missed gauge costs the other materials and the gold; the core and the item are kept.
- A Sovereign Core drops only from a world boss (25% for each player with credit) and from a won event of level 8 or higher (5%). Nothing gathers, crafts or sells one.
- A promoted legendary has the rare's three rolled properties plus the power; a dropped legendary rolls five or six — the drop stays the better item.
- **Round 9 (stream C)**: `hit` events carry `over` (overkill / overheal) and `abs` (absorbed) for the damage meter. Tempering's rare -> legendary promotion checked end to end (tests/C/promote.test.mjs): every promotable power fires in a real fight; six powers nothing in Thousandvale reads are barred from promotion (`INERT_POWERS`); a burn-length power now also lengthens a stacking burn (Firebolt).

- **Move speed is real** (lead / C, 2026-10-08): `entity.speedMul` = foot (sheet `movePct`, held to x0.5..x1.3) x mount; `you {speedMul, moveMul}`; tests/A/pt9-speed.test.js over real sockets. tests/A 291 = 287 pass / 4 skip.
- **Round 9 dead-data audit (stream C)**: every gear power / property line is proven live in a real fight (tests/C/dead-data.test.mjs, effect-audit.mjs). Wired: timed gear effects (`rpg.fx.update` was never called), kill-count / low-mana / after-dark sheet lines, the gear barrier's refill, the guard bond (town guards), a quiver's arrow element, move-speed power back in promotion. Stripped: three travel powers (off 3 uniques, 3 sets and owned items), tool / mount properties.
- **Round 9 (stream C)**: three Thousandvale set powers replace the stripped ones — Roadwarden's Vigil / Roadsong +10% move speed out of a fight, Forager's Covenant / Thistlewarden 15% chance of an extra material from a gathering node, Ragpicker's Fortune +15% kill gold and a 10% chance a crate holds one rarity better; The Long Watch gets +20% armour after dark.
- **Round 10 (stream C, owner feedback 10)**: one damage number a melee swing (Farhold's "splash behind the arc" folded into the arc's hit — Y9); hands are Main hand / Off hand / One-hand / Two-hand (`js/rules/hands.js`), tomes are main-hand caster weapons with four slower, heavier forms, orbs are off-hand implements with no attack, saved items in a now-illegal hand are moved, never deleted (Y16); dungeon walls block every attack both ways (`js/rules/sight.js` — Y10); every basic attack fires while moving (Y7); attacks per second on the weapon card and the sheet, attack speed capped at +40% and applied to bows, staves, wands and tomes (Y26); a knock moves a caster-anchored wind-up (`teleM`) and may interrupt it by rank (Y12); carried zones tell the client who they ride, and three ground-cast ones follow for the first time (Y25); Storm Beam is a six-pulse held beam (Y20); the Unbinder costs a share of lifetime income — 515 gold for everything at level 9, from the one `income.lifetime` table in prices.json (Y14, Y31); training dummies (Y17); wilderness NPCs that fight beside a player and report who helped (Y21, `js/rules/guards.js`). New knob file `data/rules/combat.json`. tests/C/playtest10.test.mjs (21).
- **The Starcaller (Y32, stream C)**: a 31st class, Thousandvale-only, injected from `data/rules/classes-tv.json` — arcane, cloth, Mana; Star Dart, Scattered Stars, Called Star, Star Field, Wheeling Stars, Heavens' Barrage, each with a four-tier talent tree; signature Constellation (Starlight, 5 at most: thrown stars fill it, the big skills spend it); five starter packs incl. the first main-hand tome kit; projectile kinds `star` and `skystar` (`fx skyfall`). Measured beside mage / stormcaller / pyromancer at 5 / 10 / 20: 40 / 86 / 233 against 34-40 / 78-86 / 205-235.

## Play-test 10 — D-UI (interface) — 2026-10-08
- **Y33 (iPhone)**: the portrait floating below the unit frame, flickering. Cause: the live portrait draws the body a second time INTO the game's canvas, in the
  square the frame covers, and reads it back; on iOS Safari the canvas box changed height (the toolbar) while the drawing buffer did not, so "frame rectangle ->
  GL viewport" pointed 86 px low and the face was drawn in the open, six times a second on a canvas repainting sixty. Now the live path is used only on a desktop
  pointer device whose canvas box matches its buffer that frame (`ui/portrait-mode.js`); iOS, the phone layout and any finger-first device get the 2D picture
  (`ui/svg-portrait.js`), an `<img>` inside the frame. `scene.js` `resize()` only on `window.resize` is the underlying fault (D-world's, in docs/requests.md).
- **Y27** (#27 #38 #40 #57 #51): every list keeps its scroll position through a redraw — one rule (`ui/keep-scroll.js`, installed by `ui-panel.js`): a scrolled
  element that is REPLACED by a new one at the same place in the same window (same tab) is put back where it was, before the browser paints. Shop lists and the
  compare card reserve their scrollbar and keep one height, so hovering shifts nothing. The spec redraws every scrolling list of every window.
- **Y39** (D#59): one stacking rule (`css/pt10.css`): `--z-ask` (pop-ups that ask) and `--z-confirm` above every window; every confirm is mounted on `<body>`
  (`mountConfirm`); the windows' own z counter is held under 900 (it used to climb past the confirm's 60 after thirty clicks — that was the bug).
- **Y38** (D#58): a skill's talent badge is decided by the SERVER's tree, not by a `talents` block on Farhold's row — a skill Thousandvale adds itself had none.
- **Y37** (S#55): party rows are de-duplicated and never include you (`partyRows`: the server's `party.me`, else your id, else your name).
- **Y11** (#35): `eventSync {live, realm}` and `travelR {gone}` drop tracker cards, the waystone line and map pins for events that are over.
- **Y29** (#37): the title opens on the front card for everyone — "Finding your characters…", then the list, or one "Create character" button; the form opens
  only when asked for. The 3D figure is the listed character (saved look + the server's `gear`, else what this browser last saw it wearing), through `lookFor`.
- **Y30** (#25): the changelog — a popup on the title after an update, a window listing every entry newest first with unread ones marked New (`ui/changelog.js`);
  "What's new" on the title's foot line and in the pause menu; `/changelog`. The marker is the account's (`settings.changelogSeen`) or the browser's.
- **Y28** (#39): "Locate player" at the top-left of the map. **Y36** (S#54): a Party section on the map (yourself first; Show / Track per member); tracking a
  party member or a friend (friends list: Track) = a marker, the minimap's rim arrow with the distance, and an arrow at the edge of the screen until within 25 m;
  pointing at a side-list row whose target is off the map draws an edge arrow. `thousandvale.tracking()` for D-world's in-world arrow.
- **Y22** (#17): a step done anywhere (craft / cook / learn / ride …) has no place: no marker, no ring; the minimap no longer fills with a region-sized ring.
- **Y16 / Y26** (#31 #32 #50): cards print the rules' hand ("Main hand" / "Off hand" / "One-hand" / "Two-hand"), attacks per second under the damage, no damage
  line for an orb; a wrong-hand drop is refused in the rules' words before the round trip. **Y15** (#33): Angling is under Gathering (no block of its own).
- **Y6** (#28): a ring's icon is the ring — a 2D loop in the model's own metal and stone colours — not a close-up of a fist.
- **Y32**: a calling's card on the new-character form (role, armour, stat, resource, hook, signature) fed by one list that includes Thousandvale's own callings;
  pictures for the Starcaller's six skills (`ui/skill-icons.js`; other skills keep initials); `ui/class-res.js` draws a class resource as pips on your frame —
  WAITING on the server to send it (no class resource has ever been sent; see docs/requests.md).
- **Y5** (#53): `/wave /sit /dance /cheer /bow /point`, `/emotes`; a third ring "Emotes" on the quick wheel. **Y34** (desktop half): the fishing control is a rod,
  a line and a fish with "Cast a line" under it.
- Tests: `tests/D/pt10.test.js` (19), `tests/D/pt10.spec.js` (desktop + 393 x 852 as an iPhone), nine gallery scenes.

## 2026-10-08 — stream A, owner feedback 10 (protocol 8, no schema change)
- `teleM` + `emote` event types; `starcaller` accepted (server/load.mjs reads data/rules/classes-tv.json). Y37 `partyState.me` + a resend after rejoin. Y11 `eventSync`, `travelR.gone`. Y23 per-death respawn clocks, wilds 90-150 s, no respawn in view inside a minute. Y24 waystones claim at 30 m. Y8 empty corpses are not targets. Y5 `emote`. Y17 dummies (`dummy` rows; stand-ins in the first town). Y21 `data.fighter`, `npcHelped` thanks (`npcThanks` knobs). Y15 angling is learned (anglers teach). Y16 hands-moved items to the bag / post, `refreshItem` over the bag. Y30 `/changelog.json`, `charList.changelog`, `settings.changelogSeen`. Y36 `track` / `whereabouts`, `settings.shareLocation`.
- tests/A/pt10.test.js (6); tests/A 297 = 292 pass / 4 skip / 1 red in the parallel run (stage2, passes alone).

## 2026-10-08 — stream G2 (phone touch layer, controller, gallery), owner feedback 10
- **Y35 / Y7** (#45): the Attack button is a switch. One tap picks the nearest enemy when you have none, ends whatever was moving you, turns you, walks you
  into the attack's real reach and keeps attacking; a second tap stops (taps under 0.6 s apart count as "attack"). Auto-attack is its own state now
  (`controls.auto`), separate from the walk toward the enemy (`controls.chasing`), so moving by hand — keys or stick — no longer switches it off. The slot wears a
  lit ring while it is on (every layout). `controls.js` / `main.js` edits are marked "Y7/Y35 (G2)".
- **Y34** (S#52, S#53): the "drink button" was the Belt (a bottle) whose first slot held the fishing rod. The Belt never uses a tool and wears the picture of what a
  tap will use; **Fish** and **Mount** are buttons of their own with their names on them (Fish lit only with water in casting range — the server's own sweep in
  `input/water-reach.js` — dim with "No water in reach" otherwise; Mount reads Mount / Calling… / Dismount with a progress bar). A first-time fishing hint.
  Every on-screen control has a row in `TOUCH_CONTROLS` (`input/bindings.js`): a long press shows its name, Pause > "What do these buttons do?" numbers and lists
  them all, Settings > Key bindings > Touch prints the table.
- **Y1** (#46): `controls.release()` + `input/activity.js` — a mini-game, a cast, a talk or a shop STARTING lets go of held move keys (ignored until pressed again),
  auto-run, the pad's stick (until it re-centres) and the phone's stick.
- **Y19** (#21): every profession mini-game opens READY and waits for the first key / click / touch (not counted as a move); it starts itself after 6 s.
  `data/rules/professions.json` `lateMs` 4000 -> 10000 so the server's clock allows the wait. `tvprof.mini.begin()`, `tvprof.ready(type)`.
- **Y36**: `input/party-arrows.js` — a small edge arrow (initial + distance) for every party member who is off the screen; on the phone, hold a party portrait
  for "Track".
- Tools / tests: `tests/G/pt10.test.js` (8, node), `tests/G/phone-play.spec.js` (+5 steps: one-tap attack, the toggle + Y1, Fish / Mount / Belt, labels + the
  overlay, party arrows + Track), `tests/G/phone-goover.mjs` (the real game on an iPhone-sized browser, Chromium or WebKit: every newer window measured and
  photographed), `tests/P/client-minigames.spec.js` (+1: the ready state). Five new gallery scenes (94 in all).

## 2026-10-10 — round 10 completion
- Finished phone/desktop control integration: tools excluded from potion slots, stale rod assignments repaired, Attack releases movement and stays available outside reach, phone map toolbar wraps, canvas follows element/visual viewport size.
- Connected saved title equipment and live class resources to both storage implementations and the game protocol.
- Rebuilt profession content with silver ore at 26 gold; gathering-income gate passes without changing its thresholds. Fixed browser test parsing and synthetic friend tracking.

## 2026-10-12 — profession lesson details
- Bram Delver's dialog confirms Mining was learned and names the gathering tool. Mining stays accessible on repeat visits, with skill, tool and gathering instructions in the trainer window.
- Other teachers keep their profession details available after learning; unknown trades still offer the normal free lesson and tool.
- Validation: 21 profession client/server/content checks and both desktop/phone trainer-dialog browser cases passed. The regression covers automatic Mining lessons, repeat visits, duplicate status prevention and learning Foraging through the UI.

## 2026-10-13 — wrap-up, economy (Y31)

Owner: "the gold costs are too high now, gear is unaffordable and there's no way I could buy more than one piece at a reasonable pace." His character had 3,445 gold in total at level 9.

- **The sim was right about gold per level and wrong about the hour.** `tools/sim-economy.mjs` counted about 3,400 gold by level 9 all along, but reached level 9 in 80 minutes of back-to-back questing. Its "gold per hour" was an ideal hour nobody plays, and every price was set against it. New `ASSUME.real` (a real hour gets through 38% of an ideal one; 16% of play is gathering): level 9 after about four hours with 3,412 gold. Prices are now measured in minutes of real play.
- **One income table.** `data/rules/prices.json` `income.lifetime` is written by `node tools/sim-economy.mjs --write-income` (row 9 pinned to 3,445; refuses if the sim's own count is more than 15% off). The Unbinder reads it as before: 515 gold at level 9, unchanged.
- **Gear costs about a fifth**: `45 + 144 x level` -> `8.5 + 28.5 x level`, rare multiplier 11 -> 10.7. An uncommon piece is 22-27 minutes of play at levels 1-30 (was about two hours), a rare 93-116 minutes (was 8-10 hours).
- **Sell-back 1.2% -> 6%** of the price. A sold drop pays the same gold as before, so income did not move. 15-25% was the aim; at 10% sold loot is 29-45% of income and at 15% killing out-earns questing by half, so it stops at 6%.
- **Shop goods to a third** (healing potion 30 -> 10, ash rod 1,350 -> 450), **mounts** 750 / 4,200 / 16,500 / 33,000 -> 400 / 1,800 / 5,300 / 9,000, **waystones** `6 + m/135` -> `3 + m/200`. `tools/content-shops.mjs` re-run; `data/provinces/angling.json` rod and bait prices follow the shelf.
- Tests: `tests/E/playtest7-economy.test.js` pins the owner's point (within 15%), the table against the sim at every level, and both affordability bands at levels 1 / 5 / 9 / 15 / 20 / 30; `tests/C/playtest7.test.mjs`'s kill-hour ratio restated in real play.
- Not fixed: gathering at level 9 earns 42-47% of questing (still tier-2 nodes at skill 41). Before/after tables: `docs/economy/README.md`.

## 2026-10-13 — wrap-up, interface

Six player reports and two audit items, contained fixes only.

* **#67 damage meter needed `/meter` twice.** The window's × hides it and leaves it counting; `/meter` looked only at "counting" and switched it off. `pt8-core.js` `meterToggle({on, open})` → `on` / `off` / `show`; `meter-window.js` asks it. Every other window toggles from the DOM's own hidden flag, so this was the only one.
* **#60 a card explains the status it names.** New pure `js/rules/status-text.js` (`statusExplain`, `statusesNamed`, `statusNotes`): one sentence a status, every number read off the status row (Farhold `skills.json` `statuses`) and Farhold's tick length. `item-card.js` collects the PROPERTY lines only (attack/focus/convert text, properties, the unique power — never the name or lore) and prints the notes at the bottom (`.ic-status`, `css/inventory.css`). Only harmful statuses (damage / slow / debuff kinds) are explained; matching is by the status's display name as a whole word. Skill cards are not touched.
* **#58 loot window stuck open over several bodies.** The group window is led by whichever body still holds something, so its id moves; the server's closing message named the body FIRST clicked, the client compared it with the current leader, ignored it, and kept the last row on screen — the next E met a body that was already gone ("nothing left on it"). `js/sim/corpses.js`: `groupView` keeps `w.main` on the current leader; a take of the gold row pays from every body of the window (the row shows the sum); `nextNear` moves the window on to another lootable body within reach when it empties (never a chest). `loot.js` also closes on any id the window was drawn under (`lootCloses`).
* **#57 skinning did not wait for the mouse.** The READY state started the game by itself after 6 s. Now no game ever starts by itself: after `READY_MAX_MS` (25 s) an untouched game is put away, nothing lost; `data/rules/professions.json` `gather.lateMs` 10000 → 30000 so the server allows the wait. The skinning trace begins the moment the MOUSE is on the knife, no click (`prof-games.js` `hoverBegins`, 34 px); a click, Space or a touch still begin it.
* **#56 the angler had no trades door.** `js/sim/professions.js` `npcExtra` filtered Angling out of `trains`, leaving the client nothing to build the button from. It is listed now; "known" for it is the angling record's `learned`; the province passes what its own `use` just taught.
* **#62 "Prospector — teaches mining".** The suffix came from two places: `data/names/titles.json` `roles.prospector` (hand-written data, no generator involved) and the title `js/sim/professions.js` gives a trainer it places itself. Both are the plain "Prospector". The trade button beside quest buttons (82a9c070) is confirmed by `tests/P/trainer-dialog.spec.js`.
* **Audit, Y13 "The forge is still warming up" for ever.** The engine and the temper rules were asked for once, on the first order; a failed load was never retried. They are asked for when the system sees its first room, retried after a failure (every 3 s at most), and `forgeWhy()` says which is the matter: warming up / out of order / not in this place.
* **Audit: Angling `known: true` before it is learned** in `you.professions.list` — follows `angling.learned` now, and the list is re-sent when the angler teaches it.

Tests: `tests/D/wrapup.test.js`, `tests/P/wrapup.test.js` (node); `tests/D/wrapup.spec.js`, and additions to `tests/P/trainer-dialog.spec.js` and `tests/P/client-minigames.spec.js` (browser).

## 2026-10-13 — wrap-up, world

Four player reports from the 3D world, contained fixes only.

* **#65 the chain coif was open at the top front.** `avatar-3d/js/chibi2-hats.js` built the hood as one sphere with a wedge cut out for the face — a wedge that ran all the way to the pole, so the hood was open from chin to crown. It is two pieces now: a closed crown down to the brow and the wedge only from the brow down, with a rim at the brow. The mail bands were also wrong (the top one floated as a halo, three were inside the shell, and the squash was on a rotated axis); they sit on the hood now. Shared with Farhold/Emberveil/Bannerline: same id, same colours, 151 more vertices (`tests/fixtures/gear5-baseline.json` `hat:chain_coif` 4046 → 4197).
* **#63 two wells at The Pail and Plough.** `js/client/objects.js` gives every `use` object a stand-in model chosen from its NAME, and the inn's recipe already draws a well as a prop 1.5 m from its "Well" object. `js/sim/vignettes.js` `useIsDrawn()` now marks a `use` object `bare` when the recipe draws that same kind of thing within 2.5 m; `info.bare` (entity.js) reaches `objects.js`, which then draws the ring, glow and prompt and no model. Province scan of same-kind things within 1.5 m: 48 pairs before, 22 after — the 26 removed were all this fault (the well, 3 rune stones at the humming circle, 22 stone steps beside a step the recipe already had); the 22 left are deliberate (stair flights, stacked barrels, rows of hives, one doubled ground decal). No data file changed and no generator was run for this.
* **#61 training dummies were dogs.** `training_dummy` had no row in `data/monster-looks.json`, and an unknown creature type is a wolf. `js/client/body-kind.js` (`bodyKindFor`, pure) decides object / humanoid / creature before the creature fallback; `js/client/dummy-model.js` is the dummy: a post on a cross-braced base, sack torso and stitched head, crossbar arms with straw in the cuffs, a battered shield and a painted target board — 1.92 m, two merged meshes on one shared material. A hit rocks it on its post and it settles (a damped spring); it no longer slides or swells when struck.
* **#59 the Caged Scout had no cage.** The rescue record says `held: 'cage'` (`data/provinces/road-events.json`), `js/sim/roadevents.js` sends `info.held { kind, x, z, open? }` on the captive, and `js/client/held-view.js` draws a timber-and-iron cage with a padlocked door where they sit. Freeing them sets `open` (and re-sends the description), and the door swings out. The cage has no collision (you can walk through the bars).
* **The same fault in the road chests.** Every road-event chest was one crate whatever its record's `look` said. `objects.js` `CHEST_LOOKS` dresses four of them: the Wrecked Cart (bed, shafts, wheels), the Buried Cache (hole, spoil heaps, a spade), the Hollow Stump (a stump) and the saddlebags. `chest_iron` / `chest_small` are honestly boxes. "Fallen Pack Mule's Load" promised a dead mule nothing draws: it is **Spilled Saddlebags** now, the mule having bolted (`tools/content-events.mjs` words, then `node tools/content-events.mjs`).
* Still promising something that is not drawn: the Bound Trader is "tied" with no rope or post (they sit on the ground); the `use` objects "Inn sign" and "Notice post" put a stone step beside the real sign and post.

Tests: `tests/E/wrap-overlap.test.mjs`, `tests/D/wrap-dummy.test.js`, `tests/A/wrap-cage.test.js` (node); `tests/D/wrap-world.spec.js` (browser: one well, the dummy and its rock, the cage shut and open, the four chests) and `tests/D/wrap-coif-shot.spec.js` (contact sheet). `tests/D/m3-server.mjs` gained a `/roadevent` hook.
- **Orbs are off-hand items in the shops too** (lead's note): `tools/content-gear.mjs` `shelfFor` puts a weapon-type orb on the tailor's "Caster's off hand" shelf and on no weapon shelf; the plain Orb and the Armillary left the apothecary's "Staves, wands & rods". `tests/E/playtest5-gear.test.js` fails if an orb is on any weapon shelf.

## 2026-10-13 — wrap-up, content

Four things play-test 10 wrote the rules and the server for and never switched on with data ("a finished module with no data"). No new systems.

* **#26 "Why can't I skin barrow hounds" (Y18).** `tools/content-professions.mjs` made skins for `family: beast | dragonkin` only, and a Barrow Hound is a dog filed under `undead`. `skinRule(d)` now decides by the BODY: a creature drawn on the quad / spider / bat / snake plan (`avatar-3d/js/creature-types.js`) has a hide unless it is a construct, an elemental or a fiend. Bosses are included. **Skinnable kinds 19 -> 24** of 76 (+ Barrow Hound, Pale Courser, Waste Wyrm, the Thornmother, Kirrath). The long dead are `worn`: `js/rules/professions.js` `skinOf` gives them the hide one grade under their level's (never a new material) and no meat. Everything else gets a sentence in `skins.none` ("A spirit leaves no body to skin."), which a skinner now SEES: `js/sim/professions.js` writes it to the log once per kind of monster per session, and answers `gatherR { why:'noHide', msg }` with it at the corpse and when the knife is used from the bag beside one (that used to say "Nothing to skin in reach"). People get no line.
* **#29 training dummies in towns (Y17).** The rule and the spawner were there; no file had a `dummy` row, so the game showed two hard-coded stand-ins in the first town. `tools/content-towns.mjs` `dummyPosts` places a row in every walled town (2) and city (3) — **41 in 18 towns** — on the open ground nearest the square: standing room on the nav grid all round, off every street and high street, clear of every building, market stall, the square, the wall, guard posts, waystones, office doors and placed people. They are in `guards.json` `dummies`; `tools/content-hunts.mjs` copies them into `<zone>.quest.json` as `type:'dummy'` rows, which `js/sim/placements.js` already read. **The first town's two stand-ins were not kept**: one of them stood on a market stall (597.1, 1282.3 against the stall at 597.08, 1282.07). The pair is 24 m from the square now.
* **#18 wilderness NPCs fight beside you (Y21).** New block `fighters` in `data/provinces/travellers.json`: `roles` (guard, sergeant, captain, caravan guard, road patrol, scout, hunter, lone hunter, poacher, smuggler), `crew: 'armed'`, `levelOver`. `js/sim/realm.js` `markFighters` marks every placed NPC in the wilds with one of those roles (**157**: fort garrisons, scouts, hunters, village guards); `js/sim/travellers.js` marks armed crew on the road (caravan guards, patrols, a collector's escort, hunting parties) and the wayside hunters and poachers (24), holds a group still while one of its crew fights and leaves a fighter's feet to the rules. Each fights at the floor of its zone's level band. Nobody in a town room is marked; traders, farmers, pilgrims, porters and children never fight.
* **Y32 the Starcaller's class quest.** `class_starcaller`, "Nine Stones, Nine Stars", level 3, from Magister Pellam Voss (who now trains the class): sight the evening star at the Nine Maidens, bring down six dusk flitters at Ashby's Lumber Camp, chalk the altar stone. A rare wand (Wand of the Ninth Star) and a perk point. Marks, the giver index and the two copies of the trainer's class list (`offices.json`, the `z12_02` placement row — both patched by hand, because `content-offices` and `place-vignettes` may not be run) carry it.
* **A fragile test made honest.** `tests/A/pt8-chest.test.js` killed the chest's keepers at the entity while the rules' units lived on and kept hitting a 94-health player (`devSetLevel` raises the entity's level, not the unit's); whether the player was alive to open the chest depended on which tick a hit landed. A slain keeper deals no damage there now.

Generators, in order: `content-professions` -> `content-towns` -> `content-givers` -> `content-hunts`; all four `--check` clean afterwards. Tests: `tests/E/wrap-content.test.js` (9, real data and the real province); `tests/E/playtest2.test.js`, `tests/C/class-quests.test.mjs`, `tests/A/pt2-quests.test.js` count 31 classes.

## 2026-10-13 — wrap-up, 3D client

The round 10 audit found that the 3D-client stream never ran: the rules and the server were already sending these things and the client ignored every one. Nothing here is a new system; each item is a message that finally has a reader. Client only — no rules, server or data change.

* **Y5 emotes play.** The server's `emote {id, e, ms?, end?}` event had no case in `main.js`, so `/wave /sit /dance /cheer /bow /point` (and the wave while a mount is called) did nothing on anybody's screen. `actors.playEmote` plays the clip on that body: wave, cheer, bow and point once (for the server's `ms` when it sends one), sit and dance held until `end: 1`, a step, a swing or a death. The four clips were not in the list a body is built with (`CHIBI_ANIMS`), so they did not exist on any character; they do now. The dance clip was already in `avatar-3d/js/chibi2-motion.js` — avatar-3d is untouched.
* **Y8 corpses and targeting.** New `js/client/pick-rule.js` (no three.js in it): a dead monster with nothing left on it for you cannot be clicked or hovered at all, so the click goes to whatever is behind it or to the ground; a live body under the cursor beats a corpse however near the camera the corpse lies; a live enemy just beside the cursor (1.6x its click size) beats the corpse under it. `actors.pickAt` collects what the ray came near and asks the rule. Tab asks the bodies on screen as well as the snapshot (a corpse can be dead here a moment before the snapshot says so), and a corpse you had targeted is let go when `lootable {on:false}` says it is empty.
* **Y12 a wind-up that is knocked back.** `teleM {id, x, z}` had no handler: the warning lay where it was cast and the blow landed where the knock had carried the caster. `telegraphs.move()` — the "am I standing in it" test moves the moment the message arrives, the drawn shape glides there in a few frames (like the body it belongs to), and a landing lands where the rules had it. An interrupt already removed its shape at once (`teleR {x:1}`); `fx interrupt {id}` now also drops every other wind-up of that monster without waiting for theirs, and floats "Interrupted" over it.
* **Y25 carried zones follow.** `fx place` carries `follow: <entity id>` and `spells.js` never read it. New `js/client/zone-follow.js`: everything a carried zone drew is shifted every frame by how far its owner has moved since the cast (its effects are built in world coordinates round the cast spot), up and down hills too, with its glow. A carried zone is drawn for its whole life up to 12 s (Blessed Earth with Cathedral is 10 s); a zone left on the ground keeps the old 6 s cap.
* **Y20 Storm Beam is a beam.** New `js/client/beam-fx.js`: `fx beam / beamPulse / beamEnd` draw ONE beam for the whole channel — a soft sheath and a hot core (two crossed strips each) and three jagged strands re-drawn twenty times a second, additive, no spheres. It leaves the caster's hand every frame, runs along the line each pulse really struck (`fx spell shape:'beam'`, so a dungeon wall cuts it short), flares on every pulse with a bright front running down it, and goes when it ends, when its caster dies or leaves, or 0.7 s after its own time if the `beamEnd` was lost. The old per-pulse flash is not drawn on top. One rig is built at boot and compiled in the warm-up, rigs are re-used, and a pulse writes vertex positions and uniforms — nothing is created or linked in play (the spec counts shader programs before and after).
* **Y4 fish pools.** The shaft of light and the floating diamond are gone from ordinary pools: tier 1 ("Fish pool") and tier 2 ("Busy fish pool") are ripples (tinted by tier) and a jumping fish. Only tier 3 ("Deep fish pool", the rare water) keeps the marker, in that tier's gold. The field is `info.pool.tier` / `fishPools.open[].tier`; the rule is `poolMarker(tier)` in `angling-view.js`.
* **Y3 the stars over a corpse.** They were a stun's aura, not a rank mark. The killing blow's own stun arrives after the death; `spells.js` drew it on the corpse, `status-sync.js` refused to BOOK an aura on a corpse — and only ever cleared what was in its book, so nothing took it off until the server removed the body ten seconds after it had sunk out of sight. Three fixes: nothing new is drawn on a dead body; the sync asks the effects what is really on a body rather than its own list; and a corpse that has finished sinking is hidden whole, with everything riding it.
* **Y2 farm plots follow the ground.** proctown's `cropField` is drawn for flat ground: each row's strip of soil is one box the whole length of the plot (14-40 m), stood at the ground height of its own middle — half under a hillside and half in the air. In Thousandvale's `setpiece-view.js` (proctown untouched): `drapeLong` cuts a long, low, level box into pieces of about 2 m, and `drapePose` lays each piece on the ground under it — its height from both ends and its middle, pitched along its length and rolled across its width — sunk a hand deeper so no underside shows. Patches of standing stalks lean with the hill the same way, and the far-off flat stand-in is tipped to the plot's slope. Still the same instanced meshes: a 20 x 14 m plot goes from 33 soil boxes to about 230.

Tests: `tests/D/wrap-3d.test.js` (12, the rules above against the real modules) and `tests/D/wrap-3d.spec.js` (one browser against its own server: emotes through the real server, the rest through the client's own event handlers; shots `tests/D/shots/wrap-3d-*.png`).

## 2026-10-13 — wrap-up, Starcaller visuals

The Starcaller (Y32) had rules, skills, cards and icons but no 3D side: its star flew as an arcane orb, its falling star drew only a ground mark, its zones were the generic violet vortex and it was dressed as a warrior on the creation screen. All of it is drawn now, in the class's gold.

* **Thrown stars.** Star Dart and Scattered Stars (`proj: 'star'`) are a gold compass star that spins as it flies, sheds small stars behind it and bursts into a gold starburst where it lands — one star for each `bolt` event the rules send, leaving the hand and landing on the rules' own flight time. `projectile-kinds.js` answers `model: 'star'` for it; the ten pooled bodies are untouched and nobody else's shot changed.
* **Falling stars.** `fx skyfall` (Called Star, each of Heavens' Barrage's ten) had no reader at all. A star now streaks down from 30 m (22 m for a barrage star) with a bright tail and touches the ground exactly `ev.ms` after its event — when the rules deal the damage. The flight runs off the wall clock, not summed frames, so a slow frame cannot make it late. While it falls a gold ring marks the spot's real radius and a second ring closes on the centre; on landing a gold ring races across the ground with a flash, a short pillar of light and a fountain of small stars. The barrage also shows the edge of the area it is falling in.
* **Star-rune zones.** Star Field (`place`) and the class's lingering ground from talents (`pool`: Glitter, Star Crater, Lingering Light — recognised by the caster's class, since a pool names no skill) are a gold rune on the ground: an outer wheel of small stars and ticks turning one way, a five-pointed star turning the other, motes rising off it. It lasts the zone's real time (the generic look stopped at six seconds; a Star Field is eight, or twelve at five Starlight), tilts to the lie of the ground, ends on `unplace` / `pool end` / its owner's death, and is drawn wherever it is this frame — with `follow` (Drifting Field) it rides its owner.
* **Wheeling Stars** are three gold stars circling the caster for the skill's twelve seconds. A star skill's hit is a small gold starburst and its cast a gold glint at the hand, instead of the arcane ones.
* **Constellation motes.** One small gold mote round your head for each Starlight held, in five fixed seats; five turn faster and brighter; spending them throws them outward with a ring at your feet. **Your own character only**: the rules send Starlight to its owner alone (`you.res`), so other players' motes cannot be drawn until a per-player field exists (asked in `docs/requests.md`).
* **Outfit.** `data/class-outfits-tv.json` — a midnight-blue trimmed robe with gold thread, a pointed hat with a gold star on its brow, a star on the chest and back, a short shoulder cape, gold bracers and an orb staff; a tier-2 version (high-collared robe + mantle) for Zenith-Thread Robes. The shared `avatar-3d/data/class-outfits*.json` are Farhold's and Emberveil's too and are **not written** (a test there counts thirty tier-2 rows): `looks.js` lays the Thousandvale file over them in memory. In the world a character wears exactly its gear, so `wear.starcaller.cloth` recuts a Starcaller's plain cloth pieces in the class's colours (`gearLook({ classWear })`, opt-in, cloth only): starter robes are midnight and gold on the kit step and in the world (the worn head piece is a midnight hood with the gold star — the item is called a Hood; the pointed hat is the portrait's), and the bag icons of those pieces match, because both come from the same call.
* **Cost.** `js/client/star-fx.js` is two materials and six instanced meshes, built once and compiled in the boot warm-up; fading is a per-instance colour. A cast creates no geometry, material, mesh or light. No glowing spheres, no new sprites (every shape is geometry).

* **A server fault found on the way: no projectile had ever crossed the wire.** `js/sim/room.js` read ANY `to` on an event as "deliver this to that one player" (right for `xp`, `loot`, `open`, an NPC's thanks). But every `fx bolt | arrow | shot | arc | link | skyfall` the rules send carries `to` = what it is aimed at (an entity id or a point). So a bolt thrown at a monster reached **nobody**, a monster's arrow reached only its victim with the target stripped off (it could not be drawn), and a `skyfall` reached nobody. Play-test 8's travelling projectiles (W2 / W14) were checked with events injected in the browser, never from a server; what players saw for a bow or a wand was the client's stand-in for "a shot with no event" (`weapon-fx.js` `pendingShots`), and skill bolts — Firebolt, Star Dart — drew nothing in flight. `personalTo(ev)`: an `fx` is personal only when its kind is in `PERSONAL_FX` (`npcThanks`); everything else with a target goes to everyone in view, target intact. `tests/A/wrap-fx-to.test.js` sends six kinds through a real server to a caster and a bystander (it fails on the old room: the caster got none of them). With volleys now arriving as one event per projectile, `spells.js` draws ONE body per `bolt` event (it drew the look's whole count for each — nine arrows for a three-arrow shot, had they ever arrived).

New: `js/client/star-looks.js` (pure decisions), `js/client/star-fx.js` (drawing), `data/class-outfits-tv.json`. Hook lines only in `spells.js` (the stars are handed each `fx` / `cast` first), `projectile-kinds.js`, `main.js`, `looks.js`, `gear-look.js`. Tests: `tests/D/wrap-star.test.js` (9), `tests/A/wrap-fx-to.test.js` (1), `tests/D/wrap-star.spec.js` (3, screenshots `tests/D/shots/wrap-star-*.png`).

## 2026-10-13 — wrap-up, lead's last pass before the hold

* **Y2's cost.** Cutting every soil strip into 2 m pieces took `sp-box` in one farm zone from 86,000 to 310,000
  triangles (the round-8 mount spec went red only because the headless page dropped from 2.75 to 2.25 frames a
  second). `drapeJoin(list, ground)` in `js/client/setpiece-view.js` joins neighbouring pieces of one strip again
  wherever the ground under the run is straight to 7 cm — a strip on level or evenly sloping ground is one tipped
  box; only a strip over a hump stays in pieces. Back to 98,000. `tests/D/wrap-3d.test.js` (13) and the browser
  spec now measure the rule (a strip is within 10 cm of the ground along its whole length), not the piece count.
* `tests/D/wrap-star.spec.js` reads motes and Starlight in one look (two looks raced a landing cast).
* The game is **on hold** from this publish: `docs/ON-HOLD.md`.

## 2026-10-13 — stream H (the game server serves the whole playground)
- **H** Owner report: `<live link>/prototypes/emberveil/` did not load — Emberveil imports `library/js/make.js` and only `library/data` was on the allow-list. And the owner asked for the live link's root to be the playground home page, like 8400.
- **H** `server/static.js`: `/` is the playground home page (was a redirect to the game); `ALLOW` now names the home page files (`index.html`, `GAME-GUIDE.md`, `js`, `css`, `data`), all of `library`, and every experiment and prototype folder. New `PRIVATE_DIRS` (a `server/ ops/ tools/ tests/ research/ test-results/ node_modules/` folder is refused wherever it sits — dev used to hand out other prototypes' tests and tools), `PRIVATE_FILES`, `DENY` + `library/synced`, `BROWSER_CODE` (Bannerline's `js/tools/` page scripts), `DEV_ONLY` (our own tool pages stay dev-only). `hostInfo()` answers `data/served-by.json`: which game this server runs and which home-page links it cannot serve.
- **H** `tools/publish-thousandvale.sh` has no folder list any more: it reads the lists from `server/static.js` at the commit being published. Gate 3 is wider and written out by hand: no private folder name, package file, script, `CLAUDE.md` or symlink anywhere in `public/`, nothing at its top the allow-list did not name, and the home page + `library/js/make.js` must be present. Symlinks in git (Tiny RTS) and uncommitted folders are skipped with a line saying so.
- **H** Home page (`js/home.js`, playground root): `forHost()` — on the game server the Thousandvale card is a same-address link (no "Play on this network", no Docs button, no "Live link" to the address you are already on) and the Tiny RTS card is left out. Unchanged on 8400 and GitHub Pages, where `data/served-by.json` is `{}`.
- **H** `tools/check-public-pages.mjs <address>`: walks `data/experiments.json` on a running server — each page, its scripts/stylesheets, their imports — and lists anything not found, plus a private-path check. `tests/H/public-lists.test.js` (8 tests), `ops/lib/probe-public.mjs` expects the home page at `/` and 9 more refused paths.

## 2026-10-14 — art pass: drawn icons, mannequin gear icons, class signature spell effects
Owner: "update all other icons in the game to have icons designed by codex, like we did for spells. Attack, fish, mana
potion (is also red and should be blue), and redo all existing programmer art. For equipment keep the 3d icons… make the
character model in the icons… more like a manekin… Also design new enhanced spell effect graphics for all spells… Add an
option to disable graphics."
* **Icons.** Every non-spell, non-gear picture is now Codex-drawn SVG from the shared icon library
  (`icons/js/game-icons.js`, `icons/data/game/*.js`, gallery `icons/game.html`): Attack (with the spell medallion), Cast a
  line, the touch buttons, quick wheel, the 10 window buttons, emotes, the 10 professions, event-tracker eye, map locate,
  the paper-doll mannequin; and in the bag/shop/loot/hotbar every potion (mana is blue — it was red because every potion
  was one canvas drawing tinted `#d83838`), food, fish meal, good, tool, rod, bait, crate, gift, trophy, junk, all 55
  materials and all 78 fish. `ui/inv-core.js iconSpec` gains `{ kind: 'art', id }` (looked up by item id → species → what
  it is → a family fallback); `item-icons.js iconFor` returns it at once (no render queue). Rings keep their coloured
  drawing (it takes the ring model's metal and stone). Crafting "needs" chips show the material's picture.
* **Gear icons on a mannequin.** `avatar-3d/js/chibi2.js` gains opt-in `createChibi2Character(avatar, { mannequin: true })`:
  the face is built with every colour replaced by the skin colour (a carved dummy's face). `item-icons.js` dresses a bald
  pale-ash dummy (skin and under-clothes one colour) and bumps the icon cache to `v5`. Off = byte-identical for every
  other game.
* **Class signature spell effects.** `js/client/sig-looks.js` (pure) gives each of the 30 classes its own way of moving
  (`CLASS_STYLE`: a bard's notes bob up on a wave, a tinker's cogs tumble and bounce, a chronomancer's sigil ticks like a
  clock hand, a stormcaller's heads zigzag…) over its own three Codex shapes and three colours (`icons/js/motifs.js`), and
  varies each skill by shape and a hash (no two of a class's six skills alike — `tests/D/sig-looks.test.js`).
  `js/client/sig-fx.js` draws it: ONE instanced quad mesh + one shader + one atlas; casts write numbers into slots and
  create nothing. Heads fly the server's own flight time; bursts on hit (one per body per skill per 150 ms from
  `fx impact` or `hit`); ground sigils with orbiters and rising motes; cast blooms; beam streams, melee arcs, dash paths.
  It sits on top of the element effects. The Starcaller keeps its own stars.
* **Settings → Graphics → Spell effects** (`js/client/fx-level.js`, saved as `fx`, applies at once): Enhanced (default) /
  Standard (no signatures) / Reduced (full effects only for your spells, spells at you and at your target; others show
  only what flies) / Off (projectiles only). Telegraphs are never affected. `spells.js` draws a 'flight' event with
  `quiet` set (the projectile flies, its landing draws nothing).
* `tests/D/m3-server.mjs` gains `POST /grant {name, items}` (exact item objects) for icon screenshots.

## 2026-10-14 — Expansion 1: Torbor Downs is an island; Vharlen, the Burning Isle (spec `docs/EXPANSION-1.md`)
- **Lead** `tools/lib/world-core.mjs` `CONTINENTS` (`block` Torbor x11–14 y1–4, `island` Vharlen x11–13 y9–11): outside a continent the pangea ground sinks to the sea floor with a wandering coast (`baseGround`; `mainland()` is the old ground; Torbor's 16 baked zones bit-exact). Horizon + map re-baked; the map model has `playables`/`inPlayable`, everything else is "Open sea"; a toast at Torbor's walkable edge points at the harbours. `tests/D/ui-map.test.js` is multi-province.
- **T** volcanic island shaping (`tools/lib/vharlen.mjs`), 9 zone bakes `data/zones/z1{1,2,3}_{09,10,11}`, the `vharl` ground palette + scatter kinds (basalt columns, steam vents, ironpalms…), proctown culture `vharl` (stilt houses, basalt + red ochre, reed thatch), `tools/ground-look.html`, `tests/B/vharlen.test.js`, docs/world.md §14.
- **P** multi-province server + content tools: `js/sim/province-files.js` (`data/provinces/<province>-<file>.json`), every Torbor-only assumption made per province, Torbor outputs byte-identical; waystones, events and the Callboard never cross the sea; respawn stays on your island; the starter province is the one whose band starts at 1.
- **V** the voyage: `js/sim/ships.js` + `data/provinces/ships.json` (Gullwick ↔ Port Vharl on the Saltwren, 60 gold, held 40 s, skip after 5 s, refund if cut short, party boarding), `tools/ship-routes.mjs`, `js/client/ship-view.js` (ship on the real sea, wake, gulls, spray, a brine-wyrm, the ash plume) + `js/client/ui/ship-travel.js` (Harbourmaster window, banner, journal "Voyages"). Quest step kind `voyage` matched in `js/sim/quests.js`. Tests `tests/V/`.
- **C** Vharlen content: `data/rules/monsters-tv.json` + `js/rules/tv-monsters.js` (13 island-only monsters with their own names and looks, numbers borrowed from a bestiary block), 54 quests / 27 givers, 18 rares, 9 elites, 9 events, world boss Ossathra, 8 dungeon families, 6 materials, 18 recipes, 15 fish + 9 legends, 9 shops; Gullwick's `smoke_on_the_horizon` (level 8) sends you on the first voyage.
- **S** the specialties: hot springs (Steam-soaked while in, Steam-warmed +5% max health 10 min after), 18 geysers (2 s telegraph, throw + `glide` drift in the shared movement step, snapshot self flag 8), 26 lava-vent lines (telegraphed fire curtain, damage by zone band, monsters keep their last point), ashfall fog + steam wisps. `js/rules/hazards.js`, `js/sim/hazards.js`, `js/client/vharlen-fx.js`, `tools/content-hazards.mjs` (re-run LAST after any Vharlen re-bake), `tests/S/`.
- **W** the island's own wilderness dressing: `data/vignettes/vharlen-{props,wayside,curios,vignettes}.json` (20 wayside kinds, 49 curios, 24 vignettes), `data/provinces/vharlen-{travellers,wanderers,road-events}.json`, island shop goods + carter greetings, 35 chatter pools, 43 low-poly props in `js/client/vharl-props.js` (dev page `tools/vharl-props.html`; `tools/ground-look.html?sites=1`), island farms/forts drawn in the vharl style, all 9 dungeon doors pinned with a waystone 6–36 m away. No Torbor dressing left on the island (`tests/W/vharlen-dressing.test.js`); Torbor's tool outputs unchanged. Re-bake order is place-vignettes → bake-zone → horizon → map, twice, then the content chain, then content-hazards. Buff label "Oat-fed mount" → "Well-fed mount" (island mounts eat cane-seed).
- **Lead** Codex-drawn icons for Vharlen: 6 materials, 15 fish + 9 legends, 17 island goods (`icons/data/game/items-{materials,fish,goods}.js`).

## 2026-10-15 — accounts: gentler lockout, reset codes by email (owner)
- `js/sim/accounts.js` `LOGIN_LIMITS`: 10 wrong passwords per username in 15 min (was 5), 20 per address (was 10, so it never trips before the username limit).
- Forgot password: when the account has an email and the server has a SendGrid key (`server/mail.mjs`, same key/sender as rgs-api), the reset code is emailed. It still always shows on the admin page for accounts without one. The title screen and replies say "admin" and "email" instead of "the game's keeper". Tests in `tests/A/m3-accounts.test.js`.

## 2026-10-15 — auto-attack hits the chosen target, on the run (owner: a giant fen croaker and its adds)
- `js/rules/cast.js`: a basic attack faces the CHOSEN target when its wind-up ends (the room copies the movement facing onto you every tick, so a strike resolved after running away went where you ran); a bow / crossbow / javelin shot with a target is loosed at it and strikes it alone (`field.strikeArea({ only })` — the line scan took the first body near the line and the 2.6 m splash hit the adds at a big target's feet). Multi-shot side arrows and a wand's own splash are unchanged. `tests/C/autoattack-target.test.mjs` (old code: 0 hits on the target in every case).
- Shoot on the run: `avatar-3d/js/chibi2.js` `setTwist(yaw, side, fwd)` (opt-in, upper body on the hips over any clip); `js/client/actors.js` turns a person's chest to its target while it attacks and moves (±63°, the body comes round past that: a sideways run or a backpedal), with a small lean; you and other players alike.
- Accounts: the SendGrid key was taken back out of the droplet's Thousandvale settings (the owner never approved SendGrid for Thousandvale); with no key, reset codes go to the admin page as before.
- Title screen: **Create an account** on the Log in tab (owner 2026-10-15). It replaces the log-in fields while open; it connects this browser's guest (a fresh one if the page is logged in to another account) and claims it at once, so any guest characters come along, then shows "your characters". `js/client/account.js` `drawCreate`, `main.js` `guestForAccount`, `css/social.css` `#signin.creating`; spec in `tests/D/m3-social.spec.js`.
- Email: both servers send reset codes through the shared games SendGrid login (`RGS_SENDGRID_API_KEY`, sender `Thousandvale <noreply@games.radgh.com>`; ~/claude/docs/rgs.md "Email").

## 2026-10-15 — play-test 11
### Stream C — Z62 the dagger back-stab (found by C; owner's decision: fix it and re-tune)
- Farhold's back-stab (x2.2 and a bleed, `actors.js` ~1631, copied into `js/rules/field.js`) measured the back the wrong way round: it landed when the target FACED you and never from behind, and every dagger class was balanced on it. Thousandvale now has its own rule (`data/rules/combat.json` `dagger`, helpers in `js/rules/combat-cfg.js` `isBehind`/`daggerRule`/`daggerMult`/`daggerText`, applied in `js/rules/field.js` strike): **every dagger hit deals 120% more** (the x2.2 a dagger got solo before), and **a hit from behind deals 50% more on top and makes the target bleed**. "Behind" is the same test a skill's "more damage from behind" uses: the 160° wedge at the target's back (more than 100° from where it looks), a skill whose hit counts as from behind (Slip Away), or a mark that makes every hit count from behind. The bleed now comes only from behind.
- Solo damage (sheet estimator, the dummy faces you) rogue 47/80/125/187 -> 47/78/122/184, shadow dancer 43/65/125/174 -> 42/64/123/171 a second at levels 5/10/20/30 (-2% at most: the front bleed is gone). Class-quest fights unchanged (rogue and shadow dancer win every trial at the same health left).
- Cards: the dagger's item card (`attackText`, `js/rules/caster-forms.js` stampCaster) and the basic-attack card say exactly when the back-stab applies, from the same numbers.
- A parity engine (no combat.json) keeps Farhold's rule, so `tests/C/parity-attack.test.mjs` still matches Farhold. **Farhold itself still has the inverted back-stab** (its own `js/actors.js`) — not changed; for the owner.
- Tests: `tests/C/dagger.test.mjs` (behind vs front vs side-on, bleed only from behind, the edge on every hit, the solo band within 10% at 5/10/20/30, card text from odd knob values). C 465/465, E 327/327.
### Z63 — the held sword swings with the arm (#62, #63; avatar-3d, shared with Farhold / Emberveil / Bannerline)
- Cause: `aim()` in `avatar-3d/js/chibi2-motion.js` holds a weapon at one direction in the CHEST's frame, and walk/run used it too, so the solved wrist cancelled the arm swing: the longsword stayed at one angle while the fist pumped (its angle to the forearm swept 2–83 degrees per stride, through the forearm line), and run reused the walk's pitch on a body leaning forward, so the point sat 53 degrees below level, by the boots. Not `setTwist` (the twist turns the chest, and the hand and grip are under it).
- Fix: `lockToFist` (chibi2-motion.js, called from `poseAt`) aims a sword / axe / mace / hammer / wand ONCE at the gait's neutral phase and keeps that grip turn for the cycle, so the weapon rides the fist like a dagger; `GAIT_LOCK` gives walk and run their own carry pitch; a weapon arm pumps 0.6x in the run; `REST_PITCH.blade` idle/walk -0.95 -> -1.2. Staff, polearm, bow, torch and a shouldered two-hander keep their steady carry.
- Longsword, measured on the baked clip: idle -36 -> -21 degrees below level; run: angle to the forearm 2–83 -> 39–47, point -53 fixed -> -13..+55 swinging with the arm. Axe/mace run 1–80 -> 41–50.
- Test: `avatar-3d/tests/gait-grip.test.js`. Player-facing: "Swords, axes, maces and wands now swing with your arm when you walk or run, and a sword is carried closer to level instead of pointing at the ground."
### Stream UI (interface + the bag / shop / mount server pieces; contract docs/requests.md "Round 11 contracts — UI")
- **Bag tabs (#11, #42):** `js/sim/bag-tabs.js` (pure, shared by server and client) puts every item in **Equipment**, **Items** (ore, skins, fish, food, potions, tools, goods) or **Other** (the recall charm, quest items, reward boxes, cart tokens — anything no merchant buys). Equipment and Items each hold the bag's full size (40 + backpack + saddle bags); Other never fills and shows only what you have, sorted. Every server capacity check now asks by the item (`bagFull(o, item)`: grant, crates, stack split, unequip, shop buy / buyback, trade, mail, loot, fishing, gathering, crafting, trainer tools). Nothing is stored, so no save migration. The bag window has the three tabs (Equipment keeps the old filters); the shop's Sell tab has Equipment / Items and never lists Other.
- **Recall charm (#3, #41):** everyone holds exactly one, given at join when missing; `noSell`/`noDrop`/`keep` — cannot be thrown away, sold, traded or posted; using it never uses it up (no cooldown). A save with a stack of the old one-use charms keeps one and is paid half the shop price for each spare. Shops list a recall good only to someone with none; a quest reward never hands a second one.
- **Mounts (#16, #44):** no free horse at level 5 any more (owners keep theirs). The stable sells a **Trail Horse for 120 gold** (the Moor Pony is 1,800). Speeds now rise with price: 1.35 / 1.5 / 1.7 / 1.85 (the Dray Elk had been slower than the Courser). New **Mount slot** on the paper doll: lists every mount you own, hover compares speed and steadiness with the one in the slot, a click puts it there (`mount {op:'pick'}`, saved `char.mountPick`; calling rides it).
- **Saddle bags (#15):** using them fits them to your mounts for good: +12 squares in Equipment and Items while you own a mount (saved `char.saddle`); bought-before saddle bags are fitted at login; shops stop selling them once fitted. A **bought good now sells back for half** its shop price (it was 1 gold); gear stays at 6% (docs/economy/README.md — raising it moves sold loot past the income caps).
- **Loot from the menu (#8):** "Loot" on a far body walks you there and opens the window on arrival (a new goal of your own cancels it).
- **Shift compare (#43):** windows stop their own key events, so Shift pressed in the shop / loot / mail / bag never reached the card. The card now listens in the capture phase, and the shop redraws its compare card on Shift.
- **Potion keys (#13):** the 7–0 group spans the action bar's own top and bottom, and each picture is laid over its key, so a filled key's icon sits exactly where an empty one's would (measured in tests/D/pt11.spec.js).
- **Damage meter (#18, #51):** records from login whether or not the window was ever opened; the setting and /meter only show or hide it. #51's "No records yet" with totals beside it: nothing had been cleared — our side was matched by entity id, and dying and waking at the inn gives you a new one, so the boss fight's bars were hidden. Our side is now written into each record with a key that never changes (`ours:self`).
- **Controller (#21, #22, #28, #29):** Strike (pad X / F) with no live target takes the enemy you face, else the nearest, and attacks; with nothing near, a message and a rumble. The loot window starts on the first item (`data-pad-first`). A focused square shows its card at once, and Y on it compares the other hand / ring. A **Mount button** sits on the action bar where the fishing button was (H / LT + X; the phone keeps its own).
- **NPC remarks (#54):** a passing remark (`say` with style `bark`) is a chat line and a speech bubble, never the big centre call-out, which stays for bosses, warnings and event calls.
- Tests: tests/A/pt11-ui.test.js (7), tests/D/pt11.test.js (7), tests/D/pt11.spec.js (desktop + 393x852, 2); older tests moved to the new rules: A pt1-kit, pt5-play, pt8-bag (W19 by tab), m3-mail, pt2-services, pt2-consumables, pt4-food-mount; E playtest7-economy (the Trail Horse is held under an hour on purpose); D pt8 (W21 meter).

### Stream C (combat rules; contract and numbers docs/requests.md "Round 11 contracts — C" / "Round 11 — C status")
- **No attributes (#2):** Strength, Dexterity, Intellect and Constitution are gone (`js/rules/attributes.js`, Thousandvale only — Farhold / Emberveil data untouched). The 6 points everyone had are plain +24 health, +12 mana, +1.2% critical chance, +1.8% dodge; every weapon carries its family's damage share ("Heavy weapon: +18% damage"). Attribute lines on items, uniques, sets, the roll table and perk nodes become what they were worth (Strength n -> +3n% heavy weapon damage; Dexterity n -> +3n% light weapon damage, +0.2n% crit, +0.3n% dodge; Intellect n -> +3n% magic weapon damage, +2n mana; Constitution n -> +4n health); owned items convert as they load. Numbers on every sheet are unchanged.
- **Melee guard (#61):** a melee weapon in the main hand takes 15% (two-handed) / 10% (one-handed, sceptre) off every hit you take; sheet row "Melee guard", item line on the weapon.
- **Rares and champions (#61):** health and damage held under caps however their modifiers stack (`data/rules/affixes.json` `ranks`, `monster-ai.js retuneRank`): a level-12 rare is ~x2.9 a normal monster's health (was ~x5.8, up to x19), x1.3 its damage (was x1.6, up to x3.5). A rare always pays one rare-quality item or better, a champion one magic item.
- **Weapon attacks slower, skills stronger (#37):** every basic attack's clock x1.5 (`combat.json speed.basicPace`), every skill's damage x2 (`skills.damage`; cards print the real share). The basic attack's share of damage 79/76/67% -> 58/55/45% at levels 5/10/20, total damage about the same at 5-10 and +15% at 20.
- **Bosses (#51):** the 33 boss scripts that healed back to a full bar for a last phase lost that phase; the encounter validator refuses it now. An ability started by a phase or a trigger now gets its call-out and cast bar.
- **Starcaller (#1):** Starlight builds from level 6 (when Called Star, the first spender, opens); cards and class text say so.
- **Wand of the Ninth Star (#40):** arcane, three stars in a fan — made that way and owned copies put right on load. A fan wand throws all three bolts (each its own flight, hit and fx), 45% each (Farhold threw one).
- **Early Bond and perk text (#17):** the card names the class companion (not a hireling), the normal levels (10 / 20) and what it changes, from the rules' own numbers; "None but the walk" and bare "for N%" lines rewritten across the perk forest.
- **Find stats (#36):** the sheet's magic find / gold find / experience tooltips say what they count for (drops, chests, treasure, events, rolled quest rewards, reward boxes; kill gold only, capped at +100%; kill experience only).
- **Leash (#5, rules half):** monsters follow 120 m from home (was 40) and keep after you 20 s with nothing landing (was 8).
- One-line edits in others' files: `js/sim/province.js` (reward item spec), `js/client/form-fx.js` (fan flare once), `js/client/ui/class-card.js` (family from the attribute tag). Tests: `tests/C/playtest11.test.mjs` (15); old tests moved to the new rules (C encounter / playtest2 / playtest5 / playtest5-sheet / playtest10 / perks, E encounters).

### Stream P (professions; contract docs/requests.md "Round 11 contracts — P")
- **Everyone knows all ten trades (#11):** `js/sim/professions.js` `knows()` is true for every trade; `grantAll(o)` on every join (one line after the `joined` message in `js/sim/province.js`) fills the saved list and hands over the pick, hatchet, knife, sickle and a fishing rod ONCE per trade (`professions.tools[prof]`; a sold one is not given back — the trainers still sell them). `js/sim/angling.js` `learned()` is true for everyone. Trainers no longer "teach": their window says "Your trades and tools" with your rank and level in each, the dialog button reads "Trades: …". Quest steps of kind `learn` complete on TALKING to someone who trains that trade (the first chain's steps now read "Talk to Garrow, the smith, about Smithing").
- **Fishing only at a fishing spot (#12):** a cast lands only in a live fish pool within 16 m of you (`ANGLING.poolUseM`; its middle or its shore point) — open water answers `noPool`. A fish pool is an E-object with the prompt "Fish here" (`objects.js` `KINDS.fishpool`, which may now carry its own `reach`); E casts into THAT pool (`fish {op:'cast', pool}` — new protocol field), E again reels in, E / Space on a bite hooks. The action-bar fishing button is gone and X no longer casts (the UI stream's Mount button takes the slot). A pool above your skill still lets you fish its edge as before.
- **A high score pays (#9):** a gathering game played Fine or Perfect gives every main material x1.5 (rounded up — a perfect copper boulder is 5 ore, was 3) and always ONE uncommon-or-better find: the tier's gem for mining (all gems are now uncommon, the Star Opal rare), **Golden Resin** for logging, **Wild Honeycomb** for foraging (two new materials with Codex-style icons in `icons/data/game/items-materials.js`), an uncommon Beast Fang for skinning. The result card says "High score" and tags the find. Because a decent player scores Fine most of the time, raw pieces sell for less (`tools/content-professions.mjs` `RAW_PRICE`, e.g. tier-1 ore/log/herb 2 -> 1, tier-2 ore 6 -> 4) so an hour of gathering stays 70-100% of an hour of questing (level 1 sits at the 1-gold floor and may reach 120%; `tests/P/core-content.test.js`); `tools/sim-professions.mjs` now counts the high-score yield and the find, and a projected level-20 row only prices zones that grow the trade's best tier.
- **Three times the experience (#10):** `gather.xpPerTier` 10 -> 30, `craft.xpPerTier` 12 -> 36 (refining keeps its half share), angling `xp.mult: 3` (`data/rules/fishing.json`, read in `js/rules/fishing.js` `xp()`); C's "30 catches is about level 10" angling pace test now checks the round-8 pace at mult 1 and the x3 rule.
- **Choppable trees (#24):** a tier-2 marked tree (Oak, Logging 25) grows only in zones whose level band starts at 5 or above (`LOG_TIER2_FROM`, `logMix`); every other zone's 212 such trees are Ash (Logging 1) now. Same spots, same node ids (`data/provinces/professions-nodes.json` re-made; Vharlen re-made too).
- **Crafted gear (#58):** the "As" choice is read when Make is pressed (`prof-craft.js` `chosenBase`) — the button carried the first base worked out when the row was drawn, so every gear recipe came out as its first pattern (a dagger). Made gear is never plain: magic, with a rare chance of 15 / 25 / 35 / 50% by quality (+0.5% per skill point past the recipe, to +15%); never legendary (`craft.rarity.floor`).
- **Names, not ids (#14):** `displayName()` / `wordsOf()` in `js/sim/professions.js` — the skinning lines ("Sporecap Walker: It is fungus…"), the skinnable prompt and the gather start name a monster in words; a plain monster's entity name is its type, so an id is never printed as it is.
- **"Somewhere in Test" (#59):** the starter zone's sheet id is `test`, and legend fish name their zone by sheet id; `js/client/names.js` now maps sheet ids to names too ("Somewhere in The Torbor Fields"; Saint Orrin's Rise gets its apostrophe back).
- **Keys on every mini-game (#34, #57):** `js/client/input/hints.js` remembered a key cap's default text only for plain caps — once a controller had been used, every `<kbd data-action>` on a keyboard went blank ("Hold [] to lift", the forge's "[] puts the bar back in"). The forge also draws its keys on the picture ("FIRE (D)", "Too cold — put it back in the fire (D)", "Hammer (Space)", "Tap the fire" on a phone) and the words say "or click the anvil / the fire".
- **Skinning on a desktop (#7):** measured with a real mouse at device pixel ratio 1 and 2: the scored point is the pointer to within half a pixel, event by event — there was no offset in the maths. What misled: the knife's tip circle was green whenever you were near the line, while a PERFECT mark is gold, and the score bar showed amber for a middling cut, so gold read as "yellow = worse". Now the ring at the tip is the mark it will give (gold on the line, green close, red off) with a dot at the exact point, a gold perfect strip is drawn along the line, a legend sits in the corner, the score bar is gold only for perfect, and the system cursor is hidden while you cut (the knife is the cursor).
- **Skinning on a controller (#23):** the cut begins when the stick moves (after it has come back to rest once, so the stick that walked you up does not start it), and from then on the stick holds the knife — it no longer sinks at the start.
- Tests: `tests/P/round11.test.js` (5), `tests/P/round11.spec.js` (#7 at dpr 1 and 2, #34/#57, #23 — pictures in `tests/P/shots/round11/`); rewritten to the new rules: tests/P core-rules (+ the x3 rule), core-content, core-server, town-trainers, wrapup; tests/A pt5-angling, pt10; tests/D pt5.spec (T25: E at a pool, not X).

### Star Blade (Z52 #53, Z55 #56; contract docs/requests.md "Round 11 contracts — Star Blade")
- **A 32nd class, the Star Blade** — the Starcaller's melee partner, Thousandvale-only like it (`data/rules/classes-tv.json`, injected at boot; Farhold's files untouched): arcane, plate, sword or greatsword, Mana. Six skills on the usual ladder, each with a four-tier talent tree: **Starcut** (1, a star-steel swing), **Star Aegis** (3, a barrier and an 8 s window in which every melee blow on you is cut by 30% and answered with an arcane strike), **Star Tether** (6, drags everything within 10 m to you and makes it attack you), **Comet Rush** (12, dash to your target, stun on arrival), **Binding Stars** (18, roots a 7 m ring, then a circle that drags inward for 5 s), **Collapsing Star** (24, pulls in and bursts — the finisher).
- **Starlight, the blade's way (#56):** the same five-point Constellation as the Starcaller, applied differently. From level 3 (when the first spender opens) it fills from blows GIVEN (Starcut / Star Tether / Comet Rush, one a hit), from blows TAKEN (once a second at most — new row field `tv.hurtGain`, read in `js/rules/cast-skills.js` `hurtGain` from the room's hurt hook) and from every blow Star Aegis answers. It is spent on defence and control: each point gives Star Aegis +3% of maximum health of barrier and answers 20% harder (at five they stun 0.5 s), Binding Stars holds 0.3 s longer (at five it stuns 1 s first), Collapsing Star hits 12% harder (at five it reaches 11 m). New row field `tv.points` (`applyPoints`, after the bar spends), described on the card by `js/rules/wording.js` `tvAfterSentences`.
- **Found on the way (C's round-11 skill power, `js/rules/character.js` `empowerPlan`):** `plan.barrier /= K` divided an OBJECT barrier (`{ share, seconds }`) by 2 and made it `NaN`, so every skill or talent barrier of that shape (Martyr's Vow, Dragonscale, Star Aegis and 51 talent nodes across the classes, e.g. Salvage, the Starcaller's Star Shield) silently gave nothing since the skill power landed. Only the number form (a share of damage dealt) is divided now; pinned in `tests/C/starblade.test.mjs`.
- **Kits:** Star-Forged Plate / Comet Rider's Harness / Night-Watch Mail; Star-Steel Longsword and Seeing Glass, Night-Sky Greatsword, Comet Sabre and Buckler, Needle-Star Rapier and Dagger. Tier-2 plate "Nightsteel Plate" (`armour-tiers.json`).
- **Class quest** `class_starblade` "Steel by Starlight" (level 3, Magister Pellam Voss — the Starcaller's trainer): every step at the Nine Maidens or on the slope just under it (altar stone, five thicket boars in the hunting ground 60 m below, the heel stone), so nothing sends you back the way you came. A rare longsword, Edge of the Evening Star, and a perk point. Marks, giver index, the trainer's office row and the z12_02 placement patched by hand (as for the Starcaller).
- **Art:** six skill pictures in the Icon Library (`icons/data/starblade.js`, batch 7: the Starcaller's medallion and gold with star steel for every blade and shield), three effect shapes and a palette (`icons/data/game/fx-motifs.js` `starblade.a/b/c`, silver-blue with the Starcaller's gold) driving its own signature effects (`js/client/sig-looks.js` CLASS_STYLE.starblade); the client now reads Thousandvale's own skill rows too so the effects know each skill's shape (`main.js`, one block). Outfit (`data/class-outfits-tv.json`): night-blue plate with star-steel edges, the gold star on chest, back and helm brow, a dark cape; tier 2 with gold pauldrons; its starting plate and mail are cut in those colours in the world (`star-looks.js classWearLook` now reads any weight, not only cloth). The creation card shows each calling's emblem (its effect sigil; the Starcaller its first skill picture — `ui/class-card.js classEmblemSvg`); gallery scene `title-calling-starblade`.
- **Measured** (the sheet's estimator: one dummy, kit weapon, basic + every unlocked skill on cooldown) at levels 5 / 10 / 20 / 30: Star Blade 58 / 84 / 185 / 287 against warrior 57 / 79 / 180 / 291, dragon knight 79 / 122 / 188 / 255, runesmith 67 / 93 / 144 / 252, paladin 53 / 85 / 136 / 236, knight 54 / 75 / 134 / 182, fighter 90 / 123 / 361 / 573 — on the warrior's line, with its shield and crowd control on top.
- Tests: `tests/C/starblade.test.mjs` (8), `tests/D/starblade.test.js` (3), `tests/D/sig-looks.test.js` (+1), `tests/D/starblade.spec.js` (2, screenshots `tests/D/shots/starblade-*.png`); class counts moved 31 -> 32 in tests C starter-kits / talents / class-quests, E playtest2 / wrap-content, A pt2-quests, icons catalog.

### Stream World (A world sim + E content; contract docs/requests.md "Round 11 contracts — World")
- **New dice every run (#6):** every room's seed (towns, wilds copies, dungeons) is mixed with a `runSeed` the server draws fresh at each start (`server/load.mjs runSeedFrom`, `TV_RUN_SEED` pins it; `createProvince({ runSeed })`, 0 = the old fixed seeds for tests). Before, every room's combat, loot and rank rolls started from seed 1, so a restart replayed the same giant bog slime and the same "wise leather armour of haste". The world bake, placements, dungeon floor plans and quest/job generation keep their fixed seeds.
- **Events reach further and scale with who is there (#5):** an event's reach is `max(autoEnrolMetres, r x 2.5, 150 m)` (a town raid covers the town) and its monsters follow 300 m / 60 s (`data.leash`, read by `js/rules/monster-ai.js`) instead of a camp's 120 m / 20 s. With n players inside it when a wave or the boss appears (cap 20): wave head-count x (1 + 0.5 (n-1)) (max 40 a wave), wave health x (1 + 0.15 (n-1)), boss health x (1 + 0.6 (n-1)), and a boss grows (share kept, never shrinks) when more people arrive mid-fight (`js/sim/events.js crowdScale`, knobs `events.json director.size`). A wilds rare or boss grows x (1 + 0.5 (k-1)) for k players who have hit it (`js/sim/province.js crowdOnRare`; dungeon bosses are a party fight already and stay as they are).
- **Looted bodies (#19):** an emptied body lies 12 s more (`corpses.js LOOTED_STAY_MS`) and, while you may skin it, as long as the skinning lasts — untargetable (no click, Tab or auto-target, as before), E / the interact button still skins it. The client now fades a corpse only when it has neither loot for you nor a skin prompt (`actors.js` + `prof-view.js skinMark`), so there is never an invisible skinnable spot.
- **Kill areas (#30, #35):** every kill / collect step's area holds `max(count + 4, 2 x count)` of its monster — two players at once — and the quest camps come back in 1-1.5 minutes (`tools/content-hunts.mjs needFor`, several passes, copies spread 12-24 m round the camp they copy, pairs only within 420 m of the start town). Torbor quest heads 104 -> ~690; Vharlen re-run too (then content-hazards). `collect` steps may carry `near`.
- **Class quests in one place (#31):** 21 class quests re-pointed so every step is within 150 m of the one before (the Starcaller's flitters now roost round the Nine Maidens; the Scavenger's three rummages are all at Turnwater Mill; the Shaman's posts are all at Tench Pool; …), texts rewritten to the new places. `tools/fill-quest-marks.mjs` fills a step's map mark from the live layout after `content-hunts`.
- **No empty shop (#32):** the dialog's "Browse wares" follows the server's `shop` flag only (`js/client/ui/pt2.js`), so a role name alone (a herb-woman, a fort quartermaster) no longer offers an empty shop; Bettony is a `wise_woman`, and the herb-gathering folk are "Herb Gatherer" (they never sold anything).
- **Carts leave by the road (#45):** `cartRide.path` — the first ~160 m out along the road toward the destination (`js/sim/carts.js departPath`; with no road near, straight out away from the town's middle); `js/client/carts-view.js` follows it (`alongPath`).
- **Shrine blessings are real (#47):** the 59 vignette objects with `use.buff` did NOTHING (the rules had no `buff`), while the dialog said "You feel stronger". Now `js/rules/blessings.js`: haste "Light-footed" +10% on foot, might "Emboldened" +6% damage, guard "Warded" 8% less damage taken, rally "Heartened" +4%/-4%, regen "Restored" 0.4% health a second, for the object's seconds (max 10 min); the dialog prints the exact sentence ("Light-footed: 10% faster on foot for 4 minutes."). Light-footed reaches your real speed through `footMul`.
- **Two Vharlen lizards (#48):** **Ash Strider** (level 10, 3,600 g, speed 1.6, a lean rock lizard on the drake frame) and **Slag Basker** (level 15, 7,000 g, speed 1.78, very calm, the crocodile frame) at Vharlen's stables only (`data/provinces/vharlen-mounts.json` `extends: true`, economy.json, vharlen-shops); dearer is still faster across the table. Bodies: `avatar-3d/js/mount-types.js` `ash_strider` / `slag_basker` (opt-in rows).
- **No "!" over a cart for hire (#49):** a roaming cart (`offers: 'cart'`) is travel, not a quest — only errand-runners (`deliver`) carry the mark. (The Orrinsford carter keeps his one start-chain ride lesson, a real quest.)
- **One bark at a time (#52):** `js/sim/barks.js` — per town (per 150 m of a wilds copy): 4 s between barks, at most 3 in 20 s, never the same line twice within 2 minutes.
- **C's ask:** a letter's items pass `refreshItem` when read or taken (`js/sim/mail.js`). There is no bank in Thousandvale; market listings are wave 3's.
- Tests: `tests/E/round11-world.test.js` (9: every kill/collect step of both provinces, every class quest, blessings, mounts, barks, cart paths), `tests/A/pt11-world.test.js` (6: run seeds on the real province, event leash + rare growth, a looted body's stay, a shrine's blessing and speed, Bettony, mail refresh, the event crowd formula); moved to the new rules: tests/E playtest7-economy (Vharlen's shelf), wrap-content (Starcaller's step).

### Stream D-world (3D client visuals; contract docs/requests.md "Round 11 contracts — D-world" / "Round 11 — D-world status")
- **A painted sky (#60):** six Codex-painted panoramas (`assets/sky/*.webp`, 26–112 KB each, made by `tools/sky-art.py` — horizon found, edges wrapped seamless, cropped to the sky) — clear day, cloudy day, dawn, dusk, starry night and Vharlen's ash-hazed day — on the inside of the sky dome (`js/client/sky-box.js`), crossfaded by the realm clock (`js/client/sky-plan.js`: night → dawn 0.20–0.26 → day 0.29–0.35 → dusk 0.66–0.72 → night 0.77–0.82). The weather is per realm day (about one day in three is cloudy, the same for everyone); Vharlen has its own day sky. The sun's glow is drawn over the painting. **The fog is the painting's own horizon colour**, written as display values because three adds fog after tone mapping — so far hills fade into the painted horizon instead of a grey wall; fog starts further out (8 % of its far distance, was 6 %). One shader for every sky; pictures load when the clock needs them, at most four kept.
- **Woods by Torborhold, and giants (#26):** `js/rules/forest.js` grows forests out of the bake's even sprinkle: a slow world noise marks forest patches (about a fifth of the land); inside one, ~4 in 10 of the bake's trees become **giants 3.2–4.6× taller** (trunks as much thicker) and every tree gets one or two new neighbours (a third of them giants) — about 2,500 new trees and 1,500 giants a zone, never on a road, in a town, in water, on a cliff, or on a set piece, field, camp or vignette (`clearOf`). The server grows the same woods from the same files, so a giant you see is a giant you walk round. Giants are drawn further out but step down in detail at the same distances as any tree. **Measured** (Medium, 1100x700, the wood by Torborhold at 25520,5560 — renderer counts; before = `?forest=0&spire=4`): 378 draw calls / 4.10M triangles before, 403 / 5.13M after (+7% calls, +25% triangles; a first try that kept giants at full detail further out was 5.64M and was cut back); the mountain-slope view 429 / 2.65M before, 434 / 2.73M after with ~200 real kit conifers swapped in; zone build: grow 12-14 ms + collider wrap 15-17 ms, each in its own frame (the ground build is ~1,440 ms on the software renderer either way).
- **Mountain trees (#26):** a far tree is now a two-tier six-sided conifer (12 triangles, darker boughs, lit tips, each a little lighter or darker than its neighbours) instead of a four-sided pyramid; and within 300 m (High; 220 m Medium) the canopy's spires are swapped for **real kit conifers** — pine, fir, spruce at the spire's height × 1.35, set on the real ground (`js/client/near-trees.js`); the spires there fold away in the canopy's vertex shader, so a slope never shows both.
- **Round colliders (#38):** the bake stamped every tree and rock into nav.bin's 2 m grid as every sample within its radius + 1 m, and walkers read the nearest sample — so a 0.3 m trunk blocked a 3 m square set off to one side, and a boulder's square stuck out past the stone (the report's "invisible wall at the stones" is the boulder field at 26081, 4625). `js/rules/nav-refine.js` answers those samples with CIRCLES: one per tree / rock, its radius measured from the drawn kit model's cross-section at body height (`tools/measure-scatter.mjs` → `SCATTER_COLLIDE`) at the drawn scale, + 0.32 m for the body. Walls, towers, gates, buildings, water and roads answer exactly as before (a sample with a non-scatter wall beside it keeps the grid). Server (`js/sim/content.js`) and client (`js/client/world-stream.js`) wrap the same files the same way.
- **Click-to-move goes round things (#39):** `js/client/click-path.js` plans the click with the monsters' own A* (`js/rules/pathfind.js`) over the same "can I stand here" the movement step uses, string-pulled to a few waypoints; the walker re-plans when it stops gaining ground. The report's boulder field: straight, 20 m short and stuck; routed, there in 3.9 s.
- **Archers shoot arrows (#27):** a humanoid monster's bow is in its bestiary look, which the shot drawer never read — so every brigand / bone archer threw a stone. Read now (and a clockwork sentry looses a quarrel); a node test walks every physical ranged monster in the bestiary.
- **A fan is three flights (#40):** with C's three `fx bolt {n, of}`, each bolt bows out to its own side and comes back in on its mark (`fanBow`), so three bolts at one target are three you can count.
- **Bigger mounts (#33):** every mount is drawn 1.38× (the shared table's own `scale` option); the seat is counter-scaled, so the rider keeps their size and sits on the bigger back.
- **Vharlen's lizards (#48, models):** the Ash Strider and the Slag Basker ride their own bodies (`avatar-3d/js/creature-types.js`, opt-in rows): the Strider long-legged with its head high, a whip of a tail and a horned crest; the Basker broad, low and plated with a short club of a tail.
- **Travel marks (#46):** a ship over every harbourmaster and a cart over every carter and parked cart, floating like a quest mark (a quest mark wins), drawn from two new icon-library pictures (`icons/data/game/ui.js` `travel_ship`, `travel_cart`; `js/client/travel-marks.js`).
- **Ship arrival (#50):** the voyage's speed is now set by distance — leaving, it grows with the distance from the berth; arriving it is 0.3 × the distance still to go, so the far shore grows on screen at one steady rate (no lunge at the coast, no stand on the brakes), and the last 50 m are at a ship's own pace. The water runs past at the ship's real speed (to 32 m/s) instead of a fixed 11 m/s while the land rushed by at hundreds — which is why it seemed to flow the wrong way.
- **Giants are giant (#55):** the frame loop set every body's scale to "1 + hit pulse" each frame, so a humanoid monster scaled as a whole — every rare, champion and Giant (`sc` 3.2) — was always drawn plain size (beasts were fine: their size is built into the geometry). It keeps its size now; a size that arrives after the body was built re-scales it; and the target portrait frames a humanoid monster's face (it framed the whole body, so it came out tiny).
- **Star Blade gold:** its six skills join the star look (gold glint on the cast, gold starburst on the hit, gold stars over its rings), and its arcane swing / spell ground is drawn white-gold, never the generic violet (`star-looks.js` `STARBLADE_SKILLS`, `starTint`).
- Tests: `tests/D/pt11-world.test.js` (15), `tests/D/pt11-world.spec.js` (screenshots `tests/D/shots/pt11w-*.png`); older D tests moved to the new rules (far-tree triangle budgets, X2's goal rule); World's #48 test reads the lizards' own bodies.

### Market (Z24, live #25; contract docs/requests.md "Round 11 contracts — Market")
- **The Market** — a tab in the party window: browse everything players are selling (search, Equipment by slot or Materials and items by kind, sort by price, price each or newest), sell from your bag at your own price, and see your listings. The listing fee is 20% of what a shop would pay (at least 1 gold), paid when you list and not paid back; a listing lasts 30 days; 20 listings per character. Selling needs a claimed account at level 5. Everything moves by mail: the buyer's item, the seller's gold (with a note saying who bought it), anything taken off or unsold.
- **All-or-nothing:** every list / buy / cancel / expiry is one database transaction (`server/db/schema-v8.sql`: `market_listings`, the item waits in the escrow table with `listing_id`, so a uid is never in two places). Two players buying the same listing at once: one gets it, the other keeps their gold ("Someone else bought it first").
- **Full bags never lose an item (#25):** a reward that does not fit its bag tab (a quest reward, an event share, anything granted) is posted to you in a letter "Your bag was full" instead of being turned into gold; chests and treasure caches check for room BEFORE they open and stay shut until there is space; crates and gift boxes say which tab is full before they open; a letter whose items do not fit keeps everything and says which tab to clear.
- Files: `js/sim/market-rules.js`, `js/sim/market.js`, `js/client/ui/market.js`, `css/market.css`, `server/db/schema-v8.sql`, store methods in `js/sim/store-memory-m3.js` + `server/db/pg-social.js`, gateway expiry sweep, `js/sim/province.js` (`grant` posts overflow, `roomWords`, chest/cache checks).
- Tests: `tests/A/pt11-market.test.js` (7: rules, list/browse/buy, gates + cap + hourly limit, a same-tick race and a failing store, expiry through the gateway sweep, 150 random moves + a crash conserve every item and coin, full bags), `tests/A/pt11-market-pg.test.js` (real Postgres: a two-connection race, a refused save rolls back, cancel, expiry, cap), `tests/A/pt11-market.spec.js` (desktop seller + phone buyer, shots `tests/A/shots/market-*.png`). Changed to the new rule: `tests/A/pt8-bag.test.js` W19 and `tests/A/pt11-ui.test.js` #11 ("paid in gold" -> "posted").

### Coast (Z4 live #4, Z61 typed; world bake B + content E + client visuals)
- **Gullwick is a harbour town (Z61):** the sea now comes in to Gullwick. `tools/lib/world-core.mjs` `BAYS` — the one deliberate exception to "a block's own land is never touched" — cuts **Gullwick Bay** into Torbor Downs' east coast: a 2 km inlet whose head is ~50 m below Gullwick's south gate, the land round it a coastal lowland (`flat` 150 m) that eases back to the downs over 420 m (`band`). It only lowers ground and is the identical number outside its band, so ONLY z14_02 re-baked (every other zone of both islands bakes bit for bit — `bake-zone --check` on all 24); z14_01's placements carry one shared road's out-of-zone heights and were re-written (terrain/nav/scatter unchanged).
- **The harbour (zone bake step 6d, `harbour` placement):** a 106 m stone quay along the waterline (paved, dry, its face dropping into dug-out water), a 78 m pier out to 7 m of water and two jetties for the fishing boats — all walkable decks like a bridge's (`meta.bridges`, nav) — drawn by `js/client/harbour-view.js` (stone face and coping, bollards, planks on posts to the sea bed, lamps lit at night with the town's, a harbour shed, crates, barrels, nets on a frame, rowboats tied up). The **Saltwren lies alongside the pier's end**, the **Harbourmaster stands on the quay at its foot**, and a voyage home puts you ashore there: `tools/ship-routes.mjs` takes berth / Harbourmaster / dock from the bake (`bakedHarbour`; no stand-in jetty) and sails the route out down the bay. A fisher works the quay; the bay has coast fishing pools (two by the quay).
- **Gullwick's plan did not re-cut:** the town is pinned where it stood and its planner (and its graveyard / field belt spot choice — `zone-setpieces.mjs` `choose`, opt-in) read the ground as it was before the sea came in (a no-bay pass of the same zone); the town is still levelled on the real ground. Every plot id, office and NPC door is where it was (tested); the south gate's street now runs straight down to the quay.
- **Rivers and roads meet the bay properly:** `coastWorld` — the Batpate Run ends in a mouth in the bay (nothing downstream), the Fackfalpot, which joined the Batpate below the new shore, takes its old course on to the bay; heights move with the land (only where the ground moved); roads are cut at the waterline; bridges over a river that no longer reaches them are dropped.
- **What the sea took was moved, nothing else:** `tools/coast-content.mjs` (new; `--check`) moved 24 stream E placements — those the bay put in the water or on its new shore, the dungeon door's waystone and guard, one camp in the door's new way (11 camps incl. 3 roaming packs, the Spider Bridge vignette, Gullwick Fishing Plot, 6 curios, 2 wayside stones, 2 folk, a waystone) — to the nearest spot that passes the placer's own rule (and stream E's curio spacing), and the pinned dungeon door ("The Gullwick Throat") 190 m east along the north shore; nothing hostile stands within 150 m of the harbour. Content chain re-run: content-professions (z14_02's nodes only, same ids), content-towns / content-givers (nothing to change), content-pools (z14_02 only), content-hunts (one new roadside champion by Gullwick; the champion cycle gave one z14_04 champion `packleader` for `fiery`), fill-quest-marks (nothing empty). Horizon, map and sea routes re-baked.
- **Rivers and roads stop at the shoreline (Z4, #4):** the 3D was already clean (0 road samples in the sea and 0 river sheets over it in all 25 zones); the MAP drew `world.json`'s old pangea lines — 8 rivers and 21 roads across Vharlen's block and Torbor's lines running on into the sea. The map bake now writes the lines as BUILT (`tools/lib/coast-lines.mjs`: every road a zone laid, each zone its own stretch; each river from its source — or the island's edge — to its mouth, none inside an island's block) into `data/world/map/map.json`, and the client map reads them (`js/client/ui/map-load.js` / `map-data.js`; without them world.json's lines are cut to the islands). Also: the far night lights are the settlements that are BUILT (both islands' towns, from the same map bake) — 213 settlements of the old mainland had been lit on the open sea and 13 on Vharlen's empty hillsides (`js/client/horizon.js`).
- Tests: `tests/B/coast.test.js` (7: no road or river over the sea in any zone; the map's lines; mouths, never uphill; the bay touches only its own zone; Gullwick on the coast — quay dry and walkable, piers over deep water, the hull afloat and clear of the pier, ships.json from the bake; nothing hostile by the harbour, every office plot unmoved; the harbour drawing), `tests/B/coast.spec.js` (shots `tests/B/shots/coast-*.png`: the quay, the pier and ship, the harbour and the bay from the air, the map round Gullwick, the world, Vharlen, Torbor). Moved to the new rules: `tests/B/map.test.js` (line counts), `tests/B/vharlen.test.js` (z14_02's frozen layer hash), `tests/B/bridges.test.js` (rivers as baked; where a stream meets the sea), `tests/V/ships.test.js` (the Harbourmaster on the quay, outside the walls).

## 2026-10-16 — graphics (G-PROPS: worn props, building trim, painted portraits)
Owner: "There were props and atmosphere visuals you had suggested adding to Thousandvale. Can we add those now? I'd like to enhance the graphics in a way that still runs good on mobile." (docs/ON-HOLD.md "Look and feel"). This is the props half; G-ATMOS has water, mist, light and grade. Contract: docs/requests.md "Graphics contracts — G-PROPS".
- **What things are made of.** Every building and kit prop keeps its colour, but now says what it is made of — planks, logs, cut stone, fieldstone, brick, limewash, thatch, clay tiles, shingles, iron, canvas, rope — and the shader lays a painted detail layer over it in real metres (a 6 m wall shows six boards of grain, roof tiles follow the pitch, a post's grain runs up it). Walls follow proctown's own `wallMaterial` / `roofMaterial`; anything untagged is read from its colour. Medium and High also darken the foot of a wall and the crease under the eaves, rub the edges lighter and weather each piece a little differently; High adds relief (a screen-space bump from the same texture read). The 12 layers are painted by code at load (`js/client/surface-paint.js`, a layer per idle moment), one texture array for the whole game, one float per instance — **no new draw calls**, one shader program per tier shared by every zone.
- **Trim on every building:** window sills, lintels and cross bars, door jambs and a stone step, a ridge cap along each gable, and on timber-framed houses a rail and braces under the eaves (`js/client/prop-clutter.js` `buildingTrim`).
- **Lived-in streets:** shops have barrels, crate stacks, grain sacks, planters or a bench beside the door (never in it), homes sometimes a wood pile or a bucket; town squares get benches round the rim, sacks and crates by the stalls, a hand cart and a bucket at the well; street lamps are lanterns now (stone foot, iron post, glass that lights at night, a little roof). Gullwick's quay gets more of a working harbour (rope coils at the bollards, fish baskets, lobster pots, a hand crane with a crate on its rope, nets, an old anchor) and Port Vharl's beach is dressed in the island's own way (reed awnings over drying racks, outrigger canoes, clay pots, baskets, black stones) — `harbourExtras` / `portDressing` in harbour-view.js.
- **Painted portraits:** the target frame shows a painted portrait for monsters (by their own id, else their body type), humanoid enemies (brigand, cultist, cursed knight, goblin, orc…) and human townsfolk by trade (guard, merchant, smith, innkeeper, farmer, elder, healer, trainer, harbourmaster, angler, carter, shepherd, woodcutter, sexton; related trades borrow the nearest). 60 pictures painted by Codex, 192 px webp, ~8 KB each (`assets/portraits/`, `tools/portraits.sh`). Players always show their OWN look; on desktop their live 3D face gets a painted-look filter (Kuwahara, ~1 ms). An elf or dwarf townsperson keeps their own face.
- **Mobile:** tiers ride the existing Graphics quality. Low = the old flat look + a few props; Medium (a phone's default) = layers at 128 px (1 MB), wear, trim, 60% of the clutter, no relief; High = 256 px (4.2 MB), relief, all the clutter. `?props=0` draws everything as before (baseline for measuring).

## 2026-10-16 — graphics (G-ATMOS: water, drifting mist, soft light)
Owner: "enhance the graphics in a way that still runs good on mobile" (the look-and-feel goal in docs/ON-HOLD.md, from a friend's top-down raft game: lively turquoise water with white foam at the shore, low cloud drifting over the world, soft warm light).
- **Water that looks like water:** the sea, lakes and rivers now shade by depth — clear turquoise over the shallows, deepening to dark blue — with two layers of ripples drifting across each other, sun glints, the sky's own colour at a low angle, and **white foam where the water meets the shore**, with lines of surf rolling in on the sea and lakes (rivers get a narrower edge and no surf). Foam also forms along bridge and pier decks and round rocks and posts standing in water. One shader, no reflection pass on any quality. The zone's sea now meets the far horizon's sea without the old rectangular seam (visible off Vharlen's coast before).
- **Drifting mist:** soft wisps of low cloud drift over water, down in valleys and far out over the fields — never within 45 m of you and faded out close to the camera, so they never cover your character or a fight. One draw call for all of them; 8 on Medium, 16 on High, none on Low.
- **Cloud shadows:** soft shadows of passing clouds slide over the ground and the water by day (deeper on a cloudy day, none at night or underground).
- **Soft light:** a slightly warmer sun and a cooler sky fill, hollows and the foot of slopes a little darker (baked into the ground, free each frame), a soft round shadow under every character near you (the only shadow on Low, which has none), a gentle warm-highlight / cool-shadow colour grade folded into the existing tone mapping (no extra pass), and a faint darkening at the screen's corners. On **High** only, a soft glow round bright things (lamps at night, the sun, spells).
- **Quality tiers** (Settings → Graphics → Graphics quality lists what each one draws; a phone starts on Medium, the Steam Deck and desktops on High, software renderers on Low):

  | | Low | Medium (phones) | High |
  |---|---|---|---|
  | water | depth colour + shore foam baked into the mesh (no shader cost) | shaded: ripples, glints, foam, surf | same |
  | cloud shadows | – | yes | yes |
  | drifting mist | – | 8 wisps | 16 wisps |
  | hollows in the ground | yes | yes | yes |
  | contact shadow under characters | 0.34 (darkest: no shadow map) | 0.24 | 0.20 |
  | colour grade | – | yes | yes |
  | corner darkening | faint | yes | yes |
  | glow (bloom) | – | – | yes (5 small extra draws) |

  `?atmos=0` draws everything exactly as before this round (the measuring baseline).
- **Measured** (`tests/D/atmos.spec.js`; this VM's software renderer, so absolute times are slow — compare before / after; before = `&atmos=0`). Desktop High 1100x700, median frame ms before -> after: Torborhold square 1800 -> 1833 (+1.9%), Gullwick quay 1633 -> 1683 (+3.1%), river 1350 -> 1383 (+2.5%), valley 2350 -> 2350 (0%), Vharlen coast 1883 -> 2033 (+8.0%, a screen of shaded sea + the glow). Phone 393x852 Medium with the CPU slowed 4x: square 1300 -> 1317 (+1.3%), quay 1267 -> 1333 (+5.3%), river 1367 -> 1417 (+3.7%), valley 2100 -> 2067 (-1.6%), Vharlen 1433 -> 1533 (+7.0%) — every place within the +10% budget. Draw calls +1..+7 (mist 1, contact shadows 1, glow 5 on High), triangles unchanged (±0.5%), compiled shader programs +2..+4 for the whole session (64 -> 68 desktop, 66 -> 68 phone; nothing is compiled after the world is up, no light is ever hidden or added). The water build adds ~25-45 ms of waterline sweep per zone (an open-sea zone ~42 ms), measured in node. After that run the pier foam was made fainter and the broad sun reflection on water damped (free); a final pass at the quay / river / Vharlen read the same times (desktop 1700 / 1383 / 2033, phone 1317 / 1400 / 1533).
- Files: new `js/client/gfx-tiers.js` (pure: the tier table and every number the shaders share), `js/client/atmos.js` (shared uniforms, the noise texture, the water shader, mist, contact shadows, the grade), `js/client/postfx.js` (the glow — it works on the finished frame, because the fog and the painted sky are written as display colours and must reach the screen untouched), `css/atmos.css`; changed `js/client/scene.js`, `js/client/terrain-view.js` (water + the ground's cloud shadow and hollows), `js/client/ui/settings.js`; one tagged line each in `js/client/main.js`, `js/client/world-stream.js`, `index.html`.
- Tests: `tests/D/atmos.test.js` (10: tier table, water colour, foam, the waterline sweep incl. a zone-sized timing, hollows, warm/cool, cloud strength, grade, mist rules, and that every shader patch still finds the three.js lines it hooks), `tests/D/atmos.spec.js` (shots `tests/D/shots/atmos-{before,after}-{desktop,phone}-{square,quay,river,valley,vharlen}-{day,dusk,night}.png` + perf JSON).
- **Measured** (`tests/D/gfx-props.spec.js`, BEFORE = `?props=0&atmos=0`, AFTER = `?atmos=0`, so the numbers are this half only; seven fixed free-camera views; this VM renders in software, so draw calls and triangles are the reliable numbers and the frame times are a noisy software-GL reading): **phone** (Medium, 393x852, CPU x4) draw calls +0 to +8 in town / on the quay (375->377 square, 387->395 street, 232->240 quay; +16 at Port Vharl's beach), triangles +1-3%, mean frame within -18% / +5% of before (square 1222->998 ms, street 941->976, quay 672->657, Port Vharl 633->663); **desktop** (High) calls +0 to +8, triangles +1-6%, frames within noise. One texture array (1 MB phone / 4.2 MB desktop); +2-3 shader programs (one per tier, shared by every zone). A town's build costs ~+5 ms (Torborhold's zone: 7 -> 12 ms min, node bench) for ~1,000 more instances.
- **Not done:** Codex hit its usage limit (resets 2026-10-16 02:38) before 6 portraits: `sulphur_toad`, `obsidian_warden`, `mudback_lurker` (they show the frog / turtle / crocodile art meanwhile) and `undead`, `giant`, `slagborn` (live / 2D face meanwhile). Re-run `codex exec -s danger-full-access --skip-git-repo-check "$(cat <job>)"` with the prompts in `~/claude/agent/mmo/gprops-codex/job-*.txt` (it skips existing files), look at the pictures, then `tools/portraits.sh`. Port Vharl's jetty itself is drawn by ship-view.js (left as it is).
- Tests: `tests/D/gfx-props.test.js` (13: tables and tiers, layers tile + keep the palette, clutter models, trim, door clutter never in the doorway, square, harbour extras, Port Vharl beach, portrait resolver, every listed picture exists, filter, kit drawing); `tests/D/gfx-props.spec.js` (before/after shots `tests/D/shots/gfx-*.png` + numbers `gfx-*.json`); `tests/D/m3-server.mjs` gained `/harbour` and `M3_PROVINCES` (tagged G-PROPS). D node 329/0, B node 123/0.
