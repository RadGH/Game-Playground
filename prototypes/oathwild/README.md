# Oathwild

**Status:** town round 2026-11-25 (Larkford rebuilt as a crowded hillside town, Thornwatch cabins, villagers, townspeople at work spots, people called by their job, shops look-then-buy, Trade skills window, phone ability fix). Round 1 playable on the LAN: world server (shared saved worlds, ≤ 10 players, create/join by code) + the 3D client (title, character select, Tabard creator (Look → Class with its tree → Background → Attributes), world list, the world with over-the-shoulder aim, spells with ground indicators, loot windows, inventory, sheet, level-up, class trees, talents, spellbook, quests, map, people, shops, shrines, menus). Live on games.radgh.com since 2026-11-24 (world server on the droplet, saves in /var/lib/oathwild, archived hourly). Not yet played by a person.
**Play:** https://games.radgh.com/oathwild/ · LAN dev http://192.168.1.34:8401/prototypes/oathwild/ (start the world server first: `tools/game-servers.sh start oathwild-dev`; https for controllers: https://192.168.1.34:8441/prototypes/oathwild/). Stable 8400/8442 pairs with the `oathwild` unit (8660/8662) after publish-stable.
**Next:** (tried and reverted 2026-11-24: compiling every world material on load — where the browser cannot compile in the background it froze the first seconds in the world, worse than the stalls it meant to remove) investigate prediction on very slow frames (2026-11-24: in the software test browser, at a few frames a second, the client sends ~1/3 of its 20 Hz steps and its predicted position overshoots the server by up to 30 m after the key is released, then snaps — fine at real frame rates, but a slow phone could feel it); a person plays it (check the new look on a real phone: Low 139-159 draw calls / ~400k triangles measured; software frame time ~60% above the old flat world); instance the fal building/prop models (≈490 single meshes on Medium); tune the Look group with `?tune`; item pictures drawn from the worn models (rule 20); buff/debuff visuals on bodies; real horse/boss models as the art budget allows.
**Parked:** Smithing / Alchemy benches and the Tinker class (later round); Chronomancer, Oracle, Dragon Knight, Starcaller; charm/turn spells; Farhold's resource / afterimage / "consumes" spell rules; playing offline without the world server; chat box (the server relays chat, no UI yet); **placeholder art to replace later: `docs/PLACEHOLDERS.md`** (props, 8 monsters, horse, items — about $23 of models when there is budget).

A third-person open-world fantasy RPG for 1–10 players in one shared, saved world. The heart of it is levelling:
every level you pick a class (27 to choose from, unlimited per character), each class is a mastery tree of spells,
ranks, modifiers, passives and training, plus attributes, talents and non-combat skills. Independent project by
Radley Sustaire.

- Owner rulings and the plan: `docs/PLAN.md` (§0 first). Code map and contracts: `docs/ARCH.md`.
- The rules in plain words: `docs/RULES.md`. Every class, where it came from, and its tree: `docs/CLASSES.md`.

## The rules core (`js/rules/`, pure — runs in Node, the server and the browser)

| Module | What it does |
|---|---|
| `farhold.js` | The one door to Farhold / Emberveil / Thousandvale code and `shared/format.js` (by path; never edited). |
| `data.js`, `boot.js`, `engine.js` | Load the data, build one `rules` object (Farhold's `Rpg` on Oathwild's balance, statuses, spell catalogue). |
| `attributes.js` | Point buy, level points, per-point values. |
| `sheet.js` | The character sheet: every number from attributes, classes, passives, talents, background, gear. |
| `classes.js` | Classes as masteries: unlocks, class points, ranks, paths, modifiers, capstones, `castRow`. |
| `spells.js` | The spell catalogue: reused rows + Oathwild's own, ranks, modifiers, targeting kind, power source. |
| `talents.js` | Talent points and rows. |
| `skills-use.js` | Non-combat use-skills (Sneak, Lockpicking, Pickpocket, Speech, Enchanting) and their effects. |
| `proficiency.js` | `canWear` / `canWield` with reasons in plain words; training enchantments. |
| `inventory.js` | Carry weight, durability, enchanting, the horse. |
| `levels.js` | The character record, XP, `levelUp`, respec. |
| `auras.js` | Buffs and debuffs on Farhold's statuses: stacking, ticks, cures, control, display data. |
| `combat.js` | The world sim for ≤ 10 players: weapons, spells, auras, monsters, pets, death, XP, loot, camps. |
| `casters.js` | Magic weapons: which wand / tome / staff style, sceptre swing or off-hand rider an item has (Thousandvale's caster forms), the attack plan, and its card with real numbers (`data/casters.json`). |
| `caster-attack.js` | Carries a caster plan out in the world sim with combat.js's own shapes: bolts, fans, chains, seeking, cones, beams, rings, lobs, forks, wards, lingering ground, riders. |
| `loot.js` | Individual loot per player, gold that must be taken, chests that refill per player. |
| `describe.js` | The one tooltip text model for spells, items, auras, talents, class nodes, classes, skills. |
| `world-state.js` | The shared saved world: flags, quests (per-player rewards), camps, chests, shrines. |

## The world (`js/world/`, pure) — details in `docs/WORLD.md`

| Module | What it does |
|---|---|
| `terrain.js` | The ground from `data/map.json`: heights (mesh = walked surface), rivers, marsh, graded roads, bridges and fords, biomes, forest, regions, level bands, walkable, reach on foot. |
| `scatter.js` | Trees and small decor, the same everywhere, clear of roads, water and footprints. |
| `encounters.js` | Camps and roam zones on top of the combat sim; bosses sized to the number of heroes (Guessed). |
| `quests.js` | Quests (shared progress, per-player rewards), NPC talk with choices, escorts, services, the quest log model. |
| `boot.js` | Loads map, placements, quests and NPCs; builds the terrain and the quest book. |

Data lives in `data/*.json` (each file's `_doc` says who reads it). `data/art.json` and `data/spell-visuals.json`
belong to the art and spell-visual helpers.

## Server and client (round 1, 2026-11-23)

| Part | What it is |
|---|---|
| `server/main.mjs` | Node + ws world server: dev 8661 (wss 8663), stable 8660 (wss 8662), `/status`, admin feed; saves in `saves/<dev|stable>/` (JSON, gitignored) |
| `server/hub.js` | Hello (device id or games.radgh.com account ticket → profile), characters, world list, create/join by code, reconnect keeps your hero 90 s, empty worlds saved and put away |
| `server/world.js` | One world: the 20 Hz combat sim, the ground check, camps + roam packs, quests, loot per player, talk, level-up, gear, shops, shrines, travel, respawn; per-player snapshots (units within 95 m) |
| `js/net/protocol.js` | The wire: message checks, rate limits, button bits |
| `js/game/ground.js`, `gear.js` | Shared by server and browser: where a body may stand (prediction uses the same check); equip rules, prices, gear → Tabard pieces |
| `js/client/` | `main.js` (the app contract), `screens/` (title, chars, creator, worlds, play), `play/` (camera + aim, prediction, HUD, minimap, touch), `render/` (view, world, actors, fx + Spell Kit, `caster-fx.js` = how each wand / tome / staff style looks), `ui/` (window kit, the ONE tooltip renderer `tip.js`, every window), `input/` (one binding table, keyboard/mouse/pad/touch, padnav) |
| `ops/` | `oathwild` / `oathwild-dev` user units (linked, never enabled: `tools/game-servers.sh start oathwild-dev`) |

Controls (rebind in Settings → Controls): WASD move, mouse look (click the world), left click attack, right click block, F power attack, Space dodge, Shift sprint, X sneak, R horse, E talk/loot/use/revive (hold), 1–8 spells (ground spells: hold to aim, release to cast), Tab target, B bag, C character, N level up, L classes, T talents, P spellbook, J quests, M map, Esc menu. Controller: left stick move, right stick look, RT attack, LT block, A dodge, X use, Y power, B sneak, LB/RB + A/B/X/Y spells, Start menu, d-pad up horse. Phone: stick + drag to look, Attack/Dodge/Block/Use/Run buttons, tap a person / remains / chest / shrine to use it (walks there when far), tap the prompt to use, tap a ground spell then tap the ground. Mouse: with a free mouse, click a person / remains / chest / shrine.

## The ground, sky and light (2026-11-24, "the world looks MVP")

| File | What it does |
|---|---|
| `data/ground.json` | Every knob: the nine painted layers (surface, tint, metres per repeat, tone), biome → layer, how roads wear the ground, town paving (squares, cobbled streets, yards round buildings and yard props), the crops in each field, grass per quality. |
| `js/client/render/ground-plan.js` | Pure (node-tested in `tests/world/ground.test.mjs`): paints two splat maps (1 m a texel; 2 m on Low) from the biomes, fields, roads, towns and placements, and plans the crops + fences (proctown `cropField` / `fenceLine`, none on a road, in water or in a footprint). |
| `js/client/render/ground.js` | The ground mesh (the terrain's own grid, GRID SPLIT), its shader (up to nine texture layers mixed per pixel, rock by slope, a second larger sample on Medium/High so the repeat does not show), water, and the fields (swaying sheaves). Roads are worn into the ground, not laid on it. |
| `js/client/render/grass.js` | Grass tufts on the graphics card round the camera (one draw call; a slot per lattice square, Farhold/Thousandvale's idea), grown from the splat, standing on the drawn triangles, fading out at the edge, a few flowers. |
| `js/client/render/kit-props.js` | Pure (node-tested in `tests/world/kit-props.test.mjs`): every scenery piece without a GLB (98 ids: buildings, camp gear, shrines, stones, ruins, graves, chests, trees, rocks, plants) as unit-shape parts — proctown's set-piece kit (`propkit.js`), building kit (`buildkit.js` + `offices.js`) and Oathwild's own pieces in the same style — fitted to the art row's planned size (so placement radii and colliders still match) and turned so the front faces -Z like every placement. Gallery: `tools/kit-gallery.html` (`?group=building`); pictures: `tests/ui/kit-shots.mjs`. |
| `js/client/render/kit-draw.js` | Draws them: every placed piece in a 128 m tile goes into one InstancedMesh per unit shape (plus an unlit one for glowing parts); trees / rocks / bushes are baked to one low-poly mesh per kind (three variants) for the scatter; campfires flicker, the mill wheel turns. Cost check: `tests/ui/perf-kit.mjs --spot larkford` (draw calls + triangles; `--swap` serves older files for a before/after). |
| `js/client/render/tufts.js` | Leaf crowns as fluffy tufts (2026-11-24, owner: "trees look bad compared to Thousandvale"): each clump of a story tree is a ball of camera-facing tuft quads (the stylized "fluffy tree" technique — douges.dev / Pontus Karlsson, three.js forum), normals out of the clump, a painted dense leaf / needle tuft picture, a depth material for tuft-shaped shadows; conifer tiers as rings of needle tufts. Same full crown on High / Medium / Low (counts change, never flat cards). Gallery: `tools/tree-gallery.html`; pictures: `tests/ui/tree-gallery-shot.mjs`, `tests/ui/tree-shots.mjs`; test: `tests/world/tufts.test.mjs`. |
| `js/client/render/view.js` | The painted sky (gradient, sun + glow, drifting clouds), warm sun + cool sky fill, horizon-coloured fog, shadow box that moves in whole texels (no crawling edges); soft shadows on High. |
| `img/ground/*.webp` | The layer pictures, baked from highdef-3d's painted surfaces by `tools/bake-ground.mjs` (run it after changing `layers`). |

Check: `node prototypes/oathwild/tests/ui/ground-probe.mjs --quality low|medium|high [--phone] [--at x,z]` (draw calls, triangles, forced frame time, who draws what, shader errors, a picture) and `tests/ui/look-shots.mjs --tag ground`.

## The air, light and life (environment round, 2026-11-24)

Owner's guide (`oathwild-environment-guide.md`, written by another thread without the code) → what was built:

| File | What it does |
|---|---|
| `js/client/render/atmos.js` | Height mist (pools in low ground) and drifting cloud shadows on EVERY fogged material, by wrapping `Material.onBeforeCompile` once (each material keeps its own hook and program identity). Numbers: `ATMOS.set`. |
| `js/client/render/post.js` | After-effects per quality: Low none; Medium bloom (half size, only the brightest) → tone map → grade + vignette → SMAA; High 4× MSAA + GTAO ground-contact shade + the same. The grade is a LUT written as numbers (warm highs, cool shadows, calmer greens, barely lifted blacks). |
| `js/client/render/view.js` | Late-afternoon sun (~28°, warmer), image-based light baked from our own painted sky (PMREM; no HDRI download), distant hill rings inside the far plane, Look numbers from `data/tuning.json` applied live (`?tune` panel, group Look), `?envoff` = this round switched off (before/after), `?tone=agx` to compare tone mapping. High: one wider 4096 shadow box (80 m) instead of cascades (CSM replaces material hooks and adds a shadow pass per cascade). |
| `js/client/render/ambient.js` | Dust motes, falling leaves from nearby crowns, chimney smoke (tops found by kit-draw.js), bird flocks, butterflies over meadows, and the ambience bed for where you stand (forest / town / marsh / wind, `sfx` library). |
| `js/client/render/contact.js` | A soft contact shade under every building, prop, shrine and chest, tilted to the slope (one instanced draw). |
| `js/world/scatter.js` `understory()` | Shrubs at tree feet and a stepped wood edge (saplings → shrubs → meadow); drawn by trees.js with leaf tufts (the kit's bush balls became tuft shrubs too); client only, walk-through, 0.15 s. Test: `tests/world/understory.test.mjs`. |
| ground | Big straw/deep-green colour patches on grass (`ground.js`), leaf litter painted under every crown (`ground-plan.js paintGround({ trees })`), rippling water that reflects the sky (Medium/High). |
| tufts | Backlit leaves glow with the sun's colour when you look toward it. |
| quality | First visit picks a tier from the graphics chip (`main.js autoQuality`); an automatic pick that runs under ~24 fps steps down once; `?quality=low|medium|high` for one visit. |

Measured (2026-11-24, `tests/ui/env-shots.mjs`, Medium): the first tune washed out (saturation −20-40%: valley mist veiling whole towns, bloom below the sky's brightness, lifted blacks) — retuned: bloom 0.1 above 1.15, mist 0.0012 max 0.22 in the lowest 4% of the land, no lift, saturation ×1.12, contrast ×1.1, sky light 0.3; after ≥ before on saturation in the field and valley views. High: GTAO blend 0.35 (0.55 left woods near black), god rays faint by design (`RAYS`). Phone Low: 139-159 draw calls, ~400k triangles (decor and trees grouped bigger, one look per species, shrubs merged, understory 30%).
Check: `tests/ui/env-shots.mjs [--quality] [--tag] [--extra envoff] [--only views] [--pitch -0.5]`, `tests/ui/ambient-shots.mjs` (smoke, building base, under a tree; chimney count) — six fixed views + brightness / spread / saturation /
clipped numbers per picture (a washed-out picture has a high mean, low spread, low saturation).
Not done from the guide, on purpose: §8 spending (needs the owner's OK), ez-tree (big-leaf rule 74; tufts instead),
three-csm (see above), KTX2 texture compression (see the round's notes), @takram atmosphere (our painted sky + matched fog).

## Towns (town round, 2026-11-25 — owner: "the town is still very empty … just tiny houses plopped onto a flat area")

Streets first, then the houses that line them (lessons rule 76). Larkford went from nine 6 m houses on a 120 m disc of
flattened dirt to 57 terraced houses along a high street, a ring lane, West Street up the hill and two alleys, with
back yards, a market square, terraces and townsfolk; Thornwatch got 13 log cabins along two lanes.

| Part | What it does |
|---|---|
| `data/map.json` | The towns' own streets are real roads (`town`, `surface` cobble / dirt, a short `shoulder`), so grading, paving, tree clearing and walking read them. A town keeps `relief` of its hill (Larkford 60%); `pads` are level terraces (the square, the shrine yard, the tower terrace); `front: true` = houses face that square. |
| `data/towns.json` | Per town: the street rules (house widths / depths / storeys in 3 m kit cells, shop fronts), work `spots` for townspeople (where they stand, which way they look, their routine), stalls, props, villager `stops`; `idles` = the work routines (shopkeeper, smith, innkeeper, minstrel, priest, guard, trainer, mage, groom, crafter, watcher, elder). |
| `js/world/town.js` | The planner, pure, run by the server (colliders) and the browser (drawing): terraced houses on every frontage (an alley gap every 3-6 houses, the town's edge spaced out), each tested along its whole footprint against every street, square, placed thing, person and other house; floors above the ground under them (stone plinths on the slope); fenced / hedged / stone-walled back yards with clutter and vegetable beds; lamps; terrace walls where a pad stands over the ground; a few big trees in open ground whose crowns clear every roof; the street network and each villager's walking loop. |
| `js/client/render/town-draw.js` | Draws it: Kenney Fantasy Town Kit wall pieces storey by storey (windows, shutters, doors, half-timber bracing by style: timber / stone / plaster / wood), roofs made here from the wall rectangle (they cannot disagree with the walls), plinths, doorsteps, smoking chimneys, shop awnings and banners, fences, hedges, stalls, the fountain, lamps, Survival Kit clutter. Each house's plaster / roof / timber colour comes from swatches painted into the kit palette's empty top row (texture coordinates moved per house) — one material; one merged mesh per 48 m chunk (Larkford: 20 draw calls). |
| `js/client/play/villagers.js` | Nameless townsfolk ("Villager") walking their loops on the wall clock (every player sees them in about the same place, nothing sent by the server); they linger at stalls, the fountain, doors; never units, talk targets, tap targets or name tags; step aside for a hero (drawn only). 4 / 10 / 14 by quality; they give bodies up first when bodies run short. |
| `js/client/screens/play.js` | Townspeople play their routine at their spot, turn to a hero within 4.5 m, talk while their window is open. |
| `js/game/ground.js` | Houses, stalls and terrace walls are solid boxes (a step into one is refused; someone inside one from an old save walks out); town trees and the fountain are solid circles. |

Checks: `node --test tests/world/town.test.mjs` (crowded, nothing on a street / square / water / another house every
0.5 m, every door on a street, floors span the hill, walls stop a walker, villagers never walk through a house or the
fountain and their loops close, spots clear and kept in step with npcs.json, trees clear of roofs, spawn and shrines in
the open, same data = same town); `node tools/town-preview.mjs [--town thornwatch]` (the plan from above, pure Node);
`tests/ui/town-shots.mjs [--house N] [--only aerial,square]` (street level + aerial pictures, the town's cost).
Art: `playground/assets/kenney/` (CC0, credits in `shared/credits.json`).

**Ideas for fuller towns (the brainstorm, 2026-11-25).** Done this round: streets drawn first with houses lining them
as terraces; alleys between terraces into the back yards; the hill kept (plinths, steps, terraces with retaining
walls); back yards with fences, hedges, walls, woodpiles, crates, vegetable beds; 1-3 storeys with gables both ways,
smoking chimneys; shop fronts with awnings and banners and goods at the door; a market square with stalls, a fountain
and benches; lamps along every street; big trees in the open ground; villagers walking and townspeople working.
Next (not built yet): walk-in interiors for the inn and shops; a palisade with a gatehouse at the bridge; a mill race
through town with footbridges; market day (more stalls and a crowd at set hours) and evening (lamps lit, villagers
go home); animals (chickens in yards, a dog, horses at the stable); hanging trade signs, window boxes, ivy; jettied
upper storeys and balconies, an alley that passes under a house; worn steps, puddles, cart ruts, moss on old roofs;
smithy hammering and market chatter in the town's sound; a tall landmark (a temple spire) that shows from afar.

## Tests and tools

- `node --test prototypes/oathwild/tests/rules/*.test.mjs` — 145 tests: purity, drift guard (pins every borrowed
  number), class trees, level 1→10 for every round-1 class and several mixes, plate rules, ranks, tooltips (no NaN,
  no long decimals), individual loot, auras, use-skills, world state, combat bots (every class wins a level-matched
  fight), co-op camp clear, death/revive, forms, summons, taunt, sneak, leash, horse, same seed = same fight.
- `node --test prototypes/oathwild/tests/world/*.test.mjs` — 35 tests: the map, placements, the quest engine and a
  campaign bot that plays all 23 quests from level 1 to 10 alone (warrior, cleric) and as a group of three.
- `node --test prototypes/oathwild/tests/net/*.test.mjs` — the server: join, move, water stops you, sprint, fights, individual loot, spells, quest sharing, a whole quest with per-player rewards, level-up, gear, save/load, reconnect, protocol; and a 3-player co-op test through the real server process.
- `tests/rules/casters.test.mjs` (30) and `tests/net/casters.test.mjs` (3): every wand / tome / staff style, the
  sceptre and each off-hand rider hit what their card says; the attack's events, the bolt's look and a lob's
  crosshair point go through the real server. `tests/ui/caster-shots.mjs` photographs every style firing
  (test-results/oathwild-casters/, dev-only `devGear` holds a styled weapon).
- Browser (one at a time, needs oathwild-dev): `node prototypes/oathwild/tests/ui/smoke.mjs [--phone]` (title → hero → world → walk), `tests/ui/controls.mjs` (keys, mouse, mocked controller change the game), `node tools/walk-screens.mjs oathwild` (every screen, desktop + phone, `tests/walk.mjs`).
- `node prototypes/oathwild/tools/map-preview.mjs [--text]` — draws `docs/map-overview.png`; `tools/place-world.mjs
  --write` rebuilds `data/placements.json` from its layout.
- `node prototypes/oathwild/tools/sim-levels.mjs [--fight] [--class paladin | --plan warrior,cleric,… | --all]` —
  every number per level for tuning.
- `node prototypes/oathwild/tools/pin-drift.mjs` — re-pin the borrowed numbers after reviewing a change in
  Farhold / Emberveil / Thousandvale.
- `node prototypes/oathwild/tools/classes-md.mjs --write` — regenerate the trees in `docs/CLASSES.md`.

## History

- 2026-11-25 — town round (owner: shops buy on a tap on phones; names → jobs; "the town is still very empty"; enchanting
  as the player's trade skill; motionless town; shopkeepers' spots + idles; "brainstorm … detailed terrain, realistic
  paths and alley ways"). See "Towns" above. Shops and repairs: tap = look (the one item card) + a separate Buy / Sell /
  Repair button (`win-shop.js`, `win-services.js`, test `tests/ui/shop-buy.mjs`). Trade skills: `win-trade.js` (K, ☰,
  HUD), works anywhere but mid-fight (`tests/net/trade.test.mjs`). People: only the main story's five keep names
  (`tests/world/npc-names.test.mjs`). Phone fix reported mid-round ("can no longer press my first action ability"):
  the drag-to-look layer covered the lone centred slot; the bottom bar now sits above the touch layer
  (`tests/ui/phone-slots.mjs`, real touch taps, warrior + mage; lessons rule 15 sharpened).

- 2026-11-24 — tap the world + creator pages + trees (owner: "I cannot click to interact with npcs or loot corpses on
  mobile … cannot click to revive at the shrine … class selection after customization on its own screen … view the
  skill tree … background and attribute pages separate … trees look bad compared to Thousandvale"). Tapping (phone) or
  clicking with a free mouse on a person, remains, chest, object or shrine uses it, walking over first when out of reach
  (`play.js` `interactables` / `pickAtScreen` / `reach`); the prompt is a button (phones: above the action buttons); the
  fallen panel sits above the touch look area (it covered Wake at the shrine) and is built once. Creator: Look → Class
  (the class's whole tree, `win-classes.js` `treeHtml` preview mode, real numbers from a draft hero) → Background →
  Attributes (starting numbers). Trees: two causes — the story trees were built ~12 m and SCALED to 18-50 m, so their
  leaf cards became house-sized single leaves; and one detail level for all distances meant Low (every phone) drew the
  far two-card clumps beside the hero. Leaves are now fluffy tufts (`tufts.js`). Low costs ~12% more triangles than the
  old flat cards (ground-probe, phone, Low). Phone HUD: Tap hints from the start, an Attack button, no empty slots.
  Checks: `tests/ui/tap-interact.mjs [--desktop]` (NPC, prompt, Use, far chest walk-to, wolf remains, Wake at the
  shrine — real touch taps), `tests/ui/creator-shots.mjs [--phone]`; dev-only `devDown` / `devDummy hp`.

- 2026-11-24 — Thousandvale's magic-weapon itemization (owner: "wands and tomes having special attacks"): 13 wand
  styles, 4 tome forms, staff styles and element spells, sceptres that swing their element, off-hand riders (Echo,
  Burst, Ward, Siphon), named casters, a `magic` loot kind and two shops; each style drawn with the Spell Kit; cards
  from the same plan the sim fights. Also fixed: a scheduled job's ground point overwrote its due time, so the
  landing hit of every ground-targeted spell was silently dropped (a lingering zone it leaves still worked).
- 2026-11-23 — round 1, rules core: 27 classes consolidated from Farhold / Thousandvale / Emberveil (8 base, 13
  advanced, 6 specialty), mastery trees with ranks and modifiers, attributes, talents, non-combat skills, plate and
  other training, auras, the world sim, individual loot, tooltips, world state; 145 tests.
- 2026-11-23 — round 1, world content: a hand-shaped map of Brightwater Vale and Thornmere Wilds (rivers, marsh,
  roads, four crossings, level bands), Larkford and Thornwatch, 11 camps, 17 roam zones, 7 shrines, 10 chests, 34
  people with trainers for every round-1 class, the main thread (8 quests, a boss in each region, a hook north) and
  15 side quests; 35 world tests including a level 1-10 campaign bot.
