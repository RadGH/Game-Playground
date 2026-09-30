# WILDMARCH — Design Bible, page 18: roadmap

**Status:** v0.1 draft — 2026-09-29. **Nothing is built.** Owner of this page: **the order v2 is built
in.** Each milestone lists its scope, the bible pages it implements, the tests that say it is done
(acceptance), and the playground modules it pulls in. The reuse map and module names are in
[page 16 §14](16-TECH.md); the offline-first plan is [page 16 §15](16-TECH.md).

## How to read this page

- **Milestones are in order.** Each one ends with the game playable and the tests green, published to
  the stable server (8400) with `tools/publish-stable.sh`. Nothing is half-built across a milestone line.
- **Size** is relative: **S** (one focused session), **M** (a few), **L** (a round of work), **XL** (several
  rounds; split into sub-milestones when it starts). No calendar dates — the owner's review rhythm sets
  the pace.
- **Acceptance tests** are named by file; page 16 §16 describes the kinds. A milestone is done when its
  acceptance tests exist, pass, and would fail on the code before the milestone (a test that could never
  fail proves nothing).
- **Checklist**: each milestone gets `~/claude/agent/wildmarch-checklist.md` entries while it is in
  flight (owner's convention), and a `CHANGELOG.md` entry when it lands.
- Playground rule for agents: **do not stop between milestones** to ask for feedback when the next one is
  already laid out here (`playground/CLAUDE.md` "Do Not Stop For Feedback"). Stop only where this page
  says **Owner check**.

## Gate before M0 — nothing is built until the owner approves the docs

**Nothing is built until the owner approves the docs.** M0 does not start until the owner has answered
[`QUESTIONS.md`](QUESTIONS.md) (answering "yes to all recommendations" counts) and approved this bible.
Answers that differ from a recommendation are folded into the named pages and logged in `CHANGELOG.md`
**before** M0; the pages are then the spec. Agents may not treat an unanswered question as approval.

## The shape of the plan

```
 Part 1  OFFLINE VERTICAL SLICE        M0 ─ M8     one region, one dungeon, three classes, finder hires
 Part 2  GO ONLINE                     M9 ─ M11    server, accounts, two players, social core
 Part 3  GROW THE GAME                 M12 ─ M17   all classes, regions 2–11, dungeons, raids, economy
 Part 4  PVP, HARDENING, LAUNCH        M18 ─ M21   PvP, anti-cheat, moderation, alpha, beta, launch
```

**Recommendation: build the offline vertical slice first** — Hearthvale (levels 1–6), the dungeon
`d01_hollow_barrow` (5–7), and three classes: **Warrior** (tank), **Druid** (healer, with forms — the
hardest class mechanic, so it proves the class system), and **Mage** (damage). Together they fill a
dungeon group's roles. The slice is played in the browser with the server code running in
a worker (`LocalTransport`), so it proves the rules/sim/render split, is publishable to GitHub Pages
with no hosting, and gives the owner something real to play months before networking. This is canon
00 §10 "Offline solo": the game must be fully playable offline, solo, with followers, and the build
starts this way.

### What the slice contains (from 00 §4 and §10)

The slice covers **levels 1–7** (Hearthvale 1–6 and `d01_hollow_barrow` 5–7), so it carries exactly the
part of page 07's ladder that falls in those levels, plus the rules 00 §10 fixes for everything it touches:

| Area | In the slice | Owner |
|---|---|---|
| Unlocks (page 07 ladder, levels 1–7) | day-one kit + spell slot 1 (1) · perk forest (2) · **sprint** `q_hv_the_long_field` (2) · **potion belt**, 2 slots, `q_hv_the_herbwifes_basket` (3) · **spell slot 2** (4) · **dodge roll** `q_hv_fall_and_rise` (5) · player trade (5; online only — shown greyed offline) · **Calling I** `q_calling_<class>_1` (6) · **group finder + dungeon journal** `q_hv_the_barrow_bell` (6) · **homeward stone** `q_hv_a_bed_by_the_fire` (7) · bag slot 1 (7). Each with its card, sound and Unlocks-screen row | 07 |
| Not in the slice (the ladder puts them later) | own follower slots (8/15/25/35) · crafting (9) · boats (9) · spell slot 3, first mount, Challenge, duels (10) · bank/mail/market (11) · talents tier 1, waystones, portals (12) · guild charter (15) · everything later | 07 |
| Followers | a character has **no follower slot of its own** before level 8, so the slice uses **finder hires** (page 15 §7.4, §21.3): free followers of the missing roles for one Normal `d01` run, offered by the group finder's "Fill with followers" — which works offline because it needs no other player. A finder hire takes a party slot (00 §10) | 15 |
| Keys | page 02's table: `WASD`, `Space`, `F` dodge (from 5), `E`, `1`–`6`, `Q` / `G` class keys, `Shift+1`–`4` druid forms, `Tab`, `L` light, `M`, `I`, `K`, `N`, `J`, `Shift+J`, `P`, `O`, `Alt+1`–`4` boss-dialog replies, `,` / Mouse 5 follower orders | 02 |
| Aim | Hybrid by default; Action and Classic as options; every slice spell works in all three | 02 |
| Combat | GCD 1.0 s; bosses ignore stun/knockdown/root/disarm and fill a **break bar** instead; one shared 90 s cast-pause lockout per boss | 05/11 |
| Telegraphs | page 11's vocabulary, colours and palettes (read from `mechanics.json`, never restated) | 11 |
| Items | the **15** slots of page 08 §2.1; seven rarities with Legendary violet `#c86bff`; personal loot; `cur_gold` shown as copper/silver/gold (100c = 1s, 100s = 1g). Delver's Marks (`cur_delve`) from `d01` if page 08 §12.2 pays them at that level | 08 |
| Levels | XP curve `600 × 1.107^(L−1)`, perk points from 2, the 60-minute day | 07/00 |
| Save | offline IndexedDB save of every field above (page 16 §12.4) | 16 |


---

## Part 1 — The offline vertical slice

### M0 — Skeleton (S)

**Scope**
- Folder layout of page 16 §14.1: `index.html` with the import map and a generated modulepreload block,
  `css/`, `js/{rules,sim,net,render,ui,audio,offline}/`, `data/`, `server/`, `tools/`, `tests/`.
- `js/net/transport.js` with `LocalTransport` (worker + lag simulator `?lag=&jitter=&loss=`) and a stub
  `SocketTransport`; `js/offline/local-server.js` ticking an empty world at 20 Hz; `js/rules/protocol.js`
  with `hello`/`welcome`/`in`/`snap`/`ping`/`pong`.
- `tools/validate-data.mjs`; the first `balance.json`, `classes.json` (all 30 rows from canon §6, even
  though only 3 are playable), `unlocks.json`, `bindings.json`, `settings.json`, `screens.json`,
  `items/currencies.json`, `mechanics.json` (the full data-file list is page 16 §13).
- Tests wired into the playground: `package.json` `test:unit` gets `prototypes/wildmarch/tests/*.test.js`.
- A card for Wildmarch on the playground `index.html`; a row in `CLAUDE.md`'s Prototypes table;
  `docs/playground.md` line; `prototypes/wildmarch/README.md` (playground convention 6).

**Implements** page 16 §2, §3, §14.1, §15.

**Acceptance**
- `purity.test.js` (no `three`/`document`/`window`/`localStorage`/`fetch(`/`Math.random` in `js/rules` or `js/sim`)
- `filenames.test.js` (no blocker-unsafe names)
- `protocol.test.js`, `data.test.js`
- `boot.spec.js`: the page loads on 8401 with **zero console errors** and the worker answers `pong`
- `publish-stable.sh` accepts the commit

**Pulls in** `tools/serve.py`, `tools/preload-modules.py`, `shared/format.js`, `shared/store.js`,
`prototypes/emberveil/js/rng.js`.

---

### M1 — Walk in Hearthvale (M)

**Scope**
- `tools/bake-region.mjs` and `data/regions/hearthvale/shape.json` → `height.u16`, `water.u8`, `nav.u8`,
  `surface.u8` (page 16 §11). First pass: the river, the farm valley, Brightwater's plateau, the road,
  the barrow hill.
- `js/render/region.js`: terrain with surface blending, water, vegetation scatter, GPU grass, sky with the
  60-minute day, height fog, post chain — through `enhance()`.
- `js/sim/movement.js` (shared with prediction): ground from the baked heightmap, collision with scatter
  trunks/rocks and buildings, swimming, jumping.
- Player body: Chibi 2 with the four race presets; third-person camera; `js/net/predict.js` +
  `interp.js`.
- Title → "Play offline" → `scr_char_create` (race, body, face, class preview) → spawn in Brightwater.
- Graphics presets (page 04 §7.2, plus page 17 §7's art knobs) with the first-launch machine check; `?quality=low` = the Low preset.

**Implements** page 01 (Hearthvale geography), 02 (movement keys), 03 (`scr_login`, `scr_char_create`,
basic HUD), 04 (graphics + controls tabs), 16 §7, §11, 17 §2.1–2.4, §6, §7.

**Acceptance**
- `ground-agrees.test.js` (mesh, movement and water agree to 5 cm at 1,000 points)
- Walking the grass patch does not move any blade (highdef `grass.test.js` pattern)
- `boot.spec.js` extended: each race builds and walks 20 m; `budget.spec.js` open-field numbers
- `lag.spec.js`: at `?lag=150`, own movement stays smooth and ends where the server says

**Pulls in** `highdef-3d/js/{materials,sky,terrain,water,grass,vegetation,scatter,quality}.js`,
`highdef-3d/js/kit/{trees,rocks,textures}.js`, `highdef-3d/data/vegetation.json`,
`prototypes/farhold/js/{graphics,gfx,postfx,wind,rain,atmosphere,sky-palette,grass-gpu,grass-plan,light,nightlights}.js`,
`avatar-3d/js/chibi2*.js`, `chibi2-races.js`, `prototypes/farhold/js/{bodypresets,appearance,figure3d,player}.js`
(player controller as reference), `worldgen/js/{noise,weather}.js`.

---

### M2 — Combat core (L)

**Scope**
- Basic weapon attacks as patterns (sword slash-slash-overhead etc.), the three-part swing (wind-up,
  damage, recovery), **dodge roll** (`F`, unlocked at level 5 by `q_hv_fall_and_rise`) with the
  server-granted invulnerable window, block/guard if page 05 keeps it.
- The aim model: Hybrid by default, Action and Classic as options (00 §10, page 02).
- Statuses, damage maths, threat table and taunt, death and revive (page 05), respawn at the town.
- Mobs: Hearthvale's families (page 10) with AI, packs, champion/rare marks (`monster-modifiers.json`), loot
  hooks (stub drops); the **Sootwick** warband where page 10 places it in Hearthvale (band 2–18, 00 §10).
- **Server-side hit resolution with lag compensation** (page 16 §10.2–10.4).
- Combat feel: hit-stop, shake, knockback, stagger; damage numbers; combat log; the damage meter.
- Shader warm-up; pooled lights; batched spell effects.

**Implements** page 05, 10 (Hearthvale monsters), 16 §6, §10, 17 §5.

**Acceptance**
- `one-owner.test.js` (spell power and every named multiplier applied once)
- Node: no strike from any Hearthvale monster at any rank produces NaN (Farhold R4 test pattern)
- `lag.spec.js`: a dodge pressed 100 ms before a hit (on screen, at 150 ms lag) avoids it
- `stutter.spec.js`: 0 shader programs linked during 30 s of combat after warm-up
- `budget.spec.js`: 12 mobs + 3 effects in view under High budgets

**Pulls in** `prototypes/farhold/js/{weapons,combat-feel,combat-fx,skills,rpg,affixes,effects,actors,mesh-merge}.js`
(rules copied into `js/rules/`, AI split into `js/sim/mob-ai.js`), `avatar-3d/js/{creatures,creature-types,spellfx,spellfx-batched}.js`,
`assets/js/assets.js` + fx sprites, `meters/js/{meter,meter-ui}.js`.

---

### M3 — Three classes: Warrior, Druid, Mage (L)

**Scope**
- `js/rules/spellbook.js`, the six-slot ladder (1/4/10/18/28/40) and resources (Fury, Mana, Focus).
- `data/spells/warrior.json`, `druid.json`, `mage.json` from their class files; the three class
  mechanics (Bulwark, Shapeshift with its per-form spell bars on `Shift+1`–`4`, Arcane Charge) in
  `js/rules/mechanics/`, on the class keys `Q` / `G` (page 02).
- Druid forms as creature bodies (bear, cat, owl, stag) with the form swap (page 17 §2.8).
- Only the spells a character can reach in the slice (levels 1–7: slots 1 and 4) are required to be
  complete; the other four per class may be data-complete but unplayed.
- Class outfits and starting armour looks; class voices; spell barks.

**Implements** page 06 + `classes/warrior.md`, `classes/druid.md`, `classes/mage.md`, 17 §2.5, §8.4.

**Acceptance**
- `ladder.test.js` (slots, calling levels, talent levels read from data match canon)
- `classes.test.js` (no spell shared between two classes — run over all class files that exist)
- `classes.spec.js`: each of the three boots and casts slots 1 and 2 on a dummy; druid enters and leaves
  each form available by level 7 and its bar changes
- Every spell's `fx` and `sfx` resolve to real effect kinds and catalogue ids

**Pulls in** `prototypes/farhold/js/{skilltalents,spellshapes,spellcard,classwear,titlelook}.js`,
`avatar-3d/js/class-outfits.js` + `data/class-outfits.json`, `prototypes/emberveil/data/class-looks.json`,
`shared/voices.js`.

---

### M4 — Items and loot (M)

**Scope**
- The seven canon rarities, bases, affixes with units restated, item level, uniques and Hearthvale's
  share of sets/legendaries (a few, to prove the pipeline), consumables.
- Personal loot, drop beacons, the reward popup, the 16-slot backpack + bag slot 1 (level 7), the paper doll
  with page 08's **15** slots, compare panel, vendors with buyback; coins as copper/silver/gold (00 §10).
  (Salvage and the forge unlock at 9, after the slice — the code may land here but stays locked.)
- `look.worn` for every Set/Unique/Legendary; gear shows on the body (page 17 §2.6).
- Compact item storage + rehydration (page 16 §12.1 rule 7).

**Implements** page 08, 09 (the slice's items), 17 §2.6, §4.1.

**Acceptance**
- `loot-sources.test.js` (every item has a source)
- Node: every affix stat is wired (Farhold `effects` "nothing is inert" test), every unique's power runs
  once (R23 test)
- `save-roundtrip.test.js` with a full inventory
- Playwright: kill → loot → equip → the body shows it → reload → still worn

**Pulls in** `prototypes/emberveil/js/loot.js` + `data/items.json`, `prototypes/farhold/js/{uniques,foci,gear,craft,questrewards}.js`,
`prototypes/farhold/data/uniques.json` + `tools/build-uniques.mjs`, `shared/rewards.js`, `shared/tooltip.js`,
`prototypes/farhold/js/waylight.js`.

---

### M5 — Progression 1–7 and the feature ladder (M)

**Scope**
- XP table to cap 60 on canon's smooth curve (`600 × 1.107^(L−1)`, page 07 — it replaces Farhold's
  stretched `setLevelCap`); level-ups; perk forest (one point per level from 2); attributes.
- The feature-unlock ladder for levels 1–7 exactly as listed in "What the slice contains" above: each
  unlock announced with a card, a sound and an Unlocks screen entry (canon rule 5). **No follower slot** —
  the first is level 8 (page 07).
- The first **calling quest** (`q_calling_<class>_1`, level 6) for each of the three classes.
- Save/load in IndexedDB; export a character as JSON.

**Implements** page 07 (levels 1–7 subset), 14 (calling quests for 3 classes), 16 §12.

**Acceptance**
- `dead-data.test.js` over `balance.json` progression knobs
- `save-roundtrip.test.js` complete for the slice's fields; the "no live field missing from
  `SAVE_FIELDS`" test
- Playwright: reach level 6 by `gainXp` (not by killing N rats — memory note *tests that pin wording*),
  the unlock card appears, the calling quest is offered

**Pulls in** `prototypes/farhold/js/{perks,retrain}.js`, `save.js` (pattern).

---

### M6 — Hearthvale's people and quests (L)

**Scope**
- Brightwater and the valley's NPCs with Lingo personalities and formant voices; the talk panel; the
  Wildmarch Lingo pack with pronunciations.
- Hearthvale's quests (main story opening, side quests, the barrow lead-in), dynamic events (page 14),
  phasing flags, the quest tracker, markers and the map.
- Homeward stone (7) and bind; **not** waystones (12) or mounts (10) yet — page 07's ladder.
- Heroes of the Wildmarch: Hearthvale's hero may be met and their introduction quest written, but
  recruiting waits for follower slot 1 at level 8; mercenary hiring likewise (page 07, page 15 §21).
- The unlock quests of levels 2–7 (sprint, potion belt, dodge roll, group finder, homeward stone).
- Ambience beds and night layer; footsteps by surface.

**Implements** page 01 (Hearthvale), 14 (Hearthvale), 15 §21.3, 17 §8.3, §8.5.

**Acceptance**
- `wording.test.js` (no stray `{`, "NaN", "undefined" in any rendered line; numbers via `format.js`)
- Lingo binding audit over the Wildmarch pack (Emberveil `bindings.test.js` pattern)
- Playwright: take a quest, complete it, turn it in, the phase flag changes what is on the ground
- Every NPC line is the same for two offline clients given the same seed (server-picked line)

**Pulls in** `lingo/js/{lingo,memory,relations,context}.js`, `conversations/js/conversations.js`,
`namegen/js/namegen.js`, `voice-lab/js/{formant-voice,voice}.js`, `shared/langdebug.js`,
`prototypes/farhold/js/{speech,sound,talkui,markers,quests,factions,followers,hire}.js`,
`prototypes/farhold/data/mercenaries.json`, `sfx/js/sfx.js`.

---

### M7 — Telegraphs, bosses and the Hollow Barrow with followers (XL)

**Scope**
- `js/rules/telegraph.js` + `data/mechanics.json`: every shape and kind of page 11; favour-the-dodger
  resolution (page 16 §10.1).
- `js/render/telegraphs.js`: the ground decals, rims, fills, patterns, colour-blind modes, cast bars
  (page 17 §4.3–4.5); `tg_*` sounds (page 11 §6); the centre banner (page 11 §8).
- `js/sim/boss.js`: phases by health %, adds, enrage, interrupts, dispels, **boss dialog** and
  **dialog opportunities** (page 11).
- `js/sim/follower-ai.js`: tank/healer/damage/support behaviour, **obeys every telegraph kind**, orders on
  `,` / Mouse 5 and the order ring (page 02 §5.17), downed/help-up (page 15 §21.7–21.8). Follower bodies
  count toward soaks and take a party slot; class pets do not (00 §10).
- Group finder offline: "Fill with followers" with **finder hires** for `d01` (page 15 §7.4).
- Boss crowd control: the **break bar** instead of stun/knockdown/root/disarm; the shared 90 s cast-pause
  lockout (00 §10).
- `d01_hollow_barrow`: layout, trash, sub-bosses, bosses, secret boss if page 12 defines one, loot;
  instance creation and reset.
- Boss voice lines pre-rendered at pull; warning lines fixed text (page 11 §9.2); each line's spoken length checked against the time to its telegraph's resolve.

**Implements** page 11, 12 (d01), 15 §4.6 (Normal instance), §21, 17 §4.3–4.5, §8.6.

**Acceptance**
- `telegraph.test.js` (every shape's inside test; every ability's warning ≥ page 11 minimum)
- `followers.test.js` (followers leave every danger zone with ≥ 0.3 s spare, soak when needed, spread
  when targeted, never stand in void)
- A test that every boss warning line, spoken in its boss's voice, ends before its telegraph resolves
- `telegraph.spec.js`: a test boss casts each kind; standing in hurts, leaving does not
- `dungeon.spec.js`: a bot-driven solo player + 4 finder hires clears d01 on Normal
- **Owner check** after this milestone: play the barrow.

**Pulls in** everything above + `prototypes/farhold/js/dungeon-plan.js` (filler rooms only),
`avatar-3d/js/spellfx.js` `pillar/vortex/storm/breath` for boss attacks.

---

### M8 — Slice polish, the bot, performance → "Slice 1.0" (M)

**Scope**
- `tools/sim-wildmarch.mjs` for levels 1–7 and d01: time per level, deaths and causes, d01 clear time
  solo-with-finder-hires vs 5 bots (target ≤ 1.3×), damage share per spell (flag any spell > 2× its class
  average).
- Tuning passes from the sim report. Budget pass on the three scenes. Settings complete for the slice.
  Every screen in the slice listed in `screens.json` and opened by `screens.spec.js`.
- Publish to stable **and** GitHub Pages (`tools/publish-pages.sh`) — the offline slice is public.

**Implements** page 16 §16.3, §17; 04 (all slice settings); 03 (all slice screens).

**Acceptance**
- Full node + Playwright suites green on 8401; stable A/B for any red (memory note)
- `budget.spec.js` all three scenes at Low and High
- Sim report committed to `prototypes/wildmarch/research/sim-slice.md` with the ≤ 1.3× result
- **Owner check**: Slice 1.0 review. Answers to `QUESTIONS.md` items the slice raised are folded into
  canon before Part 2.

---

## Part 2 — Go online

### M9 — The Node server (L)

**Scope**
- `server/main.mjs` running `js/sim/world.js` (the same code as the worker) with the `ws` package;
  `SocketTransport`; `config.json`; ports **8470** (dev) and **8471** (stable) (page 16 §18.1).
- Clock sync, snapshots at 20/10/4 Hz by distance, interest management (page 16 §8), binary snapshots
  (page 16 §9.1 stage 2).
- One player online, same experience as offline; the server restarts cleanly and saves characters to
  disk (JSON files) as a stand-in for the database.
- **Recommended**: Wildmarch moves to **its own git repository** at the start of this milestone (like
  TinyRTS), with playground modules copied in (page 16 §14.2) — question for the owner.

**Implements** page 16 §4, §7–§11.

**Acceptance**
- The whole offline Playwright suite passes against `?server=ws://localhost:8470`
- `bot-client.mjs --bots 50` in one layer: tick ≤ 25 ms, ≤ 24 KB/s per client
- Kill the server mid-fight → client shows "Connection lost", reconnect within 3 min restores the
  character in place (page 15 §2)

---

### M10 — Accounts, the database, two players (L)

**Scope**
- Supabase project (free tier for dev): Auth sign-up/sign-in/magic link, JWT check on `hello`,
  `server/migrations/*.sql` for page 16 §12.3 tables, row-level security denying client writes.
- `scr_login`, `scr_realm_select`, `scr_char_select`, `scr_queue` (new); name rules (page 15 §19) with
  the reserved list built by `tools/build-reserved-names.mjs`.
- Session lock, 60 s dirty flush, important-event saves, item rows with unique uids.
- **Two players in one layer**: see each other, fight the same mobs, personal loot, Say chat.

**Implements** page 15 §2, §3 (one dev realm), §19; 16 §4.2, §12.

**Acceptance**
- `names.test.js`; migrations apply to an empty database and are recorded
- Two-context Playwright: both players see each other move and fight; one logs out, the other sees
  them vanish; relog restores both
- A deliberate double-move of one item uid fails for the second mover (duplication test)

---

### M11 — Social core (L)

**Scope**
- Parties (invite, leader, markers, ready/role check, level sync), XP sharing, the gift window.
- Chat: every channel of page 15 §9.1 except custom channels; commands; links; rate limits; word filter.
- Friends, Kin, ignore, recent; whispers; emotes (all of page 15 §12) with the emote wheel.
- Trade window. Mail (without market mail yet).
- Layers: soft/hard caps, party-first placement, merge; phasing in parties.
- Group finder for **Normal d01**, with follower fill.
- Reporting and the auto-silence rule; GM commands (mute, kick, teleport) for the owner's account.

**Implements** page 15 §4–§7 (Normal), §9–§13, §15 (mail), §18.

**Acceptance**
- `trade.test.js`, `mail.test.js` (races, conservation of gold and items)
- Four-context Playwright: a party of 3 players + 2 finder hires clears d01 through the finder
- Rate-limit test: the 6th message in 10 s is refused
- Ignore hides all of chat, whisper, invite, trade and mail from that player
- **Owner check**: public test realm decision (VPS + Supabase Pro, page 16 §4.4).

---

## Part 3 — Grow the game

The canon has 30 classes, 11 regions + Highcourt, 14 dungeons, 5 raids and 8+ world bosses. Content is
built **region by region** with **classes in waves** alongside, so every region lands with the classes
that can play it.

### M12 — Class wave A + Mossfen, Greyridge, Highcourt (XL)

**Scope**
- Classes wave A (10, covering all four roles): **paladin, ranger, rogue, cleric, necromancer, shaman,
  knight, monk, pyromancer, tactician** — spells for slots 1/4/10/18 complete (the levels these regions
  reach), calling 1 (level 6); the three slice classes get slots 10 and 18 too.
- Regions `mossfen` (5–12), `greyridge` (10–18), `highcourt` (capital): baked terrain, towns, NPCs,
  quests, events, the first world boss in region 3.
- Dungeons `d02_drowned_mill`, `d03_deepdelve`, `d04_bellows_keep` (Normal).
- **Talent tier 1 (level 12)** for every class that exists; the page 07 ladder from 8 to 18: **first
  follower slot** (8, `q_mf_coin_for_a_blade`, Reedhollow) and heroes/mercenaries, crafting (9), boats (9),
  spell slot 3 + **first mount** + Challenge + duels (10), **bank, mail and market** unlock quest (11),
  **waystones** + portals + the Unbinder (12), **follower slot 2** + **guild charter** (15), upgrade bench (16),
  spell slot 4 (18); region transitions at gates (page 16 §11).

**Implements** page 01, 06, 07, 10, 12, 13 (world boss 1), 14 for these regions.

**Acceptance** — per class: `classes.spec.js` row; per region: `ground-agrees`, quest chain completes by
bot, `loot-sources`; per dungeon: bot clear with followers on Normal; sim report to level 18 with 13
classes.

**Pulls in** `prototypes/farhold/js/warbands.js` + data (enemy races), creature bodies for new families.

---

### M13 — Guilds, the Trading Post, crafting, reputation (L)

**Scope**
- Guilds complete (ranks, permissions, bank with logs, renown, perks, news, calendar, guild finder).
- The Trading Post (listing, commodities, search, price history, deposits and cut, mail delivery).
- Crafting and salvage at full scope (page 08); reputation with Hearthvale–Greyridge factions (page 07).
- Economy log and alerts (page 15 §17).

**Implements** page 15 §8, §14, §17 (economy), 08 (crafting), 07 (reputation).

**Acceptance** — `market.test.js`, `guildbank.test.js` (two officers withdrawing the last item at once:
exactly one gets it); a 100-bot economy run shows gold sinks ≥ 80% of faucets over a simulated week
(page 08 sets the real target).

---

### M14 — Class wave B + Sunscar, Whisperwood, Cinder Steppe + the first raid (XL)

**Scope**
- Classes wave B (10): **fighter, bard, warlock, demon_hunter, swashbuckler, stormcaller, oracle,
  witch_hunter, runesmith, tinker**.
- Regions 4–6 with d05–d09 and their world bosses; talent tier 2 (level 22); spell slot 5 (level 28)
  and calling 2 (level 20) for every class that exists; wave B gets slots 1–5 and callings 1–2.
- Page 07 ladder 20–34: Riding II (20), wardrobe and **follower slot 3** (25), skyways (25), dual spec (30),
  upgrade bench second voice (34). (The level-20 battleground/war-mode unlock quest lands with PvP in M18.)
- **Heroic dungeons** framework (level 60 versions are built now, tuned at M16).
- **Raid framework**: raid groups, 10-player instances, weekly lockouts, raid frames, raid warnings, raid
  finder by wing; `r01_barrowking` (level 30, 5 + 1 secret bosses).
- Any creature body plan a boss of these regions needs (page 17 §3).

**Implements** page 06, 12 (d05–d09), 13 (r01), 15 §6, §7 (raid finder).

**Acceptance** — per boss: telegraph test data, warning lines fit; r01 cleared by 10 bots (perfect
dodgers) and failed at the expected rate by sloppy bots; 20-player effects budget scene.

---

### M15 — Class wave C + Frostmantle, Drowned Coast, Riftmarch + raids 2–3 (XL)

**Scope**
- Classes wave C (the last 7): **scavenger, dragon_knight, chronomancer, sorcerer, shadow_dancer,
  priest, enchanter** — slots 1–6 and all three callings; spell slot 6 (level 40) and calling 3 (level 40)
  for every other class. All **30** classes playable.
- Regions 7–9, d10–d12, world bosses, `r02_glacier_throne` (42, 10), `r03_sunken_choir` (50, 10/20) with
  **Mythic 20-player** framework; talent tier 3 (level 32); callings at 40 (Dragon Form etc.); **follower
  slot 4** (35); Riding III, the swimming and leaping mount (40).

**Acceptance** — `classes.test.js` across all 30 (no shared spells); every class boots in `classes.spec.js`;
Mythic lockout test; sim report to level 50 across 30 classes flags no class more than 20% off the median
clear time.

---

### M16 — Emberthrone, Veilspire, endgame (XL)

**Scope**
- Regions 10–11, d13–d14, `r04_ember_court` (60, 10/20), `r05_veilspire` (60, 20), talent tier 4 (45),
  level cap 60 content.
- Heroic tuning for all 14 dungeons; **Mythic+** (keystones, timer, key levels, affixes per page 12);
  weekly/daily systems (page 14); seasonal world bosses; Renown; `cur_delve` Delver's Marks,
  `cur_oathstone` Oathstones and `cur_veil_sigil` Veil Sigils vendors at full scope (page 08 §17).
- **Flying mounts**: Riding IV at 60 through the `q_sky_1`…`q_sky_5` chain (page 07); before 60 winged
  mounts run and glide.

**Acceptance** — sim 1→60 per class within page 07's target time curve; every secret boss reachable;
Mythic+ key level scaling test; every raid boss killable by perfect bots and not by sloppy ones.

---

### M17 — Art and audio completion pass (L)

**Scope**
- Every Set/Unique/Legendary has a hand-authored `look.worn`; every status has an aura; every boss has a
  tuned voice; all new `tg_*`, boss, class-mechanic and social sfx ids; region ambience complete.
- Chibi 2 **LOD 1** body and **stand-ins**; sheathed weapons; nameplates final.
- Music decision executed (page 17 §8.7).
- Colour-blind modes checked by screenshot review; UI scale 75–150% on every screen.

**Acceptance** — `budget.spec.js` town (40) and raid (20) scenes at every tier; tests for "every Set/Unique/
Legendary has `look.worn`", "every telegraph kind has a `tg_*` sound", "every status has an aura or is
listed as mote-only".

---

## Part 4 — PvP, hardening, launch

### M18 — PvP (L)

**Scope** — per 00 §10 (**Resolved**): **duels from level 10**; **battlegrounds and the open-world
war-mode flag from level 20** (unlock quest `q_hc_the_proving_yard`); **rated arenas at level 60** (and the
level-60 unrated skirmish queue, page 15 §16.3). Also guild feuds, grief brakes, the PvP currencies
`cur_glory` Glory and `cur_laurels` Laurels (page 08 §17), five arena maps, seasons, the Even Footing
template (page 15 §16; page 05 PvP maths). Open detail questions (group duels, item powers in rated play)
are page 15 §24.

**Acceptance** — duel end at 1 health and refused below level 10; war-mode flag refused below 20; flag
timer; DR (diminishing returns) on control effects; a battleground to completion with 20 bots; rated arena
refused below 60; arena match to completion with 6 bots; rating maths test.

---

### M19 — Anti-cheat, moderation, operations (M)

**Scope** — every server check in page 15 §17 with tests that feed it cheating inputs; staff roles and
the audit log; tickets; chat and economy log retention jobs; deploy by GitHub Actions to a VPS; backups
to S3; health endpoint; restart broadcast; monitoring line (page 16 §18.2).

**Acceptance** — speed/teleport/no-clip/cooldown/range cheat bots are all refused; a restart with 200
bots online saves every character and reconnects them; `bot-client.mjs --bots 1000` across one realm
process: tick ≤ 30 ms.

---

### M20 — Closed alpha → open beta (M)

**Scope** — invite-only realm (alpha), bug-report flow into the dev server inbox, balance passes from real
play, the code of conduct and account deletion/export, then an open beta realm per server region.

**Acceptance** — a week of alpha with no data-loss bug; beta realm holds its target concurrent players
(measured, page 16 §17.4).

---

### M21 — Launch (S)

Two realms (NA, EU), Supabase Pro, production domain, status page, the launch checklist (backups verified
by a restore, GM accounts, reserved names refreshed, a rollback plan for the client and server versions).

---

## Milestone summary

| # | Name | Size | Pages implemented | Key playground modules |
|---|---|---|---|---|
| M0 | Skeleton | S | 16 | serve.py, preload-modules, format, rng |
| M1 | Walk in Hearthvale | M | 01, 02, 03, 04, 16, 17 | highdef-3d, Farhold graphics, Chibi 2, weather |
| M2 | Combat core | L | 05, 10, 16, 17 | Farhold rules, creatures, spellfx, meters |
| M3 | Warrior, Druid, Mage | L | 06 + 3 class files, 17 | skilltalents, class-outfits, voices |
| M4 | Items and loot | M | 08, 09, 17 | Emberveil loot, Farhold uniques/foci/gear |
| M5 | Progression 1–7 | M | 07, 14, 16 | perks, retrain |
| M6 | Hearthvale's people and quests | L | 01, 14, 15 §21, 17 | lingo, conversations, formant voice, sfx |
| M7 | Telegraphs, bosses, d01 with followers | XL | 11, 12, 15, 17 | spellfx area methods, followers |
| M8 | Slice 1.0 | M | 03, 04, 16 | sim pattern |
| M9 | Node server | L | 16 | — (same sim) |
| M10 | Accounts, database, two players | L | 15, 16 | Supabase |
| M11 | Social core | L | 15 | meters (group), emotes |
| M12 | Wave A + regions 2–3 + Highcourt | XL | 01, 06, 07, 10, 12, 13, 14 | warbands |
| M13 | Guilds, market, crafting, reputation | L | 07, 08, 15 | craft, factions |
| M14 | Wave B + regions 4–6 + r01 | XL | 06, 12, 13, 15 | creatures |
| M15 | Wave C + regions 7–9 + r02–r03 | XL | 06, 12, 13 | |
| M16 | Regions 10–11, endgame | XL | 12, 13, 14 | |
| M17 | Art and audio completion | L | 17 | Chibi 2 (LOD), sfx catalog |
| M18 | PvP | L | 05, 15 | |
| M19 | Anti-cheat, moderation, ops | M | 15, 16 | |
| M20 | Alpha → beta | M | all | |
| M21 | Launch | S | all | |

## Risks and what to do about each

| Risk | What it would look like | Mitigation |
|---|---|---|
| Two copies of a rule drift apart | Client shows 140%, server does 196% | `js/rules/` shared by both; `one-owner.test.js` (M2) |
| A saved field silently dropped | Reload loses talents (Farhold R20) | `SAVE_FIELDS` table + round-trip test (M5) |
| A finished module nothing calls | Feature "does nothing" (Farhold's signature fault, rounds 11–16) | Every milestone's acceptance includes a Playwright path that uses the feature from the UI |
| A knob nobody reads | Tuning has no effect | `dead-data.test.js` moves each knob (M0 onward) |
| Telegraphs unreadable in a 20-player raid | Deaths feel unfair | Rules in page 17 §4.3; 20-raid budget scene (M14) |
| Shader stutter on hits | Frame drops on every impact | Warm-up + no light toggling; `stutter.spec.js` (M2) |
| Chibi 2 crowds too heavy | Town at 20 fps | LOD 1 + stand-ins (M17, earlier if M11 shows it) |
| 30 bespoke kits balloon | Class waves slip | Waves of 10; the sim flags outliers; class files are the spec |
| Server cost/time | A tick over budget | Measure with `bot-client.mjs` at M9, M11, M19 before promising capacity |
| A half-written import breaks the page the owner is on | Blank screen | The owner always gets 8400 (stable); `publish-stable.sh` refuses unparsable commits |
