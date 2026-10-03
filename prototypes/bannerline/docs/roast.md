# Bannerline — Roast of plan v1

Written 2026-10-03 against `docs/plan-v1.md`, `docs/research.md` and the request in
`~/claude/agent/bannerline-checklist.md`. This page is meant to be harsh. Every reuse claim below was
checked by opening the file. Every number was run through a small script; the scripts are described
inline so they can be run again.

**Verdict in one line:** the shape is right, but the economy as written is broken, and the build
order means nothing is playable until milestone 9 of 13. The economy compounds without limit (the
best plan is "spam the cheapest pack unit forever"), every top-tier unit is worse than tier 1 on
every measure, and the counter table mostly decides nothing. The plan also promises reuse
that is really rewriting (skills, talents, uniques), and it builds the three hardest risky
things (lockstep, split screen, gamepad) last. Fix the economy on paper first, build a crude
playable slice second, and add the rest on top of that.

---

## 1. Fun

### 1.1 The economy has a dominant strategy, and it's the dullest one

I simulated plan v1 §3 as written: start with 150 gold and 20 income, spend everything every pay on
the best income-per-gold unit that's unlocked, with the plan's tax brackets and its repeat-buy
falloff (−10% per repeat inside 30 s, floor −50%). This is the raw income per pay:

| Minute | Freeholds | Ashtusk | Unburied | Thornmane |
|---|---|---|---|---|
| 1 | 78 | 65 | 67 | 77 |
| 3 | 294 | 210 | 217 | 324 |
| 5 | 860 | 567 | 603 | 969 |
| 8 | 3,348 | 1,970 | 2,126 | 3,788 |
| 10 | 7,768 | 4,141 | 4,513 | 8,641 |
| 15 | 60,357 | 24,379 | 26,640 | 63,086 |

Without the repeat falloff, Freeholds reaches **14 million per pay** by minute 15. The tax and the
falloff only slow down a curve that grows exponentially. They don't bend it. What that means:

- **Gold stops meaning anything by minute 6–8.** Unit costs are fixed (a Levy costs 12 gold
  forever), so by minute 8 one pay buys ~280 Levies. The field cap (120) is hit by about minute 4–5.
  After that the plan says sends "wait at the gate in a queue", so the queue grows without end and
  the match is decided by a gate that never closes.
- **A small difference in ratios becomes a huge difference in income.** Freeholds T1 returns 0.200 gold
  per gold each pay. Ashtusk T1 returns 0.167. Compounded, that becomes **2.5× the income by minute
  15**. Under compounding you can't balance races by giving them different ratios, which is exactly
  how §3.2 tries to give races identity.
- **Items can never compete with sends.** A send is an asset that pays back every pay. An item
  is a one-off buy. Under compounding, the right answer is always to send, and to buy items
  only out of bounty money. The genre's central tension ("every coin spent on income is a coin not
  spent defending", §1) disappears. That also hollows out the "real inventory", which is one of the
  user's headline asks.
- **The plan's open question 8 has the snowball wrong.** Leaking doesn't pay the attacker. Income is
  paid when a unit is *bought*. The real snowball is compounding income combined with linear
  defence (hero DPS 25 → 140 → 400 across 20 levels, §4.2).

### 1.2 Top tiers are worse than tier 1 at everything

Per gold, from the §4.2 tables:

| Unit | HP/gold | DPS/gold | Leak per 100 g | Income/gold |
|---|---|---|---|---|
| Freeholds Levy (T1) | 10.0 | 0.67 | 8.3 | 0.200 |
| Freeholds Golem (T5) | 8.8 | 0.19 | 1.7 | 0.077 |
| Freeholds Marshal (T6) | 7.8 | 0.17 | 0.9 | 0 |
| **Ashtusk Raiders ×2 (T1)** | **18.0** | **1.80** | **20.0** | 0.170 |
| Ashtusk Warchief (T6) | 7.9 | 0.22 | 1.0 | 0 |
| Thornmane Wolf Pair (T1) | 14.3 | 1.14 | 14.3 | 0.193 |
| Thornmane Packlord (T6) | 7.2 | 0.20 | 0.9 | 0 |

The research says top sends exist as "pure pressure that does not pay you back". Here they give
less pressure per gold *and* no income. A champion is dominated on every column. Its only use is
that a single big body ignores area damage. **Ashtusk Raiders are the best unit in the game on all
four columns.** 900 gold of Raiders is 90 bodies and 180 banners of leak, against 8 for the
Marshal. In a 30-banner game, cheap pack spam is the whole strategy.

**Fix:** pressure per gold must *rise* with tier to pay for the falling income. A T6 should carry
about 2–3× a T1's HP/gold and should leak about as much per gold. Leak value per body has to be
priced by cost, not set by tier while packs count each body (make it `leak = max(1, round(cost/40))`
per purchase, split across the pack).

### 1.3 Make sends limited by stock instead of compounding

The cleanest fix, and it also helps the gamepad and the AI: **every unit has a stock** (for example
T1: 6 charges, +1 every 8 s; T3: 3, +1 every 25 s; T6: 1, +1 every 90 s). This is how
the most successful standalone descendant of the genre stops spam. Income still rises with every
send, but the rate of rise is capped per minute, so income grows **linearly**. Leftover gold then goes to
items and upgrades, which makes the inventory matter. Races can differ by ratio by ±15% without
2.5× swings. The field cap stops being a band-aid, and the impostor system (§3.3) becomes
unnecessary because body counts stay bounded. **Spawn every send on the next Pay** as one wave per
sender. That makes the plan's own "gate preview of the next 10 s" (§3.1) actually possible, because as
written a send spawns instantly, so there's nothing to preview. It also gives the AI a clean
decision point and makes the pay ring the true heartbeat.

With stocks in place, the income tax and the repeat-buy falloff can both go. That's two fewer
rules to explain and two fewer things on the HUD.

### 1.4 Opening and early game

The starting 150 gold buys 12 Levies (1,440 HP, 96 total DPS). A level-1 Warrior (620 HP, 25 DPS)
caught by all 12 dies in about 6.5 s. Walking 140 m at 3 m/s takes about 47 s, and a lone hero
can't clear 1,440 HP in that time while being hit. So **minute-0 all-in sends leak 8–12 of 30
banners** in 1v1, before anyone has made a decision. Stocks fix this too: an opening cap of 6 T1s
is roughly one hero's worth. Separately, tune unit DPS against hero EHP, not just unit HP against
hero DPS. The plan only gives the second.

### 1.5 The counter table mostly decides nothing

- **Damage types on units are mostly unused data.** Units only ever hit heroes (armour `hero`,
  100% from everything), Druid wolves and Keep Guards. So the `siege` row and every unit's damage
  column hardly matter. Only the three hero rows (blade/pierce/arcane) do anything.
- **Two of the four heroes are arcane** (Pyromancer, Druid). Arcane averages 110% across the
  armours, blade 90%, pierce 94%. Spectral takes 150% from arcane, so **Unburied, who are mostly
  spectral, are hard-countered by half the roster**. Thornmane, who are mostly hide, take 75% from both
  arcane heroes. In 1v1, race-vs-hero is largely decided on the pick screen.
- **Fix that also gives the inventory a reason to exist:** let the hero's **chest item set the
  hero's armour class** (light/heavy/spectral-warded/hide). Then unit damage types matter: you
  send siege at a heavy-armoured Warrior and pierce at a light Ranger, and buying armour becomes a
  counter-move the enemy can see and answer. Give each hero a damage-type swap item in the shop
  from minute 0, so a bad matchup costs gold rather than the game.

### 1.6 One shared field per team

The plan is right about the problem (in 3v3, parallel 1v1s strand idle players and let a weak lane
drain shared lives) and wrong about the cure. A fully shared field brings in three new problems:

1. **The area-damage hero carries and everyone else watches.** With 3 heroes on one road and a
   Pyromancer laying Burning Line, the Ranger and the Warrior get last hits and little else.
2. **Kill-stealing.** Killing-blow bounty (§3.1) in a shared field turns teammates into rivals.
3. **No ownership, so no blame and no pride.** "Whose fault was that leak?" is part of what
   makes team games tense. Part of the fun is defending *your* gate against *your* rival.

**Recommendation:** keep one field per team, but give each gate's road its **own lane for the first
~60%**, with low walls the heroes can cross at two bridges, merging only in the last 40% before the
Keep. Your counterpart's sends come down "your" lane, and you can rotate to help. Pay **bounty to
the team pool, split evenly**, so nobody steals kills. In 1v1 this is identical to the plan. The
field size grows by about one road width per extra player.

### 1.7 Is a 1v1 against a human two solo games?

Mostly yes. That's the genre, and it's fine, but the plan gives the player almost no sense of their
rival. Add a **rival strip**: the enemy hero's portrait, level, HP, damage type and armour class,
what they're killing right now, and their send stocks. Counter-sending then feels personal,
and it costs nothing because lockstep already knows everything. Keep the Clash duel parked.

### 1.8 Mode by mode

| Mode | Will it be fun? | What to watch |
|---|---|---|
| 1v1 vs AI | Yes, if the AI counter-sends visibly (a toast like "Warlord is sending siege at your heavy armour") | AI being invisible makes it feel like a tower-defence level |
| 1v1 human | Yes, with the rival strip | Snowball: needs the catch-up rule, kept |
| 2v2 / 3v3 | Only with per-gate lanes and a team bounty pool | Carry problem and idle players otherwise |
| Couch split screen | Best mode, if the menus don't kill it (§1.9) | Opponents can see each other's screen. Fine, nothing is hidden anyway |
| Online | Fun when it connects. See §3 | One slow peer stalls everyone |
| Online co-op vs AI | Strong. Low stakes, and an AI leaver replacement is invisible | — |

**Dead time:** in the first 2 minutes, before T2, nothing interesting is bought. Tides every
40 s help. Move T2 to 1:30. **Match length:** with the economy fixed, 18–28 min is realistic.
Pull Rising Tide in to **20:00** and the hard cap to **32:00**. Forty minutes is too long for a
prototype someone tests five times in an evening.

### 1.9 The inventory on a gamepad in split screen

The plan gives each hero 11 equipment slots, a 20-slot bag, 4 belt slots, affixes, sets, uniques, a
reforge, a shop that refreshes every 3 minutes and ground loot to walk over. All of it lives in a
960 px half-screen, navigated with a d-pad cursor, while your lane keeps leaking because nothing
pauses. That's a menu game bolted onto an action game. The user asked for a real inventory, so it
stays, but it has to be *fast*:

- **8 equipment slots** (weapon, off-hand, head, chest, hands, feet, neck, ring) plus the charm later. **Bag of 12.**
  **Belt of 2** in v1 (1/2 keys, d-pad left/right).
- **Auto-loot** into the bag. Drops show a rarity beacon for a beat, then fly to you. Never make a
  defender walk off the road to pick something up.
- **"Equip if better"** prompt on pickup (one button). **"Buy recommended"** at the top of the shop
  (one button). The rule to hold to: **any upgrade is at most two presses away.**
- **Cut the reforge and the 3-minute stock refresh** in v1. Use a fixed shop by tier.
- The inventory panel takes the bottom 60% of *that player's* half and the field stays visible
  above it. Test it on a 1366×768 laptop split in two, not just the dev monitor.

### 1.10 Mustering on a gamepad

Plan v1 puts the muster radial on the d-pad while LB is held. A d-pad has 4 clean directions. Each
race has 10 units plus 7 upgrades. **Use a deck instead:** before the match (or at any Pay)
the player pins **4 sends** to LB+d-pad, and **auto-send toggles** (a send fires whenever its
stock and your gold allow) cover the rest. Keyboard players get the same thing on Z/X/C/V plus
Shift. The AI's send logic can use the same deck structure.

---

## 2. Scope

Plan v1 is a full game, not a prototype: 40 units, 4 heroes with 5 skills and 3 talent picks each,
a Diablo-depth item system, 3 AI personalities, 3 maps, lockstep online with a Cloudflare server,
split screen, a campaign with a stash, 9 creatures, 2 vehicle plans, an impostor atlas system and
an icon pipeline. Each line item is reasonable. Together they guarantee nothing is fun-tested until
the end.

### 2.1 Every feature ranked by value / effort

| Feature | Value | Effort | Call |
|---|---|---|---|
| Headless sim, 1v1, sends/income/Tides/banners/win | Essential | M | **KEEP**, first |
| Fixed-point millimetre positions + trig tables + integer isqrt | Low (see §3.1) | L | **SIMPLIFY**: doubles with a banned-function list and our own sin/cos/atan2 polynomials; ints only for gold and ids |
| Stocks + send-on-Pay (replaces tax + falloff) | Very high | S | **ADD** |
| Income tax brackets | Low once stocks exist | S | **CUT** |
| Repeat-buy falloff | Low once stocks exist | S | **CUT** |
| Catch-up "Rally" | Medium | S | **KEEP** |
| 4 races × 10 units | High (user ask) | L | **SIMPLIFY**: 4 × **6** in v1 (T1, T1, T2, T3, T4, T6). Expand to 8–10 after the balance sim passes. Drop the three mercenary extras (Firepot, Crow Murder, Stalker) |
| ~30 traits | Medium | L | **SIMPLIFY** to ~12 (pack, heal, siege, flying, rise, enrage, charge, aura, bleed, raise, stealth, champion) |
| Muster ×5 + Quartermaster ×2 + 2 race techs per race | Low | M | **SIMPLIFY**: Muster I–III per race, one race tech |
| 4 heroes, 5 skills each | High (user ask) | L | **KEEP**, but build one hero end to end first |
| Talents at 5/10/15 | Medium | M | **SIMPLIFY**: one pick at level 6 in v1. Add the tiers later. Note Farhold talents now have **4** tiers, not 3 |
| Druid 3 forms + summon | Medium | L | **SIMPLIFY**: Briarback toggle + wolf in v1. Fenrunner/Sporecap later |
| Groundbreaker talent alt | Low | S | **CUT** |
| 8-slot equipment + bag + belt | High (user ask) | M | **KEEP** (trimmed per §1.9) |
| Affixes (~35 stats) | Medium | L (each needs a handler) | **SIMPLIFY** to ~16 stats with handlers and tests |
| Sets (4 hero + 2 generic) | Low | M | **SIMPLIFY**: 1 generic set in v1 |
| Uniques (8 per hero) | Medium | L | **SIMPLIFY**: 2 per hero, reimplemented (see §6) |
| Reforge, shop refresh | Low | S | **CUT** |
| Ground loot + pickup | Negative on a gamepad | S | **SIMPLIFY** to auto-loot |
| Champion 3-card pick | Medium | S (exists) | **KEEP** |
| AI, 3 difficulties | High (user ask) | L | **KEEP** as one parametric AI (§4) |
| Warlord combos (Shove into Burning Line) | Low | L | **CUT** to later |
| KB+M + gamepad | High (user ask) | M | **KEEP** |
| Ready-up claims a device | High (user ask) | S | **KEEP** |
| Split screen | High (user ask) | M | **KEEP** |
| Lockstep online over PeerJS | High (user ask) | L | **KEEP**, but with BroadcastChannel first |
| Adaptive input delay | Low | M | **SIMPLIFY**: fixed delay chosen in the lobby from measured ping |
| Cloudflare Durable Object relay | Medium | M | **CUT** from v1 code (keep the doc). Revisit if PeerJS connect failures show up in testing |
| Pause quotas, kick vote | Low | S | **SIMPLIFY**: pause/unpause by anyone, 60 s auto-resume |
| Reconnect / rejoin | Medium | L | **CUT**, but make state serialisable from day one so it's possible later (§3.5) |
| 3 maps | Low | M | **SIMPLIFY**: `vale` only (sized per mode). `switchback` only if campaign mission 1 needs it |
| Shrine, chokes | Low | S | **CUT** shrine. Keep one ford |
| Keep Bells ×2 | Medium | S | **SIMPLIFY**: Toll of Iron only |
| Requisition (buy from anywhere, 4 s) | High | S | **KEEP** |
| Town-portal scroll | Low (requisition covers it) | S | **CUT** |
| Gate preview | High | S once sends spawn on Pay | **KEEP** |
| Campaign, 4 missions + stash + per-hero Lingo dialogue | Medium (user ask) | L | **SIMPLIFY**: 3 missions, plain-text dialogue, no stash. Data format ready for per-hero chapters |
| 9 creatures + 2 vehicle plans | Medium (user ask) | L | **SIMPLIFY**: 4 new (tuskback, ghoul, bone colossus, crow). The rest are colour/feature variants of existing types (thornback = `turtle`/`boar` + `horns`+`plates`; elder griffin = `griffin` size 1.4; iron golem = `golem` recolour). Vehicles (ram, mortar) later |
| Impostor atlas | Low once body counts are bounded | L | **CUT** from v1. Measure first |
| Icon generator | High (user ask) | M | **KEEP**, simplified (§3.7) |
| Live 3D portrait | High (user ask) | S | **KEEP** |
| Unit voice barks | Low | M | **CUT** |
| Results + damage meter | Medium | S (meters/ is drop-in) | **KEEP** |
| Replay + desync dump | High (debugging) | S | **KEEP** |

### 2.2 Milestone order: get something playable early

Plan v1 puts the first visible frame at M6 and the first thing a human can play at about M9. That's the
plan most likely to deliver a polished, unfun game. Reorder into **vertical slices**:

1. **S0 Interfaces + economy on paper.** `docs/interfaces.md` plus the balance spreadsheet with
   stocks. A node script must show bounded income and bodies before any game code exists.
2. **S1 Ugly playable.** Sim 1v1, **one** race (Freeholds, 6 units), **one** hero (Warrior), a
   Three.js view with **capsules**, keyboard+mouse, Recruit AI. A human can lose a game by minute 3
   of the build. Everything after this is judged by playing it.
3. **S2 Second race + second hero + balance sim** (Ashtusk, Pyromancer). Matchup matrix in node.
4. **S3 Lobby loop + gamepad + split screen.** Do this early. Split screen and device assignment
   touch input, camera, HUD and every UI panel. Bolting them on at the end means rewriting all four.
5. **S4 Inventory + shop + drops** (trimmed version).
6. **S5 Online over BroadcastChannel → PeerJS.** Desync tests running in Chromium *and* Firefox.
7. **S6 Remaining races/heroes, Veteran/Warlord AI.**
8. **S7 Art pass:** Chibi 2 + creatures replace capsules, icons, portrait, control bar. This
   stream (creatures in avatar-3d, the icon tool) can run **in parallel from S1**, because it touches
   no sim files.
9. **S8 Campaign** (3 missions on the finished systems).
10. **S9 Ship.**

Ten parallel streams against a written interface, before anything runs, is how you get ten modules
that each pass their tests and don't fit together. Farhold's history ("a finished module with no
way in", twelve times in one round) is exactly this failure. **Before S3, run at most three
streams:** sim+content, view+input, creatures/icons.

---

## 3. Tech risk

### 3.1 Determinism in JS: the plan over-engineers the easy part and misses the hard parts

- **Floats are not the enemy.** `+ − × ÷` and `Math.sqrt` on doubles are exactly specified by
  IEEE 754, and JS engines don't fuse multiply-adds. The real cross-engine risks are
  `Math.sin/cos/tan/atan2/exp/log/pow/hypot/cbrt`, which the spec allows to differ. Banning those
  (a good rule, keep it) is enough. **Millimetre `Int32` positions, trig lookup tables and an
  integer square root are a lot of code to buy nothing.** Write small polynomial `sin/cos/atan2`
  using only basic arithmetic, keep doubles, and quantise positions only in the hash (for example
  `Math.round(x*1000)`) so tiny float differences can't hide.
- **Things the plan misses:**
  - **`Array.prototype.sort` with a comparator that isn't a total order** gives different results in
    V8 and SpiderMonkey (different sort algorithms). Every sort in the sim must break ties by id.
    Add a lint test that greps `js/sim/**` for `.sort(` and asserts a tie-break helper is used.
  - **Integer-like object keys are iterated in numeric order first**, regardless of insertion order.
    Ban object-as-map in sim state. Use arrays and `Map`.
  - **JSON data loaded at different times** (async fetch order differs per peer) must be frozen and
    **hashed into the start packet**. Two peers on different builds of `units.json` desync at
    tick 1. The start packet should carry a hash of every data file.
  - **Shared modules default to `Math.random`.** Farhold's `rollAffixValue(def, ilvl, rng = Math.random)`
    and `itemLevelFor(..., rng = Math.random)` really do default to it (affixes.js:450, 486). One
    forgotten argument means a desync that only shows up when someone gets a drop. The purity test must
    also cover **imported** modules. Easier still: wrap every import from outside `js/sim/` in an
    adapter inside `js/sim/` that *requires* the rng argument.
  - **Testing in node only tests V8.** Chrome is also V8. The only real cross-engine check is
    running the command log in **Firefox** (Playwright has it). Without that, the determinism test
    proves nothing about the case that actually breaks.

### 3.2 Hidden tabs freeze the lockstep

Browsers throttle background tabs: `requestAnimationFrame` stops, `setTimeout` is held to ≥1 s,
and Chrome's heavier throttling after 5 minutes goes as far as once a minute. **One player who
alt-tabs stalls all six.** Drive the lockstep clock and the sim from a **dedicated Worker**
(workers are not frame-throttled), keep the view on rAF, and show "Waiting for <name> (tab
hidden)" using `visibilitychange` broadcast to the peers. After 20 s, offer "replace with AI".

### 3.3 Input delay

The gamepad moves the hero with the stick directly. Under lockstep, with a 150 ms delay plus the
50 ms tick plus interpolation, that's 200–250 ms from stick to motion online. Even offline it's
about 100 ms if local play goes through the same pipe. Direct stick control feels like steering a
boat at that latency. Mitigations:
- **Offline/split screen: delay = 1 tick.** There's no reason to add network delay with no network.
- **Turn the hero's facing and play the walk start in the view immediately** (only the look, not the
  sim), so the stick feels connected even while position lags.
- Online: send stick commands with **redundancy** (each packet repeats the last 3 ticks of
  commands) over an **unordered** channel, so one lost packet doesn't block the stream
  (a reliable+ordered channel holds everything up behind a single loss).

### 3.4 PeerJS and connectivity

- The public broker has no TURN. Roughly 10–20% of pairs (strict NAT, mobile, corporate, VPN) **will
  never connect**, and the player sees a spinner forever. Add a **10 s connect timeout with a plain
  error** ("Your networks can't reach each other directly. Try another network, or host from the
  other machine.").
- **A PeerJS id stays reserved on the broker for a while after a refresh.** A host who reloads gets
  "ID is taken" for their own room code. Handle it: generate a new code on that error.
- Host-star relay doubles latency for guest↔guest and makes the host a single point of failure.
  Accept it for v1, but **host migration is not coming**, so say "host left — match ended, results
  saved" rather than hanging.
- The Cloudflare DO relay recommendation in §9.4 is sound. Keep it in the docs, not the v1 code.

### 3.5 Desync recovery and rejoin

A desync currently ends the match. If sim state is **plain serialisable data** (no closures, no
class instances with methods, no Three.js references), then "host sends a snapshot, guest
replaces its state" turns a fatal desync into a 1-second hiccup, and the same code is the
rejoin feature later. That's a design rule to set in S0, and it **directly rules out importing
Farhold's `resolveAttack`**, whose `env.later(ms, fn)` queues closures (uniques.js:255). Timed effects
must be data: `{ atTick, kind, args }`.

### 3.6 Split screen and Chibi 2 crowd cost

What CHIBI2.md actually records: **one** benchmark with **eight** actors on SwiftShader (software)
at 1028×594. Chibi 2 + batched spells = 43.7 draw calls, 67k triangles, 97 ms frame time. A
flagship body is 2 meshes / ~7,950 triangles. Each actor has **its own skeleton and animation
mixer**, and bodies are **not GPU-instanced across characters**. There is no crowd measurement at all.

- 40 actors per viewport × 2 viewports = 80 skinned actor-renders + shadow passes ≈ 320 draws,
  640k triangles, 40 mixers updated. That's possibly fine on the owner's desktop GPU and unknown on integrated
  graphics. **Nobody has measured it.** Make a `bench.html` (40/80/120 actors, 1 and 2 viewports)
  the first art-stream deliverable and set budgets from real numbers on the owner's machine.
  Playwright's headless browser runs SwiftShader, so its frame times are no good for this.
- **Team colours will blow up the template cache.** CHIBI2.md: "Color changes currently rebuild a
  variant because colors live in its vertex data." 40 unit types × 2 team colours = 80 templates,
  each a full geometry compile. Mark team with a **ground ring / banner sprite**, not a recolour.
- **`createChibi2Character` is async** (chibi2.js:425). A send that spawns a type nobody has built
  yet stalls for a geometry compile mid-match. **Pre-warm every unit type in every roster during
  the 3-2-1 countdown.**
- **Creatures are dozens of separate meshes** (creatures.js builds every bead as its own `Mesh` with
  its own `MeshStandardMaterial`). A Thornmane army is mostly creatures. Farhold already solved
  this in `prototypes/farhold/js/mesh-merge.js` `compactCreature()` (1,377 → 86 meshes). The plan
  doesn't mention it. **Move it to `avatar-3d/js/`** (Bannerline should not import from Farhold's
  game folder) and run every creature through it.
- **Shadows:** two cameras means rendering shadow maps twice. Use Chibi 2's contact shadows (its
  default) and no dynamic shadow map in split screen.
- **Impostors as specced** (8 directions × 14 frames × 128² per unit type × 40 types) come to roughly
  **290 MB of textures** and ~4,500 offscreen renders at startup. Cut them. Once stocks bound body
  counts, the problem they solve mostly goes away.

### 3.7 Icons and the portrait

- **"One offscreen `WebGLRenderer`" is a second WebGL context.** Contexts don't share geometry or
  textures, so every model is built twice, and browsers cap live contexts (~16) and drop the oldest.
  Render icons with the **main renderer into a `WebGLRenderTarget`**.
- Better: **bake icons with a tool** (`tools/bake-icons.mjs` driving Playwright, like
  `tools/bake-chibi3.mjs`) to committed PNGs for every unit, hero, item base and skill. Generate at runtime only for
  rolled items that need it, which they don't, since the icon is the base's. The user asked for "a way to
  generate icons from the 3D models". A tool page plus a bake script is that way, and it costs
  nothing at runtime.
- The portrait as a scissored viewport of the main renderer is right. In split screen that's 2
  extra tiny passes. Cheap.

### 3.8 Gamepad API quirks

- **Secure context.** MDN lists the Gamepad API as secure-context only, and Firefox enforces it. The
  owner tests at `http://192.168.x.x:8400`, which is **not** a secure context (only `localhost`
  is exempt). **Gamepads may not exist at all on the dev URL in Firefox.** Test on the GitHub Pages
  build (https), or serve the LAN over https with a self-signed certificate. Check this on day 1 of
  S3, not at the end.
- **Pads are invisible until a button is pressed** after page load. That fits "press A to join",
  but the lobby must poll `getGamepads()` every frame, not wait for `gamepadconnected`.
- **Mapping:** Chrome reports `mapping: "standard"` for most pads. **Firefox on Linux often
  reports `""`**, with triggers as axes and a different button order. Ship a fallback table for
  common ids (Xbox, DualShock/DualSense, 8BitDo) and a "press each button" remap screen when the
  mapping is empty.
- **Duplicate devices:** on Windows with Steam running, one PlayStation pad can show up twice
  (raw + virtual Xbox pad). One press then joins two slots. Ignore a join from a second pad index
  whose button pattern matches a pad that joined in the same frame.
- **Identical pads have the same `id` string.** Key seats by `index`, and on reconnect re-claim by
  the next button press ("Player 2, press A"), not by id.
- `getGamepads()` returns stale data when the window loses focus. That's fine for split screen (one page),
  but don't run gamepad polling in a Worker.

### 3.9 Device assignment edge cases

- **Two keyboards are impossible.** `KeyboardEvent` has no device id, so the browser can't tell two
  keyboards apart. There is exactly **one keyboard seat** per machine. Say so in the lobby ("One
  keyboard player per screen").
- **The mouse belongs to the keyboard seat.** A pad+pad couch game has no mouse player, so every
  screen (lobby, shop, inventory) must be **fully usable by pad alone**. That's a hard
  requirement for every UI stream, not a polish item.
- **"Cursor clamped to that half" isn't possible** with the hardware cursor. It needs the
  **Pointer Lock API** plus a drawn cursor. Pointer lock needs a click to engage, **Esc always
  releases it** (and Esc is also the plan's "unready/menu" key), and Firefox shows a banner.
  Simpler: no clamp. Mouse clicks only act inside the keyboard player's half, and the cursor is drawn
  dimmed over the other half.
- **Enter/Space to join on a page that also has text inputs** (the room-code box) will join a slot
  while someone is typing. Ignore join keys while an input has focus.
- **Keyboard + pad on one machine, then a pad disconnects mid-match:** freeze that player's
  commands and send "idle" packets, so the lockstep doesn't stall on a local device.

---

## 4. AI

The three difficulties are genuinely different on paper, but they're written as **three
programs** (`recruit.js`, `veteran.js`, `warlord.js`). That's three times the code and three sets of bugs,
and the leaver replacement then needs its own choice. Build **one AI with knobs**:

| Knob | Recruit | Veteran | Warlord |
|---|---|---|---|
| reaction ticks | 32 | 16 | 7 |
| greed (target income share) | random | 0.6 | adaptive (banner lead, time to end) |
| counter-pick chance | 0 | 0.5 | 1.0 |
| send estimator | off | batch at ≥ 1 pay of gold | "cheapest wave that leaks" vs estimated defender DPS |
| hero micro tier | 0 (nearest, random skills) | 1 (lowest HP, AoE at ≥3, retreat 30%) | 2 (focus order, kite if ranged, potions) |
| shopping | potions | best-scoring item (`scoreWeights` from items.json exists, used by emberveil/js/loot.js) | build toward a target list |

- **Buildable?** Recruit and Veteran: yes, easily. The Warlord **estimator** is buildable because the sim
  can run its own damage maths. **Warlord combos** (Shove a Ram back into a Burning Line) and
  "kiting" are the expensive part. Defer the combos. Kiting for Ranger/Pyro is a 30-line
  behaviour (keep distance > enemy reach, attack when cooldown is up).
- **The win-rate bar (Warlord ≥70% over Veteran) will mostly measure hero micro**, because both
  use the same economy and the economy decides games. Add a bar that measures *decisions*:
  Warlord with Veteran's hero micro must still beat Veteran ≥60%. Otherwise "hard" just means "better
  at clicking".
- **The AI runs inside the sim on every peer.** 3 Warlords running an estimator every 7 ticks must
  fit in the 2 ms tick budget. Put the AI in the sim benchmark.
- **The AI must use the deck/stock system** described in §1.10 so humans and AI play the same game.
- **Make the AI visible:** a single log line or toast when an AI counter-sends ("Warlord switches to
  siege"). It's the only way a player learns the counter system against bots.

---

## 5. Data and balance

Beyond §1.1–1.5:

- **Race identity through ratios is invisible and dangerous.** "Unburied are the late economy race"
  rests on T4–T5 ratios of 0.118/0.090, but Unburied's own T1 returns 0.167. Nobody buys a T4 for
  economy, ever, so the identity never shows. Under stocks, give identity through **what the units do**:
  Freeholds heal and guard, Ashtusk enrage and trample, Unburied rise and raise, Thornmane pack and
  pounce. Also give each race one rule-bending economic trait that's visible on the HUD (for example
  Unburied: "a unit that leaks returns half its cost"; Thornmane: "packs refill stock 25%
  faster"; Ashtusk: "−15% cost, −15% income"; Freeholds: "Muster upgrades cost 30% less").
- **Thornmane T2 has the same income ratio as T1** (0.18 vs 0.19) with far more HP. Hyena Pack is
  strictly better economy than any other race's T2.
- **Pack leak:** if leak is per body, packs leak 2–3× per purchase (§1.2). Price leak per purchase.
- **The `guard` trait** (−30% pierce to allies behind) only matters against the Ranger, so it's a
  one-hero counter on a T2 unit. Fine, but write that down so it isn't "fixed" later.
- **Heroes have no armour class** (all take 100%), so `hero` armour is unused. See §1.5 for the
  chest-item fix.
- **Farhold's numbers don't carry over.** Farhold damage scales to 7,301–11,864 per hit at level 40
  for followers. The plan says "keep Farhold's N% weapon damage model". Keep the *multipliers*
  (`mult`) from skills.json, but the base weapon numbers must be Bannerline's own. Otherwise item
  stats from items.json (tuned for Farhold's curve) will flatten the 25→400 hero DPS curve.
- **Item level 1–30 against Farhold's tiers** (crude 1, plain 8, fine 16, superior 24, exquisite
  34, mythic 44) means Bannerline never reaches the top two tiers. Fine. Just don't advertise mythic.
- **Rarity affix counts:** the plan says legendary = 5. items.json says `legendary: [5, 6]`. Pick
  one and assert it.

---

## 6. Reuse claims, checked

| Claim | Reality | Verdict |
|---|---|---|
| Farhold `js/affixes.js`: `tuneAffixData`, `rollAffixValue`, `affixAllowed`, `capValue`, `tierFor`, `roundFor` | All exist (lines 419–514), **no imports**, pure arithmetic. Two default to `Math.random` | **Real.** Wrap it to force the rng argument |
| Farhold skills `cleave` … `sporecap_shape` (23 ids) | **All 23 exist** in `data/skills.json` with names and data | **Data is real** |
| "Talents lifted from `talents."1"/"2"/"3".nodes`" | Talents now have **4 tiers**. Nodes are **mods** (43 distinct keys across these 23 skills: `afterimage`, `again`, `barrier`, `channel`, `charges`, `link`, `revive`, `ricochet`, `wall`, `ward`…). `applyMod()` (skillmech.js:981) is pure and reusable for folding mods into a plan. **Executing** the plan lives in Farhold's 11,040-line `main.js` | **Half real.** Data + plan-folding reusable; every shape (`around, beam, bolt, dash, ground, melee, self, summon`) and every mod key used needs a Bannerline executor. Budget it as new code |
| Skill elements → blade/pierce/arcane | Skills use `physical`/`fire`/`nature`. No mapping exists | Write the mapping in `build-hero-skills.mjs` |
| Druid forms use `boar`, `crocodile`, `mushroom` | Confirmed in each form's `body.creature`. Forms also carry `stats`, `basic`, `onEnter`/`onExit` blocks to implement | **Real**, more work than "swap a stat block" |
| Farhold `js/uniques.js` powers | `resolveAttack(env, …)` uses callbacks and `env.later(ms, fn)` (closures, wall-clock ms). The file imports `gear.js` and `tools.js`, which pull in `combat-feel.js`, `harvestinfo.js` and `buildplan.js` (outposts, roadplan) — Farhold's world code inside a "pure" sim | **Not reusable as code.** Copy the unique *rows* (name, flavour, numbers) with a build tool, and reimplement the powers as data-driven sim handlers |
| `emberveil/data/items.json` bases, affixes, sets, `rarityColors`, `scoreWeights` | All keys present | **Real** |
| Farhold warbands `ashtusk`, `unburied`, `thornmane` with `defs` | Present, Chibi 2 races `orc`, `undead`, `beast` | **Real**. But see §7: the warband `name` field reads "The Ashtusk **Horde**" |
| Chibi 2 races human/dwarf/halfling | Present in `chibi2-races.js` | **Real** |
| `class-outfits.js` `dressAs` | Exists | **Real** |
| `creatures.js` features `tusks`, `horn`, `plates`, `beak` | `tusks`, `horns`, `plates`, `beak` **already exist** as features | **Less new work than claimed.** Only `trunk`, `howdah`, `hunch`, `ribs`, feathered wings are new |
| Creature types `golem`, `titan`, `griffin`, `bat`, `boar`, `hyena`, `saber_cat`, `wolf` | All exist | **Real** |
| Vehicles: new `ram`/`mortar` plans | `vehicles.js` has plans `cart, pack, wagon, coach, sled` with `metrics()` hitch/seat | Feasible but new. Defer |
| "Farhold's mount seat code" for Courser Knight / Boar Rider | No reusable seat/rider helper found; riding is inside Farhold's `main.js`/`player.js` | **Doesn't exist as a module.** Use `vehicles.js` `metrics().seat` as the model and write a small `mountRider(actor, creature)` in avatar-3d |
| `metrics()` for icon framing | Chibi 2: `{ totalHeight, height }` only. Creatures: bounding box. Vehicles: full | **Partial.** Head-and-shoulders framing needs a head position. Read the head bone instead |
| `BatchedSpellFx` | Exists (`spellfx-batched.js`) | **Real** |
| `shared/rewards.js` 3-card pick | Exists as `showRewards({…, choose: true})` (not `spec.choose`) | **Real**, different call |
| `meters/` drop-in | `Meter` class exists | **Real** |
| `shared/store.js`, `format.js`, `tooltip.js`, `voices.js` | Exist | **Real** |
| Gamepad, split screen, networking | **Nothing in the playground** uses `getGamepads`, `setScissor` (except one assets page) or WebRTC | All **new**. Budget accordingly |
| Mesh merge for creatures | `farhold/js/mesh-merge.js` `compactCreature` exists. **Not mentioned in the plan** | Use it. Move it to avatar-3d |

---

## 7. Names

Checked against playground convention 9 and the banned list.

| Name | Problem | Fix |
|---|---|---|
| **"The Ashtusk Horde"** (Farhold `warbands.json` `name`) | **"Horde" is on the banned list.** If Bannerline shows the warband's `name`, it ships a banned term. It's also a live violation in Farhold's data | Use `short` ("Ashtusk") everywhere. Separately, tell the owner Farhold's warband name needs a rename |
| **Ashtusk Warchief** | "Warchief" is the signature title of the orc faction in the source games. Not on the list, but it's the most recognisable one-word give-away in the roster | Rename player-facing to **Tuskchief** or **Bloodbanner** |
| **Mortar Crew** | Close to a source-game unit name ("Mortar Team") | **Bombard Crew** |
| **"scrolls (town portal …)"** (§6.3) | A Diablo item name | Cut the item (requisition covers it), or call it **Homeward Scroll** |
| **Ghoul, Wraith, Raider, Griffin** | Folklore/common words, also source-game units | Acceptable as plain nouns. Never pair them with source-game modifiers |
| **Stoneskin** | A long-standing tabletop spell name | **Stonehide**, or "Hardened" |
| **Shieldwall** | Generic historical term (WoW has "Shield Wall" as an ability) | Acceptable as one word. Watch it |
| **Cinder Stride** | Fine. Good that "Ember Stride" (Farhold's internal id `ember_stride`) is not shown | Keep. The data id is not player-facing |
| Tide, Rising Tide, Keep, Banner, Muster, Requisition, Rally, Toll of Iron, Last Muster | Clean | Keep |

Add a **banned-terms test** that scans every Bannerline `data/*.json` string and every UI string
table against the convention-9 list plus `Warchief`, `Town Portal`, `Mortar Team`.

---

## 8. Test strategy gaps

1. **Cross-engine determinism:** run the same command log in **Firefox** via Playwright and compare
   hashes with node. Node and Chrome are both V8, so testing only those proves nothing.
2. **Economy bounds as tests:** income at minute 10 within a band, bodies on field under the
   cap with stock-limited sends, unit efficiency monotone by tier (HP/gold for T6 ≥ 2× T1). These are the
   bugs §1 found by hand. Encode them so they can't come back.
3. **Match-length distribution:** AI-vs-AI over 50 seeds, median 18–28 min, none hitting the hard
   cap more than 10% of the time.
4. **Race × hero matchup matrix:** no race-vs-hero pairing outside 40–60% at Veteran-vs-Veteran.
5. **State snapshot round-trip:** serialise at tick N → restore → identical hash at N+1000. Guards
   the "no closures in state" rule and enables resync/rejoin.
6. **Command fuzz:** random and illegal commands from every slot for 5 minutes. No throw, no NaN,
   hashes equal across two sims.
7. **Data-file hash in the start packet:** a test where peer B has a modified `units.json` must fail
   with a clear "version mismatch", not a desync 3 minutes in.
8. **Hidden-tab lockstep:** Playwright can emulate `visibilitychange`. Assert the other peer shows
   "waiting" and the hidden peer catches up when shown.
9. **Gamepad mocks with an empty mapping** (Firefox Linux layout) and the duplicate-pad case, not just a
   clean standard pad.
10. **Pad-only UI walk:** a Playwright run that completes lobby → match → buy an item → equip →
    results → lobby **with no mouse or keyboard events**, for player 2 in split screen.
11. **Performance on real hardware:** `bench.html` measured by the owner, numbers recorded in the
    README. Playwright's SwiftShader frame times only catch draw-call/triangle regressions.
12. **Imported-module purity:** the sim-purity scan must follow imports out of `js/sim/` (or forbid
    them except through adapters).
13. **Dead data:** every trait, affix stat, talent mod key and skill shape used by Bannerline data
    has a handler, and a test moves each one to an odd value and checks the sim responds (the
    playground's own lesson).
14. **Banned-terms test** (§7).
15. **Long soak:** a 40-minute 3v3 AI match within the 2 ms tick budget, no growth in memory or state size.

---

## 9. Prioritised changes for the refined plan

1. **Replace the economy core with stock-limited sends** (per-unit charges that refill over time),
   and **spawn sends on the next Pay**. Cut the income tax and the repeat falloff. Re-run the
   income sim and put the curve in PLAN.md. Income must grow roughly linearly, with bodies bounded.
2. **Re-price units so pressure per gold rises with tier** (T6 ≈ 2–3× T1 HP/gold), and price
   **leak per purchase**, not per body. Encode both as tests.
3. **Give the hero an armour class from the chest item** so unit damage types matter, add a
   cheap damage-type swap item for each hero, and drop the unused `siege`-vs-armour row or make it matter.
4. **Per-gate lanes for the first ~60% of the field, merging near the Keep**, plus a **team bounty
   pool**. Keep 1v1 identical to the plan.
5. **Reorder into vertical slices**: S1 is an ugly playable 1v1 (one race, one hero, capsules,
   KB+M, Recruit AI) before any other content. Split screen, gamepad and lobby (S3) come before items and online.
6. **Simplify the sim number format**: doubles, a banned-function list, our own trig polynomials,
   tie-broken sorts, no object-as-map, frozen data hashed into the start packet, rng required on
   every imported roller.
7. **Make sim state plain serialisable data** (timed effects as `{ atTick, … }`, never closures).
   Do not import `uniques.js`. Reimplement powers as handlers.
8. **Run lockstep in a Worker** and handle hidden tabs. Offline delay = 1 tick. Use stick commands
   with redundancy.
9. **Cut content for v1**: 6 units per race, ~12 traits, Muster I–III + 1 race tech, one talent pick at
   6, Druid with one form + wolf, 8 equipment slots / bag 12 / belt 2, ~16 affix stats, 2 uniques per
   hero, 1 generic set, no reforge or refresh, auto-loot, one map, Toll of Iron only, 3 campaign missions,
   4 new creatures (the rest as variants), no impostors, no barks.
10. **Gamepad muster as a 4-send deck plus auto-send toggles**, shared with the AI. Rule: any
    upgrade is at most two presses away. Every screen usable by pad alone.
11. **One parametric AI** with the knob table in §4, a decisions-only win-rate bar, and visible
    counter-send toasts.
12. **Icons:** bake to PNG with a tool script, and use the main renderer + render target for anything at runtime.
    No second WebGL context. Portrait stays as a scissored viewport.
13. **Art performance:** `bench.html` first. Move `compactCreature` into avatar-3d. Pre-warm Chibi 2
    templates in the countdown. Team marker rings instead of team recolours. Contact shadows only.
14. **Devices:** one keyboard seat, pointer-lock-free mouse (acts only in its half), pad mapping
    fallback + remap screen, duplicate-pad guard, join keys ignored while typing, and **https for
    gamepad testing** (GitHub Pages or a LAN certificate).
15. **Online:** BroadcastChannel transport first. PeerJS with a 10 s connect timeout, a plain error,
    and recovery from "ID taken". Fixed delay picked from lobby ping. Snapshot resync on desync. No host
    migration (say so).
16. **Names:** use `short` warband names (never "The Ashtusk Horde"), rename Warchief → Tuskchief,
    Mortar Crew → Bombard Crew, Stoneskin → Hardened, and cut the portal scroll. Add the banned-terms
    test. Flag Farhold's "Horde" to the owner.
17. **Tighten the clock**: T2 at 1:30, Rising Tide at 20:00, hard cap at 32:00.
18. **Add the 15 tests in §8** to PLAN.md's test list, especially Firefox determinism, economy
    bounds, snapshot round-trip and the pad-only walk.
19. **Rival strip** in the HUD (enemy hero level, armour class, damage type, current stocks) so 1v1
    feels like playing against someone.
20. **Give each race one visible, rule-bending economic trait** instead of identity hidden in ratios.

---

## 10. The five biggest risks

| # | Risk | Why it's big | Mitigation |
|---|---|---|---|
| 1 | **The economy runs away** (as written it compounds to 60k/pay by minute 15) | Breaks fun, balance, race identity, the inventory's purpose *and* performance (unbounded bodies), all at once | Stock-limited sends + send-on-Pay + tier-rising pressure. A node income/bodies test gates S1 |
| 2 | **Nothing playable until late**, so systems get built without being played and the game turns out unfun | 10 parallel streams against an interface. Farhold's "finished module with no way in" pattern | Vertical slices. S1 ugly playable in the first batch. At most 3 streams before S3 |
| 3 | **Lockstep desyncs or stalls in the real world** (Firefox vs Chrome maths, unstable sorts, `Math.random` defaults in shared code, hidden tabs, no TURN) | One desync or stall ruins every online match, and they're the hardest bugs to reproduce | Firefox-vs-node hash test, purity scan that follows imports, data hash in the start packet, a Worker clock, snapshot resync, desync dump, connect timeout with a plain error |
| 4 | **Split screen + gamepad + inventory don't fit together** (pad-only screens, half-width panels, d-pad muster, Firefox gamepads off on http, empty mappings) | It's the user's headline mode and it touches every UI panel. Retrofitting it is a rewrite | Build split screen and devices in S3 before the UI grows. Pad-only Playwright walk. Https test URL. Mapping fallback + remap. Deck muster. Two-press upgrade rule |
| 5 | **Reuse that turns out to be rewriting** (talent mods, skill shapes, uniques, affix handlers, mount seats) | The plan budgets these as small. They're the largest content cost, and scope overruns land on the playable date | Budget executors as new code. Cut to 1 talent pick, 2 uniques/hero, ~16 affixes in v1. Dead-data handler tests. Build a tool that copies *data rows* and never imports Farhold's game code |
