# WILDMARCH — Design Bible, page 18: roadmap

**Status:** v0.2 draft — 2026-09-30 (round 2 applied). **Nothing is built.** Owner of this page: **the
order v2 is built in.** Each milestone lists its scope, the bible pages it implements, the tests that say
it is done (acceptance), and the playground modules it pulls in. The reuse map and module names are on
[page 16](16-TECH.md) ("Client modules and the reuse map"); the offline-first plan is page 16's "Offline
single-player first" section.

Round 2 (canon [00 §12](00-OVERVIEW.md#12-round-2-rulings-2026-09-30)) changed this page in five ways:

1. **Removed**: raids (parked in [`WISHLIST.md`](WISHLIST.md)), PvP beyond friendly duels (battlegrounds,
   arenas, the open-world flag), the progression track that followed level 60, rested XP, every currency but
   gold, the day/night clock and the light slot, the old flight network, keyed timed dungeons, attunement,
   daily and weekly quests, raid frames.
2. **Added milestones** for tab targeting (early — every spell is written against it), tags, monster
   rarities, the item card with its 3D portrait and the five special rarities, sockets (gem, jewel, soul,
   gadget), Harvesting and the crafting professions, Travel Methods, Depth and Challenge mode, and the two
   5-player story finales `d15_fire_court` and `d16_the_spire`.
3. A new **Part 2, "Offline systems"**, builds those systems while the game is still offline and solo, so
   the order stays: *offline slice → offline systems → online → content → launch*.
4. Renames: `emberthrone` → `kingsfire`, `veilspire` → `spire_isle`, the old hard difficulty → **Challenge**,
   the old timed-key mode → **Depth**, the homeward stone → **Recall Stone** (`it_recall_stone`), the group finder →
   **Dungeon Finder**, dual spec → **Second Loadout**.
5. Page links: page 13 is now [`13-WORLD-BOSSES.md`](13-WORLD-BOSSES.md); new pages
   [`19-PROFESSIONS.md`](19-PROFESSIONS.md) and [`20-TRAVEL.md`](20-TRAVEL.md).

## How to read this page

- **Milestones are in order.** Each one ends with the game playable and the tests green, published to
  the stable server (8400) with `tools/publish-stable.sh`. Nothing is half-built across a milestone line.
- **Size** is relative: **S** (one focused session), **M** (a few), **L** (a round of work), **XL** (several
  rounds; split into sub-milestones when it starts). No calendar dates — the owner's review rhythm sets
  the pace.
- **Acceptance tests** are named by file; page 16's "Testing plan" describes the kinds. A milestone is done
  when its acceptance tests exist, pass, and would fail on the code before the milestone (a test that could
  never fail proves nothing).
- **Every milestone's acceptance includes a Playwright path that uses the feature from the UI.** Farhold's
  most common fault was a finished module that nothing called; a node test alone cannot catch that.
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
 Part 1  OFFLINE VERTICAL SLICE     M0 ─ M11    one region, one dungeon, three classes, finder hires
 Part 2  OFFLINE SYSTEMS            M12 ─ M16   item card + special rarities, sockets, professions,
                                                Travel Methods, Depth + Challenge — still solo, no server
 Part 3  GO ONLINE                  M17 ─ M20   server, accounts, parties of 5, Dungeon Finder,
                                                chat, trade, mail, Trading Post, guilds, duels
 Part 4  GROW THE GAME              M21 ─ M27   all 30 classes, regions 2–11, d02–d16, world bosses,
                                                factions, endgame, art and audio completion
 Part 5  HARDENING AND LAUNCH       M28 ─ M30   anti-cheat, moderation, alpha, beta, launch
```

### Dependency graph

An arrow means "must be finished first". Parts run left to right; inside a part the arrows are the only
ordering that matters.

```
M0 ─► M1 ─► M2 targeting ─► M3 combat ─► M4 tags ─► M5 classes ─► M6 items ─► M7 monster rarities
                                                                     │                │
                                            M8 progression ◄─────────┘                │
                                                 │                                    │
                                            M9 people + quests ─► M10 d01 + followers ◄┘ ─► M11 Slice 1.0
                                                                                                 │
   ┌─────────────────────────────────────────────────────────────────────────────────────────────┘
   ▼
M12 item card + special rarities ─► M13 sockets ─► M14 Harvesting + professions (gadgets close M13's loop)
M11 ─► M15 Travel Methods (needs M9's roads and stations, not M12–M14)
M11 + M13 ─► M16 Depth + Challenge (Depth rewards include jewels, souls and special rarities)
   │
   ▼  (M12–M16 all done)
M17 server ─► M18 accounts, two players ─► M19 parties, chat, Dungeon Finder, shared travel ─► M20 economy, guilds, duels
   │
   ▼
M21 wave A + regions 2–3 + Highcourt ─► M22 wave B + regions 4–6 ─► M23 wave C + regions 7–9
   ─► M24 Kingsfire + Spire Isle + d13–d14 ─► M25 d15 + d16 story finales ─► M26 endgame pass ─► M27 art + audio
   │
   ▼
M28 anti-cheat, moderation, ops ─► M29 alpha → beta ─► M30 launch
```

**Recommendation: build the offline vertical slice first** — Hearthvale (levels 1–6), the dungeon
`d01_hollow_barrow` (5–7), and three classes: **Warrior** (tank), **Druid** (healer, whose shapeshift
turns each of its six spells into a different spell — the hardest class mechanic, so it proves the class
system), and **Mage** (damage, with a tank hybrid through wards and decoys). Together they fill a dungeon
group's roles. The slice is played in the browser with the server code running in a worker
(`LocalTransport`), so it proves the rules/sim/render split, is publishable to GitHub Pages with no
hosting, and gives the owner something real to play months before networking. This is canon 00 §10
"Offline solo": the game must be fully playable offline, solo, with followers, and the build starts
this way.

### What the slice contains (from 00 §4, §10 and §12)

The slice covers **levels 1–7** (Hearthvale 1–6 and `d01_hollow_barrow` 5–7), so it carries exactly the
part of page 07's ladder that falls in those levels, plus the rules canon fixes for everything it touches:

| Area | In the slice | Owner |
|---|---|---|
| Unlocks (page 07 ladder, levels 1–7) | day-one kit + spell slot 1 (1) · perk forest (2) · **sprint** `q_hv_the_long_field` (2) · **potion belt**, 2 slots, `q_hv_the_herbwifes_basket` (3) · **spell slot 2** (4) · **dodge roll** `q_hv_fall_and_rise` (5) · player trade (5; online only — shown greyed offline) · **Calling I** `q_calling_<class>_1` (6) · **Dungeon Finder + dungeon journal** `q_hv_the_barrow_bell` (6) · **Recall Stone** `it_recall_stone` (7; page 14 owns the quest id) · bag slot 1 (7). Each with its card, sound and Unlocks-screen row | 07 |
| Not in the slice (the ladder puts them later) | own follower slots (8/15/25/35) · Harvesting + one crafting profession (9) · spell slot 3, first mount, duels (10) · bank/mail/Trading Post (11) · talents tier 1, waystones, Travel Methods (12) · guild charter (15) · calling II + faster mount (20) · wardrobe (25) · Second Loadout (30) · calling III + swim/leap mount (40) · Challenge mode, deep Depths, the flying mount chain (60) | 07 |
| Followers | a character has **no follower slot of its own** before level 8, so the slice uses **finder hires** ([page 15](15-SOCIAL-ONLINE.md) "Filling with followers"): free followers of the missing roles for one Normal `d01` run, offered by the Dungeon Finder's "Fill with followers" — which works offline because it needs no other player. A finder hire takes a party slot (00 §10) | 15 |
| Keys | page 02's table: `WASD`, `Space`, `F` dodge (from 5), `E`, `1`–`6`, `Q` / `G` class keys, `Shift+1`–`4` druid forms, **`Tab` next enemy**, **`F1` target yourself**, **`F2`–`F5` party members**, `M`, `I`, `K`, `N`, `J`, `Shift+J`, `P`, `O`, `Alt+1`–`4` boss-dialog replies, `,` / Mouse 5 follower orders. (No `L` key — there is no light slot) | 02 |
| Targeting | **Tab targeting** (00 §12.1 W8): one hard target that never changes by itself; every slice spell is marked Needs target, Auto-target, Ground or Self | 02/05 |
| Combat | GCD 1.0 s; **tags** on every spell, basic attack and affix; bosses ignore stun/knockdown/root/disarm and fill a **break bar** instead; one shared 90 s cast-pause lockout per boss; no limit on in-combat revives | 05/11 |
| Monsters | Normal, **Champion packs** (blue names, one shared affix), **Rares** (yellow, 2–3 affixes + minions), Named, Boss; **greater rarities** (Giant, Flaming, Electrified, Frozen) with their exclusion rule | 10 |
| Telegraphs | page 11's vocabulary, colours and palettes (read from `mechanics.json`, never restated) | 11 |
| Items | the **15** slots of page 08 §2 (incl. the **tool** slot, empty until level 9); the seven rarities with Legendary violet `#c86bff`; personal loot; items tradeable (quest items excepted); **gold only**; quivers as damage stat-sticks; the seven magic-find stats read by the drop tables. The item card is plain until M12 | 08 |
| Levels | XP curve `600 × 1.107^(L−1)`, perk points from 2, no rested XP | 07 |
| Light | **always daylight**; the barrow interior is film-set dark (page 17) | 17 |
| Save | offline IndexedDB save of every field above (page 16 "Offline saves") | 16 |

---

## Part 1 — The offline vertical slice

### M0 — Skeleton (S)

**Scope**
- Folder layout of page 16's "Folder layout": `index.html` with the import map and a generated
  modulepreload block, `css/`, `js/{rules,sim,net,render,ui,audio,offline}/`, `data/`, `server/`,
  `tools/`, `tests/`.
- `js/net/transport.js` with `LocalTransport` (worker + lag simulator `?lag=&jitter=&loss=`) and a stub
  `SocketTransport`; `js/offline/local-server.js` ticking an empty world at 20 Hz; `js/rules/protocol.js`
  with `hello`/`welcome`/`in`/`snap`/`ping`/`pong`.
- `tools/validate-data.mjs`; the first `balance.json`, `classes.json` (all 30 rows from canon §6, even
  though only 3 are playable), `unlocks.json`, `bindings.json`, `settings.json`, `screens.json`,
  `tags.json`, `mechanics.json` (the full data-file list is page 16 "Data files").
- Tests wired into the playground: `package.json` `test:unit` gets `prototypes/wildmarch/tests/*.test.js`.
- A card for Wildmarch on the playground `index.html`; its row in `CLAUDE.md`'s Prototypes table moves from
  "docs" to "building"; `docs/playground.md` line; `prototypes/wildmarch/README.md` (playground convention 6).

**Implements** page 16 (words, constraints, architecture, folder layout, offline-first).

**Acceptance**
- `purity.test.js` (no `three`/`document`/`window`/`localStorage`/`fetch(`/`Math.random` in `js/rules` or `js/sim`)
- `filenames.test.js` (no blocker-unsafe names — Farhold's `beacon.js` lesson)
- `protocol.test.js`, `data.test.js`
- `boot.spec.js`: the page loads on 8401 with **zero console errors** and the worker answers `pong`
- `publish-stable.sh` accepts the commit

**Pulls in** `tools/serve.py`, `tools/preload-modules.py`, `shared/format.js`, `shared/store.js`,
`prototypes/emberveil/js/rng.js`.

---

### M1 — Walk in Hearthvale (M)

**Scope**
- `tools/bake-region.mjs` and `data/regions/hearthvale/shape.json` → `height.u16`, `water.u8`, `nav.u8`,
  `surface.u8` (page 16 "Instancing and processes"). First pass: the river, the farm valley, Brightwater's
  plateau, the road, the barrow hill.
- `js/render/region.js`: terrain with surface blending, water, vegetation scatter, GPU grass, a **fixed
  daytime sky** (no clock — canon 00 §4 "Day and light"), height fog, post chain — through `enhance()`.
  The sun's angle and colour are per-region data, not a time of day.
- `js/sim/movement.js` (shared with prediction): ground from the baked heightmap, collision with scatter
  trunks/rocks and buildings, swimming, jumping.
- Player body: Chibi 2 with the four race presets (Human, Elf, Dwarf, Halfling); third-person camera;
  `js/net/predict.js` + `interp.js`.
- Title → "Play offline" → `scr_char_create` (race, body, face, class preview) → spawn in Brightwater.
- Graphics presets (page 04's graphics tab, plus page 17's art knobs) with the first-launch machine check;
  `?quality=low` = the Low preset.

**Implements** page 01 (Hearthvale geography), 02 (movement keys), 03 (`scr_login`, `scr_char_create`,
basic HUD), 04 (graphics + controls tabs), 16 (timing, instancing), 17 (environment, lighting, budgets).

**Acceptance**
- `ground-agrees.test.js` (mesh, movement and water agree to 5 cm at 1,000 points — Farhold's water
  staircase lesson)
- Walking the grass patch does not move any blade (highdef `grass.test.js` pattern)
- `daylight.test.js`: no module reads a time of day; the sky and sun of every region come from its data
- `boot.spec.js` extended: each race builds and walks 20 m; `budget.spec.js` open-field numbers
- `lag.spec.js`: at `?lag=150`, own movement stays smooth and ends where the server says

**Pulls in** `highdef-3d/js/{materials,sky,terrain,water,grass,vegetation,scatter,quality}.js`,
`highdef-3d/js/kit/{trees,rocks,textures}.js`, `highdef-3d/data/vegetation.json`,
`prototypes/farhold/js/{graphics,gfx,postfx,wind,rain,atmosphere,sky-palette,grass-gpu,grass-plan}.js`,
`avatar-3d/js/chibi2*.js`, `chibi2-races.js`, `prototypes/farhold/js/{bodypresets,appearance,figure3d,player,ground}.js`
(player controller as reference), `worldgen/js/{noise,weather}.js`. **Not** Farhold's `light.js` or
`nightlights.js` (no night, no carried light).

---

### M2 — Tab targeting (M) (new)

Every spell in every class file says **Needs target**, **Auto-target**, **Ground** or **Self**
(00 §5, §12.1 W8), so the targeting model is built **before** any spell or basic attack exists.

**Scope**
- `js/rules/targeting.js` (pure, node-testable): the **hard target** — one entity id per player, held on
  the server. It changes **only** when the player changes it: `Tab` (next enemy, nearest-to-aim first, then
  cycling outward), `Shift+Tab` (previous) if page 02 binds it, a click on a body or a nameplate, `F1`
  (yourself), `F2`–`F5` (party members 1–4, followers included), a click on a party frame, clear with
  `Esc`, or **the target dying** (then it is empty; it never jumps to a neighbour). No "closest" or "last
  hit" fallback may ever write the hard target.
- The four spell targeting kinds as one check each:
  - **Needs target** — refused with a plain message ("You need a target") if the hard target is missing,
    the wrong side (a heal on an enemy), out of range or out of line of sight.
  - **Auto-target** — casts on the hard target if it is valid; if not, picks **the valid target closest to
    where the player is aiming** (smallest angle from the camera ray, distance only breaking ties) within
    the spell's range, and casts on it. Whether that pick also becomes the hard target is the setting
    page 04 names (default: yes).
  - **Ground** — a reticle on the ground at the aim point, clamped to range.
  - **Self** — always the caster.
- `js/ui/target-frame.js`: the one target frame (name, level, rarity colour, health, cast bar, statuses)
  and the target-of-target line; nameplate highlight on the hard target; the party frames 1–5 with the
  player first (`F1`) and click-to-target.
- A dummy yard in Brightwater: 6 training dummies, 2 friendly dummies to heal, and a moving dummy, so the
  model is tested before combat exists.

**Implements** page 02 (targeting model, `Tab`/`F1`–`F5`), 03 (target frame, party frames), 04 (the
auto-target-sets-target option), 16 (targeted-spell lag rules).

**Acceptance**
- `targeting.test.js`: 1,000 random frames of moving dummies, a player hitting one of them and another
  walking closer — the hard target never changes unless an input event or a death changed it (the Farhold
  "wrong health bar" bug as a test)
- `autotarget.test.js`: with no target, Auto-target picks the smallest-angle valid body inside range;
  ignores out-of-range, dead and friendly bodies; Needs target refuses with the right message
- `targeting.spec.js`: `Tab` cycles 3 dummies in order; `F1` targets self and a Self-or-Ally heal lands on
  the caster; `F2` targets party member 1; the frame shows the right name after each

**Pulls in** `prototypes/farhold/js/targetpick.js` (`lookedAt` is the "closest to where you aim" rule;
its sticky fallbacks are **not** reused — they are what Wildmarch's hard target replaces),
`prototypes/farhold/js/actors.js` (hit-scan as reference), `prototypes/farhold/js/hud.js` (frame look).

---

### M3 — Combat core (L)

**Scope**
- Basic weapon attacks as patterns (sword slash-slash-overhead etc.), the three-part swing (wind-up,
  damage, recovery), **dodge roll** (`F`, unlocked at level 5 by `q_hv_fall_and_rise`) with the
  server-granted invulnerable window, block/guard as page 05 defines it. Basic attacks follow the hard
  target when there is one (M2) and swing at the aim point when there is not.
- Statuses, damage maths, threat table and the tank's **Provoke**, death and revive (no limit on in-combat revives —
  W21), respawn at the town.
- Mobs: Hearthvale's families (page 10) with AI and packs, loot hooks (stub drops); the **Sootwick** warband
  where page 10 places it in Hearthvale (band 2–18). Rarity layers are M7.
- **Server-side hit resolution with lag compensation** (page 16 "Lag compensation").
- Combat feel: hit-stop, shake, knockback, stagger; damage numbers; combat log; the **damage meter**
  (kept — W16).
- Shader warm-up; pooled lights; batched spell effects.

**Implements** page 05, 10 (Hearthvale monsters), 16 (simulation split, lag compensation), 17 (effects).

**Acceptance**
- `one-owner.test.js` (spell power and every named multiplier applied once — Farhold R22's squared
  spell power)
- Node: no strike from any Hearthvale monster produces NaN (Farhold R4 test pattern)
- `lag.spec.js`: a dodge pressed 100 ms before a hit (on screen, at 150 ms lag) avoids it
- `stutter.spec.js`: 0 shader programs linked during 30 s of combat after warm-up (memory note *three.js
  shader-recompile stutter*)
- `budget.spec.js`: 12 mobs + 3 effects in view under High budgets
- Playwright: open the damage meter mid-fight and drill down actor → spell → hit

**Pulls in** `prototypes/farhold/js/{weapons,combat-feel,combat-fx,skills,rpg,affixes,effects,actors,mesh-merge}.js`
(rules copied into `js/rules/`, AI split into `js/sim/mob-ai.js`), `avatar-3d/js/{creatures,creature-types,spellfx,spellfx-batched}.js`,
`assets/js/assets.js` + fx sprites, `meters/js/{meter,meter-ui}.js`.

---

### M4 — Tags (S) (new)

**Scope**
- `data/tags.json`: page 05's tag list, every entry a `tag_` id with a player-facing name and a group
  (element, delivery, shape, source) — e.g. `tag_ice`, `tag_area`, `tag_ranged`, `tag_spell`,
  `tag_basic_attack`.
- `js/rules/tags.js`: a bonus names **one or more** tags and applies to a hit only when the hit carries
  **all** of them ("+20% damage with Area Spells" needs `tag_area` **and** `tag_spell`). One function,
  called from the one place damage is summed, so no bonus can be applied twice.
- Tags on basic attacks (weapon type + `tag_basic_attack`), on every monster ability, and on the affix
  table. Every spell written from M5 on carries its tags.
- The tags are shown on the spell card and the item card as small labelled chips (page 03).

**Implements** page 05 (tags section), 08 (tag affixes), 03 (tag chips).

**Acceptance**
- `tags.test.js`: every spell, basic attack, monster ability and affix carries at least one tag that
  exists in `tags.json`; every tag in `tags.json` is used by something (no orphan tags)
- `tag-bonus.test.js`: a +10% Ice bonus changes an Ice hit and not a Fire hit; an Area+Spell bonus
  changes an area spell and not an area basic attack; two matching bonuses add, never multiply
- Move one tag bonus in data to an odd value and the damage the module returns moves with it (memory
  note *testing dead data rules*)

---

### M5 — Three classes: Warrior, Druid, Mage (L)

**Scope**
- `js/rules/spellbook.js`, the six-slot ladder (1/4/10/18/28/40) and the three resources: **Momentum**
  (Warrior), **Mana** (Druid, Mage). Tempo lands with its first class in M21.
- `data/spells/warrior.json`, `druid.json`, `mage.json` from their class files — every spell with its
  targeting kind (M2) and tags (M4); the three class mechanics (**Bulwark**; **Shapeshift**, where Bear,
  Wolf and Heron form turn each of the six spells into a different spell on `Shift+1`–`4`; **Resonance**
  with the mage's **Wards** for the tank hybrid) in `js/rules/mechanics/`, on the class keys `Q` / `G`.
- The Mage's out-of-combat **Portal** and the Druid's **Heron's Flight** are data-complete but locked
  until their levels (page 20); they are tested in M15.
- Druid forms as creature bodies with the form swap (page 17).
- Only the spells a character can reach in the slice (levels 1–7: slots 1 and 4) are required to be
  complete; the other four per class may be data-complete but unplayed.
- Class outfits and starting armour looks; class voices; spell barks.

**Implements** page 06 + `classes/warrior.md`, `classes/druid.md`, `classes/mage.md`, 17 (class looks,
voices).

**Acceptance**
- `ladder.test.js` (slots, calling levels, talent levels read from data match canon)
- `classes.test.js` (no spell shared between two classes — run over every class file that exists; every
  spell has a targeting kind and at least one tag)
- `classes.spec.js`: each of the three boots and casts slots 1 and 2 on a dummy; the druid enters and
  leaves each form available by level 7 and the same key casts a different spell in each form; the mage's
  ward pulls a dummy's attention
- Every spell's `fx` and `sfx` resolve to real effect kinds and catalogue ids

**Pulls in** `prototypes/farhold/js/{skilltalents,spellshapes,spellcard,classwear,titlelook}.js`,
`avatar-3d/js/class-outfits.js` + `data/class-outfits.json`, `prototypes/emberveil/data/class-looks.json`,
`shared/voices.js`.

---

### M6 — Items and loot (M)

**Scope**
- The seven canon rarities, bases, affixes with units restated (Farhold's `affixes.js` fraction-vs-percent
  lesson), item level 1–60 = the level needed, uniques and Hearthvale's share of sets/legendaries (a few,
  to prove the pipeline), consumables.
- **Quivers** as damage stat-sticks for bows and crossbows, compared on the same scale as off-hand foci;
  a quiver's basic-attack effect (fire arrows, exploding arrows, multi-shot) applies only to hits tagged
  `tag_basic_attack` (M4).
- **Magic find**: the seven `mf_` stats (gold find, item quantity, item rarity, XP gain, reputation gain,
  +profession skill level, profession XP gain). The drop table reads quantity and rarity; XP and gold read
  theirs; the reputation and profession stats are wired to stub receivers until M14 and M21 (page 08
  owns the formulas and caps).
- Personal loot, drop beacons, the reward popup, the 16-slot backpack + bag slot 1 (level 7), the paper doll
  with page 08's **15** slots (the tool slot shown, empty, "Opens at level 9"), compare panel, vendors
  with buyback; **gold only**. Items are tradeable; quest items say "Quest item" and cannot leave the bags.
- A plain item card (name, rarity colour, stats, tags). The 3D portrait and rarity frames are M12.
- `look.worn` for every Set/Unique/Legendary; gear shows on the body (page 17).
- Compact item storage + rehydration (page 16 "Persistence and save shape").

**Implements** page 08, 09 (the slice's items), 17 (worn gear).

**Acceptance**
- `loot-sources.test.js` (every item has a source — canon rule 4)
- Node: every affix stat is wired (Farhold `effects` "nothing is inert" test), every unique's power runs
  once (R23 test)
- `magicfind.test.js`: 100,000 seeded rolls at item quantity +0% / +50% and item rarity +0% / +100% move
  the mean drop count and the rarity mix by the amounts page 08 states (within 2%)
- `quiver.test.js`: a quiver's fire-arrow effect fires on a basic attack and never on a spell without
  `tag_basic_attack`
- `save-roundtrip.test.js` with a full inventory
- Playwright: kill → loot → equip → the body shows it → reload → still worn

**Pulls in** `prototypes/emberveil/js/loot.js` + `data/items.json`, `prototypes/farhold/js/{uniques,foci,gear,questrewards}.js`,
`prototypes/farhold/data/uniques.json` + `tools/build-uniques.mjs`, `shared/rewards.js`, `shared/tooltip.js`,
`prototypes/farhold/js/waylight.js` (loot beacons).

---

### M7 — Monster rarities (M) (new)

**Scope**
- `data/monster-rarities.json` (page 10 owns the lists): the **standard** modifiers (`mod_` ids) that a
  **Champion pack** shares (one affix for the whole group, blue names) and a **Rare** rolls (2–3 affixes,
  yellow name, a pack of minions); the **greater rarities** (`grr_` ids: Giant, Flaming, Electrified,
  Frozen and the rest of page 10's list), each with an **exclusion group** (`element`, `size`, …) so one
  monster takes at most one from each group — a Giant Flaming ogre is legal, Flaming + Electrified never.
- `js/rules/monster-rarity.js`: **open world** — rarities rolled at spawn from the region's odds (common);
  **dungeons** — placed by the dungeon's data (the room is known to hold a rare pack; which modifiers it
  gets is rolled). Greater rarities usually on **one** strong monster, rarely a whole group.
- Loot hooks: champion/rare/greater multipliers on quantity and rarity (page 08); a greater-rarity
  monster raises the matching **special rarity** chance (an Electrified monster → Electrified items) —
  wired to a stub until M12.
- Visuals (page 17): Giant scale, Flaming / Electrified / Frozen auras, nameplate badges and colours.
- The target frame (M2) shows the rarity colour and every modifier's name with a hover line in numbers.

**Implements** page 10 (monster rarities), 08 (rarity loot multipliers), 17 (greater-rarity looks).

**Acceptance**
- `monster-rarity.test.js`: 10,000 seeded open-world spawns never put two greater rarities of one
  exclusion group on a body; the share of Champion / Rare / greater matches page 10's odds within 1%
- A dungeon room marked "rare pack" holds one in every one of 200 seeded builds, with different modifiers
- Every `mod_`/`grr_` modifier is wired (move its number, the monster's behaviour moves)
- `rarity.spec.js`: a Giant Flaming rare spawns in the dummy yard with its scale, aura, yellow name and
  both badges

**Pulls in** `prototypes/farhold/js/{actors,encounters}.js` (champion/rare packs and auras),
`prototypes/farhold/data/enemies.json` (the 14 champion/rare modifiers as a starting list),
`avatar-3d/js/spellfx.js` status auras.

---

### M8 — Progression 1–7 and the feature ladder (M)

**Scope**
- XP table to cap 60 on canon's smooth curve (`600 × 1.107^(L−1)`, page 07 — it replaces Farhold's
  stretched `setLevelCap`); level-ups; perk forest (one point per level from 2); attributes (STR, DEX,
  INT, CON). **No rested XP.** The XP-gain magic-find stat (M6) applies here.
- The feature-unlock ladder for levels 1–7 exactly as listed in "What the slice contains": each unlock
  announced with a card, a sound and an Unlocks screen entry (canon rule 5). **No follower slot** — the
  first is level 8 (page 07).
- The first **calling quest** (`q_calling_<class>_1`, level 6) for each of the three classes.
- Save/load in IndexedDB; export a character as JSON.

**Implements** page 07 (levels 1–7 subset), 14 (calling quests for 3 classes), 16 (persistence).

**Acceptance**
- `dead-data.test.js` over `balance.json` progression knobs
- `save-roundtrip.test.js` complete for the slice's fields; the "no live field missing from
  `SAVE_FIELDS`" test (Farhold R20: talents that were never saved)
- Playwright: reach level 6 by `gainXp` (not by killing N rats — memory note *tests that pin wording*),
  the unlock card appears, the calling quest is offered

**Pulls in** `prototypes/farhold/js/{perks,retrain}.js`, `save.js` (pattern).

---

### M9 — Hearthvale's people and quests (L)

**Scope**
- Brightwater and the valley's NPCs with Lingo personalities and formant voices; the talk panel; the
  Wildmarch Lingo pack with pronunciations.
- Hearthvale's quests (main story opening, side quests, the barrow lead-in), dynamic events (page 14),
  phasing flags, the quest tracker, markers and the map.
- The **First Waystone** (`lm_first_waystone`) in Brightwater as a landmark; the **Recall Stone**
  (`it_recall_stone`, level 7; it starts bound at the starting town — the First Waystone for Brightwater,
  `lm_oakhollow_waystone` for Oakhollow, page 20 §15) and binding it at a town waystone or safe landmark (never a dungeon or a
  wild landmark — W24). Waystone travel (12), Travel Methods (12) and mounts (10) wait — page 07's ladder.
- **Discovery**: walking up to a dungeon entrance or a waystone records it on the character (the
  Dungeon Finder list and the travel map both read this record — W9).
- Hearthvale's **faction chapters** met in the slice (the Wardens' Vale watch, the Greenhand's farmers)
  with standing and page 07's tier names; rewards past the slice are data-only until M21.
- Heroes of the Wildmarch: Hearthvale's hero may be met and their introduction quest written, but
  recruiting waits for follower slot 1 at level 8; mercenary hiring likewise (page 07, page 15).
- The unlock quests of levels 2–7 (sprint, potion belt, dodge roll, Dungeon Finder, Recall Stone).
- Ambience beds (daytime only) and footsteps by surface.

**Implements** page 01 (Hearthvale), 14 (Hearthvale), 07 (reputation tiers), 15 (followers), 17
(ambience), 20 (Recall Stone, discovery).

**Acceptance**
- `wording.test.js` (no stray `{`, "NaN", "undefined" in any rendered line; numbers via `format.js`)
- Lingo binding audit over the Wildmarch pack (Emberveil `bindings.test.js` pattern)
- Playwright: take a quest, complete it, turn it in, the phase flag changes what is on the ground
- Playwright: bind the Recall Stone at Brightwater's waystone, walk 300 m, use it, arrive at the waystone;
  binding at the barrow entrance is refused with the reason
- Every NPC line is the same for two offline clients given the same seed (server-picked line)

**Pulls in** `lingo/js/{lingo,memory,relations,context}.js`, `conversations/js/conversations.js`,
`namegen/js/namegen.js`, `voice-lab/js/{formant-voice,voice}.js`, `shared/langdebug.js`,
`prototypes/farhold/js/{speech,sound,talkui,markers,quests,factions,followers,hire,waypoints}.js`,
`prototypes/farhold/data/{mercenaries,factions}.json`, `sfx/js/sfx.js`.

---

### M10 — Telegraphs, bosses and the Hollow Barrow with followers (XL)

**Scope**
- `js/rules/telegraph.js` + `data/mechanics.json`: every shape and kind of page 11; favour-the-dodger
  resolution (page 16 "Lag compensation").
- `js/render/telegraphs.js`: the ground decals, rims, fills, patterns, colour-blind modes, cast bars
  (page 17); `tg_*` sounds (page 11); the centre banner (page 11).
- `js/sim/boss.js`: phases by health %, adds, enrage, interrupts, dispels, **boss dialog** and
  **dialog opportunities** (page 11; solo picks, a party votes).
- `js/sim/follower-ai.js`: tank/healer/damage/support behaviour, **obeys every telegraph kind**, orders on
  `,` / Mouse 5 and the order ring (page 02), downed/help-up (page 15). Follower bodies count toward soaks
  and take a party slot; class pets do not (00 §10). Followers heal and buff **through the same targeting
  rules** as players (M2).
- Dungeon Finder offline: "Fill with followers" with **finder hires** for `d01`, listing only
  **discovered** dungeons (M9).
- Boss crowd control: the **break bar** instead of stun/knockdown/root/disarm; the shared 90 s cast-pause
  lockout (00 §10).
- `d01_hollow_barrow` on **Normal**: layout, trash with its placed rare pack (M7), sub-bosses, bosses,
  secret boss if page 12 defines one, loot; instance creation and reset. **Film-set dark** interior:
  looks dark, everything readable (page 17).
- Boss voice lines pre-rendered at pull; warning lines fixed text (page 11); each line's spoken length
  checked against the time to its telegraph's resolve.

**Implements** page 11, 12 (d01 Normal, Dungeon Finder discovery rule), 15 (followers, Normal instance),
17 (telegraph art, film-set dark).

**Acceptance**
- `telegraph.test.js` (every shape's inside test; every ability's warning ≥ page 11 minimum)
- `followers.test.js` (followers leave every danger zone with ≥ 0.3 s spare, soak when needed, spread
  when targeted, never stand in void)
- A test that every boss warning line, spoken in its boss's voice, ends before its telegraph resolves
- `telegraph.spec.js`: a test boss casts each kind; standing in hurts, leaving does not
- `finder.spec.js`: `d01` is missing from the Dungeon Finder until the character walks to its entrance
- `dungeon.spec.js`: a bot-driven solo player + 4 finder hires clears d01 on Normal
- `readable-dark.spec.js`: a screenshot of the barrow's darkest room has every enemy's silhouette above
  page 17's minimum contrast
- **Owner check** after this milestone: play the barrow.

**Pulls in** everything above + `prototypes/farhold/js/dungeon-plan.js` (filler rooms only),
`avatar-3d/js/spellfx.js` `pillar/vortex/storm/breath` for boss attacks.

---

### M11 — Slice polish, the bot, performance → "Slice 1.0" (M)

**Scope**
- `tools/sim-wildmarch.mjs` for levels 1–7 and d01: time per level, deaths and causes, d01 clear time
  solo-with-finder-hires vs 5 bots (target ≤ 1.3×), damage share per spell (flag any spell > 2× its class
  average), rare-pack and greater-rarity death share.
- Tuning passes from the sim report. Budget pass on the three scenes. Settings complete for the slice.
  Every screen in the slice listed in `screens.json` and opened by `screens.spec.js`.
- Publish to stable **and** GitHub Pages (`tools/publish-pages.sh`) — the offline slice is public.

**Implements** page 16 (bot sim, budgets); 04 (all slice settings); 03 (all slice screens).

**Acceptance**
- Full node + Playwright suites green on 8401; stable A/B for any red (memory note *A/B test failures
  first*)
- `budget.spec.js` all three scenes at Low and High
- Sim report committed to `prototypes/wildmarch/research/sim-slice.md` with the ≤ 1.3× result
- **Owner check**: Slice 1.0 review. Answers to `QUESTIONS.md` items the slice raised are folded into
  canon before Part 2.

---

## Part 2 — Offline systems

The systems canon §12.3 added are built here, **still offline and solo**, on the slice's region and
dungeon. Their unlock levels (Harvesting 9, Travel Methods 12, Challenge mode 60) stay in the ladder data;
the tests reach them with a dev level command (`/setlevel`, dev builds only), and players meet them as
the regions that carry those levels land in Part 4.

### M12 — The item card and special rarities (M) (new)

**Scope**
- **The item card** (page 03 owns the layout, page 17 the art): a **3D portrait** of the item at the top,
  rendered in a small offscreen scene (one shared renderer, a slow turntable, a three-light setup, a
  cached still for lists and a live turntable only on the open card). The card's **frame** is decorated
  by rarity: Common plain, then Uncommon, Rare, Epic, Unique, Set and Legendary each more decorated than
  the last.
- **The five special rarities** (`sr_` ids, page 08 owns the numbers): `sr_electrified` (lightning procs),
  `sr_starwoven` (one extra affix beyond the normal maximum from a special pool), `sr_twinned` (every
  affix rolled twice, the better kept), `sr_ancient` (every value 10–20% above its normal maximum),
  `sr_living` (grows stronger with kills, up to a limit). Each sits on top of an Uncommon-or-better item.
- Each special rarity's **card look** (crackle; holographic deep-space shader; mirrored shimmer; stone-
  and-gold frame; creeping vines) and its **bespoke SVG icon** (bolt, star, two linked rings, carved rune,
  sprout) — original SVGs, never an emoji — shown before the item's name on the card, in chat links, the
  loot log and the Trading Post.
- Drop hooks: the special-rarity roll reads item rarity magic find (M6); the greater-rarity stub from M7
  now raises the matching special rarity.

**Implements** page 03 (item card), 08 (special rarities), 17 (card frames, special looks, icons).

**Acceptance**
- `special-rarity.test.js`: each `sr_` does exactly what page 08 says (a Twinned roll is never below the
  plain roll with the same seed; an Ancient value is 10–20% above the base maximum; Living stops at its
  limit); every `sr_` has an icon file and a card style
- `itemcard.spec.js`: open 30 cards in a row — renderer count stays 1, no shader links after the first
  of each look, the cached still appears within 1 frame of the second open
- Screenshot set of one longsword at every rarity and every special rarity for the owner's review
- The icon appears before the name in a chat link, the loot log and the reward popup

**Pulls in** `prototypes/farhold/js/figure3d.js` (offscreen figure pattern), `prototypes/farhold/js/hud.js`
`itemCard` (one card renderer everywhere), `avatar-3d/js/chibi2-weapons.js` (item models),
`shared/tooltip.js`.

---

### M13 — Sockets: gem, jewel, soul, gadget (L) (new)

**Scope**
- Socket kinds and counts per base and slot (page 08 owns which items get which sockets); socketing,
  swapping and removing rules and costs (page 08).
- **Gems** (`gem_<kind>_<grade>`, ten kinds incl. Amber and Peridot, grades 1–5 — page 08 §13.4): one gem, three effects — the armour table (defensive and attribute values), a weapon
  table (damage or spell damage), a jewellery table (secondary effects and magic find); the card shows the
  effect for the item it is in.
- **Jewels** (`jwl_`): roll their own affixes and rarity (Uncommon / Rare / Unique); drop sources and odds
  from page 08, raised by Depth (M16).
- **Souls** (`soul_`, catalogue on page 09): a new behaviour each (a new effect, a changed skill, a chance
  to apply an effect), gated by item type, slot or class; built on the same power registry as legendary
  powers so a soul runs exactly once.
- **Gadgets** (`gdg_`): a configurable baseline (stats picked from a menu). Until Engineering exists
  (M14), a dev vendor sells one test gadget so the socket path is tested end to end.
- Socket UI on the item card and the paper doll: empty socket shapes per kind, drag to socket.

**Implements** page 08 (sockets), 09 (souls), 03 (socket UI).

**Acceptance**
- `sockets.test.js`: the same gem gives the armour, weapon and jewellery effect in the three item kinds;
  a soul refuses an item that fails its requirement with the reason; every `soul_` power runs once per
  trigger (Farhold R23 "every unique's power ran twice")
- Every jewel affix and soul power is wired (move its number, the result moves)
- `sockets.spec.js`: socket a gem, a jewel, a soul and a gadget into four items; save; reload; all four
  still there and applied

**Pulls in** `prototypes/farhold/js/{effects,uniques,affixes}.js` (power registry), `prototypes/farhold/js/craft.js`
(the Upgrade tab's inscribe/recast pattern).

---

### M14 — Harvesting and the crafting professions (L) (new)

**Scope**
- **Harvesting** ([page 19](19-PROFESSIONS.md) owns it): one shared skill 1–300 for mining, skinning,
  herbs, timber, fishing and the rest; each node kind needs the right tool in the **tool slot**; tool tier
  gates node tier; the node's gather bar; the two profession magic-find stats (+profession skill level,
  profession XP gain) finally have their receivers.
- **Crafting professions** (`prof_` ids): Blacksmithing, Leatherworking, Tailoring, Jewelcrafting,
  Enchanting, Engineering, Alchemy — each character picks **one** (changing profession freezes the old one
  at its rank start, page 19 §11.9). Recipes (`rcp_<prof>_<name>`, page 19), trainers, recipe drops, crafting stations, salvage.
- Closing M13's loop: **Engineering makes gadgets**, **Jewelcrafting cuts gems** (`mat_rough_<kind>_<grade>` →
  `gem_<kind>_<grade>`), Enchanting and the rest make what page 19 lists; the M13 dev gadget vendor is removed.
- **Adding sockets**: page 08 §13.2's five actions (Bore a Gem Socket, Set a Jewel Mount, Recut a Socket —
  Jewelcrafting; Fit a Gadget Port — Engineering; Open a Soul Socket — Enchanting, paid in Tear-glass Shards
  `mat_tearglass`), once per item.
- Hearthvale's nodes placed; the level-9 unlock quest wired (met by players in M21 as Mossfen lands).

**Implements** page 19, 08 (salvage, tool items), 07 (profession unlock), 03 (profession screens).

**Acceptance**
- `harvest.test.js`: a node refuses a missing or low-tier tool with the reason; skill gain per gather
  follows page 19's curve; +profession skill level adds a flat N to the effective skill
- `recipes.test.js`: every recipe's inputs are something the game produces (Farhold R13's "a cost you
  cannot obtain is a wall"); every crafted output has a use (no dead-end recipe)
- `craft.spec.js`: equip a pick, mine 5 ore, smelt, forge an item as a Blacksmith; an Engineer makes a
  gadget and sockets it

**Pulls in** `prototypes/farhold/js/tools.js` + `data/tools.json` (the tool slot and tiers),
`prototypes/farhold/js/{mining,props,harvestinfo,craft,station-ui,work}.js`,
`prototypes/farhold/data/{crafting,resources}.json` (starting lists).

---

### M15 — Travel Methods (L) (new)

**Scope** ([page 20](20-TRAVEL.md) owns every rule and number)
- **Routes** (`tm_` ids): a polyline over the baked terrain with **stations**; the vehicle or creature
  follows it at page 20's speed (much faster than walking), riders are **protected** (no damage, no
  aggro, no weather) for the whole trip.
- **Snap-back**: if the vehicle leaves its route (knocked off a bridge, stuck, in water it should not be
  in) it reappears on the route at the nearest point ahead within page 20's time limit — the rider never
  ends up stranded.
- **Two boarding kinds**: **bus-style** (the vehicle waits at the station for more riders up to a set time,
  leaving early when full) and **scheduled** (trains, boats, barges run to a timetable; you wait for it to
  arrive and a whole group boards at once). Offline, the bus leaves when its wait ends with the player and
  their followers aboard.
- Waystone travel (level 12), scrolls, and the class travel utility spells of the slice classes (Mage
  **Portal**, Druid **Heron's Flight**); arrival counts as **discovering** the place (W9).
- A Hearthvale test route: a wagon line Brightwater → the barrow road → the Highcourt road gate, with 3
  stations and one bridge.

**Implements** page 20, 17 (travel vehicles), 03 (station board, route map).

**Acceptance**
- `route.test.js`: the route polyline stays on walkable ground and within page 20's slope limit at every
  metre; a route through water only if it is a boat route
- `snapback.test.js`: push the wagon off the bridge in the sim — it is back on the route ahead within the
  limit, with its riders
- `timetable.test.js`: a scheduled vehicle arrives at every station at its listed time ± 1 s over 24 hours
  of sim
- `travel.spec.js`: board the wagon, ride to the last station, take no damage from a mob placed on the
  road; a Portal to a discovered waystone works and to an undiscovered one is refused

**Pulls in** `prototypes/farhold/js/{roadplan,road-fold,bridge-plan,haulpath,vehicles,ground}.js`
(route building and walkable-ground checks), `avatar-3d/js/{vehicles,creatures}.js` (wagons and draft
creatures), `prototypes/farhold/js/portal.js` (reference).

---

### M16 — Depth and Challenge mode (M) (new)

**Scope** ([page 12](12-DUNGEONS.md) owns every number)
- **Challenge mode**: the dungeon's level-60 version with the full boss mechanic set; loot from each
  Challenge boss once per week per character, reset **Monday 06:00** server time (the only weekly reset in
  the game, shared with world bosses).
- **Depth**: a dial on top of Normal or Challenge, open once the dungeon is cleared on Normal. Each depth
  raises the dungeon's level by 3 until 60; past 60 each depth raises health, damage and pack size, and
  every 5 depths (a **Depth tier**) adds new enemy types and new enemy abilities and page 12's Depth
  modifiers. Rewards scale with it: rarity odds, jewels, souls and special rarities.
- Both built on `d01_hollow_barrow`, which a Depth dial can already take to 60. Content for the other
  dungeons lands with them in Part 4; the endgame tuning pass is M26.
- The Dungeon Finder offers Normal / Challenge / Depth for discovered dungeons; the dungeon journal shows
  what each depth adds.

**Implements** page 12 (Challenge, Depth), 08 (Depth rewards), 10 (Depth enemy types), 03 (finder and
journal).

**Acceptance**
- `depth.test.js`: d01 at depth N has level `min(60, band + 3N)`; above 60 the health/damage/pack curve
  equals page 12's table; every depth tier adds the enemy types and abilities its data lists
- `loot-limit.test.js`: a Challenge boss pays once, refuses loot on the second kill that week, pays again
  after Monday 06:00
- `depth.spec.js`: finder shows Depth only after a Normal clear; a Depth 20 run spawns a tier-4 enemy type
- **Owner check** at the end of Part 2: the offline game with every system in it. Published to stable and
  GitHub Pages.

---

## Part 3 — Go online

### M17 — The Node server (L)

**Scope**
- `server/main.mjs` running `js/sim/world.js` (the same code as the worker) with the `ws` package;
  `SocketTransport`; `config.json`; ports **8470** (dev) and **8471** (stable) (page 16 "Dev/stable
  servers and deploy").
- Clock sync, snapshots at 20/10/4 Hz by distance, interest management, binary snapshots (page 16).
- Hard targets live on the server; a target change is an input message, never inferred by the server.
- One player online, same experience as offline; the server restarts cleanly and saves characters to
  disk (JSON files) as a stand-in for the database.
- **Recommended**: Wildmarch moves to **its own git repository** at the start of this milestone (like
  TinyRTS), with playground modules copied in (page 16) — question for the owner.

**Implements** page 16 (architecture, timing, interest management, protocol, lag compensation,
instancing).

**Acceptance**
- The whole offline Playwright suite passes against `?server=ws://localhost:8470`
- `bot-client.mjs --bots 50` in one layer: tick ≤ 25 ms, ≤ 24 KB/s per client
- Kill the server mid-fight → client shows "Connection lost", reconnect within 3 min restores the
  character in place (page 15)

---

### M18 — Accounts, the database, two players (L)

**Scope**
- Supabase project (free tier for dev): Auth sign-up/sign-in/magic link, JWT check on `hello`,
  `server/migrations/*.sql` for page 16's tables, row-level security denying client writes.
- `scr_login`, `scr_realm_select`, `scr_char_select`, `scr_queue`; name rules (page 15) with the reserved
  list built by `tools/build-reserved-names.mjs`.
- Session lock, 60 s dirty flush, important-event saves, item rows with unique uids.
- **Two players in one layer**: see each other, fight the same mobs, personal loot, Say chat.

**Implements** page 15 (accounts, one dev realm, names); 16 (Supabase, persistence).

**Acceptance**
- `names.test.js`; migrations apply to an empty database and are recorded
- Two-context Playwright: both players see each other move and fight; one logs out, the other sees
  them vanish; relog restores both
- A deliberate double-move of one item uid fails for the second mover (duplication test)

---

### M19 — Parties of five, chat, the Dungeon Finder, shared travel (L)

**Scope**
- **Parties of 5** (players + followers together — 00 §4; no raid groups): invite, leader, markers (the
  world marker icons Sword, Shield, Anvil, Crown, Leaf, Wave, Key, Eye — W23), ready/role check, pull timer,
  level sync, XP sharing; party frames with `F2`–`F5` targeting (M2) now pointing at real players.
- Chat: every channel of page 15 except custom channels; commands; links (special-rarity icons render in
  links — M12); rate limits; word filter. Friends, Kin, ignore, recent; whispers; emotes with the emote
  wheel.
- Layers: soft/hard caps, party-first placement, merge; phasing in parties.
- **Dungeon Finder** online: Normal, Challenge and Depth queues; a dungeon is listed only if **you** have
  discovered it (for a premade party, every player in it must have discovered it; page 15 §7.1); role shape
  1 Tank / 1 Healer / 3 Damage with Support in a Damage slot; follower fill for Normal.
- **Shared Travel Methods**: several players board one wagon or boat; a bus-style vehicle waits for
  riders up to its limit and leaves early when full; a scheduled vehicle takes a whole party aboard at
  once; riders on one vehicle see each other on it (page 15 and page 20).
- Group teleports: Mage **Portal** usable by party members; Oracle **Guiding Call** (assisted teleport)
  counts as discovery for the pulled player.
- Reporting and the auto-silence rule; GM commands (mute, kick, teleport) for the owner's account.

**Implements** page 15 (parties, chat, friends, whispers, emotes, layers, Dungeon Finder, shared travel),
20 (boarding online).

**Acceptance**
- Five-context Playwright: a party of 3 players + 2 finder hires clears d01 through the Dungeon Finder
- A player who has not discovered `d02` cannot queue it alone; walking to its entrance lists it
- Two-context Playwright: both board a bus-style wagon within its wait; it leaves with both; both arrive
- Rate-limit test: the 6th message in 10 s is refused
- Ignore hides all of chat, whisper, invite, trade and mail from that player

---

### M20 — Trade, mail, the Trading Post, guilds and duels (L)

**Scope**
- Trade window; mail with attachments and COD; **the Trading Post** (listing, commodities, search, price
  history, deposits and cut, mail delivery). Every item is tradeable except quest items; **gold only**.
- Guilds (ranks, permissions, **guild bank** with logs, news, calendar, guild finder) and **guild deeds**
  (page 15 §8.4: each member's deeds count up to 1,500 toward ranks 1–10, one perk point per rank; perks
  never touch combat power; no weekly cap).
- **Friendly duels** from level 10: challenge, flag ring, ends at 1 health, no rewards (W1). Nothing else
  in PvP.
- Economy log and alerts (page 15 "Anti-cheat").

**Implements** page 15 (trade, Trading Post, mail, guilds, duels), 08 (fees and sinks).

**Acceptance**
- `trade.test.js`, `mail.test.js`, `market.test.js` (timing bugs where two things step on each other;
  conservation of gold and items)
- `guildbank.test.js`: two officers withdrawing the last item at once — exactly one gets it
- `duel.test.js`: duel ends at 1 health, refused below level 10, refused in towns and dungeons
- A 100-bot economy run shows gold sinks ≥ 80% of faucets over a simulated week (page 08 sets the real
  target)
- **Owner check**: public test realm decision (VPS + Supabase Pro, page 16 cost table).

---

## Part 4 — Grow the game

The canon has 30 classes, 11 regions + Highcourt, 16 dungeons and 8+ world bosses
([page 13](13-WORLD-BOSSES.md)). Content is built **region by region** with **classes in waves** alongside,
so every region lands with the classes that can play it. Every dungeon lands with **Normal** and a
**Challenge** version (tuned in M26) and inherits Depth from M16.

### M21 — Class wave A + Mossfen, Greyridge, Highcourt, the factions (XL)

**Scope**
- Classes wave A (10, covering all four roles and all three resources): **paladin, ranger, rogue, cleric,
  necromancer, shaman, knight, monk, pyromancer, tactician** — spells for slots 1/4/10/18 complete (the
  levels these regions reach), calling 1 (level 6); the three slice classes get slots 10 and 18 too.
  This wave brings **Tempo** (rogue, monk, ranger, tactician), the **Momentum caster** (pyromancer),
  the ranger's **Tame Beast** and the necromancer's **Control Undead** with their revive/expiry rules.
- Regions `mossfen` (5–12), `greyridge` (10–18), `highcourt` (capital): baked terrain, towns, NPCs,
  quests, events, rare spawns and the first world boss in region 3 (page 13).
- Dungeons `d02_drowned_mill`, `d03_shaft_seven`, `d04_bellows_keep`.
- **The seven player factions** (00 §12.2) with their chapters in these regions and quartermasters that
  sell at your level up to 60; the reputation-gain magic-find stat gets its receiver.
- **Talent tier 1 (level 12)** for every class that exists; the page 07 ladder from 8 to 18: **first
  follower slot** (8, `q_mf_coin_for_a_blade`, Reedhollow) and heroes/mercenaries, Harvesting + one
  crafting profession (9), spell slot 3 + **first mount** + duels (10), **bank, mail and Trading Post**
  unlock quest (11), **waystones** + **Travel Methods** + the Unbinder (12), **follower slot 2** + **guild
  charter** (15), spell slot 4 (18); the first real Travel Method routes between Hearthvale, Mossfen,
  Highcourt and Greyridge; region transitions at gates.
- Land mounts from the page 08 catalogue that these regions sell or drop (horses, great elk, boars, giant
  frogs that swim).

**Implements** page 01, 06, 07, 08 (mounts), 10, 12, 13 (world boss 1), 14, 19, 20 for these regions.

**Acceptance** — per class: `classes.spec.js` row; per region: `ground-agrees`, quest chain completes by
bot, `loot-sources`, every Travel Method route passes `route.test.js`; per dungeon: bot clear with
followers on Normal; `factions.test.js` (every faction has a chapter reachable at level ≤ 12 and a
quartermaster item useful at 60); sim report to level 18 with 13 classes.

**Pulls in** `prototypes/farhold/js/{warbands,factions,pets}.js` + data (enemy races, faction standing,
tamed/bound companions), creature bodies for new families and mounts.

---

### M22 — Class wave B + Sunscar, Whisperwood, Cinder Steppe (XL)

**Scope**
- Classes wave B (10): **fighter, bard, warlock, demon_hunter, swashbuckler, stormcaller, oracle,
  witch_hunter, runesmith, tinker** — including the warlock's **Bind Demon** and its ritual, the demon
  hunter's **Demonsight + Traps**, the oracle's **Guiding Call**.
- Regions 4–6 with d05–d09 and their world bosses; talent tier 2 (level 22); spell slot 5 (level 28)
  and calling 2 (level 20) for every class that exists; wave B gets slots 1–5 and callings 1–2.
- Page 07 ladder 20–34: calling II + faster mount (20), wardrobe and **follower slot 3** (25),
  **Second Loadout** (30).
- More Travel Methods: the Longshanks of Sunscar, river barges on a timetable, the Cinder Steppe
  wagon line; the new mount bodies of page 17 §3.2 (Raptor Runner, Crested Strider, Horned Grazer, ram)
  and lizards among the mounts.
- Any creature body plan a boss of these regions needs (page 17).

**Implements** page 06, 12 (d05–d09), 13, 20, classes.

**Acceptance** — per boss: telegraph test data, warning lines fit; every d05–d09 boss killed by 5 perfect
bots and failed at the expected rate by sloppy bots; Second Loadout swap saves and reloads both builds.

---

### M23 — Class wave C + Frostmantle, the Drowned Coast, the Riftmarch (XL)

**Scope**
- Classes wave C (the last 7): **scavenger, dragon_knight, chronomancer, sorcerer, shadow_dancer,
  priest, enchanter** — slots 1–6 and all three callings; spell slot 6 (level 40) and calling 3 (level 40)
  for every other class. All **30** classes playable.
- Regions 7–9, d10–d12, their world bosses; talent tier 3 (level 32); callings at 40 (Dragon Form etc.);
  **follower slot 4** (35); calling III + the swimming and leaping mount (40); the Chronomancer's
  **Retrace**. The best boss mechanics of the parked raid designs are reused here, tuned for five
  (page 12).
- Travel Methods: coastal ferries (scheduled), the Riftmarch's floating-stone line.

**Acceptance** — `classes.test.js` across all 30 (no shared spells); every class boots in `classes.spec.js`;
every resource × build cell of canon §6 has a playable class; sim report to level 50 across 30 classes
flags no class more than 20% off the median clear time and no hybrid role below page 06's floor on Normal.

---

### M24 — Kingsfire, Spire Isle, d13–d14 (XL)

**Scope**
- Regions `kingsfire` (52–60) and `spire_isle` (60), d13 `d13_cindergate`, d14 `d14_ashen_reliquary`,
  their world bosses; talent tier 4 (45); level cap 60 content.
- The **flying mount** chain `q_sky_1`…`q_sky_5` in Kingsfire at 60 (page 07); before 60 winged mounts run
  and glide.
- The Kingsfire Legion (`fac_kingsfire_legion`) as the region's enemy faction; the Travel Method into
  Spire Isle.

**Acceptance** — sim 1→60 per class within page 07's target time curve; every secret boss reachable;
the flying chain completes by bot and flight is refused below 60.

---

### M25 — The story finales: d15 The Fire Court and d16 The Spire (L) (new)

**Scope**
- `d15_fire_court` (the main story's climax, Kingsfire, 60) and `d16_the_spire` (the epilogue, Spire
  Isle, 60), **rebuilt for five players** from the old story raid designs (page 12 owns them): the Fire
  King `b_fire_king_kaedros`, Saelith, the Everflame and the Mend, with their boss dialog opportunities.
- Their story quests (page 14) and the main story's end state (phase flags across the world).
- Normal and Challenge; Depth from M16.

**Acceptance** — both cleared by 5 perfect bots on Normal and Challenge and failed at the expected rate
by sloppy bots; every mechanic within 5-player numbers (soaks need ≤ 5 bodies, spread counts ≤ 5); every
dialog opportunity's outcomes reachable; the ending sets the phase flags page 14 lists.

---

### M26 — Endgame pass: Challenge and Depth across every dungeon (L)

**Scope**
- Challenge tuning for all 16 dungeons; Depth tiers for every dungeon with their new enemy types and
  abilities (page 12); Depth rewards (jewels, souls, special rarities) at page 08's odds.
- World bosses in every region from 3 upward and the seasonal ones (page 13); the Monday 06:00 weekly
  loot limit shared by Challenge bosses and world bosses.
- Post-60 progression is exactly canon's list: Depth, Challenge, sockets, professions, reputation and
  collections. Nothing else.

**Acceptance** — Depth scaling test over all 16 dungeons; a Depth 30 run by 5 perfect bots finishes and
by 5 average bots fails at page 12's rate; every world boss beaten by 30 bots within page 13's time.

---

### M27 — Art and audio completion pass (L)

**Scope**
- Every Set/Unique/Legendary has a hand-authored `look.worn`; every status has an aura; every boss has a
  tuned voice; all new `tg_*`, boss, class-mechanic, special-rarity and social sfx ids; region ambience
  complete; every biome's cave and film-set-dark light sources in (page 17).
- Every mount species and every Travel Method vehicle or creature final (page 17).
- Chibi 2 **LOD 1** body and **stand-ins**; sheathed weapons; nameplates final.
- Music decision executed (page 17).
- Colour-blind modes checked by screenshot review; UI scale 75–150% on every screen.

**Acceptance** — `budget.spec.js` town (40 players) and world-boss (30 players) scenes at every tier;
tests for "every Set/Unique/Legendary has `look.worn`", "every telegraph kind has a `tg_*` sound",
"every status has an aura or is listed as mote-only", "every `sr_` has its icon and card style".

---

## Part 5 — Hardening and launch

### M28 — Anti-cheat, moderation, operations (M)

**Scope** — every server check in page 15's anti-cheat table with tests that feed it cheating inputs
(including a client that claims a target change it did not make, and a rider leaving a protected Travel
Method mid-route); staff roles and the audit log; tickets; chat and economy log retention jobs; deploy by
GitHub Actions to a VPS; backups to S3; health endpoint; restart broadcast; monitoring line (page 16).

**Acceptance** — speed/teleport/no-clip/cooldown/range cheat bots are all refused; a restart with 200
bots online saves every character and reconnects them; `bot-client.mjs --bots 1000` across one realm
process: tick ≤ 30 ms.

---

### M29 — Closed alpha → open beta (M)

**Scope** — invite-only realm (alpha), bug-report flow into the dev server inbox, balance passes from real
play, the code of conduct and account deletion/export, then an open beta realm per server region.

**Acceptance** — a week of alpha with no data-loss bug; beta realm holds its target concurrent players
(measured, page 16 budgets).

---

### M30 — Launch (S)

Two realms (NA, EU), Supabase Pro, production domain, status page, the launch checklist (backups verified
by a restore, GM accounts, reserved names refreshed, a rollback plan for the client and server versions).

---

## Milestone summary

| # | Name | Size | Pages implemented | Key playground modules |
|---|---|---|---|---|
| M0 | Skeleton | S | 16 | serve.py, preload-modules, format, rng |
| M1 | Walk in Hearthvale | M | 01, 02, 03, 04, 16, 17 | highdef-3d, Farhold graphics, Chibi 2, weather |
| M2 | Tab targeting | M | 02, 03, 04, 16 | Farhold targetpick (aim rule only) |
| M3 | Combat core | L | 05, 10, 16, 17 | Farhold rules, creatures, spellfx, meters |
| M4 | Tags | S | 05, 08, 03 | — (new) |
| M5 | Warrior, Druid, Mage | L | 06 + 3 class files, 17 | skilltalents, class-outfits, voices |
| M6 | Items, loot, quivers, magic find | M | 08, 09, 17 | Emberveil loot, Farhold uniques/foci/gear |
| M7 | Monster rarities | M | 10, 08, 17 | Farhold actors/encounters, enemies.json |
| M8 | Progression 1–7 | M | 07, 14, 16 | perks, retrain |
| M9 | Hearthvale's people and quests | L | 01, 07, 14, 15, 17, 20 | lingo, conversations, formant voice, factions, sfx |
| M10 | Telegraphs, bosses, d01 with followers | XL | 11, 12, 15, 17 | spellfx area methods, followers |
| M11 | Slice 1.0 | M | 03, 04, 16 | sim pattern |
| M12 | Item card + special rarities | M | 03, 08, 17 | figure3d, hud itemCard, chibi2-weapons |
| M13 | Sockets | L | 08, 09, 03 | effects/uniques power registry, craft |
| M14 | Harvesting + professions | L | 19, 08, 07 | Farhold tools.js + tools.json, mining, craft |
| M15 | Travel Methods | L | 20, 17, 03 | roadplan, road-fold, bridge-plan, haulpath, vehicles |
| M16 | Depth + Challenge | M | 12, 08, 10 | — |
| M17 | Node server | L | 16 | — (same sim) |
| M18 | Accounts, database, two players | L | 15, 16 | Supabase |
| M19 | Parties, chat, Dungeon Finder, shared travel | L | 15, 20 | meters (group), emotes |
| M20 | Trade, mail, Trading Post, guilds, duels | L | 15, 08 | — |
| M21 | Wave A + regions 2–3 + Highcourt + factions | XL | 01, 06, 07, 08, 10, 12, 13, 14, 19, 20 | warbands, factions, pets |
| M22 | Wave B + regions 4–6 | XL | 06, 12, 13, 20 | creatures |
| M23 | Wave C + regions 7–9 | XL | 06, 12, 13 | |
| M24 | Kingsfire, Spire Isle, d13–d14 | XL | 12, 13, 14 | |
| M25 | d15 + d16 story finales | L | 12, 14, 11 | |
| M26 | Endgame: Challenge + Depth everywhere | L | 12, 13, 08 | |
| M27 | Art and audio completion | L | 17 | Chibi 2 (LOD), sfx catalog |
| M28 | Anti-cheat, moderation, ops | M | 15, 16 | |
| M29 | Alpha → beta | M | all | |
| M30 | Launch | S | all | |

**Parked, not on this roadmap** ([`WISHLIST.md`](WISHLIST.md)): raids and raid frames, mass
resurrection, dungeon currencies, attunement, PvP beyond duels, housing.

## Risks and what to do about each

| Risk | What it would look like | Mitigation |
|---|---|---|
| Two copies of a rule drift apart | Client shows 140%, server does 196% | `js/rules/` shared by both; `one-owner.test.js` (M3) |
| The target frame shows the wrong enemy | Farhold's reported bug | The hard target is written only by input or death; `targeting.test.js` (M2) |
| A tag bonus applied twice | An Area Spell hits 44% harder instead of 20% | One tag function at one summing point; `tag-bonus.test.js` (M4) |
| A soul or special rarity power runs twice | Farhold R23's uniques | Shared power registry; run-once tests (M12, M13) |
| A saved field silently dropped | Reload loses talents (Farhold R20) | `SAVE_FIELDS` table + round-trip test (M8) |
| A finished module nothing calls | Feature "does nothing" (Farhold's signature fault, rounds 11–16) | Every milestone's acceptance includes a Playwright path that uses the feature from the UI |
| A knob nobody reads | Tuning has no effect | `dead-data.test.js` moves each knob (M0 onward) |
| A recipe or build cost nothing produces | Players stuck (Farhold R13) | `recipes.test.js` (M14) |
| A Travel Method strands its riders | A wagon in a river | Snap-back rule + `snapback.test.js` (M15) |
| Dark places unreadable | Deaths in crypts feel unfair | Film-set dark grade + `readable-dark.spec.js` (M10) |
| Shader stutter on hits or item cards | Frame drops on every impact or card open | Warm-up + no light toggling; `stutter.spec.js` (M3), `itemcard.spec.js` (M12) |
| Chibi 2 crowds too heavy | Town at 20 fps | LOD 1 + stand-ins (M27, earlier if M19 shows it) |
| 30 bespoke kits balloon | Class waves slip | Waves of 10; the sim flags outliers; class files are the spec |
| Server cost/time | A tick over budget | Measure with `bot-client.mjs` at M17, M19, M28 before promising capacity |
| A half-written import breaks the page the owner is on | Blank screen | The owner always gets 8400 (stable); `publish-stable.sh` refuses unparsable commits |
