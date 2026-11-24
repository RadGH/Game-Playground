# Oathwild — architecture (round 1)

Read `PLAN.md` §0 first (owner rulings). This file is the code map and the contracts between parts, so several
builders can work at once. Reuse map (2026-11-23 survey): the combat maths is **Farhold's** pure modules
(`prototypes/farhold/js/*.js` + `data/*.json`), item bases are **Emberveil's** (`prototypes/emberveil/data/items.json`),
Thousandvale (`prototypes/thousandvale/js/rules/*`) orchestrates them as pure server-side code. Oathwild does the same.

## Layout
```
prototypes/oathwild/
  index.html, css/, js/main.js            client entry (title, creator, world, HUD)
  js/rules/                               PURE (no DOM, no three.js, no sockets) — runs in node tests, server, client
    farhold.js        the ONE file that imports Farhold/Emberveil/Thousandvale-rules by path (like T/js/rules/farhold.js)
    attributes.js     Str/Dex/Con/Int/Wis/Cha → derived stats (feeds Rpg.derive)
    classes.js        multiclass: class levels, unlock requirements, horizontal trees, spell ranks
    skills-use.js     use-based skills 0–100 (One-handed … Speech), XP per use, milestones
    talents.js        talent points + rows gated by attributes/skills (adapts T perk-forest / F perks)
    proficiency.js    canWear/canWield: armour + weapon kinds from class nodes, affixes, talents; Str needs
    levels.js         character XP curve (cap 10 in round 1), level-up choices (class pick, attribute point, talent)
    combat.js         adapts T cast.js/cast-skills.js/field.js to one world of ≤10 players (+ monster AI, threat)
    auras.js          buffs/debuffs on top of F skills.js statuses (stacking, DoT/HoT, stat mods, display data)
    loot.js           INDIVIDUAL loot per player (owner): corpse/chest/bag contents rolled per eligible player on
                      first open; gold looted; chest refill timers per player
    describe.js       tooltip TEXT model (pure): spell/item/aura/talent/class-node → { title, kind, rows, lines,
                      auras, how, compare, next, needs } with live numbers from a character; UI only renders this
    engine.js boot.js data.js   one rules object (Farhold's Rpg on Oathwild's balance, statuses, spell catalogue)
    spells.js         the spell catalogue: reused rows + own, ranks, modifiers, targeting kind, power source
    sheet.js          the character sheet (attributes + classes + passives + talents + gear → every number)
    inventory.js      carry weight, durability, enchanting, the horse
    world-state.js    shared persistent world: quest flags, cleared camps, chest timers, discovered shrines
  data/               Oathwild's own JSON (classes.json trees + ranks, attributes.json, skills-use.json,
                      talents.json, proficiency.json, regions.json, quests.json, npcs.json, loot-tables.json,
                      spell-visuals.json, art.json (fal props + enemies per region — art helper writes it))
  js/client/          three.js: terrain, props, actors (Tabard heroes, fal enemies), camera + aim, indicators,
                      spells (spellkit), HUD, windows (loot, character, class tree, talents, inventory, map)
  js/net/             client socket, snapshot apply, prediction (adapt T predict.js / snapshot.js, sized for 10)
  server/             Node + ws: one process hosts several worlds; 20 Hz sim; world saves (JSON on disk);
                      ports 8660 stable / 8661 dev, wss 8662 / 8663 (unit names oathwild / oathwild-dev)
  tests/              node --test for rules (tests/rules/*.test.mjs), browser checks, walk.mjs
```

## Contracts
- **Character record** (saved on the player's side, travels into any world) — *refined by the rules core
  2026-11-23*: `{ id, name, look (Chibi 2.6 look → Tabard), background, version, level, xp, classLevels: { warrior: 3,
  cleric: 1 }, classOrder: [cls…], attributes: { str, dex, con, int, wis, cha } (the point buy), attrSpent: { str: 1 }
  (level points), nodes: { 'warrior/cleave': 2 } (class-tree ranks bought), paths: { warrior: 'bulwark' }, talents:
  { id: rank }, skills: { sneak: { v, xp } … } (non-combat use-skills), bar: [spellId…] (8), gear: { slot: item },
  bag: [item], gold, enchant: { known: [affixId] }, shrine, horse, boosted: { cls: true } }`. Changed from the first
  draft: `picks` → `nodes` (ranks per node), `spellRanks` is DERIVED (`classes.spellRanks(rules, char)`), `attrPoints`
  is derived (`attributes.attrPointsLeft`). `levels.blankCharacter()` lists every field.
- **Level-up** = `levels.levelUp(rules, char, { cls, path?, spend?: [nodeId], attr?, flags })` → needs the XP
  (`pendingLevels`) and the class (base, or its requirements met — `flags` from `world-state.flagsFor`) → class
  level +1 (+ its health/mana/attribute growth, + 2 points for that class, free nodes granted) → optional path,
  node buys and attribute point, all-or-nothing. Points can also be spent any time with `classes.buyNode`.
- **Spell ranks and modifiers**: a class node `{ kind: 'spell', spell, level }` holds ranks 1–3 (rank r needs class
  level `level + 2(r−1)`); rank data on the spell in `data/spells.json` `ranks: [{}, { power, mp, cooldown?, seconds?,
  add? }…]`; a `{ kind: 'mod', on: nodeId, change: { mult, add, set } }` node changes a spell's row. The row a cast
  uses is `classes.castRow(rules, char, spellId)`; `describe.describeSpell` shows the current rank and the next.
- **Proficiency**: `proficiency.canWear(rules, char, item, { slot })` → `{ ok, why }` (why is player language, e.g.
  "Plate Armor: Plate armour needs training (the Warrior's Plate Drill, the Paladin's Plate Training, the Plate
  Training talent or an item of the Bulwark) and 15 Strength (you have 11).").
- **World sim** (`js/rules/combat.js`, server at 20 Hz): `createWorld(rules, { seed })`, `addPlayer(world, char)`,
  `spawnCamp / spawnRoamers / spawnMonster`, `events = step(world, dt, inputs)` with input per player `{ move:{x,z},
  aim:{origin,dir}, attack, power, block, sprint, sneak, dodge, cast:{ slot | spell, at, held }, revive, respawn, mount
  }`; `snapshot(world)` for the network; `respawnPlayer`, `refreshPlayer` after gear/points change. Event kinds are
  listed at the top of combat.js. Loot containers land in `world.containers` (`loot.openFor / takeItem / takeGold`).
- **Tooltip model**: `describe.describeSpell / describeItem / describeAura / describeTalent / describeNode /
  describeClass / describeSkill` → `{ title, kind, icon, rank, rows, lines, auras, how, compare, next, needs, ok }`.
- **Rules engine**: `const rules = await bootRules({ seed })` (js/rules/boot.js) or `createRules(data)`; every rules
  function takes `rules` first.
- **Spell targeting** (client → server `cast {slot, aim:{origin,dir}, at:[x,y,z]?, held}`): kinds `bolt` (aimed
  along the crosshair ray), `ground` (placed where the crosshair ray meets the ground, clamped to range; the client
  shows the zone indicator while held), `cone`, `line`, `self`, `beam`. Indicator shapes reuse T telegraph-shape.js.
- **Tooltips**: one renderer (`js/client/ui/tip.js`) on top of `shared/tooltip.js`, fed only by `describe.js`. Every
  number via `shared/format.js`. Standard layout: title · kind/rank line · cost / cast / cooldown / range row · body
  lines with live numbers · auras explained · "How it's worked out" (formula with the hero's numbers) · compare
  (items: green/red against what's worn).
- **Spell visuals**: `avatar-3d/spellkit/` (new reusable experiment) — `createSpellKit({ scene, camera, textures })`
  → `kit.windup(caster, spellVisualId)`, `kit.indicator(shape, opts)`, `kit.release(...)`, `kit.impact(at, id)`,
  `kit.ground(at, id, seconds)`, `kit.update(dt)`; data `data/spell-visuals.json` (layers per phase, PLAN §0).
- **Art**: `data/art.json` (written by the art helper): enemy body ids per region, prop ids + kinds + sizes; models
  load through avatar-3d/fal (enemies: `createFalCharacter`; props: the props loader it documents).

## Guards (lessons)
- Importing Farhold by path: copy Thousandvale's drift guard (`T/tests/C/drift.test.mjs` idea) — a test pins the
  numbers Oathwild depends on, so a Farhold change can't silently change Oathwild.
- Purity test for `js/rules/` (no DOM/three/ws imports), as T/tests/C/purity.test.mjs.
- Game standards (`~/claude/docs/game-standards.md`) + lessons (`~/claude/docs/lessons-from-games.md`), game-lint,
  walk.mjs for every screen, What's new, ☰ menu + in-game bug reports, controller everywhere.
