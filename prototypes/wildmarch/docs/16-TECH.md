# WILDMARCH — Design Bible, page 16: technology

**Status:** v0.2 draft — 2026-09-30 (round 2 applied). **Nothing is built.** Owner of this page: how Wildmarch is put
together — the client, the server, what each one runs, how they talk, how a character is saved, every
data file and its shape, which playground modules are reused (the **reuse map**, canon pillar 7), the
tests, the performance budgets, the two servers (dev and stable) and how it is deployed.

**Round 2 (2026-09-30).** Canon 00 §12 removed raids, PvP beyond duels, currencies other than gold,
binding, rested XP, dailies/weeklies, the day/night clock, the light slot and flight paths. Their tables,
fields and files are gone from this page (raids and the rest are parked in `WISHLIST.md`). New data and
JSON shapes: **tags**, the four **socket** kinds, **special rarities**, **monster rarities**, **magic
find**, **Harvesting and professions**, **Travel Methods**, **targeting state** and **Depth** — §13.1–§13.10.

The short version:

1. **Build it offline first.** The whole game — including the "server" — runs in the browser, with the
   server code in a Web Worker (a background thread in the browser) behind a pretend network. That gets
   a playable single-player game early and proves the split between server and client before any real
   server exists (§15).
2. **Then put the same server code on a real server**: **Node.js with WebSockets on a small rented Linux
   server (a VPS)**, **Supabase** (hosted Postgres database + sign-in) for accounts and characters, and
   **Cloudflare** in front for the domain, HTTPS and caching (§4).
3. **One copy of every rule.** The rules modules Farhold already has with no Three.js and no DOM in them
   (`rpg.js`, `skills.js`, `affixes.js`, `effects.js`, `perks.js`, `weapons.js`…) run unchanged on the
   server *and* in the client. The server's answer is the real one; the client uses its copy only to
   predict and to draw tooltips (§5).

---

## 1. Words used on this page

| Word | Plain meaning |
|---|---|
| **Client** | The game in the player's browser: drawing, sound, input, screens. |
| **Server** | The program that runs the world and decides what really happened. |
| **Authoritative** | "The server's version wins." If the client and server disagree, the client is corrected. |
| **Tick** | One step of the server's simulation. 20 ticks a second = one every 50 ms. |
| **Snapshot** | A message from the server listing where things are and what state they are in. |
| **Prediction** | The client moves your own character at once when you press a key, instead of waiting for the server, then corrects itself if the server disagrees. |
| **Interpolation** | Drawing other characters slightly in the past (100 ms) so their motion is smooth between snapshots. |
| **Interest management** | Only telling each client about things near it. |
| **Layer / instance** | A running copy of a region / a private copy of a dungeon (page 15 §4). |
| **Worker** | A background thread in the browser (`new Worker(url, { type: 'module' })`). |
| **Transport** | The object that carries messages between client and server — a real WebSocket, or a pretend one to a worker. |
| **VPS** | A rented Linux machine in a data centre ("virtual private server"). |
| **Durable Object** | A Cloudflare feature: a tiny always-addressable program with its own memory and storage, one per id. |
| **Schema** | The agreed shape of a piece of data (which fields, which types). |
| **Hard target** | The one enemy or ally your character has selected, shown in the target frame. Only you change it (canon 00 §12.1 W8; §13.9). |
| **Polyline** | A path stored as a list of points joined by straight pieces — how a Travel Method route is stored (§13.8). |

---

## 2. Constraints (from the playground and the owner)

- **No build step.** Plain ES modules, `<script type="module">`, an import map for `three`
  (`"three": "../../vendor/three/three.module.js"`, `"three/addons/": "../../vendor/three/addons/"`),
  standalone `.css` files. The **server** may use npm packages (it is not served to a browser), but every
  module the server shares with the client must be plain ES modules with no npm imports.
- **Relative paths only.** The public site lives under `/Game-Playground/` on GitHub Pages, so a path
  starting with `/` breaks it (playground `CLAUDE.md` rule 4).
- **Blocker-safe file names.** Never name a served file `beacon.js`, `analytics.js`, `track*.js`,
  `pixel.js`, `telemetry*.js`, `ads*.js` — ad/tracker blocker lists refuse them and one refused module
  takes the whole page down (memory note, Farhold `beacon.js` → `waylight.js`). A node test enforces it
  (§16.1).
- **Owner's preferred stack**: HTML/CSS/JS, PHP, MySQL, Supabase, Cloudflare, Amazon S3, GitHub Pages and
  Actions. PHP is **not** a fit for the game server (a game server holds hundreds of open connections and
  runs a 20-per-second loop; PHP's request-in, answer-out model does not). It is fine for a later account
  website if the owner wants one.
- **Commercial-safe licences by default**: our own code, Three.js (MIT), CMUdict (BSD), Kenney sounds
  (CC0), Quaternius (CC0). **Do not ship espeak/meSpeak (GPL-3)** in the game; the formant engine is the
  voice (`GAME-GUIDE.md` §0).

---

## 3. The architecture in one picture

```
 Browser (client)                                    Server side
 ─────────────────────────────────────────           ───────────────────────────────────────────
 index.html + importmap + modulepreload              Cloudflare (DNS, HTTPS, static cache)
   js/boot.js                                           │
   ├─ render/  three.js, Chibi 2, spellfx,             ├─ static client files  (GitHub Pages or
   │           terrain, sky, telegraphs                │   Cloudflare Pages)
   ├─ ui/      HUD, screens, chat, tooltips            │
   ├─ audio/   sfx.js, formant voices, Lingo           └─ wss://play.<domain>/  ──────────────┐
   ├─ net/     transport, clock, interpolation,                                                │
   │           prediction                                                                      ▼
   └─ rules/   SHARED pure modules (read-only        VPS: Node.js "world server" process(es)
               copy, for prediction + tooltips)         ├─ gateway   (sign-in check, realm, routing)
                                                        ├─ sim/      zones, layers, instances,
         ▲  one of two transports:                      │            mobs, bosses, telegraphs,
         │  • SocketTransport  → wss:// ───────────────►│            parties, chat, trade, market…
         │  • LocalTransport   → Web Worker running     ├─ rules/    the SAME shared pure modules
         │                       sim/ in the browser    └─ db/       Supabase client (service key)
         │                       (offline mode, §15)                    │
                                                                        ▼
                                                     Supabase: Postgres (characters, guilds, mail,
                                                     market, economy log) + Auth (accounts)
```

---

## 4. Server options, costs and the recommendation

### 4.1 The two real candidates for the game server

| | **A. Node.js + WebSockets on a VPS** | **B. Cloudflare Workers + Durable Objects** |
|---|---|---|
| What it is | One long-running Node program (or a few) on a rented Linux server. The `ws` npm package for WebSockets. A `setInterval`-style loop ticks every layer 20×/s. | Each region layer, dungeon instance and chat channel is its own Durable Object; clients connect to it with a WebSocket through a Worker. |
| Shares code with the client | **Yes, directly**: Node runs the same ES modules the playground already node-tests. | Yes (Workers run ES modules), but inside Workers limits (no filesystem; 128 MB memory per object). |
| Simulation loop | Natural: one loop, all layers in one process, a bug is easy to reproduce locally. | Possible (timers run while connections are open) but each object is its own island; cross-layer things (a party split over two layers, guild chat, the market) become messages between objects. |
| Scaling | Up: a bigger VPS. Out: more processes, one per group of layers, with a gateway routing players. Manual work. | Automatic: objects spread across Cloudflare's machines. |
| Latency | One data centre per realm (players far away get 100–200 ms). | Objects start near the first player who touches them, so a layer lives near where its players are — good for one region, odd for a mixed one. |
| Memory for a region | A region's heightmap (2–4 MB), collision grid and nav grid are loaded once per process and shared by every layer of that region. | Loaded **per object** within 128 MB — a region's data and its entities must fit, times every layer. Tight. |
| Debugging | Log files, a debugger, `node --inspect`, the same bot client on the same machine. | Harder: remote logs, local emulator (`wrangler dev`) that differs slightly. |
| Cost (approximate, **check current prices before buying**) | A 4 vCPU / 8 GB VPS is about **€15–30 a month** (Hetzner-class) or **$48** (DigitalOcean-class). One such machine should hold a realm of ~1,000–1,500 online players (§17.4). | Workers Paid plan **$5 a month** + Durable Object time (roughly **$12.50 per million GB-seconds** after an included amount) + requests. An object ticking 20×/s never sleeps, so each busy layer costs about **$4 a month** at 128 MB; 40 layers + instances ≈ **$150–250 a month** at a busy moment. Hibernating WebSockets cannot be used for a ticking layer. |
| Owner's stack fit | Cloudflare in front (DNS, HTTPS) + GitHub Actions deploy — yes | Fully Cloudflare — yes |
| Lock-in | None: any Linux host | Cloudflare-only APIs |

**Rejected**: PHP (see §2); a peer-to-peer game (one player's browser hosting others — cheating is
trivial and hosts drop out); a hosted game-server platform (adds a third company and a SDK for little
gain at this size).

### 4.2 The database: Supabase

| | Supabase (Postgres + Auth) |
|---|---|
| Accounts and sign-in | **Supabase Auth**: email + password, magic links, optional Google/Discord, optional authenticator codes. The client signs in and gets a token (a JWT — a signed ticket saying who you are); the game server checks that ticket on connect. |
| Characters, guilds, mail, market, logs | Postgres tables (§12.3). The **game server** writes with the service key; **the client never writes to the database** (row-level security denies all client writes to game tables; the client may only read its own account page data). |
| Free plan (approximate) | 500 MB database, 50k monthly users; pauses after a week of no activity — fine for development, not for a live realm. |
| Pro plan (approximate) | **$25 a month** per project, 8 GB database, daily backups. One project per environment (dev, staging, production) or one shared dev + one production. |
| Why not MySQL | It would work; the owner lists both. Supabase gives sign-in, backups, a web table editor and row-level security in one place, and Postgres `jsonb` columns suit the character blobs (§12). |

### 4.3 Recommendation

**A (Node.js on a VPS) + Supabase + Cloudflare in front**, in this order:

1. Offline single-player with `LocalTransport` (§15) — no server at all.
2. The same `sim/` code under Node on the **dev VM** (this Ubuntu machine), port **8470** (§18), with a
   local Postgres **or** a free Supabase project.
3. One VPS for a public test realm; Supabase Pro; Cloudflare DNS + proxy for `wss://`.
4. Only if one machine per realm stops being enough: split layers across processes behind the gateway.
   Durable Objects stay an option for **chat and the market** (naturally one-object-per-thing) if the
   owner wants to move those later.

Why: the playground's biggest asset is its **node-testable pure rules modules**. A Node server runs them
with zero changes, and the offline worker runs them with zero changes; a sim bot (§16.3) runs them with
zero changes. Durable Objects would split the simulation into islands and cap each at 128 MB for a
saving that only matters at a size the game does not have yet.

### 4.4 Monthly cost at three sizes (approximate)

| Stage | Pieces | ≈ / month |
|---|---|---|
| Development | This VM, free Supabase, GitHub Pages | **$0** |
| Public test (≤ 200 players) | 1 small VPS (2 vCPU / 4 GB), Supabase Pro, Cloudflare free, domain | **$35–45** |
| Launch, 2 realms (≤ 1,500 online each) | 2 VPS (4–8 vCPU / 8–16 GB, one per region), Supabase Pro + extra disk, Cloudflare free/Pro, backups to S3 | **$90–180** |

---

## 5. One copy of every rule (shared modules)

The rule the playground learned the hard way: **one fact, one owner** (memory notes *one multiplier,
two owners* and *farhold water staircase*). In an online game that becomes: **the rules exist once, in
`js/rules/`, and both the server and the client import that folder.**

- `js/rules/**` may import only other `js/rules/**` modules, shared playground modules that are equally
  pure (`shared/format.js`, `prototypes/emberveil/js/loot.js` + `rng.js`, `avatar-3d/js/creature-types.js`,
  `avatar-3d/js/chibi2-races.js`), and JSON passed in by the caller. **No `three`, no `document`,
  no `window`, no `localStorage`, no `fetch`, no `Math.random`** — randomness comes from a seeded
  generator handed in (`makeRng(seed)`, reuse `prototypes/emberveil/js/rng.js`). A node test fails on
  any of those words in `js/rules/` (§16.1).
- The server runs the rules for real. The client runs them for **prediction** (your own movement, your own
  cooldowns and resource bars) and **display** (tooltips, the character sheet's numbers).
- When the client's prediction and the server disagree, the server wins and the client quietly corrects.
  The client never sends a result, only an intent ("cast slot 3 at this point").

---

## 6. What the server simulates vs what the client does

| Thing | Server (authoritative) | Client |
|---|---|---|
| Player movement | Validates every move (speed, ground, collision, page 15 §17) and is the final position | Predicts own movement at once; replays unacknowledged inputs after a correction |
| Other players, NPCs, mobs | Positions, facing, animation state name, health, statuses | Interpolates 100 ms behind; plays the named animation on the Chibi 2 / creature body |
| Mob and boss AI | All of it: targeting, threat, pathing, ability choice, phases, adds | Draws it |
| Telegraphs | Creates them with shape, size, position, **server time of resolve**; resolves damage | Draws the ground decal and fill from the synced clock; plays warning sounds |
| Spells and attacks | Validates cost, cooldown, range, line of sight, target (and, for Auto-target spells, picks the target by §13.9's rule); computes every number; applies statuses | Starts the cast animation and effect at once (prediction); shows the server's damage numbers when they arrive |
| Dodge roll | Validates it (cooldown, stamina/charges per page 05) and grants the invulnerable window (§10.4) | Plays the roll at once |
| Loot | Rolls it (personal loot) with the server's seeded generator | Shows the drop, the beacon, the reward popup (`shared/rewards.js`, reuse) |
| Inventory, gold, equipment | Owns them; every change is one database step for anything that moves between players | Shows them; drag-and-drop sends an intent |
| XP, levels, unlocks, perks, talents | Owns them | Shows the unlock card, sound, Unlocks screen entry (canon rule 5) |
| Quests and events | Owns state, counters, phase flags | Shows the tracker, markers, dialog |
| NPC speech | Picks the Lingo line (seeded by NPC id + tick) and sends the **text** | Speaks it with the formant voice; bubble; chat line |
| Chat, parties, guilds, trade, market, mail | All of it | UI |
| Weather | Weather state per region (`worldgen/js/weather.js` `WeatherClock`, seeded by realm + region + real date). **There is no time of day**: the sun is fixed per region (canon 00 §4, always daylight) | Draws the sky, fog, rain from the state; the region's fixed sun and grade (page 17) |
| Hard target | Stores each character's `target` id; changes it **only** on a `target` message or when the target dies/despawns (§13.9) | Draws the target frame from the server's value; Tab cycling is computed on the client and sent as a `target` message |
| Travel Methods | Moves every vehicle along its route, holds the riders, runs schedules and the snap-back rule (§13.8) | Draws the vehicle and riders; shows the departure board |
| Harvesting, crafting | Node state, tool check, skill rolls, recipe results (§13.7) | Gather bar, craft screen |
| Scenery (trees, rocks, grass) | Only **collision** for things that block movement | Everything else, from the same seeded scatter (`highdef-3d/js/scatter.js` pattern) |
| Sound, effects, camera, UI | — | All of it |
| Combat feel (hit-stop, shake, knockback look) | Knockback **distance** is server movement; stagger state is server | Hit-stop, shake, recoil are client-only presentation (`prototypes/farhold/js/combat-feel.js`, reuse) |

---

## 7. Tick rates and timing

| Number | Value | Why |
|---|---|---|
| Server simulation | **20 Hz** (every 50 ms) | Action combat needs at least this; 30 Hz costs 50% more CPU for little visible gain with interpolation |
| Snapshots to a client | **20 Hz** for things within 40 m, **10 Hz** 40–90 m, **4 Hz** 90–150 m | Near things move fast on screen; far things do not (§8) |
| Client input sent | Every client frame's input is sampled; batched into a message **30×/s** | Keeps the server's view of your movement fresh without flooding it |
| Client render | Whatever the display gives (60–144 Hz); simulation on the client runs its own prediction at 60 Hz fixed | |
| Interpolation delay | **100 ms** (2 snapshots) | Smooth motion even if one snapshot is late |
| Clock sync | Ping every **2 s**; the client keeps the median of the last 8 offsets | Telegraph fills and cooldowns are drawn against server time |
| Max server tick time | **30 ms** of the 50 ms budget per process at peak (§17.4) | Room for garbage collection and database writes |

---

## 8. Interest management (only sending what is near)

- Each layer divides its region into **32 m cells** (a grid). Every entity is filed in its cell each tick.
- A client's **area of interest** is the cells within its radius:

| Kind of thing | Radius sent | Update rate |
|---|---|---|
| Players, followers, companions | 150 m | 20 / 10 / 4 Hz by distance (§7) |
| Mobs | 110 m | same |
| Bosses and their telegraphs | **Whole encounter area** (a boss is always sent to everyone inside its fight area) | 20 Hz |
| Your hard target | Always, while it exists and is within 150 m (the target frame must never go blank because of interest management) | 10 Hz, health and casts |
| Travel Method vehicles | 300 m (they are big and people watch for them at stations) | 4 Hz; route + progress only, the client moves it along the known polyline |
| Telegraphs of normal mobs | 60 m | on create + on resolve only (the client animates the fill) |
| World objects (chests, nodes, doors) | 110 m | on change only |
| Chat Say / Emote / Yell | 30 m / 30 m / 150 m | on message |
| Spell effects (other players') | 60 m | on cast/impact only |

- **Enter/leave messages**: when something enters your area you get its full state once; after that only
  what changed. When it leaves you get `gone`.
- **Cap**: at most **150 entities** per client snapshot. Past that, the furthest non-party, non-boss
  entities are dropped first. Party members are always sent (their frames need health) even outside
  the radius, at 2 Hz, health and position only.
- **Budget per client**: average **≤ 24 KB/s down** and **≤ 6 KB/s up** in a busy town; **≤ 48 KB/s down**
  at a world boss with 60 players nearby (the one open-group activity, canon 00 §9).

---

## 9. The message protocol

### 9.1 Format

- **Stage 1 (offline + first network builds): JSON**, with short keys, one message per WebSocket frame,
  WebSocket compression (`permessage-deflate`) on. Readable in the browser's network tab — worth more
  than the bytes while building.
- **Stage 2 (before a public test): binary for snapshots only.** Positions and health as a fixed-layout
  `ArrayBuffer` (DataView): entity id `u32`, x/z `f32`, y `f32`, yaw `u16` (0–65535 = 0–360°), anim `u8`,
  hp fraction `u16`, flags `u16` = 21 bytes per entity. Everything else stays JSON. No library needed.
- Every message is `{ "t": "<type>", ... }`. Each type's shape lives in `js/rules/protocol.js` as a plain
  object table and a node test checks every sender/receiver uses a known type with the right fields.

### 9.2 Client → server

| Type | Fields | Meaning |
|---|---|---|
| `hello` | `token, version, characterId` | Connect: sign-in ticket, client version (the server refuses a mismatched major version with "Please reload") |
| `in` | `seq, dt[], move[], yaw[], jump, run` | Batched input samples since the last `in` (seq = input number, for prediction) |
| `cast` | `seq, slot, target?, at?, dir?, aim?, charge?` | Use spell slot 1–6 (or basic attack = 0). `target` = the current hard target (Needs target, Auto-target); `at` = ground point (Ground); `aim` = the aim point and ray, used by Auto-target when there is no valid target (§13.9) |
| `target` | `id \| null, how` | Set or clear the hard target. `how` = `tab`, `shiftTab`, `click`, `self` (`F1`), `party2`–`party5` (`F2`–`F5`), `clear`. The only message that changes the target |
| `dodge` | `seq, dir, clientTime` | Dodge roll |
| `interact` | `id` | Talk, open, loot, gather (a harvest node), enter a door, board a Travel Method |
| `cancel` | — | Stop a cast/channel |
| `item` | `op, from, to, uid, count?` | Move, equip, unequip, split, destroy, use |
| `talent` / `perk` / `spellPick` | `spellId, tier, choice` / `nodeId` / `slot, spellId` | Progression choices |
| `chat` | `ch, text, to?` | Chat message (page 15 §9) |
| `party` | `op, name?` | invite / accept / decline / leave / kick / promote / ready / role / marker / sync |
| `finder` | `op, activities?, roles?, difficulty?, depth?` | join / leave / accept / decline / vote. `difficulty` = `normal` \| `challenge`; `depth` = 0–N (§13.10). Only **discovered** dungeons are accepted |
| `guild` | `op, …` | create / invite / accept / leave / rank / bank / motd |
| `trade` | `op, slot?, uid?, gold?` | open / put / take / gold / lock / accept / cancel |
| `market` | `op, query?, listing?, uid?, price?, dur?` | search / list / cancel / buy |
| `mail` | `op, to?, subject?, body?, items?, gold?, cod?, id?` | send / take / return / delete / list |
| `duel` | `op, name?` | challenge / accept / decline / yield (friendly duels only, canon 00 §12.1 W1) |
| `socket` | `op, itemUid, index, socketableUid?` | insert / remove (page 08 owns what removing costs) |
| `craft` | `op, recipe?, count?, gadget?` | craft / learn / pick profession / configure a gadget's chosen stats (§13.7) |
| `travel` | `op, station?, route?, stop?` | board / leave / wait (bus-style) / buy a ride (§13.8) |
| `recall` | `op, lm?` | bind the Recall Stone at a town waystone / use it |
| `follower` | `op, uid?, order?, stance?` | summon / dismiss / order / stance / kit |
| `report` / `ticket` | page 15 §18 fields | Moderation |
| `ping` | `clientTime` | Clock sync |

### 9.3 Server → client

| Type | Fields | Meaning |
|---|---|---|
| `welcome` | `serverTime, character, region, layer, settings` | Full character + where you are |
| `snap` | `tick, time, ack, ents[], gone[]` | Snapshot: `ack` = last input seq applied (for prediction replay) |
| `spawn` | `id, kind, look, name, level, …` | An entity entered your area (its Chibi 2 avatar JSON or creature spec) |
| `tele` | `id, shape, kind, at, size, dir, start, resolve, follow?, pips?, label?` | A telegraph (page 11 vocabulary; `start`/`resolve` are server times) |
| `teleEnd` | `id, hit[]` | Resolved; who it hit |
| `cast` | `id, spellId, at?, target?, start, end, interruptible` | Someone began casting (cast bar; gold border if `interruptible`) |
| `fx` | `kind, element, from?, to?, at?, crit?` | A spell effect to draw (projectile, impact, pillar…) |
| `dmg` | `src, tgt, amount, kind, crit, element, overkill, absorbed, blocked` | A damage/heal event (floating number, combat log, meter record — `meters/js/meter.js` shape, reuse) |
| `status` | `tgt, type, on, remaining, stacks` | Status applied/removed (aura via `spellfx.status`) |
| `say` | `id, text, intent, voice?` | NPC or boss line (voice JSON only on first line from that NPC) |
| `banner` | `text, style, ms` | Centre-screen banner (boss line, party warning, unlock) |
| `inv` | `ops[]` | Inventory changes |
| `stats` | `hp, mp, res, xp, level, gold, …` | Your own numbers when they change |
| `unlock` | `featureId` | Feature-ladder unlock (card + sound + Unlocks entry) |
| `quest` | `op, quest` | Quest state change |
| `target` | `id \| null, reason` | Your hard target as the server holds it. `reason` = `you` (your own change), `died`, `gone` (despawned or out of 150 m). Never any other reason |
| `travel` | `route, vehicle, progress, stops, departsAt?, riders` | A Travel Method you are at or on: departure board, bus countdown, position |
| `chat` / `party` / `guild` / `trade` / `market` / `mail` / `finder` / `duel` | per system | Social updates |
| `move` | `region, layer, at, reason` | Zone change / layer change / teleport |
| `error` | `code, text` | A refusal, in plain words ("That is still cooling down: 3.2 s") |
| `pong` | `clientTime, serverTime` | Clock sync |

---

## 10. Lag compensation for action combat and telegraphs

The problem: a player's screen is always a little behind the server (their ping + the 100 ms
interpolation). A dodge that looked safe on the player's screen must not be a death on the server, and a
shot that looked like a hit must not miss for no visible reason. The rules, in order of importance:

### 10.1 Telegraphs (boss and mob area attacks)

1. The server sends a telegraph with its **resolve time** in server time (`tele.resolve`). The client
   draws the fill so it **completes exactly at `resolve`** on the synced clock — so every player sees the
   same fill whatever their ping.
2. Warning times are page 11's minimums (**1.5 s** Normal, **1.2 s** Challenge and Depth, **3.0 s**
   for anything that kills in one hit), measured **from the moment the server sends it**. To make sure a
   high-ping player still gets the full window on screen, the server adds the target's **one-way delay
   (half the measured ping, capped at 150 ms)** to that player's check (next point) — never to the
   drawn time.
3. **Favour the dodger.** At `resolve`, the server tests each player's position using the **latest
   movement input it has from that player whose client time is ≤ resolve + one-way delay** (capped at
   150 ms). In plain words: if you pressed the key to step out before the fill completed *on your
   screen*, you are safe, even if your step reaches the server a little late.
4. Moving telegraphs (a travelling wave) are resolved each tick along their path with the same allowance.
5. Soaks count the bodies inside at resolve with the same allowance; the pip count on the decal updates
   live from snapshots so the group can see it filling.

### 10.2 Aimed player attacks (skillshots, arrows, cones)

- The server keeps a **1-second history** of every entity's position (20 entries).
- A skillshot or melee sweep from player P is checked against targets **as they were on P's screen**:
  rewound by P's one-way delay + the 100 ms interpolation, **capped at 200 ms** total. Beyond that cap
  the player just sees more misses — the price of a bad connection is not paid by the other people.
- Rewind applies to **hitting**, never to **being hit**: nobody is ever hit by something because the
  attacker's screen was behind.
- Projectiles fly on the server in real time; the client draws its predicted projectile at once and
  bursts it where the server says it landed (Farhold lesson: burst on where the target **is now**,
  `GAME-GUIDE.md` "real-time skill bar").

### 10.3 Targeted spells (Needs target and Auto-target)

No rewind needed: range and line of sight are checked with a **+2 m range allowance** and a 200 ms
line-of-sight grace (if the target was visible within the last 200 ms, it counts). For an **Auto-target**
spell cast with no valid hard target, the server runs §13.9's `autoTarget` with the aim ray from the
`cast` message against positions rewound the same way as §10.2 (capped at 200 ms), so the pick matches
what the player saw.

### 10.4 Dodge roll

- The client plays the roll at once. The `dodge` message carries `clientTime`.
- The server grants the **invulnerable window** (page 05 owns its length) starting at the **earlier** of
  the message's arrival and `clientTime` mapped to server time, **but no more than 150 ms earlier** than
  arrival. A roll pressed just before a hit on your screen therefore counts.
- The server checks the roll's cooldown/charges; a refused roll snaps the character back (rare, only on
  cheating or very high lag).

### 10.5 Interrupts

An interrupt lands if it reaches the server before the cast's `end`. The client shows interrupt success
only when the server confirms (no predicted "Interrupted!" that later turns out false).

---

## 11. Instancing and processes

| Piece | Where it runs |
|---|---|
| **Gateway** | In the same Node process at first. Checks the sign-in ticket, loads the character, picks a realm process, then a layer (page 15 §4). |
| **Region layers** | Objects inside the realm process. One `Region` holds the shared, read-only data (heightmap, collision, nav grid, spawn tables); each `Layer` holds only its entities and state. |
| **Dungeon instances** | Objects inside the realm process, created on entry, destroyed 30 min after empty (page 15 §4). Difficulty (Normal / Challenge) and Depth are fixed when the instance is made. |
| **Travel Methods** | A realm-wide service inside the realm process: every route's vehicles run whether or not anyone is riding, so schedules stay true (§13.8). A vehicle crossing a region border is handed to the next region's layer with its riders. |
| **Chat, guild, market, mail, friends** | Realm-wide services inside the realm process. |
| **Cross-realm group finder** | A small separate Node process per server region that matches queues from all realms and asks the realm processes to open instances. Stage 3+ only. |
| **Heavy work** | Pathfinding for many mobs, loot for a world boss with 60 eligible players: done in the tick, budgeted; if a tick exceeds budget, the layer's mob AI thinks every 2nd tick (100 ms) — never the movement. |

**Region changes.** Canon has one continent in 11 regions + Highcourt. Proposal (for page 01 to
confirm): regions are **separate maps joined at gates/passes**. Walking through a border runs a
**2–4 s** transition (fade + the next region's data from cache). Seamless borders are possible later but
double the server work at every border. **Question for the owner** (logged).

**Region size and terrain format (proposal).** Each region is a baked **heightmap** file:
`data/regions/<id>/height.u16` — a square grid of 16-bit heights, **1025 × 1025 samples at 2 m spacing
(2,048 m square)**, with `scale`/`offset` in the region's JSON so `metres = offset + value × scale`. 2.1 MB
raw per region. Beside it `water.u8` (water surface id per sample), `nav.u8` (walkable, slope class,
road, no-mount), `surface.u8` (the ground layer the shader paints: grass, dirt, rock, sand, snow, road,
mud, ash). Baked by `tools/bake-region.mjs` from the region's **shape file** (`data/regions/<id>/shape.json`
— noise settings + hand-placed brushes: raise/lower/flatten/ridge/river/road/lake/cliff) so the land is
hand-shaped but reproducible and diff-able. **Everything reads the one baked file** — the terrain mesh,
the grass, the scatter, the water depth, the player's feet on the client **and** the server's movement
check and mob pathing (`highdef-3d` rule "one heightmap, read by everything"; Farhold's water staircase
bug came from two modules describing one surface two ways — a test asserts they agree, §16.1).

---

## 12. Persistence and save shape

### 12.1 Rules

1. **One writer.** While a character is online, **only the realm process that holds it** writes it.
   Log-in claims the character (a `session_lock` column with the process id and a 60 s heartbeat);
   a second claim is refused.
2. **When it saves**: every **60 s** if anything changed; on zone change; on log-out; at once for
   "important" events: level-up, unlock, quest turned in, an item of Epic or better gained, anything that
   moved between players (trade, mail, market, guild bank — these are written **as one database step with
   both sides**, so an item is never in two places or none).
3. **Items move, never copy.** Every item instance has a unique `uid`. The `items` table (§12.3) has a
   unique key on `uid`; a trade/mail/market/bank move is an `UPDATE owner=… WHERE uid=… AND owner=<old>`
   inside a transaction, which fails if someone else moved it first. That is the whole duplication defence.
4. **A save carries versioned JSON.** `schema: 1` on every blob; a `migrate(blob)` function per version
   step in `js/rules/save-schema.js`.
5. **Farhold's lesson** (`prototypes/farhold/js/save.js` comments): fields were **passed and silently
   dropped** for rounds (`world`, `quests`, `campaign`, `props`, `research`, `perks`, `skillTalents`…).
   Wildmarch defends against it three ways: the save shape is **one schema table** (`SAVE_FIELDS`) that
   both `snapshot` and `restore` loop over, so a field cannot be in one and not the other; a node test
   builds a character, touches **every** field to an odd value, round-trips it through
   `snapshot → JSON → restore`, and asserts nothing changed; and a second test fails if any property the
   live character object carries is missing from `SAVE_FIELDS`.
6. **World state is not saved per character** beyond deltas (Farhold's "a place is generated, not
   stored" — `territory.js`). The world itself is data + seed.
7. **Items are stored compactly**: `{ uid, base, rarity, quality, ilvl, affixes: [[id, value], …], unique?,
   set?, legendary?, sr?, srState?, sockets?, quest?, look? }` (`sr` = special rarity id, §13.3; `sockets`
   = §13.2; `quest: true` is the only thing that stops an item moving between players — there is no binding) and **rehydrated** with the item tables at load (Emberveil's
   generated items carry each affix's name/min/max, which is 3–4× larger and goes stale if the table is
   retuned).
8. **Not saved, on purpose**: the **hard target** (a login starts with none), a Travel Method ride in
   progress (you log back in at the ride's **next stop**, standing on the platform — `travel.resumeAt`),
   cast bars, cooldowns under 60 s, threat. Everything else a character carries is in `SAVE_FIELDS`.

### 12.2 JSON shapes

**Character** (`characters.data`):

```jsonc
{
  "schema": 1,
  "id": "ch_01J9Z6T2",              // also the table's primary key
  "accountId": "8f0c…",             // Supabase auth.users.id
  "realm": "thornrest",
  "name": "Aldric",
  "created": "2026-10-02T18:11:04Z",
  "playtimeS": 48211,
  "classId": "druid",               // canon §6
  "race": "elf",                    // human | elf | dwarf | halfling (canon §4)
  "pronouns": "she",                // lingo pronoun set id
  "avatar": { },                    // shared character schema `avatar` (shared/character-schema.md), incl. body.race
  "voice": { },                     // voice JSON (voice-lab README), from shared/voices.js voiceFor + player edits
  "level": 14, "xp": 23150,               // no rested XP (canon 00 §12.1 W11)
  "attrs": { "STR": 12, "DEX": 18, "INT": 30, "CON": 16 },   // page 07
  "perks": ["core", "arc_1", "arc_2"], "bonusPerks": 0,      // perk forest node ids (page 07)
  "spells": {
    "slots": ["druid_thornlash", "druid_mending_bloom", "druid_bear_form", null, null, null],  // ladder 1/4/10/18/28/40
    "talents": { "druid_thornlash": ["druid_thornlash_t1b"] }                                  // tiers 12/22/32/45
  },
  "mechanic": { "callings": [6], "state": { "form": "none" }, "bound": null },  // class mechanic, page 06; `bound` = a tamed beast / bound demon id + its revive state
  "res": { "hp": 1.0, "mana": 0.82 },       // fractions of max; the class's one resource: mana | momentum | tempo (canon §6)
  "where": {
    "region": "mossfen", "x": 812.4, "y": 31.2, "z": 1440.9, "yaw": 1.57,
    "instance": null,                       // { kind, id, entrance: {region,x,z} } when inside one
    "recallStone": "lm_oakhollow_waystone"  // where the Recall Stone (it_recall_stone) returns you: a town/safe waystone or landmark id, never a dungeon or wild landmark (canon W24); a new character starts bound at its starting town's waystone — lm_first_waystone (Brightwater) or Oakhollow's (page 20 §15)
  },
  "discovered": {                            // canon §8 + W9: the Dungeon Finder and teleports only offer what is here
    "dungeons": ["d01_hollow_barrow", "d02_drowned_mill"],
    "waystones": ["lm_first_waystone", "lm_reedhollow_waystone"],
    "stations": ["tms_brightwater_yard", "tms_reedhollow_landing"]      // Travel Method stations (§13.8)
  },
  "travel": { "resumeAt": null },            // a stop id if the player logged out mid-ride (§12.1 rule 8)
  "unlocks": ["unl_sprint", "unl_dodge_roll", "unl_riding_1"],   // feature ladder ids, `unl_` prefix (page 07)
  "phase": ["brightwater_mill_burnt"],                  // page 15 §4.4
  "gold": 1234,                              // whole gold; the only coin (canon 00 §4). No other currencies
  "reputation": { "fac_wardens": 1850, "fac_greenhand": 400 },   // the seven player factions (canon 00 §12.2); tiers are page 07's
  "professions": {                           // page 19; §13.7
    "harvesting": { "skill": 112, "xp": 340 },               // one shared gathering skill, 1–300
    "craft": { "id": "prof_blacksmithing", "skill": 95, "xp": 120, "recipes": ["rcp_blacksmithing_iron_longsword", "rcp_engineering_gadget_cog_1"] }   // exactly one crafting profession, or null
  },
  "titles": ["the_barrowbreaker"], "titleShown": null,
  "lootLimits": {                            // weekly loot limit, ONLY Challenge-mode bosses and world bosses (canon W5)
    "resets": "2026-10-05T06:00:00",         // Monday 06:00 server time
    "bosses": ["b_…"]                        // bosses whose loot this character already took this week
  },
  "depth": { "d01_hollow_barrow": 7 },       // highest Depth cleared per dungeon (§13.10); a dungeon needs a Normal clear first
  "stats": { "kills": 812, "deaths": 9, "duels": [3, 1] },
  "flags": { "renameRequired": false },
  "settingsSynced": { }                      // the subset of set.* that follows the character (page 04)
}
```

**Inventory** (`characters.inventory` — one blob, written with the character):

```jsonc
{
  "schema": 1,
  "equipment": {                              // the 15 slots, ids from page 08 §2.1
    "head": "it9a2", "shoulders": null, "chest": "it9a3", "back": null, "hands": null,
    "waist": null, "legs": null, "feet": "it9a4", "necklace": null, "ring": null, "ring2": null,
    "weapon": "it9a1", "offhand": null, "tool": "it9b0", "mount": "it9b1"      // `tool` holds the harvesting tool (canon §4); there is no light slot
  },
  "bags": { "slots": 40, "items": ["it9c0", "it9c1", null] },
  "bank": { "slots": 48, "items": [] },           // 48 slots from the level-11 unlock (page 07)
  "items": {                                  // every item this character owns, keyed by uid
    "it9a1": { "uid": "it9a1", "base": "longsword", "rarity": "rare", "quality": "mid", "ilvl": 14,
               "affixes": [["low_hp_dmg", 0.13], ["skill_cost_reduce", 1.96]],
               "sr": "sr_electrified", "srState": null,                  // special rarity (§13.3); Living keeps its kill count in srState
               "sockets": [                                              // §13.2: kind + what is in it (a socketable uid) or null
                 { "kind": "gem", "item": "it9d0" },
                 { "kind": "jewel", "item": null }
               ],
               "look": null },
    "it9d0": { "uid": "it9d0", "base": "gem_garnet_3", "rarity": "common", "ilvl": 20 },    // a socketed gem is an item row too, so removing it is a move
    "it9e0": { "uid": "it9e0", "base": "jwl_prism", "rarity": "rare", "ilvl": 48,
               "affixes": [["tag_dmg:tag_ice", 0.12], ["crit_chance", 0.03]] }         // a jewel rolls its own affixes (§13.2)
  },
  "stacks": { "potion_minor_heal": 7, "mat_iron_scrap": 42 }   // consumables and materials by id
}
```

In the online game, `items` also lives row-per-item in the `items` table (§12.3) for anything that can
move between players; the blob holds the arrangement (which slot) and the row holds ownership.

**Quest state** (`characters.quests`):

```jsonc
{
  "schema": 1,
  "active": {
    "q_hollow_barrow_rumours": { "step": 2, "counters": { "kill_m_undead_barrow_rat": 6 }, "started": 1733…, "tracked": true }
  },
  "done": { "q_first_harvest": 1733…, "q_calling_druid_1": 1734… },   // id → completion time
  "events": { "ev_mill_fire": { "lastSeen": 1734…, "contributed": 0.12 } }
}
```

**Followers** (`characters.followers`) — the page 15 §21.4 row, as `{ "schema": 1, "active": [uid…],
"book": { uid: row } }`.

**Account-wide** (`accounts_game.data`): `{ schema, tag, kin: [...], mounts: [...], appearances: [...],
achievements: {...}, settings: {...} }`.

**Guild** (`guilds` row): `{ id, realm, name, emblem: { shape, color, border, bg }, motd, info, blurb,
ranks: [{ name, perms: {...}, bank: [{ view, deposit, perDay }] }], bankGold, calendar: [...] }` (no guild renown or perks — page 15)
with members in `guild_members (guild_id, character_id, rank, note,
officerNote, joined)` and bank items as `items` rows owned by the guild.

**Mail** (`mail` row): `{ id, realm, to_character, from_character | from_system, subject, body, gold, cod,
items: [uid…], sent, deliver_at, expires, read, returned }`.

**Market listing** (`market` row): `{ id, realm, seller, item_uid | stack_id + count, unit_price,
deposit, listed, expires }`.

### 12.3 Database tables (Postgres via Supabase)

| Table | Key columns | Notes |
|---|---|---|
| `accounts_game` | `account_id` (= auth.users.id), `tag`, `data jsonb`, `banned_until`, `created` | Game-side account info |
| `characters` | `id`, `account_id`, `realm`, `name`, `name_key` (lower-case, accent-stripped, unique per realm), `class_id`, `level`, `data jsonb`, `inventory jsonb`, `quests jsonb`, `followers jsonb`, `session_lock`, `updated`, `deleted_at` | One row per character |
| `items` | `uid` (unique), `owner_kind` (character/guild/mail/market), `owner_id`, `data jsonb`, `updated` | Only items that can leave a character; see §12.1 rule 3 |
| `guilds`, `guild_members`, `guild_log` | | §12.2 |
| `mail` | | |
| `market`, `market_history` | | History = daily median per base+rarity (page 15 §14.2) |
| `friends`, `kin`, `ignores` | | |
| `economy_log` | `id`, `kind` (trade/mail/market/bank/vendor/gm), `from`, `to`, `items`, `gold`, `at`, `realm` | Kept 1 year (page 15 §18.2) |
| `chat_log` | `realm`, `channel`, `from`, `to`, `text`, `at` | Kept 30 days |
| `reports`, `tickets`, `mod_actions` | | Page 15 §18 |
| `realm_state` | `realm`, `key`, `data jsonb` | World deltas: rare timers, event state, world boss timers, Travel Method clocks (so a restart does not reset every schedule) |

Migrations are plain `.sql` files in `server/migrations/NNNN_name.sql`, applied in order by
`server/migrate.mjs` (records applied ones in a `schema_migrations` table).

### 12.4 Offline saves

Offline mode (§15) keeps **the same JSON blobs** in the browser's IndexedDB (`wildmarch.v1` database,
stores `characters`, `inventory`, `quests`, `followers`, `account`, `world` — the offline realm's `realm_state`), with localStorage only for the
"last played" pointer (Farhold's `save.js` pattern: every access wrapped in try/catch). A character can be
**exported** as one JSON file and, later, **imported to a realm** once (the server re-rolls nothing, but
checks every item against the tables and caps gold/levels to what the offline build allowed —
**question for the owner**: allow offline → online import at all?).

---

## 13. Data files (every JSON the game will have)

All under `prototypes/wildmarch/data/` unless a path says otherwise. Conventions (Farhold's): a top-level
`_doc` string explains the file for Claude; `_xDoc` strings next to blocks; ids follow the brief's id
conventions; **every knob in a file has a reader**, and a test proves it by moving the knob to an odd
value and watching the running module change (memory note *testing dead data rules*). `tools/validate-data.mjs`
checks every file's shape against the table below on every test run.

| File | Shape (top level) | Owner page | Notes |
|---|---|---|---|
| `balance.json` | `{ player, progression: { cap: 60, xpTable }, enemies: { perLevel, ranks }, followers: { perLevel, maxShareOfOwner: 0.75 }, loot, magicFind, economy, combat, duel, depth, lootLimits: { resetDay: "monday", resetHour: 6 } }` | 05/07/08/12 | The one knob file (Farhold `balance.json` pattern). No day/night block — always daylight. `magicFind` caps are §13.6; `depth` is §13.10 |
| `classes.json` | `{ classes: [{ id, name, role, alsoRoles, armour, weapons, resource, mechanic, companion?, voiceRole, outfit, startKit }] }` | 06 | 30 rows, canon §6 — the index the class picker and tests read |
| `classes/<id>.json` | page 06 class record: `{ id, name, role, hybrid, build, armour, resource: "mana"\|"momentum"\|"tempo", weapons, starter, mechanic: { id, state }, bind?: { kind: "tame"\|"bind"\|"control", ritual }, spells: [6 ids], utility: [ids], alternates, callings: [3 quest ids], sets, voice, colour, difficulty }` | 06 | 30 files; `classes.json` is built from them by a tool so the two cannot drift. `bind` = Ranger Tame Beast / Warlock Bind Demon (permanent, revived by `ritual`) or Necromancer Control Undead (temporary) — canon W32 |
| `spells/<classId>.json` | `{ classId, mechanic: {...}, spells: [{ id, name, slotLevel, cost, cooldown, cast, targeting: "needs"\|"auto"\|"ground"\|"self"\|"ally", range, shape, tags: ["tag_…"], effect: [...], statuses, fx: { element, kind, shape }, sfx, voice }], alternates: [...], utility: [...], talents: [{ id, spellId, tier, choice, name, changes, addTags?, removeTags? }] }` | 06 | 30 files, one per class, so class writers never edit the same file. Every spell has `targeting` (§13.9) and `tags` (§13.1); a talent that changes a spell's shape may add or remove tags |
| `statuses.json` | `{ statuses: { id: { name, kind: buff/debuff/control, stacks, max, tick, dispel, aura, sfx } } }` | 05 | Aura names from `spellfx.js` `STATUS_FX`. A damage-over-time status carries the tags of the spell that laid it (§13.1) |
| `tags.json` | §13.1 | 05 | **(new)** The tag list and the matching rule |
| `unlocks.json` | `{ ladder: [{ id, level?, quest?, name, card, explain, screen }] }` | 07 | The feature ladder |
| `perks.json` | `{ arms: [...], nodes: [{ id, arm, x, y, stat, value, capstone? }] }` or generator knobs | 07 | Farhold generates the forest in `js/perks.js`; Wildmarch may keep the generator (reuse map) |
| `items/bases.json` | `{ weaponBases, armorBases }` | 08 | Starts as a copy of Emberveil `items.json` bases + Wildmarch additions |
| `items/affixes.json` | `{ affixes, affixTiers, units }` — an affix may carry `needsTags` (the tags a skill must have for it to apply, §13.1) | 08 | Units restated per stat (Farhold `affixes.js` lesson: fractions vs percentages) |
| `items/rarities.json` | `{ order: ["common","uncommon","rare","epic","unique","set","legendary"], colors, affixCount, sockets: { <rarity>: { <slotGroup>: { gem, jewel, soul, gadget } } }, cardFrame: { <rarity>: frameId } }` | 08/17 | Canon §4 rarities; colours are page 08's (Set `#2fc4b2`, **Legendary violet `#c86bff`**). `sockets` = how many of each kind an item of that rarity and slot group may roll (page 08 owns the numbers); `cardFrame` names page 17's item-card frame |
| `items/special-rarities.json` | §13.3 | 08/17 | **(new)** The five `sr_` special rarities |
| `items/gems.json`, `items/jewels.json`, `items/souls.json`, `items/gadgets.json` | §13.2 | 08/09/19 | **(new)** The four socketable kinds |
| `items/quivers.json` | `{ bases: [{ id, name, level, dmg: [min, max], tags }], effects: [{ id: "qv_…", name, needsTags: ["tag_basic"], proc, fx }] }` | 08 | **(new)** Quivers as damage stat-sticks for bows and crossbows (the off hand), on par with foci (§14.2); an effect fires only on attacks tagged `tag_basic` |
| `items/uniques.json` | `{ uniques: [{ id: "uq_…", base, powers, look }] }` | 08/09 | Farhold `data/uniques.json` + `tools/build-uniques.mjs` pattern |
| `items/legendaries.json` | `{ legendaries: [{ id: "leg_…", slot, power: { id, numbers }, classId? }] }` | 09 | |
| `items/sets.json` | `{ sets: [{ id: "set_…", classId?, pieces, bonuses: { "2": …, "4": …, "6": … } }] }` | 09 | |
| `items/consumables.json` | `{ potions, food, scrolls, keys }` | 08 | Scrolls include teleport scrolls to **discovered** waystones (page 20) |
| `crafting.json` | `{ materials, salvage, benches }` | 08/19 | Farhold `crafting.json` shape for salvage and materials; **recipes live in `professions/recipes.json`** (§13.7) |
| `professions/professions.json`, `professions/nodes.json`, `professions/recipes.json`, `tools.json` | §13.7 | 19 | **(new)** Harvesting, the seven crafting professions, harvest nodes, recipes. `tools.json` keeps Farhold's shape (reuse) |
| `magic-find.json` | §13.6 | 08 | **(new)** The seven `mf_` stats and their caps |
| `vendors.json` | `{ vendors: [{ npc, stock: [{ item, price, limit? }], buyback: true }] }` | 08 | |
| `loot-tables.json` | `{ tables: { id: { picks, gold: [min, max], rarityWeights: {...}, sr?: { <sr_id>: chance }, rows: [{ item\|base\|table, weight, rarity? }] } } }` | 08/10/12/13 | Every drop source names a table; `picks`, `gold` and `rarityWeights` are the numbers magic find moves (§13.6); a test checks "every item has a way to get it" (canon rule 4) |
| `monsters.json` | `{ families, ranks, monsters: [{ id: "m_…", name, family, nature, region, levels: [min,max], role, traits, tags, temperament, rank, pack: [min,max], hp, hit, attackEvery, reach, speed, aggro, leash, fleeAt, abilities: ["a_…"], look, reuse?, loot: { bases, reagent, trophy }, harvest?: "node_…" }] }` | 10 | Page 10 row shape (grown from Farhold `enemies.json`). `tags` includes `tag_undead`, `tag_demon`, `tag_beast` — what Control Undead, Demonsight and Tame Beast read. **No night field**: nothing spawns by time of day. `harvest` names the skinning node the corpse becomes |
| `monster-rarities.json` | §13.4 | 10/11 | **(new)** Champion/rare modifiers (`mod_`), greater rarities (`grr_`), exclusion groups, the open-world roll and dungeon placement. Replaces the old `monster-modifiers.json` |
| `warbands.json` | Farhold `data/warbands.json` shape (reuse) with `members` extended by `mender` and `levels` per sub-zone | 10 | Six warbands at page 10's bands (00 §10) |
| `abilities.json` | `{ abilities: [{ id: "a_…", mechanic: "mech_…", shape, colour, warn, damage, effects, cooldown, recovery, say }] }` | 10/11 | Page 10 §12 ability row: usually cites a `mechanics.json` row and overrides numbers |
| `mechanics.json` | `{ kinds: { danger, void, soak, safe, targeted, beneficial, tether }, shapes: [...], warnMin: {...}, palettes: {...}, mechanics: [{ id: "mech_…", name, colour, shape, warn: { normal, challenge, openWorld }, category, damage, sound, banner, fx, counterplay, tooltip }] }` | 11 | Page 11 §27 row shape. Page 11 owns every colour, palette and warning time — this file holds page 11's values, nothing else restates them. The renderer and the server both read it |
| `bosses/<b_id>.json` | page 11 §27 boss script: `{ id, name, hp, targetTime, enrage, voice, lines: { open, death, … "bl_…" }, phases: [{ id, until, abilities, adds, dialog }], dialog: { lines, opportunities: ["dlg_…"] }, loot, secret? }` | 11/12/13 | One file per boss (dungeon bosses on page 12, world bosses on page 13) |
| `dungeons.json` | `{ dungeons: [{ id, region, band, map, entrance: "lm_…", bosses, secret, difficulties: ["normal","challenge"], depth: true }] }` | 12 | Canon §8, 16 rows (d01–d16). `entrance` is what "discovered" means (canon W9) |
| `depth.json` | §13.10 | 12 | **(new)** Depth levels, tiers, enemy additions and modifiers |
| `dungeons/<id>.json` | page 12 template: `{ id, card: { name, region, band, entrance, quest, par: { normal, challenge }, shrines, forces }, rooms, halls, doors, packs, raritySlots, depthPacks, bosses: ["b_…"], secret, loot, glow }` | 12 | One file per dungeon. Hand-placed; `prototypes/farhold/js/dungeon-plan.js` for procedural filler and the reachability test. `raritySlots` = §13.4 dungeon placement; `depthPacks` = packs a Depth tier switches on (§13.10); `glow` = the fixed light sources (fungi, lava, plants; page 17) — never a torch the player carries |
| `world-bosses.json` | Farhold `data/worldbosses.json` schema (tier, over-level, scale, `minions`, `phases`, chest, pin) + Wildmarch's `schedule`, `site`, `abilities[]`, `scaling`, `lootLimit: "weekly"` | 13 | Page 13 (`13-WORLD-BOSSES.md`) keeps the Farhold shape and adds five fields |
| `regions.json` | `{ regions: [{ id, name, band, hub, holder, size, gates: [{ to, at }], weather, ambience, palette }] }` | 01/17 | Canon §7 |
| `world/continent.json` | page 01 recipe: `{ worldgen: { version, seed, method, width, height, metresPerCell, … }, stamps: [...], regions: "world/region-paint.png", pins: "world/pins.json", roads: "world/forced-roads.json" }` | 01 | The fixed seed + hand edits (page 01 option C); `world/region-paint.png` is one colour per region id |
| `world/pins.json` | `{ pins: [{ id, kind, cell: [x, y], offset: [x, z], safe? }] }` | 01 | Every `town_` / `lm_` / dungeon mouth / Travel Method station. `safe: true` marks a waystone or landmark the Recall Stone may bind to |
| `world/forced-roads.json` | `{ roads: [{ id, points: [[x, y], …] }] }` | 01 | The Kingsroad and the Saltroad; the rest is A*. Travel Method routes follow these roads where they can (§13.8) |
| `landmarks.json` + `setpieces.json` | Farhold shapes (reuse) | 01 | `lm_*` kinds and world-boss site layouts `wb_site_*` (page 01 §22) |
| `regions/<id>/shape.json` | `{ size, spacing, noise, brushes: [...] }` | 01 | Baked to `height.u16`, `water.u8`, `nav.u8`, `surface.u8` (§11) |
| `regions/<id>/places.json` | `{ towns, pois, spawns, nodes, chests, waystones, phase }` | 01/10/14 | |
| `towns.json` | `{ towns: [{ id, region, layout, npcs, services }] }` | 01 | |
| `npcs.json` | `{ npcs: [{ id: "npc_…", name, race, gender, role, look, voice?, speech, town, services }] }` | 01 | `speech` = Lingo personality |
| `factions.json` | `{ bands, factions: [{ id: "fac_…", name, short, rivals, greeting, chapters: [{ id, name, regions }], quartermaster: { npc, stock } }] }` | 01/07 | Farhold `factions.json` shape + chapters (canon 00 §12.2: seven player factions reaching from the starting regions to 60). Standing is run by `js/factions.js` (reuse) |
| `quests/story.json`, `quests/side.json`, `quests/calling.json`, `quests/unlock.json`, `quests/seasonal.json` | `{ quests: [{ id: "q_…", giver, kind, level, requires, steps, rewards, phase? }] }` (page 14 record) | 14 | Page 14's split: story · side · calling (`q_calling_<class>_1..3`) · unlock · seasonal. No attunement, daily or weekly files (canon W9, W20) |
| `story-instances.json` | `{ instances: [{ id: "si_…", quest, map, spawns, scaling }] }` | 14 | Page 14 §6.13, 3 rows |
| `job-frames.json`, `incidents.json`, `wanderers.json` | Farhold shapes, copied (reuse) | 14 | Board jobs (§11), timed sub-zone states (§14), people on the road (§13.6) — page 14 §17 "as is" |
| `events.json` | `{ events: [{ id: "ev_…", region, area, level, trigger, phases: [...], cooldown, scaling, rewards }] }` | 14 | Wildmarch's own dynamic events (page 14 §13, 25 rows); Farhold's road-event `events.json` is reused under another name if kept |
| `followers.json` | `{ heroes: [...], finderHire: {...} }` + reuse `mercenaries.json` | 15 | Page 15 §21 |
| `mounts.json` | `{ mounts: [{ id, name, species, creature, speed, swim?, glide?, fly?, level, source }] }` | 07/08/17 | Creature bodies (`avatar-3d/js/creature-types.js`): the species of page 08 §24.2 — horses, elk, boars, lizards, beetles, the Raptor Runner, Crested Strider (two seats) and Horned Grazer dinosaurs, rams, giant frogs and other aquatic hybrids (`swim: true`), the Floating Stone, Clockwork Strider and Longshank Calf (canon §12.3; seven new bodies on page 17 §3.2). `fly` only for the level-60 story chain |
| `travel/methods.json`, `travel/routes/<tm_id>.json`, `travel/stations.json` | §13.8 | 20 | **(new)** Travel Methods: kinds, routes as polylines, stations, schedules. Replaces the old boats-only `vehicles.json`; models from `avatar-3d/js/vehicles.js` + creature bodies |
| `weapons.json` | `{ strikes, patterns, traits, familyWind, ranged }` | 05 | Farhold's `STRIKES` / `WEAPON_PATTERNS` / `WEAPON_TRAITS` / `FAMILY_WIND` / `RANGED` tables moved out of code (page 05) |
| `chat.json` | `{ channels: [...], commands: [...], rate: {...} }` | 15 | Page 15 §9 as data |
| `emotes.json` | `{ emotes: [{ cmd, aliases, anim, text, textTarget, inCombat }] }` | 15 | Page 15 §12 |
| `names.json` | `{ rules, blocked, contains, lookalikes }` + generated `reserved-names.json` | 15 | `tools/build-reserved-names.mjs` reads every id file |
| `bindings.json` | `{ bindings: [{ action, label, code, context }] }` | 02 | Page 02 §9's name, adopted. One table, as Farhold `settings.js` `BINDINGS` taught (a test fails if code listens for a key not in it) |
| `settings.json` | `{ tabs: [{ id, fields: [{ key: "set.<tab>.<key>", control, values, default }] }] }` | 04 | |
| `screens.json` | `{ screens: [{ id: "scr_…", title, opens, key? }] }` | 03 | Lets a test open every screen |
| `tips.json` | `{ tips: [{ id, text, category: "general"\|"class"\|"region", classId?, region?, levels: [min,max] }] }` | 03 | Loading-screen tips, ~140 (page 03) |
| `sound-map.json` | `{ events: { gameEvent: sfxId }, beds: { regionOrPlace: sfxId }, music?: {...} }` | 17 | The only place game events are named to sfx ids |
| `voices.json` | `{ npcs: { npcId: voiceJSON }, bosses: {...}, races: { race: { pitch, depth, … deltas } } }` | 17 | |
| `graphics.json` | `{ presets: { low, medium, high, ultra }: { <option>: value } }` | 04/17 | Page 04 §7.2 owns the presets and values; page 17 §7 adds the art-side knobs. One file so `resolveGraphics` (Farhold `gfx.js` pattern) is the only reader |
| `lingo/data/packs/wildmarch.json` (playground path) | Lingo pack `{ entries: [...] }` | 01/17 | Places, factions, NPCs, creatures, items with pronunciations |
| `conversations` pack `data/topics-wildmarch.json` | conversations topic shape | 15/17 | Follower camp talk |
| `avatar-3d/data/class-outfits.json`, `avatar-3d/data/creature-variants.json` (playground paths) | shared shapes (reuse) | 06/10/17 | Read, not copied; additive rows only (missing class outfits are `QUESTIONS.md` G4) |

### 13.0 How to read the shapes below

§13.1–§13.10 give the JSON shape of every file the round-2 systems need. **Numbers inside the examples
are placeholders that show the type and scale; the owner page named in each heading owns the real
values.** Every shape follows the file conventions above: a `_doc` string, ids with the canon prefix
(00 §10 "Extra id prefixes"), and every knob with a reader (`dead-data.test.js`).

### 13.1 Tags — `data/tags.json` (page 05 owns the list) (new)

A **tag** is a label on a skill, a basic attack, an item, an affix or a status, such as *Ice*, *Area*,
*Ranged*, *Spell*. A bonus names the tags it needs; it applies to a hit only if the hit's source carries
**all** of them.

```jsonc
{
  "_doc": "Tag list and matching rule. Page 05 owns the list; ids are tag_<snake>.",
  "groups": {                                    // for the tooltip order and the Trading Post filter only
    "element":  ["tag_physical", "tag_fire", "tag_ice", "tag_storm", "tag_poison", "tag_holy", "tag_shadow", "tag_arcane", "tag_nature"],
    "delivery": ["tag_melee", "tag_ranged", "tag_spell", "tag_basic", "tag_projectile", "tag_channel"],
    "shape":    ["tag_area", "tag_single", "tag_cone", "tag_line", "tag_ground"],
    "effect":   ["tag_dot", "tag_heal", "tag_shield", "tag_control", "tag_summon", "tag_trap", "tag_movement"],
    "creature": ["tag_undead", "tag_demon", "tag_beast", "tag_construct", "tag_elemental", "tag_humanoid"]
  },
  "tags": {
    "tag_ice":   { "name": "Ice",   "icon": "ui/tags/ice.svg" },
    "tag_area":  { "name": "Area",  "icon": "ui/tags/area.svg" },
    "tag_basic": { "name": "Basic Attack", "icon": "ui/tags/basic.svg", "note": "weapon swings/shots and any skill classed as a basic attack; the only tag quiver effects read" }
    // … one row per tag
  },
  "rules": {
    "match": "all",                              // a bonus's needsTags must ALL be on the source (Area + Spell = an area spell)
    "inherit": ["status", "projectile", "ground"],   // a DoT, a projectile or a ground patch carries the tags of the skill that made it
    "talentsMayChange": true                     // a talent may addTags/removeTags on its spell (§13 spells row)
  }
}
```

**Where tags live**: `spells/<class>.json` `tags` on every spell; `weapons.json` gives each basic attack
`tag_basic` + `tag_melee` or `tag_ranged` + its element; `items/*.json` bases carry tags only for search
and set bonuses; an affix row carries `needsTags`. The one reader is `js/rules/tags.js`
`bonusFor(sourceTags, stats)`: it sums every `tag_dmg:<tag>[+<tag>…]` stat whose tags are all in
`sourceTags`. Stat keys encode the needed tags so the save stays a flat `[id, value]` list:

| Stat key | Meaning |
|---|---|
| `tag_dmg:tag_ice` | +x% damage from anything tagged Ice |
| `tag_dmg:tag_area+tag_spell` | +x% damage from anything tagged Area **and** Spell (the unique staff example, canon §12.3) |
| `tag_cdr:tag_trap` | −x% cooldown on skills tagged Trap |
| `tag_cost:tag_channel` | −x% resource cost on skills tagged Channel |

### 13.2 Sockets — `data/items/{gems,jewels,souls,gadgets}.json` (page 08 owns the rules) (new)

An item has 0–N sockets, each of one **kind**. A socket only takes a socketable of its own kind. Which
items roll which sockets is `items/rarities.json` `sockets` (page 08).

```jsonc
// items/gems.json — a gem's effect depends on what it sits in
{
  "_doc": "Gems. hosts.armour is the old gem table; weapon = damage/spell damage; jewellery = secondary effects and magic find.",
  "grades": [{ "grade": 1, "name": "Chipped", "level": 1 }, { "grade": 2, "name": "Flawed", "level": 15 }, { "grade": 3, "name": "Plain", "level": 30 }, { "grade": 4, "name": "Flawless", "level": 45 }, { "grade": 5, "name": "Radiant", "level": 60 }],
  // ten kinds (page 08 §13.4): bloodstone, tigereye, lapis, jade, onyx, moonstone, garnet, pearl, amber, peridot.
  // Item ids are gem_<kind>_<grade> (gem_garnet_3 = Plain Garnet); rough stones are page 19's mat_rough_<kind>_<grade>.
  "gems": [{
    "kind": "garnet",
    "name": "Garnet",
    "colour": "#b3202c",
    "hosts": {                                   // host group = the slot group of the item it is socketed into
      "armour":    { "stat": "resistAll",            "perGrade": [6, 10, 15, 21, 30] },
      "weapon":    { "stat": "addedAs:tag_fire",     "perGrade": [0.03, 0.05, 0.07, 0.10, 0.14] },
      "jewellery": { "stat": "mf_gold",              "perGrade": [0.05, 0.08, 0.12, 0.17, 0.25] }
    }
  }],                                            // values copied from page 08 §13.4, which owns them
  "hostGroups": {                                // slot → host group
    "weapon": "weapon", "offhand": "weapon",
    "head": "armour", "shoulders": "armour", "chest": "armour", "back": "armour", "hands": "armour",
    "waist": "armour", "legs": "armour", "feet": "armour",
    "necklace": "jewellery", "ring": "jewellery", "ring2": "jewellery"
  }
}

// items/jewels.json — a jewel is a small item that rolls its own affixes and rarity
{
  "bases": [{ "id": "jwl_prism", "name": "Prism Jewel", "level": 20, "fits": ["weapon", "armour", "jewellery"] }],
  "rarities": { "uncommon": { "affixes": [1, 2] }, "rare": { "affixes": [3, 4] }, "unique": { "fixed": true } },
  "affixPool": ["tag_dmg:*", "crit_chance", "crit_mult", "attack_speed", "cast_speed", "mf_*", "…"],   // page 08 owns the pool and ranges
  "uniques": [{ "id": "jwl_uq_the_long_winter", "name": "The Long Winter", "affixes": [["tag_dmg:tag_ice", 0.25]], "power": "pw_…" }]
}

// items/souls.json — rare; each adds a behaviour, like a legendary power
{
  "souls": [{
    "id": "soul_tidecaller",
    "name": "Soul of the Tidecaller",
    "source": ["b_…", "q_…"],                    // where it drops (canon rule 4: every item has a way to get it)
    "requires": {                                // any field may be absent
      "hostGroup": "weapon",                     // weapon | armour | jewellery
      "slot": null,                              // or a single slot, e.g. "chest"
      "class": null,                             // or a class id
      "build": null,                             // melee | ranged | caster
      "tags": ["tag_spell"]                      // the soul's power only affects skills with these tags
    },
    "power": { "id": "pw_soul_tidecaller", "kind": "proc", "chance": 0.15, "on": "hit", "does": "…" },   // kind: proc | changeSkill | newEffect (canon §12.3)
    "limit": 1                                   // at most N of this soul worn at once
  }]
}

// items/gadgets.json — crafted by Engineers; the player picks the stats
{
  "gadgets": [{
    "id": "gdg_cog",
    "name": "Tuned Cog",
    "recipe": "rcp_engineering_gadget_cog_1",
    "level": 25,
    "fits": ["armour", "jewellery"],
    "choose": 2,                                 // how many lines the crafter picks from the menu
    "menu": [                                    // each line has a fixed value; stronger than a gem, weaker than a good jewel
      { "stat": "CON", "value": 12 },
      { "stat": "tag_dmg:tag_trap", "value": 0.06 },
      { "stat": "mf_rarity", "value": 0.04 }
    ]
  }]
}
```

Saved on the host item as `sockets: [{ kind, item }]` (§12.2). A socketed thing is its own item row, so
moving it in or out is an ordinary item move and cannot duplicate (§12.1 rule 3).

### 13.3 Special rarities — `data/items/special-rarities.json` (page 08 numbers, page 17 art) (new)

A **special rarity** sits on top of an Uncommon-or-better item's normal rarity. The icon is an original SVG
(never an emoji) drawn before the item's name in chat, tooltips, loot lines and the Trading Post.

```jsonc
{
  "_doc": "Five special rarities. Page 08 owns the numbers, page 17 the card look and the icons.",
  "minRarity": "uncommon",                      // canon: Uncommon-or-better
  "rarities": [
    { "id": "sr_electrified", "name": "Electrified", "icon": "ui/sr/electrified.svg", "card": "card_sr_electrified",
      "effect": { "kind": "proc", "on": "hit", "chance": 0.10, "does": "chain lightning, 3 jumps" },
      "chanceFrom": { "grr_electrified": 5.0 } },                       // an Electrified monster drops Electrified items more often (×5)
    { "id": "sr_starwoven",   "name": "Starwoven",   "icon": "ui/sr/starwoven.svg",   "card": "card_sr_starwoven",
      "effect": { "kind": "extraAffix", "count": 1, "pool": "starwoven" } },   // one affix past the normal maximum, from a special pool
    { "id": "sr_twinned",     "name": "Twinned",     "icon": "ui/sr/twinned.svg",     "card": "card_sr_twinned",
      "effect": { "kind": "rollTwice", "keep": "better" } },                   // every affix rolled twice, the better kept
    { "id": "sr_ancient",     "name": "Ancient",     "icon": "ui/sr/ancient.svg",     "card": "card_sr_ancient",
      "effect": { "kind": "overRoll", "min": 0.10, "max": 0.20 } },            // every value 10–20% above its normal maximum
    { "id": "sr_living",      "name": "Living",      "icon": "ui/sr/living.svg",      "card": "card_sr_living",
      "effect": { "kind": "grows", "per": "kill", "steps": [100, 400, 1000, 2500], "bonusPerStep": 0.04 } }   // srState = kill count
  ],
  "baseChance": 0.002,                           // per item roll before magic find; page 08 owns it
  "depthBonus": "depth.json tiers[].srChance"    // high Depth raises it (§13.10)
}
```

The chat link carries `sr` so the server's link check (page 15) proves the icon is real.

### 13.4 Monster rarities — `data/monster-rarities.json` (page 10 owns the lists) (new)

```jsonc
{
  "_doc": "Champion/rare modifiers (mod_), greater rarities (grr_), exclusion groups, open-world roll, dungeon placement.",
  "ranks": {
    "champion": { "nameColour": "#5b8cff", "mods": 1, "shared": true,  "pack": [3, 5] },    // whole pack, blue names, one shared modifier
    "rare":     { "nameColour": "#f2c94c", "mods": [2, 3], "minions": [2, 4] }             // yellow name + minions
  },
  "modifiers": [                                 // champion/rare affixes
    { "id": "mod_swift", "name": "Swift", "mult": { "speed": 1.3, "attackEvery": 0.8 }, "group": null, "minLevel": 5 },
    { "id": "mod_vampiric", "name": "Vampiric", "mechanic": "heal 20% of damage dealt", "group": null, "minLevel": 12 }
  ],
  "greater": [                                   // big spikes, layered on top of any rank
    { "id": "grr_giant",       "name": "Giant",       "group": "size",    "mult": { "hp": 3.0, "hit": 1.6, "scale": 1.8 }, "badge": "ui/grr/giant.svg" },
    { "id": "grr_flaming",     "name": "Flaming",     "group": "element", "aura": "burn", "mechanic": "mech_fire_trail", "badge": "ui/grr/flaming.svg", "dropsSr": null },
    { "id": "grr_electrified", "name": "Electrified", "group": "element", "aura": "static", "mechanic": "mech_arc_pulse", "badge": "ui/grr/electrified.svg", "dropsSr": "sr_electrified" },
    { "id": "grr_frozen",      "name": "Frozen",      "group": "element", "aura": "chill", "mechanic": "mech_frost_ring", "badge": "ui/grr/frozen.svg" }
  ],
  "exclusion": {                                 // at most ONE greater rarity per group on a monster
    "size": 1, "element": 1                      // Giant + Flaming is fine; Flaming + Electrified never
  },
  "openWorld": {                                 // rolled at random when a pack spawns
    "champion": 0.08, "rare": 0.04,
    "greater": { "single": 0.03, "wholePack": 0.003, "second": 0.15 }   // chance a monster gets one; a whole pack; a second (other group)
  },
  "rewards": { "champion": { "picks": 1.5 }, "rare": { "picks": 2.5 }, "greaterEach": { "picks": 1.5, "rarity": 0.25 } }
}
```

**Dungeons do not roll at random.** A dungeon file's `raritySlots` places them on purpose — you know a
rare pack will be in that room, not which one:

```jsonc
"raritySlots": [
  { "room": "r3", "pick": 1, "from": ["p3a", "p3b", "p3c"], "rank": "rare" },       // one of these three packs is the rare
  { "room": "r5", "pick": 1, "from": ["p5a", "p5b"], "rank": "champion", "greater": ["grr_giant"] }
]
```

`js/rules/monster-rarity.js` `roll(spawn, rng)` honours `exclusion` for both paths; `monster-rarity.test.js`
rolls 100,000 open-world spawns and asserts no monster ever carries two `element` greater rarities.

### 13.5 Quivers — `data/items/quivers.json` (page 08 owns the numbers) (new)

A quiver is the off hand of a bow or crossbow user: a **damage stat-stick** (its `dmg` range adds to the
weapon's basic attack), built the way Farhold's foci are (`js/foci.js` `FOCUS_BASES` + `installFoci`,
§14.2). Some quivers roll one `qv_` effect — fire arrows, exploding arrows, multi-shot — whose
`needsTags: ["tag_basic"]` limits it to basic attacks and skills tagged Basic Attack (canon §12.3). The
effect reader is the same `tags.js` rule as §13.1, so no second check exists.

### 13.6 Magic find — `data/magic-find.json` (page 08 owns the numbers) (new)

```jsonc
{
  "_doc": "Seven magic-find stats. Values are fractions (0.10 = +10%) except mf_prof_skill, a flat +N.",
  "stats": {
    "mf_gold":       { "name": "Gold find",              "unit": "fraction", "cap": 1.0,  "reads": "loot-tables gold" },
    "mf_quantity":   { "name": "Item quantity",          "unit": "fraction", "cap": 0.5,  "reads": "loot-tables picks" },
    "mf_rarity":     { "name": "Item rarity",            "unit": "fraction", "cap": 1.0,  "reads": "loot-tables rarityWeights (shifts weight from common upward)" },
    "mf_xp":         { "name": "Experience gain",        "unit": "fraction", "cap": 0.3,  "reads": "rpg.killXpFor / eventXp" },
    "mf_rep":        { "name": "Reputation gain",        "unit": "fraction", "cap": 0.3,  "reads": "factions.adjust" },
    "mf_prof_skill": { "name": "Profession skill",       "unit": "flat",     "cap": 25,   "reads": "professions effectiveSkill" },
    "mf_prof_xp":    { "name": "Profession experience",  "unit": "fraction", "cap": 0.5,  "reads": "professions gainXp" }
  },
  "diminishing": { "after": 0.5, "rate": 0.5 }   // past +50%, each point counts half (page 08 owns it)
}
```

**Where drop tables read it**: `js/sim/loot.js` `roll(table, killer, rng)` reads the killer's summed
`mf_quantity` (more `picks`), `mf_rarity` (shifts `rarityWeights`) and `mf_gold`. Personal loot means
every eligible player rolls with **their own** magic find. A `one-owner.test.js` row asserts each `mf_`
stat is applied in exactly one function (memory note *one multiplier, two owners*).

### 13.7 Harvesting and professions — `data/professions/*.json` + `data/tools.json` (page 19 owns the rules) (new)

```jsonc
// professions/professions.json
{
  "harvesting": {
    "id": "prof_harvesting", "max": 300,
    "kinds": ["mine", "skin", "herb", "timber", "fish"],     // one shared skill covers all (canon §12.3)
    "xpCurve": { "base": 20, "growth": 1.035 },
    "toolFor": { "mine": "pick", "skin": "knife", "herb": "sickle", "timber": "axe", "fish": "rod" }
  },
  "crafting": {
    "pickOne": true,                             // a character has exactly one; changing it is page 19's rule
    "max": 300,
    "list": ["prof_blacksmithing", "prof_leatherworking", "prof_tailoring", "prof_jewelcrafting",
             "prof_enchanting", "prof_engineering", "prof_alchemy"]
  }
}

// professions/nodes.json — what a harvest node is
{
  "nodes": [{
    "id": "node_iron_vein", "kind": "mine", "skill": 75, "toolTier": 2,
    "yield": { "mat_iron_ore": [2, 4], "gem_rough_garnet": 0.05 },
    "respawnS": 300, "perPlayer": true,          // personal node taps: each player can harvest the same node once per respawn
    "regions": ["greyridge", "frostmantle"]
  }]
}

// professions/recipes.json
{
  "recipes": [{
    "id": "rcp_blacksmithing_iron_longsword", "profession": "prof_blacksmithing", "skill": 60,
    "learn": { "trainer": "npc_…", "cost": 12 },  // or { "drop": "table_…" } / { "faction": "fac_deepforge_clans", "tier": "trusted" }
    "needs": { "mat_iron_bar": 6, "mat_leather_strip": 2 }, "bench": "bench_anvil",
    "makes": { "base": "longsword", "rarity": "uncommon" },
    "skillUp": { "orange": 60, "yellow": 75, "green": 90, "grey": 105 }   // skill at which the chance to gain a point falls
  }]
}
```

`data/tools.json` keeps Farhold's shape (tool bases, tiers, speed/yield/reach by rarity) — minus the
scanner rows. `canWork(player, node)` = the tool in the `tool` slot matches `toolFor[kind]`, its tier
≥ `node.toolTier`, and `harvesting.skill + mf_prof_skill ≥ node.skill`. The character keeps
`professions` (§12.2).

### 13.8 Travel Methods — `data/travel/*.json` (page 20 owns the rules) (new)

A **Travel Method** carries riders along a fixed **route** — a polyline (a list of points) over real
ground — between **stations**. It is faster than walking and the riders cannot be hit or hurt by weather.

```jsonc
// travel/methods.json — the kinds
{
  "methods": {
    "tm_wagon":   { "name": "Road wagon",     "model": "vehicles:covered_wagon", "speed": 14, "seats": 8,  "depart": "bus",       "busWaitS": 45, "busMinRiders": 1 },
    "tm_strider": { "name": "Great strider",  "model": "creature:strider",       "speed": 18, "seats": 10, "depart": "bus",       "busWaitS": 60 },
    "tm_barge":   { "name": "River barge",    "model": "vehicles:barge",         "speed": 12, "seats": 20, "depart": "scheduled" },
    "tm_rail":    { "name": "Stone rail car", "model": "vehicles:rail_car",      "speed": 26, "seats": 30, "depart": "scheduled" },
    "tm_flyer":   { "name": "Great flyer",    "model": "creature:griffin",       "speed": 30, "seats": 5,  "depart": "onDemand" }
  },
  "_departDoc": "bus = leaves when full or busWaitS after the first rider boards; scheduled = runs a timetable whether or not anyone waits, board while it is docked; onDemand = leaves at once for the party that bought the ride",
  "protection": { "untargetable": true, "weatherImmune": true, "dismountOnly": "at a stop" },
  "walkSpeed": 5.4                                // for the 'much faster than walking' check (test asserts speed >= 2.5 × walkSpeed)
}

// travel/stations.json
{ "stations": [{ "id": "tms_brightwater_yard", "name": "Brightwater Wagon Yard", "region": "hearthvale", "at": [412.0, 18.4, 903.5], "board": 8, "methods": ["tm_wagon"] }] }

// travel/routes/tm_wagon_kingsroad.json — one file per route
{
  "id": "tm_wagon_kingsroad",
  "method": "tm_wagon",
  "stops": [                                      // stations in order, with the index of the polyline point they sit on
    { "station": "tms_brightwater_yard", "point": 0, "dwellS": 20 },
    { "station": "tms_highcourt_south_gate", "point": 214, "dwellS": 20 }
  ],
  "loop": "pingpong",                             // pingpong | loop
  "polyline": [[412.0, 18.4, 903.5], [415.1, 18.6, 911.0]],   // x, y, z metres, resampled every 3 m (Farhold roadplan LANE_SPACING)
  "roads": ["kingsroad"],                         // the forced road it follows, if any
  "schedule": { "firstS": 0, "everyS": 300 },     // scheduled only: seconds after the realm's route clock starts
  "snapBack": {
    "maxOffRouteM": 4,                            // further than this from the polyline…
    "maxDropM": 3,                                // …or falling more than this below the route height…
    "inWater": true,                              // …or ending up in water the route does not cross
    "graceS": 0.5,                                // for this long
    "to": "nearestPointAhead"                     // → put back on the nearest route point not behind its progress
  },
  "detour": null                                  // an event may set a temporary polyline (a washed-out bridge); the same rules apply to it
}
```

**Run on the server** (`js/sim/travel.js`): each vehicle holds `{ route, progress (metres along the
polyline), state: docked | running | waiting, riders[] }`. Position = the polyline at `progress`, so a
vehicle cannot drift by construction; physics (a cart bumped off a bridge by a knockback, a creature
path around a blocker) only offsets it, and the snap-back rule resets that offset. **Bus-style**: a
docked bus shows a countdown from the first boarding; it leaves at `busWaitS` or when `seats` are full;
a party boards together with one `travel board` from its leader (page 15 describes the online flow).
**Scheduled**: vehicles run on the route clock (`realm_state`); stations show the next arrival; you can
only board while it is docked. Riders are untargetable and ignore weather. On logout mid-ride the
character is saved at the next stop (§12.1 rule 8). The **client** is told the route id and `progress`
at 4 Hz and moves the vehicle along the same polyline itself.

Routes are baked by `tools/bake-routes.mjs` from `world/forced-roads.json` and hand-placed points,
using Farhold's road code (§14.2): `roadplan.js` (`resample`, `smoothPoints`, `gradeHeights`),
`road-fold.js` (switchbacks on steep climbs), `bridge-plan.js` + `ground.js` (deck heights, so a
route over a bridge sits on the deck), and `haulpath.js`'s A* for the parts between forced roads.
`travel.test.js` asserts: every route's polyline stays on ground or deck (the *water staircase* rule —
drawn vs measured agree), speed ≥ 2.5× walking, every stop's `point` is within 2 m of its station, and a
vehicle pushed 10 m off a bridge is back on its route within `graceS` + one tick.

### 13.9 Targeting state (page 02 owns the model) (new)

```jsonc
// runtime only — never saved (§12.1 rule 8)
"targeting": {
  "target": "e_48213",        // the hard target: an entity id, your own id (F1), a party member (F2–F5), or null
  "setBy": "tab",             // the last thing that set it (for debugging): tab | shiftTab | click | self | party | clear
  "tabOrder": ["e_48213", "e_48190", "e_48222"]    // client-side Tab order, nearest-in-front first; never sent
}
```

Rules (`js/rules/targeting.js`, pure):

1. **Only two things change `target`**: a `target` message from the player, or the target dying /
   despawning / leaving 150 m (then it becomes `null`, reason `died` or `gone`). Nothing else — not a
   closer enemy, not whoever hit you last, not an Auto-target cast unless the setting below is on.
2. Spell targeting kinds (`spells/<class>.json` `targeting`): `needs` (refused without a valid target of
   the right side — heals and buffs need a friendly one), `auto`, `ground`, `self`, `ally`.
3. `autoTarget(candidates, aim, spell)` for an `auto` spell with no valid hard target: filter to valid
   targets within the spell's range and line of sight, then pick the one **closest to the aim point**
   (the ground point under the reticle, or the closest approach of the aim ray), ties broken by distance
   from the caster. If `set.combat.autoTargetSetsTarget` (page 04) is on, it becomes the hard target.
4. Tab order: enemies within 40 m inside a 90° cone in front of the camera, nearest first; Tab walks it,
   Shift+Tab walks back.

**Reuse**: Farhold's uncommitted `js/targetpick.js` (round 28) is the geometry to copy for "what the
reticle is on" — `lookedAt(enemies, ray)` (inside the body's silhouette wins, else the smallest angle
within `LOOK_SLACK`), `bodyCentreY`, `bodyRadius`. Wildmarch uses `lookedAt` for **click targeting and
the Auto-target aim point only**. Its `chooseTarget` stickiness (look > recently looked > last struck >
facing guess) is the Farhold model canon W8 rejects, so it is **not** reused: the target frame shows
the hard target and nothing else. `targeting.test.js` asserts the target never changes across 10,000
ticks of a scripted fight where closer enemies spawn and other enemies hit the player.

### 13.10 Depth — `data/depth.json` (page 12 owns the numbers) (new)

```jsonc
{
  "_doc": "Depth: a dial on any dungeon cleared on Normal. No timer, no keys.",
  "unlock": { "needs": "normalClear" },          // per dungeon; the Finder offers Depth 1..(highest cleared + 1)
  "level": { "perDepth": 3, "cap": 60 },         // dungeon level = min(60, band top + 3 × depth)
  "past60": {                                    // once the dungeon level hits 60, each further depth:
    "hp": 1.12, "damage": 1.08,                  // multiplied per depth past the one that reached 60
    "packSize": 0.05                             // +5% monsters per pack per depth, rounded per pack
  },
  "tierEvery": 5,                                // depth 5, 10, 15… each adds a tier
  "tiers": [
    { "tier": 1, "addPacks": true, "newTypes": ["m_rift_…"], "abilities": ["a_…"], "modifiers": 1, "srChance": 1.5, "rewards": { "rarity": 0.10, "jewel": 0.02, "soul": 0.001 } },
    { "tier": 2, "modifiers": 2, "srChance": 2.0, "rewards": { "rarity": 0.20, "jewel": 0.04, "soul": 0.002 } }
  ],
  "modifiers": [                                 // our own, tied to the Tear (canon W3); rolled per run, shown on the Finder card
    { "id": "dm_tear_pressure", "name": "Tear Pressure", "does": "void zones last 50% longer" },
    { "id": "dm_restless",      "name": "Restless Dead", "does": "slain undead rise once at 30% health" },
    { "id": "dm_split_sky",     "name": "Split Sky",     "does": "every 45 s a storm line crosses the room" }
  ]
}
```

The run's `{ dungeon, difficulty, depth, modifiers }` is fixed when the instance is made (§11). Clearing
a Depth writes `character.depth[dungeon]` (§12.2).

---

## 14. Client modules and the reuse map

### 14.1 Folder layout

```
prototypes/wildmarch/
  index.html              title/login/character select → game (one page)
  css/*.css               standalone stylesheets (no inline styles except dynamic values)
  js/boot.js              reads URL options, picks transport, starts screens
  js/rules/               SHARED, pure (§5) — run by server, worker and client
  js/sim/                 SERVER simulation (pure too, so the worker can run it)
  js/net/                 transports, clock, prediction, interpolation
  js/render/              three.js: world, bodies, telegraphs, effects, nameplates
  js/ui/                  screens, HUD, chat, tooltips
  js/audio/               sound map, voices, speech
  js/offline/             local-server worker entry + IndexedDB saves
  data/                   §13
  server/                 Node-only: main.mjs, gateway, db, migrations, deploy scripts
  tools/                  bake-region, bake-routes, validate-data, sim-wildmarch, bot-client, build-reserved-names
  tests/                  node tests (*.test.js) and Playwright specs (*.spec.js)
```

### 14.2 The reuse map

"Import" means import from its playground path with a relative URL. "Copy" means copy into
`js/rules/` because it needs Wildmarch changes that must not reach Farhold/Emberveil (which share the
originals — changing them there is forbidden by canon pillar 7 only when it would break them; small
additive, opt-in changes to shared modules are fine and preferred, as the playground has always done).
When Wildmarch graduates to its own repo, every "import" becomes a copy (Farhold's README "What it
reuses" note).

**Rules and data (pure — run on server and client)**

| Path | What for | Import/copy | Changes needed |
|---|---|---|---|
| `prototypes/farhold/js/rpg.js` | Stats, XP, levels, equipment, damage, loot rolls | Copy → `js/rules/rpg.js` | cap 60 on canon's smooth XP curve `600 × 1.107^(L−1)` (page 07) — it **replaces** Farhold's stretched `setLevelCap` curve (00 §4); spell ladder 1/4/10/18/28/40; canon rarities (7) instead of Emberveil's 4 names (page 08 maps them); remove planet bands; `gearLook` stays client-side |
| `prototypes/farhold/js/skills.js` | Skill bar engine: cooldowns, costs, plans, statuses (`applyStatus`, `tickStatuses`, `slowOf`, `buffsOf`, `outgoingFrom`, `incomingFrom`) | Copy → `js/rules/skills.js` | Six slots on the canon ladder; new shapes (cone, line, ring, ground target, charge, channel, cast time, interruptible); per-class resources Mana / Momentum / Tempo + class mechanic state; `tags` on every plan (§13.1); Needs target / Auto-target / Ground / Self (§13.9); **keep one owner for every multiplier** (R22's squared spell power) — a test asserts `spellPower` appears in exactly one function |
| `prototypes/farhold/js/skilltalents.js` | Per-spell talent trees folded into the plan | Copy | Tiers at 12/22/32/45 (canon), 2–3 choices, ids `<spellid>_t<tier><a|b|c>` |
| `prototypes/farhold/js/perks.js` | The perk forest | Copy | One point per level from 2 (59 total, canon); node set per page 07; "Kept Company" arm becomes follower power (page 15 §21.2) |
| `prototypes/farhold/js/affixes.js` | Affix units, floors, caps, slot rules, item levels, tiers | Copy | Item level 1–60 only (canon: no item level above 60); `tag_dmg:*` stat keys (§13.1); `mf_` stats (§13.6) |
| `prototypes/farhold/js/effects.js` | Every affix stat and legendary power as real-time hooks | Copy | Wildmarch legendaries/uniques added; keep the "nothing is inert" test |
| `prototypes/farhold/js/uniques.js` + `data/uniques.json` + `tools/build-uniques.mjs` | Uniques and their powers | Copy | Ids `uq_…`; the "every unique's power ran twice" test (R23) comes too |
| `prototypes/farhold/js/weapons.js` | Weapon patterns (swing sequences), dual wield, two-handers, staves, wands | Copy | Keep `WEAPON_TRAITS`; every basic attack gets `tag_basic` + its delivery tag (§13.1). Harvesting uses the tool slot (`tools.js`), not the weapon |
| `prototypes/farhold/js/combat-feel.js` | Hit-stop, shake, knockback, stagger with diminishing returns | Import (pure) | Server uses knockback/stagger numbers; client uses the feel |
| `prototypes/farhold/js/gear.js` | Mounts and quivers as items | Copy | **Drop lights** (no light slot, canon §4) and boats/ships; mounts from `mounts.json`; quivers keep R10's "they add damage, not armour" rule and move to `items/quivers.json` (§13.5) |
| `prototypes/farhold/js/foci.js` | Caster off-hand foci + set; **the model quivers are built on** (a base table + `installFoci`-style injection at load, balanced as off-hand damage stat-sticks) | Import (foci) + pattern (quivers) | Foci and quivers both give tag bonuses (§13.1) |
| `prototypes/farhold/js/followers.js` + `hire.js` + `data/mercenaries.json` | Follower rules, slots, scaling, broker board | Copy | Page 15 §21: party-slot followers, follower slots at 8/15/25/35 (page 07; 00 §10), hero kind, finder hire |
| `prototypes/farhold/js/questrewards.js` | One payer for every turn-in path | Copy | Wildmarch reward kinds |
| `prototypes/farhold/js/quests.js` | Job model | Copy (partial) | Remove `planet.js` import; quest kinds per page 14 |
| `prototypes/farhold/js/factions.js` + `data/factions.json` | Standing that spreads to rivals at a third (`RIVAL_SHARE`), bands, `createStandings`, `ranked` | Import | Seven `fac_` player factions with chapters (canon 00 §12.2); `holderFor` (zone holders) is not used — regions have fixed holders; `mf_rep` multiplies gains in exactly one place |
| `prototypes/farhold/js/tools.js` + `data/tools.json` | The **tool slot**: `makeTool`, `toolTierOf`, `toolSpeed`, `toolYield`, `toolReach`, `canWork`, `createGathering`, `WORK_CLIPS` (dig/chop/forage animations) | Copy | Harvesting (§13.7): tool kinds pick/knife/sickle/axe/rod; skill check added to `canWork`; drop `buildable`, the scanner (`createScanner`, `SCANNER_DEVICES`) and the held-mode wheel (`HELD_MODES` — removed in Farhold R25 too) |
| `prototypes/farhold/js/harvestinfo.js`, `props.js` (harvest ledger only) | Gather bar text, felled/cleared ledger | Pattern | Per-player node taps (§13.7) |
| `prototypes/farhold/js/targetpick.js` (round 28, uncommitted) | `lookedAt`, `bodyCentreY`, `bodyRadius` — which body the reticle is really on | Copy (those three) | Click targeting and the Auto-target aim point only; `chooseTarget`'s sticky fallback is **not** reused (§13.9) |
| `prototypes/farhold/js/roadplan.js`, `road-fold.js`, `bridge-plan.js`, `ground.js`, `haulpath.js` | Road lanes (`resample`, `smoothPoints`, `gradeHeights`, `planLane`, `ROAD_RANK`), switchbacks (`foldClimbs`), bridge decks, one ground answer (`groundAt`, `deckAt`, `wetAt`), A* over terrain | Copy | Baking Travel Method routes (`tools/bake-routes.mjs`, §13.8) and the server's route/ground answer. `haulpath.js` loses its haul-throughput half |
| `prototypes/farhold/js/retrain.js` | The Unbinder (take back a spell/perk/talent for gold) | Copy | Page 07 decides whether retraining costs gold |
| `prototypes/farhold/js/dungeon-plan.js` | Room/corridor layout, pure | Import | Only for procedural filler rooms; bosses are hand-placed |
| `prototypes/farhold/js/zones.js` | Level bands | — | Not reused: bands are canon data now |
| `prototypes/farhold/js/warbands.js` + `data/warbands.json` | Enemy warbands of the non-playable races | Copy | Orc/Goblin/Giant/Undead/Beastkin per canon; zone grip mechanics optional |
| `prototypes/farhold/js/save.js` | Save shape and restore | Pattern only | Replaced by `js/rules/save-schema.js` (§12.1) |
| `prototypes/emberveil/js/loot.js` + `data/items.json` + `js/rng.js` | Item generator, bases, affixes, uniques, sets; seeded rng | Import at first, copy at graduation | `price()` ignores an item's own `basePrice` (Farhold R10 note) — use Farhold's `rpg.price()` |
| `prototypes/emberveil/data/class-looks.json` | Thirty class looks | Import | Dressed by class outfits (below) |
| `shared/format.js` | One number formatter (`fmt`, `hp`, `pct`, `sign`, `range`, `secs`) | Import | — |
| `lingo/js/lingo.js`, `memory.js`, `relations.js`, `context.js` | NPC and follower speech, memories, feelings, scenes | Import | Server runs `lingo.speak` to pick lines; Wildmarch vocabulary pack |
| `conversations/js/conversations.js` | Follower camp talk | Import | Wildmarch topic pack |
| `namegen/js/namegen.js` | Names for generated NPCs, mercenaries, rare elites | Import | Story NPCs are hand-named (page 01) |
| `worldgen/js/weather.js` | Weather states and clock from climate | Import | Realm-seeded clock per region; weather only — the sky has no time of day |
| `worldgen/js/noise.js` | Noise for region baking | Import (tools) | — |
| `avatar-3d/js/creature-types.js`, `chibi2-races.js`, `class-outfits.js` | Body plan table, race parameters, class outfits — all Three.js-free | Import | — |
| `meters/js/meter.js` | Combat record + reports (every hit/heal/absorb/status/death, drill-down by source and target) — as used in Emberveil 2 | Import | Fed from server `dmg` events; one record per dungeon fight, per world-boss fight and per run (canon W16) |

**Client only (Three.js / DOM / audio)**

| Path | What for | Import/copy | Changes needed |
|---|---|---|---|
| `vendor/three/` | Renderer | Import (import map) | — |
| `avatar-3d/js/chibi2.js` (+ `chibi2-body/face/hats/gear/geometry/motion/weapons/weapon-ids.js`) | Every humanoid: players, NPCs, humanoid enemies | Import | **LOD** (a lower-detail body past 40 m) and a cheap far stand-in do not exist yet (CHIBI2.md "no LOD system") — new work, page 17 §7 |
| `avatar-3d/js/creatures.js` | Beasts, druid/dragon forms, mounts | Import | New body plans only if page 10 needs them |
| `avatar-3d/js/spellfx.js` + `spellfx-batched.js` | All spell effects and status auras | Import | `warm()` at load; lights never toggled (memory note *shader recompile stutter*) |
| `avatar-3d/js/vehicles.js` | Travel Method models: hand cart, covered wagon, ox cart, closed coach… with creature bodies in the shafts, `metrics()` for seat points | Import | New models for barge, rail car and flyer saddles (page 17); seat points for up to 30 riders |
| `assets/js/assets.js` + `assets/data/fx/*.svg` + `assets/data/ui/` | FX sprites, UI art | Import | New UI art for Wildmarch |
| `prototypes/farhold/js/actors.js` | One interface over Chibi 2 + creatures; `setActorAnim` | Copy (view half) | Split: AI/threat/`EnemyField` move to `js/sim/` (pure); bodies stay in `js/render/actors.js` |
| `prototypes/farhold/js/mesh-merge.js` | Fold a creature into one skinned mesh per material (1,377 → 86 meshes) | Import | — |
| `prototypes/farhold/js/figure3d.js` | Character on the title / select screen | Copy | Realm/character-select layout |
| `prototypes/farhold/js/appearance.js`, `bodypresets.js`, `classwear.js`, `titlelook.js` | Appearance editor, race presets, class starting look | Copy | Canon four races |
| `prototypes/farhold/js/combat-fx.js` | Swing arcs, arrows, impact puffs | Copy | Server-driven |
| `prototypes/farhold/js/light.js`, `nightlights.js` | — | **Not reused** | Always daylight: no carried light, no night. Only the rule survives — fixed glow lights (cave fungi, lava) are pooled, always visible, unused at intensity 0 (memory note *shader recompile stutter*) |
| `prototypes/farhold/js/graphics.js`, `gfx.js`, `postfx.js`, `wind.js`, `rain.js`, `atmosphere.js`, `sky-palette.js`, `grass-gpu.js`, `grass-plan.js` | The picture pipeline: HDR, bloom, shafts, grade, wind, GPU rain/grass, height fog | Copy | Region terrain instead of a planet; presets from `graphics.json`; `sky-palette.js` gives each region one fixed sun position and grade (no day cycle); film-set-dark grades for graveyards and crypts (page 17) |
| `highdef-3d/js/materials.js` (`enhance`), `sky.js`, `terrain.js`, `water.js`, `grass.js`, `vegetation.js`, `scatter.js`, `kit/trees.js`, `kit/rocks.js`, `kit/textures.js`, `quality.js`, `data/vegetation.json` | Region look: CSM shadows, physical sky + probe, splatted terrain, water, forest, rocks | Copy | Region heightmap input (§11); geometry contract kept |
| `prototypes/farhold/js/sound.js` | When to ask the Sound Lab for what | Copy | Region beds from `sound-map.json`; 3D positions |
| `sfx/js/sfx.js`, `loudness.js`, `methods/*`, `data/catalog.json` | Sound effects | Import | New ids (page 17 §8.2); a `voice` and a `music` bus (page 17) — additive change to `sfx.js` |
| `prototypes/farhold/js/speech.js` | NPC personality + voice | Copy | Server-chosen lines |
| `voice-lab/js/formant-voice.js`, `voice.js` | The voice engine | Import | — |
| `shared/voices.js` | `voiceFor({ role, gender, seed })` — has all 30 classes | Import | Race deltas (page 17 §8.4) — additive |
| `shared/langdebug.js` | Click words to fix pronunciations (dev) | Import | Behind a debug setting |
| `shared/tooltip.js` + `.css` | Tooltips | Import | — |
| `shared/rewards.js` + `.css` | Reward popup, opt-in chooser | Import | — |
| `shared/store.js` | Namespaced localStorage | Import | Client settings only |
| `meters/js/meter-ui.js` | Damage meter UI | Import | Themed CSS |
| `prototypes/farhold/js/hud.js`, `map.js`, `talkui.js`, `settings.js` | HUD, map, talk panel, settings with capture-phase rebinding | Copy **parts** | Rewritten around the server; keep `patch()`-style keyed updates and the binding-table guard test |
| `prototypes/farhold/js/markers.js` | Quest/story/pin markers | Copy | Region ids instead of planet ids; Travel Method stations as pins |
| `prototypes/farhold/js/waylight.js` | A column of light over the objective | Copy | — |
| `prototypes/farhold/js/spellshapes.js`, `spellcard.js` | Spell shape glyph + caption from one table | Import | New shapes (cone, line, ring…) |
| `library/js/library.js` | Dev: sync blueprints to Claude | Import (dev only) | — |
| `tools/serve.py`, `tools/preload-modules.py` | Dev server; modulepreload tags | Use | Re-run preload after adding a module; **skip `.json`** |

**Not reused** (canon drops them): `planet.js`, `terrain.js` (clipmap rings), `sky.js` (star system),
`space.js`, `atmos.js`, `warp.js`, `starchart.js`, everything under building/industry/colony
(`build*.js`, `stores.js`, `power.js`, `refine.js`, `mining.js` (the seam/ore art may be borrowed for
harvest nodes, page 17), `resources.js`, `colony.js`, `civics*.js`, `farm.js`, `terraform.js`,
`logistics.js`, `research*.js`, `shipyard.js`, Farhold's garage `vehicles.js`, `boat.js`), `raid.js`
(Farhold's base raids — nothing to do with group raids), `light.js`, `nightlights.js`, `universe/`, `proctown/` (towns are hand-made; `proctown/js/buildkit.js` may
be used for **house models** only).

### 14.3 New modules

| Path | What it does | Server | Client |
|---|---|---|---|
| `js/rules/protocol.js` | Message types and their fields (§9) | ✓ | ✓ |
| `js/rules/save-schema.js` | `SAVE_FIELDS`, `snapshot`, `restore`, `migrate` | ✓ | ✓ (offline) |
| `js/rules/telegraph.js` | Shapes, "is point inside", fill timing, the page 11 vocabulary | ✓ | ✓ |
| `js/rules/spellbook.js` | Loads `spells/<class>.json`, builds the six-slot ladder, class resources (Mana / Momentum / Tempo) | ✓ | ✓ |
| `js/rules/tags.js` | Tag matching and `bonusFor(sourceTags, stats)` (§13.1) | ✓ | ✓ (tooltips) |
| `js/rules/sockets.js` | Which socketable fits which socket; a gem's effect by host group; gadget stat choice (§13.2) | ✓ | ✓ |
| `js/rules/special-rarity.js` | Rolling an `sr_` and applying its effect; Living growth (§13.3) | ✓ | ✓ |
| `js/rules/monster-rarity.js` | Champion/rare/greater rolls, exclusion groups, dungeon slots (§13.4) | ✓ | — |
| `js/rules/magic-find.js` | Summing, diminishing and capping `mf_` stats (§13.6) | ✓ | ✓ (sheet) |
| `js/rules/professions.js` | Harvesting skill, tool check, recipes, skill-up chance (§13.7) | ✓ | ✓ |
| `js/rules/targeting.js` | The hard-target rules and `autoTarget` (§13.9) | ✓ | ✓ (prediction, Tab order) |
| `js/rules/depth.js` | Dungeon level and multipliers from Depth; tier content (§13.10) | ✓ | ✓ (Finder card) |
| `js/rules/mechanics/<class>.js` | The 30 class mechanics (page 06) | ✓ | ✓ |
| `js/rules/threat.js` | Threat table (page 05); the tank's **Provoke** | ✓ | — |
| `js/rules/unlocks.js` | The feature ladder | ✓ | ✓ |
| `js/rules/names.js` | Name rules (page 15 §19) | ✓ | ✓ (instant feedback) |
| `js/sim/world.js` | Realm: regions, layers, weather, the route clock | ✓ | — |
| `js/sim/layer.js` | One region copy: entities, cells, tick | ✓ | — |
| `js/sim/aoi.js` | Interest management (§8) | ✓ | — |
| `js/sim/movement.js` | Movement validation, collision, ground from the baked heightmap | ✓ | ✓ (prediction) |
| `js/sim/nav.js` | A* on the 2 m nav grid (Farhold `haulpath.js` pattern) | ✓ | — |
| `js/sim/mob-ai.js` | Mob behaviour | ✓ | — |
| `js/sim/boss.js` | Boss scripts from `bosses/*.json`: phases, abilities, dialog, opportunities, enrage | ✓ | — |
| `js/sim/combat.js` | Cast validation, hit resolution, lag compensation (§10) | ✓ | — |
| `js/sim/follower-ai.js` | Page 15 §21.7 | ✓ | — |
| `js/sim/party.js`, `finder.js`, `guild.js`, `chat.js`, `trade.js`, `market.js`, `mail.js`, `duel.js`, `social.js` | Page 15 systems | ✓ | — |
| `js/sim/travel.js` | Travel Method vehicles, stations, bus waits, schedules, snap-back (§13.8) | ✓ | — |
| `js/sim/harvest.js` | Node state, per-player taps, respawns (§13.7) | ✓ | — |
| `js/sim/instance.js`, `lootlimits.js` | Instances (difficulty + Depth fixed at creation) and the Monday 06:00 weekly loot limit for Challenge and world bosses | ✓ | — |
| `js/sim/quests.js`, `events.js`, `phase.js` | Page 14 + phasing | ✓ | — |
| `js/sim/loot.js` | Drop tables → items (wraps rules/rpg) | ✓ | — |
| `js/net/transport.js` | `LocalTransport` (worker) and `SocketTransport` (WebSocket), same interface | — | ✓ |
| `js/net/clock.js`, `predict.js`, `interp.js` | Clock sync, own-character prediction + replay, entity interpolation | — | ✓ |
| `js/render/region.js` | Load a region's baked files; terrain, water, scatter, grass via highdef modules | — | ✓ |
| `js/render/telegraphs.js` | Ground decals for page 11 shapes and colours (page 17 §4.3) | — | ✓ |
| `js/render/nameplates.js`, `floaters.js` | Names, health bars, cast bars, damage numbers; monster-rarity name colours and greater-rarity badges (§13.4) | — | ✓ |
| `js/render/item-portrait.js` | The item card's 3D portrait: a small offscreen scene rendered once per item look and cached (page 17 owns the setup) | — | ✓ |
| `js/render/travel.js` | Moves a Travel Method vehicle along its polyline from `progress` | — | ✓ |
| `js/render/lod.js` | Body detail levels and far stand-ins | — | ✓ |
| `js/ui/*` | Every `scr_*` of page 03 | — | ✓ |
| `js/audio/soundmap.js`, `voices.js` | `sound-map.json` → sfx; voice JSON per NPC/boss/player | — | ✓ |
| `js/offline/local-server.js` | Worker entry: builds `js/sim/world.js` with an IndexedDB store | worker | — |
| `server/main.mjs`, `gateway.mjs`, `db.mjs`, `auth.mjs`, `migrate.mjs` | Node entry, sign-in check (Supabase JWT), database | ✓ | — |
| `tools/bake-region.mjs`, `bake-routes.mjs`, `validate-data.mjs`, `build-reserved-names.mjs`, `sim-wildmarch.mjs`, `bot-client.mjs` | §11, §13, §13.8, §16 | node | — |

---

## 15. Offline single-player first

### 15.1 How it works

- `js/net/transport.js` exports one interface: `connect()`, `send(msg)`, `onMessage(fn)`, `close()`,
  `stats()`.
- **`LocalTransport`** starts `new Worker('js/offline/local-server.js', { type: 'module' })`. The worker
  imports `js/sim/world.js` and the `js/rules/` modules — **the same files the Node server runs** —
  loads data with `fetch`, keeps saves in **IndexedDB** (§12.4) and ticks at 20 Hz. Messages go through
  `postMessage` as the same JSON the WebSocket would carry.
- **`SocketTransport`** opens `wss://…` and does the same.
- `boot.js` picks: `?offline=1` or "Play offline" on `scr_login` → Local; otherwise → Socket.
- **A lag simulator** lives in `LocalTransport`: `?lag=120&jitter=30&loss=0.02` delays each message by
  120 ± 30 ms and drops 2%. Prediction, interpolation and telegraph compensation are therefore built and
  tested **before** a real network exists.
- Offline mode includes **followers** (page 15 §21) so the whole solo game — open world and Normal
  dungeons — is playable with no server. Social systems show "Online only" in offline mode.
- The dev server's inbox (`POST /api/inbox/<name>`, `tools/serve.py`) can receive an offline save or a
  bug report so Claude can read it.

### 15.2 Why first, and the recommended order

1. It forces the **split** (rules / sim / render) on day one, which is the hard part of any online game
   and much harder to retrofit.
2. It makes the **vertical slice** (page 18 M0–M8) playable by the owner on the stable server (8400) and
   on GitHub Pages with no hosting cost.
3. The **sim bot** (§16.3) and the Node server both get the sim for free.
4. When networking starts (page 18 M9), the work is the transport, the gateway, the database and the
   social systems — not a rewrite.

**Order**: offline slice (Local only) → Node server on the dev VM speaking the same protocol (Socket, one
player) → two players → accounts + Postgres → public test realm. Page 18 has the milestones.

---

## 16. Testing plan

Commands (added to the playground's `package.json` `test:unit` list and Playwright config):

```bash
node --test prototypes/wildmarch/tests/*.test.js          # rules, data, sim, protocol, saves
npx playwright test prototypes/wildmarch                   # the page, against DEV (8401)
node prototypes/wildmarch/tools/sim-wildmarch.mjs --runs 100 --out research/sim-report.md
node prototypes/wildmarch/tools/bot-client.mjs --bots 200 --url ws://localhost:8470
```

### 16.1 Node unit tests (no browser)

| Test file | What it asserts |
|---|---|
| `purity.test.js` | Nothing in `js/rules/` or `js/sim/` mentions `three`, `document`, `window`, `localStorage`, `fetch(` or `Math.random` |
| `filenames.test.js` | No served file name matches `beacon|analytics|track|pixel|telemetry|ads` |
| `data.test.js` | Every data file matches its shape (§13); every id follows the brief's conventions; every reference resolves (a spell's status exists, a loot table's item exists, a quest's giver exists) |
| `dead-data.test.js` | For each knob in `balance.json`, `mechanics.json`, `graphics.json`: set an odd value, call the real module, assert the output moved; restore (memory note) |
| `one-owner.test.js` | Named multipliers (`spellPower`, `STATUS_POWER_SHARE`, follower `perLevel`) are applied in exactly one function; follower `perLevel` equals enemy `perLevel` |
| `save-roundtrip.test.js` | Every field in `SAVE_FIELDS` survives snapshot → JSON → restore with odd values; no live field missing from `SAVE_FIELDS` (§12.1) |
| `protocol.test.js` | Every message type sent or handled is in `protocol.js` with its fields |
| `ladder.test.js` | Spell slots open exactly at 1/4/10/18/28/40, talents at 12/22/32/45, callings at 6/20/40, cap 60, perk points 59 — read from canon data, not typed into the test |
| `classes.test.js` | 30 classes; 6 spells each; **no spell id, name or effect shared between two classes** (canon §5); every spell has fx element + shape + sound |
| `telegraph.test.js` | Every shape's "inside" test; warning ≥ page 11 minimums for every ability in data; favour-the-dodger allowance |
| `ground-agrees.test.js` | Client terrain mesh height, server movement height and water depth agree at 1,000 sample points per region to 5 cm (the *water staircase* rule) |
| `loot-sources.test.js` | Every item has at least one source (canon rule 4) |
| `names.test.js` | Page 15 §19 rules, look-alike swaps, reserved list |
| `market.test.js`, `trade.test.js`, `mail.test.js`, `guildbank.test.js` | Two actors racing for the same item: exactly one wins; gold is conserved |
| `followers.test.js` | Limit ladder; scaling; the 75% cap; followers obey every telegraph kind in a scripted room |
| `bindings.test.js` | Every key the code listens for is in `bindings.json` (Farhold R17 guard) |
| `tags.test.js` | Every spell has ≥ 1 tag and every tag exists; `bonusFor` needs **all** tags (Area-only spell gets nothing from an Area + Spell bonus); DoTs and projectiles inherit their skill's tags |
| `sockets.test.js` | A gem gives the armour, weapon or jewellery effect by host; a socket refuses the wrong kind; a soul's `requires` is enforced; gadget stat picks ≤ `choose` |
| `special-rarity.test.js` | Each `sr_` does its one thing (Twinned ≥ single roll, Ancient 10–20% over max, Starwoven +1 affix past max, Living grows by `steps`) and never lands below `minRarity` |
| `monster-rarity.test.js` | 100,000 open-world rolls: never two greater rarities from one exclusion group; dungeon `raritySlots` place exactly `pick` packs |
| `magic-find.test.js` | Each `mf_` stat moves exactly its reader (move the knob to an odd value, memory note *testing dead data rules*) and respects its cap |
| `professions.test.js` | One crafting profession per character; `canWork` needs the right tool kind, tier and skill; every recipe's inputs are obtainable (Farhold R13 rule: a cost you cannot obtain is a wall) |
| `travel.test.js` | §13.8's route checks and snap-back |
| `targeting.test.js` | §13.9: the target never changes by itself; `autoTarget` picks nearest to the aim point; `needs` spells refuse without a target |
| `depth.test.js` | Level +3 per depth to 60; multipliers only past 60; a tier every 5 |
| `wording.test.js` | Player-facing text has no stray `{`, no "NaN", no "undefined", numbers go through `shared/format.js` (Farhold `WORDING.md`) |

### 16.2 Playwright (real browser, against 8401)

| Spec | What it plays |
|---|---|
| `boot.spec.js` | Title → offline → create character (each of 4 races) → world loads with no console errors (shader compile failures log without throwing — fail on any console error, `highdef-3d` rule) |
| `classes.spec.js` | Each of the 30 classes boots and casts spell 1 on a dummy |
| `telegraph.spec.js` | A test boss casts each telegraph kind; the decal appears, fills, resolves; standing in hurts, leaving does not |
| `lag.spec.js` | With `?lag=150&jitter=40`, a dodge pressed 100 ms before the fill ends (on screen) is safe |
| `travel.spec.js` | Board a bus-style wagon, wait out the countdown, ride to the next stop; knock the wagon off a bridge in a debug scene and see it snap back |
| `itemcard.spec.js` | Hover an item of each rarity and each special rarity: the 3D portrait draws, the frame matches `cardFrame`, the `sr_` icon is an SVG, not text |
| `dungeon.spec.js` | d01 with 4 **finder hires** (page 15 §7.4 — a character's own follower slots only open at level 8, page 07), bot-driven, reaches the last boss (slice acceptance) |
| `screens.spec.js` | Opens every `scr_*` from `screens.json` and closes it |
| `stutter.spec.js` | Counts `linkProgram` calls during 30 s of combat after warm-up: **0** (Farhold `hit-stutter.spec.js`) |
| `budget.spec.js` | Draw calls and triangles in three scenes (open field, town with 40 bots, a world boss with 40 bots) under §17's numbers at `?quality=low` (the Low preset) and High |
| `save.spec.js` | Play, reload, same place, same bags, same quests |
| `social.spec.js` (online stage) | Two browser contexts: party, chat, trade, mail through a local Node server |

Rules from the memory notes: **A/B a red spec against stable first** (most reds are older than the change);
**never run two Playwright suites at once** on this 10 GB machine; fix standing failures so the suite
stays read.

### 16.3 The headless bot sim

`tools/sim-wildmarch.mjs` (Farhold `tools/sim-farhold.mjs` pattern): the real `js/sim/` with no renderer.
A bot per class plays **levels 1–60** (quests, kills, spends points by a fixed priority, re-equips, runs
each Normal dungeon with followers, runs Challenge mode and Depth 1–20 with 4 bot players). Reports, per class and overall:
time to each level (target curve owned by page 07), deaths and what killed them, dungeon clear time
solo-with-followers vs 5 bots (target ≤ 1.3×, page 15 §21.5), damage share by spell (flags any spell
over 2× its class average — Farhold round 22's tell, where one holy ground spell hit for 500 against a basic attack's 7), gold per hour, loot rarity mix, every boss's
wipe rate by mechanic, harvesting and crafting skill per hour, magic-find effect on drops (rarity mix with 0% vs capped `mf_rarity`). A **"perfect dodger"** bot and a **"sloppy"** bot (misses 20% of telegraphs) bound
the difficulty from both sides.

### 16.4 Network load test

`tools/bot-client.mjs` opens N WebSocket clients that log in (test accounts), walk, fight, chat and
trade. Targets: 200 bots in one layer at 20 Hz with tick time **≤ 25 ms**; 1,000 bots across one realm
process with tick **≤ 30 ms** and ≤ 24 KB/s per client (§8).

---

## 17. Performance budgets

### 17.1 Target machines

| Tier | Machine | Goal |
|---|---|---|
| Minimum | 4-year-old laptop, integrated graphics | 30 fps at 1280×720 on the **Low** preset |
| Recommended | Mid-range desktop graphics card | 60 fps at 1920×1080 on **High** |
| Owner | Strong card (Farhold note) | 60+ fps at High/Ultra |

### 17.2 Frame budget (16.6 ms at 60 fps)

| Work | Budget |
|---|---|
| Network + interpolation + prediction | 1.0 ms |
| Game logic on client (effects timers, UI state) | 1.5 ms |
| Animation (skinning mixers) | 2.0 ms |
| Scene traversal + draw submission | 5.0 ms |
| Post-processing | 2.5 ms (High) |
| UI (DOM updates, keyed `patch()` only) | 1.0 ms |
| Audio synthesis (formant lines are cached) | spread over frames, ≤ 1 ms |
| Slack | 2.6 ms |

### 17.3 Scene budgets (checked by `budget.spec.js`)

Columns are page 04 §7.2's graphics presets (Low / Medium / High / Ultra). Where page 04 already sets a
number (`playersDrawn`, `dynamicLights`) this table repeats it and page 04 wins.

| Number | Low | Medium | High | Ultra |
|---|---:|---:|---:|---:|
| Draw calls (open world) | 150 | 300 | 450 | 600 |
| Draw calls (town, 40 players) | 180 | 320 | 480 | 650 |
| Draw calls (world boss, 40 players + effects) | 200 | 350 | 500 | 700 |
| Triangles in view | 0.8 M | 2 M | 4 M | 6 M |
| Players drawn at all (page 04 `playersDrawn`) | 20 | 40 | 60 | 100 |
| …of which full detail (Chibi 2, ≤ 8,500 tris, 2 meshes each), nearest first | 8 | 15 | 30 | 40 |
| …the rest as LOD 1 (≤ 2,500 tris, 1 mesh) | 12 | 25 | 30 | 60 |
| Beyond `playersDrawn`: stand-ins (≤ 200 tris, instanced, 1 draw for all) + nameplate | rest | rest | rest | rest |
| Spell particles (`spellfx-batched` `maxParticles`) | 120 | 200 | 320 | 480 |
| Live effects (`maxLive`) | 16 | 24 | 36 | 48 |
| Shader programs compiled after load | **0** | **0** | **0** | **0** |
| Point lights (page 04 `dynamicLights`) — spell flashes and fixed cave glow (fungi, lava), never a carried light | 4 pooled | 8 pooled | 16 pooled | 32 pooled — always visible, unused at intensity 0 |
| JS heap | ≤ 700 MB | ≤ 900 MB | ≤ 1.2 GB | ≤ 1.5 GB |

The Chibi 2 benchmark (CHIBI2.md): 8 fighters with batched effects = 44 draw calls, 67k triangles. A body
is **2 meshes / ≤ 8,500 triangles**; the template cache shares geometry for identical avatars. Beasts go
through `mesh-merge.js` `compactCreature` (one or two draws each).

### 17.4 Load and server budgets

| Number | Budget |
|---|---|
| Cold load on LAN | ≤ 5 s to the title; ≤ 10 s to standing in Brightwater |
| Cold load on 20 Mbit/s | ≤ 15 s to the title |
| Download before the title | ≤ 4 MB gzipped (modulepreload of all modules — `tools/preload-modules.py`; formant dictionary 3.3 MB loads after the title) |
| One region's data | ≤ 6 MB (heightmap + masks + scatter rules), cached |
| Server tick per layer (80 players, 300 mobs) | ≤ 8 ms |
| Server process (all layers) | ≤ 30 ms of each 50 ms tick at peak |
| Players per realm process | ~1,000–1,500 on a 4 vCPU machine (to be measured by §16.4, not assumed) |
| Database writes | ≤ 50 per second per realm at peak (60 s dirty flush + important events) |

---

## 18. Dev/stable servers and deploy

### 18.1 While Wildmarch lives in the playground

| Port | What | Moves when |
|---|---|---|
| **8400** | STABLE static client (`~/claude/playground-stable`) — **the link to give the owner** | `tools/publish-stable.sh` (refuses unless every `.js` parses and unit tests pass) |
| **8401** | DEV static client (live tree) — Playwright runs here | Every save |
| **8470** (new) | DEV Wildmarch Node server (`node prototypes/wildmarch/server/main.mjs --port 8470`) | Restarted by a watch script on server file changes |
| **8471** (new) | STABLE Wildmarch Node server, run from the stable worktree | Restarted by `publish-stable.sh` (a small addition: if `prototypes/wildmarch/server/` changed, restart 8471) |

- The client picks its server from `config.json` beside `index.html` (`{ "server": "ws://<host>:8471" }`
  on stable, `8470` on dev), with `?server=` to override. Offline mode needs neither.
- LAN link format for the owner: `http://<LAN-IP>:8400/prototypes/wildmarch/` (IP from
  `hostname -I | awk '{print $1}'`).
- After adding or removing a module: `python3 tools/preload-modules.py prototypes/wildmarch/index.html`.
- **GitHub Pages**: `tools/publish-pages.sh` already publishes the stable tree to
  `https://radgh.github.io/Game-Playground/` — so the **offline** Wildmarch is publicly playable with no
  server as soon as the slice is on stable. Pages cannot run the Node server.

### 18.2 When it goes online (and later graduates to its own repo)

| Environment | Client | Server | Database |
|---|---|---|---|
| dev | This VM, 8401 | This VM, 8470 | Local Postgres or a free Supabase project |
| staging | Cloudflare Pages preview or GitHub Pages branch | VPS, `staging` service on port 8480 behind Cloudflare | Supabase project "wildmarch-staging" |
| production | Cloudflare Pages (or GitHub Pages) on the game's domain | VPS per region, `wildmarch@realm` service, behind Cloudflare (`wss://play.<domain>`) | Supabase Pro "wildmarch-prod" |

- **Deploy by GitHub Actions**: on a tag `v*`: run node tests → run Playwright against a started local
  server → build nothing (no build step) → copy `server/` + `js/rules/` + `js/sim/` + `data/` to the VPS
  over SSH (a deploy key in the repo's secrets, never in the tree) → `server/migrate.mjs` → restart the
  systemd service with a **30 s warning broadcast** to players ("The realm restarts in 30 seconds") and a
  graceful save of every online character before exit.
- **Client/server version**: the client sends `version`; a major mismatch refuses with "A new version is
  out — please reload". Static files get a version query (`?v=1.4.0`) on `boot.js` so browsers pick up a
  deploy.
- **Backups**: Supabase daily backups (Pro) + a nightly `pg_dump` to Amazon S3 kept 30 days (owner's stack).
- **Secrets**: Supabase service key and deploy key live in `~/claude/secrets/` on the dev VM and in the
  GitHub repository secrets; never committed, never logged (owner rule).
- **Monitoring**: the server writes one JSON line per minute (players online per layer, tick time p50/p95,
  messages/s, database write queue) to its log; a `/health` HTTP endpoint for Cloudflare health checks.

### 18.3 Security notes

- The client never holds the database service key. Row-level security denies client writes to all game
  tables.
- Every message is validated against `protocol.js` (types, lengths, number ranges) before the sim sees it.
- WebSocket origin check (only the game's own domains).
- Rate limit per connection (page 15 §17) and per account for sign-in attempts (Supabase).
- Chat text is shown with `textContent`, never `innerHTML` (no script injection through chat).

---

## 19. Open questions (to `QUESTIONS.md`)

1. Region borders: loading transitions at gates (recommended) or seamless?
2. Region size: 2,048 m square as a default — page 01 to confirm per region.
3. Allow importing an offline character to an online realm?
4. Server hosting provider (Hetzner-class vs DigitalOcean-class) and server regions (NA + EU at launch?).
5. Domain name for the game.
6. When Wildmarch graduates to its own repo (recommended: at the start of networking, page 18).
7. Travel Method routes that cross a region border: hand the vehicle between region layers (proposed,
   §11) or end every route at a border station?
8. Harvest nodes: personal taps (every player can harvest a node once per respawn, proposed §13.7) or
   first-come shared nodes?
