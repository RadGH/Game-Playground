# Rogueloot

> **Status:** live on games.radgh.com · resumed 2026-11-13 (owner): round 2 done — class at creation, no Shove, 1x1 bag, skills by level + 64 talent trees, Skills/Talents/Character screens rebuilt, 1v1 early game · 2026-11-16 (report #3): new heroes start with only Attack and learn skills with skill points; specialization at 5 · checked 2026-11-13
> **Play:** LAN `http://<LAN IP>:8580/` (stable, own server; https 8582 for a controller) · public https://rogueloot.games.radgh.com/
> **Next:** play-test the talent trees (numbers are first-pass; `tools/sim.mjs` for pacing), then the overhaul list in `~/claude/agent/rogueloot-overhaul-checklist.md` (PoE world map, river/bridge) and M33 balance
> **Parked:** overhaul items C4-C23 + B1 in that checklist; talents are number-only (no new mechanics on capstones); skill-engine wishlists in each `data/skills-specs-*.json` `wishlist`
> **Ask the owner when this game is next worked on:** `model-library/` has 12 Meshy-made rigged + animated enemy models (goblin warrior/shaman/shieldbearer ≈ Hollowhorn, skeletons ≈ Restless, zombie, orc, ogre, bandits, cultist ≈ Gravesworn, lizardfolk ≈ Mirefolk). Owner 2026-11-11: plan for it, but do not put them in until he decides.

A co-op action RPG for 1–4 players: Thousandvale's items and mechanics under a Diablo-style angled camera, with combat
paced like vanilla WoW (1.5 s global cooldown, cast bars). Act 1 covers levels 1–20. Chibi 2.6 characters, no voices.

**Read `docs/PLAN.md` first.** §0 holds the owner's ~50 rulings from the 2026-11-10 question rounds, and they override
everything else. §3 lists the 33 milestones. Checklist: `~/claude/agent/rogueloot-checklist.md`.

## Run it

| What | Where |
|---|---|
| Dev server (working tree) | `node server/main.mjs --port 8581 --https-port 8583` → `http://<LAN IP>:8581/` |
| Stable LAN copy | 8580 / https 8582 — `tools/publish-rogueloot.sh` (runs the pre-publish checks) |
| Live | https://rogueloot.games.radgh.com/ (`cd ~/claude/rads-game-server && tools/deploy.sh update playground rogueloot`, after `tools/publish-stable.sh` + `tools/publish-pages.sh` in the playground) |
| Unit tests | `node --test tests/sim/*.test.js tests/rules/*.test.js tests/world/*.test.js` |

`npm install` once in this folder for `ws` (or copy Knockabout's `node_modules`).

## Round 2 (owner 2026-11-13): classes, talents, bag, menus

- **Class at creation** (`js/client/class-pick.js`, `heroes.js`): four tiles + the picked class's details; Create is
  disabled until one is picked. `rules/character.js starterKitFor(path)` gives a weapon the class can hold. A hero
  saved without a class gets the same choice in the skill book before anything else (`skills-ui.js drawClassPick`).
- **Skills vs talents** (`docs/TALENTS.md`, `js/sim/talents.js`): **since 2026-11-16 (live report #3) a new hero has
  only Attack and learns every other skill with a skill point** (1 a level from level 1, `ch.learnPoints`; rank still
  grows every 2 levels), talent points buy talents only, and the **specialization is picked at 5** (spec trees/skills
  shifted to rows 5 8 11 14 17 20). Tests: `tests/sim/learn.test.js`. Trees: `data/talents-*.json` + the old passive/synergy rows; checked by
  `tests/rules/talents-data.test.js` (rows, columns, prereqs, counts, synergy targets, ≤ +30% on one skill, no arrow
  through another talent). `js/rules/skill-text.js` prints every number from the data.
- **Skill book** (`js/client/skills-ui.js`, `css/book.css`): Skills (K) = spellbook list, detail (rank now/next,
  price, talents for it), six-slot bar (slot buttons or drag). Talents (N) = tree tabs with points spent, a grid of
  rows × 4 columns with a level rail, SVG arrows, detail with this rank / next / requirements and Learn, and a
  Specialization tab (look at every spec; choose at 5). Talent pictures: `icons.js talentIcon` (whole library).
- **Bag** (`js/rules/bag.js`): one item a square, 10 × 4, moving onto an item swaps. Gear pictures:
  `js/client/gear-icons.js`. Character screen (`sheet-ui.js`, `css/sheet.css`): equipment doll, stats, the bag, belt,
  and the item card in a fixed place under the bag.
- Tests: `tests/browser-skills.mjs` (class pick, bar by button + drag, learn, locked talent, spec tab, old save),
  walk screens `skills-pick`, `talents`, `talent-detail`, `specializations`.

## Gear on the body (live report #4, 2026-11-16)

"Character does not appear to wear weapons. We had this all figured out in Thousandvale." Heroes now wear what they
equip, the Thousandvale way: an equipped item becomes a Chibi 2 part in the avatar JSON, and avatar-3d builds it ON THE
HAND BONES (`gripR`; the off hand on `gripL`, strapped shields on the forearm) inside the body's skinned mesh.

- **Data:** `data/gear-looks.json` — every item base to a model from `avatar-3d/data/gear-catalog.json` (byBase, then
  byKind for weapons / off hands, byProf for armour), colours, rarity detail. `js/rules/gear-look.js` (pure, copied from
  `thousandvale/js/client/gear-look.js`): `heroAvatar(avatar, equip, { table, bases })`, `gearSig`, `compactGear`.
  The main hand is always what is equipped; a weapon in the off hand (dual wield, Doubled Grasp) is drawn as a weapon;
  an empty armour slot keeps the creator's clothes; gloves merge into the top, rings into the accessory.
- **World:** `js/client/actors.js` — `add(id, { gear })`, `setGear(id, equip)`. A change is baked in slices
  (`prepareChibi2`) and swapped onto the SAME body (`setAvatar`); `park: true` keeps a look taken off, so swapping sets
  back and forth never disposes a material (lessons rule 29). Your own gear comes from `char`, everyone else's from
  `roster` (`hub.js` resends it when an action changes someone's `gearSig`).
- **Swings:** `body.hold` (what the hands hold) picks the strike: `attack` becomes a cut / stab / slam / bow draw /
  staff cast; two weapons alternate (Thousandvale's `swingClip`, `dualAttackByCount`); the sim's `swing {off: 1}` plays
  the off hand's own strike; an arrow plays the bow's shot; a spell casts through a wand / staff (`spellClip`).
- **Character screen:** `js/client/hero-preview.js` — the same body (same template) in the middle of the equipment, on
  its own small renderer made once and kept; drag to turn. Five slots down each side (`css/sheet.css .doll`).
- Tests: `tests/rules/gear-look.test.js` (every base resolves to a catalog model of the right slot; a real Chibi 2.6
  body has the sword on `gripR` and changes on a live swap), `tests/sim/hub-gear.test.js` (roster gear + resend),
  `tests/browser-gear.mjs <shots> [w h mobile]` (town, swap, character screen, fight on the dev server),
  `tests/browser-gear-coop.mjs <shots>` (two browsers: the host sees the guest's dagger, then the bow after X).
  `gameEye.heroBody(id?)` and `gameEye.sheetPreview()` report what a body holds.
- Not yet: mercenaries still carry their seeded look (they wear weapon/chest/head by ruling 31, but the sim does not
  send their gear yet).

## Hands, the off hand and item cards (game standards §5b, 2026-11-11)

- **`hand` on every weapon/off-hand base** (`data/item-bases.json`) is the one field: `one` One-handed, `two` Two-handed,
  `main` Main hand only (wands, sceptres), `off` Off hand only (shields, foci, quivers). `js/rules/hands.js` is the only
  reader: `handOf`/`handText` (the item card's first line), `handRefusal` (the equip rule `canEquip` and the sim share),
  `handsBumped` (what an equip sends to the bag), `compareSlots`/`firstCompareSlot`.
- **Off hand:** a shield or focus beside a one-hander (a shield next to a bow sends the bow to the bag); a quiver only
  beside a bow or crossbow and it stays when you swap bows (`pairsWith`).
- **Dual wielding is data:** `proficiency.<path>.dualWield` + `dualWieldClasses` — the Rogue Path (daggers, swords,
  axes) and the Weaponmaster spec (`specAdds.weaponmaster`, maces too). `profOf` now reads `specAdds` (it never did, so
  Fighter specs had not been getting plate at 10 either). The off-hand weapon is `st.offWeapon` → `hero.offWeapon` and
  swings on its own clock in `fight.js stepAuto` for `balance.json hero.offHandDamage` (0.5) of its damage.
- **Doubled Grasp** (`van_doubled_grasp`, Vanguard, Breaking Line tree, level 18, one rank): `passive.stat: 'doubleGrip'`
  lets a melee two-hander go in the off hand too (never a bow or crossbow).
- **Item cards** (`js/rules/card.js cardStats`): the base's damage/armour/block line absorbs the same stat from its
  affixes and quality ("+24 Armour (20 base +4)"), so no stat is listed twice. **Compare** (`sheet-ui.js
  compareTipHtml`): the item and what it would replace side by side with green/red differences; when two slots could take
  it (rings, a dual-wielder's hands) Shift, the controller's Y or the **Compare: …** button switch the slot, and Equip
  uses the slot being compared. Tests: `tests/rules/hands.test.js`, `tests/rules/card.test.js`.

## How it fits together

- `js/sim/`: the PURE world sim (seeded rng, fixed 20 Hz step, no clocks/DOM). `world.js` (players, step, snapshot),
  `move.js` (the ONE walking rule, used by the sim *and* by the client's own prediction), `area.js` (M1's test meadow;
  M10 swaps in hand-made zone JSON with the same shape), `rng.js`.
- `js/net/`: `protocol.js` (frames, rate limits, room codes) and `hub.js` (rooms: create/join by code, roster, inputs,
  snapshots every 2nd step). The hub is pure, so the **solo game runs the same hub inside a Worker**
  (`js/client/solo-worker.js`): solo and online take exactly the same code path.
- `server/main.mjs`: http + ws (Knockabout's layout), static files from the allow-list in `server/static.js`,
  `/feedback` + `/tally` + admin feed reused from Tumblefair's server modules.
- `js/client/`: `main.js` (title → game, prediction + reconcile against `seq`), `scene.js` (flat-shaded low-poly,
  camera looking north at a 48° tilt: **W = screen north**), `actors.js` (Chibi 2.6 through Thousandvale's
  `createTvBody`, a stand-in while it builds, others interpolated ~110 ms behind), `input.js` (keys, pad, stick),
  `touch.js`, `menu.js` (☰, What's new, Credits, Report a bug), `link.js` (solo Worker or WebSocket).
- `window.gameEye.state()` reports the screen, link, room code, your position and the players.

## Messages

Browser → server: `hello {v, token}`, `create {character}`, `join {code, character}`, `input {mx, mz, seq}` (world-space
move vector, ≤ 1), `leave`, `ping`. Server → browser: `welcome {token}`, `joined {code, you, host, seed, area}`,
`roster {host, players:[{id,name,look,gear}]}` (on every join/leave, and when an action changes what someone has equipped; looks and gear never ride in snapshots), `snap {tick, players:[{id,
x, z, yaw, moving, seq}]}` at 10 Hz, `left {id, host}`, `err {code, msg}`.

## Maps (live report #2, 2026-11-16)

- **Minimap** (`js/client/maps.js`, `css/map.css`): round, top-right under the bag/☰ buttons (176 px; 100 px on an
  upright phone; 96 px left of the buttons on a phone on its side, where the skill arc owns the right). The quest
  tracker moved under it. Draws the zone picture, fog, you (arrow = facing), party, monsters by rank (ring: blue
  champion/elite, gold rare; boss = big diamond) and role (caster/shaman diamond, archer triangle), unopened chests,
  people, exits (chevron points out), dungeon entrances, waypoint, portals, quest spots, your portal and the guide's
  goal; rim arrows for the goal and party members off the edge; N on the rim. Map up = screen up (`CAM.yaw`; W = north).
  No tooltip of its own (only the pins have a card: Thousandvale W16). +/− and the wheel zoom (`rogueloot.mm.zoom`); the
  corner button hides it to a map button (`rogueloot.mm.hidden`, body class `mm-off`); click/tap opens the region map.
- **Region map** (`js/client/region-map.js`): **M** opens/closes (Esc and the ✕ close too; **Tab** or the tab button
  switches to the World map, the old waypoint map in `travel-ui.js`, which now has a "This area" tab back). Whole zone,
  named exits/entrances/portals/people, a place list (Quests, Ways on, Waypoint, People) with live distance + compass;
  pressing a row centres the map on it. Drag / wheel / pinch; controller: padnav walks the list, right stick pans,
  LB/RB zoom. Monsters only within 30 m of you. Labels are decluttered (an overlapping label is left off).
- **Shared** (`js/client/map-core.js`, pure): `mapView` (world ↔ map with the camera yaw, plus the canvas matrix),
  `fitScale`, `compass`, the explored grid (6 m cells, 24 m reveal radius, `encodeExplored`/`decodeExplored`, a zone
  whose bounds changed starts fresh), `exploredStore` — saved per hero per zone under `rogueloot.explored.v1` (kept out
  of the character because the room server drops unknown fields and caps frame size), `placesOf`, `foePin`.
  `js/client/map-paint.js` paints the zone ONCE per area at 3 px/m from the same shapes as the 3D ground; the town and
  the Proving Meadow have no fog.
- Tests: `tests/world/map-core.test.js` (node), `tests/browser-maps.mjs <shotDir>` (desktop, 390 and 360 px phones:
  minimap shows the hero + Thornwood exit, keeps clear of the HUD, M / tap opens, list centring, drag, Tab ↔ World,
  Esc / M close, hide sticks over a reload, explored cells saved). Walk screens `region-map` and `map`.
  `gameEye.maps()` reports both.

## Credits

Third-party things this game uses are listed in `shared/credits.json` (`games` includes `rogueloot`) and shown by the
Credits button. Add a row whenever something made by someone else comes in (ruling 49).
- **Codex art (2026-11-10):** `assets/art/key-art.webp` (title backdrop) and the games.radgh.com card are one Codex image (prompt in the M1 commit notes; original design).

## Zones and the editor (M10-M11)

- A zone is `data/zones/<id>.json`: readable SHAPES (surfaces, hills, water, cliffs, props, seeded scatter, spawns,
  chests, markers), listed in `data/zones/index.json`. `js/world/zone.js` turns it into the sim's area;
  `js/client/zone-view.js` draws it from the same samplers. Prop kinds: `js/world/props.js` (collision radius) +
  `js/client/prop-meshes.js` (mesh); a test fails if the two lists differ.
- `node tools/zone-check.mjs [id]`: everything reachable from the start, no unknown props, a start marker.
- **Early-game ramp (owner 2026-11-13: more 1v1 fights early, swarms and group fights a few levels later).**
  `data/balance.json groups`, read by `js/sim/spawn.js rampGroup`, keyed by the spawn MARKER's level: a group is at
  most 1 monster at level 1, 2 at levels 2-3 (and most of those are cut to one by `soloChance`), 3 at level 4, 4 at 5,
  5 at 6, the table's full roll from 7. A swarm marker below `swarmMinLevel` (5) spawns only that cap of its swarm;
  a champion stands alone up to level 3; pinned `pack` arrays keep their size up to the cap (the early zones' pinned
  packs were cut to it by hand). Nothing is lost: each monster the cap trims off is placed as its own single 11-18 m
  from the marker in the open (`placeStray`: a clear line back to the marker, 10 m from other strays and markers,
  never on the start), so a zone keeps its monster count and XP and the ~30 min a level pace holds. Tests:
  `tests/sim/spawn.test.js`.
- **Editor:** `editor.html` (`http://<LAN IP>:8581/prototypes/rogueloot/editor.html`). Tools 1-9 (select, prop, paint,
  hill, water, cliff, scatter, spawn, patrol, chest, marker), right-drag pans, wheel zooms, Enter finishes a shape,
  Ctrl+Z/Y, Delete, R turns a prop. **Save** writes the file through the DEV server only (`POST /editor/save`,
  LAN addresses only); **Download** works anywhere; **Play-test** opens the game in that zone (`index.html?zone=<id>`).

## Skills (M9, M20-M28)

A skill is data: a row in `data/skills.json` (Wanderer), `skills-paths.json` (the four Paths) or `skills-specs-N.json`
(specializations, one file per wave, listed in `skills-specs-index.json`). `js/sim/skills.js` runs every row through one
vocabulary of effects; `tests/sim/paths.test.js` casts every active of every Path and spec and fails on an unknown `do`.

Effects (`do`): `weapon` (x weapon damage), `damage` / `bolt` (spell, `base: [a, perLevel]`), `area` (circle / cone /
line, `at: self|target|ground`, inner `effects`), `zone` (lasting ground that re-applies its effects each `tick`),
`dot`, `heal` (`who: 'self'` inside an attack), `hot`, `shield` (`thorns` strikes back while it holds), `buff`
(`stat`: damage, armour, dodge, moveSpeed, crit, healTaken…), `debuff` (stun, root, slow, damageDown…), `mark`,
`taunt`, `interrupt`, `dash`, `pull` (negative = knock back), `resource`, `cleanse`, `revive`, `summon` (pet, or up to
8 minions; `stay: true` stands where dropped), `coat` (every weapon hit leaves a dot), `link` (takes a share of a
friend's hits), `stance` (`bar: [6 ids]` swaps the action bar while it holds; press again to leave).
Modifiers: `cond: 'behindBonus'` + `frontMult`, `cond: { targetHpBelow, mult }`, `cond: { slowed, mult }`,
`perDot`, `perTargetHit` (crowd bonus), bolt `chain: { jumps, range, falloff }`, `spendAll` + `perResourceSpent`,
`weaponOnly: 'ranged'|'melee'`, `altCost` (hybrids), `perRank` on any number, `synergy` rows (also feed pets).

**Legendary powers** (`js/sim/legendary.js`, data in `data/legendaries.json`): a worn, identified, unbroken legendary
reshapes one skill at cast time (`shapeSkill` returns a changed copy of the row plus rules for this cast: charges,
chains, refunds, damage turned to healing…) or a basic action (life leech on auto-attacks, free potions).
`tests/sim/legendary.test.js` wears each power and casts its skill.

## Monsters on screen (M14, M30)

`js/client/bestiary-kit.js` (Fable) builds every monster, rare and boss (`buildMonster`) and animates it
(`animateMonster`); `bestiary.html` is the gallery. `js/client/foes.js` loads the raw `data/monsters.json` once, builds
each body with the kit, rebuilds a boss when its phase changes, and passes the body through `js/client/mesh-merge.js`
(still parts under the same parent with the same material become one mesh: ~23 -> ~16 draws a monster).
`tests/browser-perf.mjs` reads draws / triangles at phone size per zone.


## Project history (moved from playground CLAUDE.md, 2026-11-11)

This was the table row for this folder in `playground/CLAUDE.md`, kept word for word when that file was cut down to a short index. Newer notes belong in this README, not in CLAUDE.md.

**Rogueloot** (2026-11-10 →): co-op (1-4) action RPG under a Diablo-style angled camera with vanilla-WoW pacing (1.5 s global cooldown, cast bars), Thousandvale's items/mechanics, Act 1 levels 1-20; Wanderer → Path at 3 (Fighter/Rogue/Mage/Healer) → spec at 10 (~28 incl. hybrids, 3 trees each), D2 grid bags, stingy tiered loot (item level ≠ character level, gear score), PoE-style currency shards, Chibi 2.6, no voices. Pure sim `js/sim/` + pure room hub `js/net/hub.js` shared by the server and the solo Worker; own server stable :8580/https :8582, dev :8581/:8583 (units `rogueloot`, `rogueloot-dev`); public https://rogueloot.games.radgh.com/ (live from day one). Fable designed the bestiary and the item data. **Read `docs/PLAN.md` §0 (owner rulings) first**

**Status / key files:** M1 2026-11-10
