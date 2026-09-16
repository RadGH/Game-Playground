# Farhold — the RPG expansion (round 4)

What round 4 added, why, and where to change it. The brief was: make Farhold work the way the
block-world action-RPG mods do — **difficulty belongs to the place, not to you** — and fill in the
RPG systems that were missing or half-wired.

Reference points are named here for Claude's benefit only. **None of these names, or anything from
them, appears in player-facing text or data.**

---

## What was studied first

The mod the user named (*Hack/Mine*) and its successors (*Loot Slash Conquer*, *Mine and Slash*):

- **Area levels.** Difficulty is a property of where you are. Further from spawn = higher area
  level = better rewards. Monsters roll their stats against the area level.
- **Randomly generated monsters** with their own attacks and AI.
- **Procedurally generated dungeons and towers**, plus larger hand-made boss dungeons.
- **Randomly generated weapons and armour** with levels, rarities and attributes.
- **Player stats** driving damage, health, attack speed, move speed, mana, regen, crit.
- **Classes and abilities.**

Farhold already had the loot half (it borrows Emberveil's generator). What it did not have was the
*place* half — every square metre of a 163 km × 82 km planet was equally dangerous — so that is
where round 4 started.

---

## 1. Zones — `js/zones.js`

Those mods measure "further" as **distance from spawn**, which gives you invisible rings: you cross
a line in an empty field and everything gets harder for no visible reason. World Forge already grows
**named regions** with borders it draws on the map, so Farhold bands *those* instead. "The Kelder
Reach is level 9–13" is a thing you can see, point at, and decide to avoid.

```js
const zones = buildZones(world, { spawn: [x, z], maxLevel: 30, bandWidth: 4 });
zones.at(x, z);             // { name, minLevel, maxLevel, danger, band, home, … }
zones.levelFor(x, z, rng);  // a level to roll a spawn at, right here
```

**How a band is decided.** Breadth-first over the region *neighbour graph* from the region the
player starts in gives `hops` — how many borders you must cross. Hops alone are too coarse: World
Forge grows big, well-connected regions, so a whole continent is often three or four borders across,
and banding purely on hops produced 1–4, then 10–13, then 18–21, then *everything else* at 27–30.
That is a cliff, not a gradient. So the band is

```
t = (hops/maxHops × 0.6 + distanceFromHome × 0.4) ^ 1.35
```

Hops still lead (they respect what is actually walkable); distance separates the regions that share
a hop count; the exponent softens the bottom so the first ring out of home starts around level 5
rather than 9. The starting region is then **pinned** to level 1 whatever the arithmetic says.

Unreachable landmasses get `maxHops + 1`, so an island across the sea is endgame.

**Where it shows:** the HUD's zone line (coloured against your own level by `zoneTone`), the
Journal tab's region table, and the map's level overlay.

## 2. The map's level overlay — `js/map.js`

On by default, toggled by the **Level bands** checkbox above the layer list. Every land pixel is
washed toward a danger colour worked out against *your current level*, each region's centre carries
its band ("14–17 / Hostile"), and dungeon mouths, camps and lairs are drawn as markers. The legend
gains the danger scale. This is what "plan a route" means in practice: you can see where you may
walk today and where you may not.

## 3. The bestiary — `data/enemies.json`

From 16 enemies to **46 enemies, 6 bosses, 10 companions and 14 modifiers**.

**Sizes.** The user's note was "things like rats are tiny, not good". A creature body at `size: 1` is
roughly its real-world metre size, so a rat at 0.62 was 28 cm long. Everything was rescaled and a
node test now fails if any creature drops below `size: 1.4`. The Cairn Gnawer is 3.2 — a dire rat
that comes up to your chest.

**Fields each entry carries:**

| field | what it does |
|---|---|
| `family` | beast / undead / construct / fiend / elemental / aberration / dragonkin / humanoid — what the affixes that say "+50% against the undead" test against |
| `role` | `skirmisher` closes, `brute` is slow and hard, `archer` and `caster` keep their distance and throw real bolts, `leader` brings an escort |
| `pack` | `[min, max]` bodies that arrive together |
| `leads` | ids this one turns up escorting |
| `ranged` | `{ range, element }` — makes it an archer or a caster |
| `onHit` | a status every one of its hits applies |
| `flying` | it hovers above the ground |
| `rareOnly` | never spawns ordinarily (the Hoard Mimic) |

**Ranks.** Every spawn rolls one: `normal`, `champion` (one modifier, an aura, 18% bigger),
`rare` (two modifiers, a name from Name Forge, 35% bigger). Multipliers live in
`balance.json` `ranks`. A champion is worth 2.4× the xp and drops one extra item; a rare 4.5× and
two, at a much better rarity. That is the "go and kill the glowing one" loop.

**Modifiers** (`data/enemies.json` `modifiers`) are the 14 things a champion or rare may be:
Vicious, Ironclad, Fleet, Vital, Venomous, Scorched, Rimed, Thorned, Leeching, Warded, Frenzied,
Gilded, Hoarding, Unyielding. Each names a colour, and that colour is the ring of light under the
body — so you can tell from 40 m away, without a nameplate.

**Bosses** are placed, not spawned: one per dungeon, and one at each high-band lair. Each has
`phases` that fire at fractions of its health, turning a modifier on and saying a line, and some
call in help.

## 4. Encounters — `js/encounters.js` + `data/encounters.json`

The second complaint was that the world was "few and far between… a single lone straggler". Two
fixes. The ring is denser (`maxAlive` 14 → 38, `everySeconds` 2.5 → 1.1, a tighter radius) and packs
are the default (`zones.packChance` 0.78). And on top of that, every ~26 seconds the walk rolls for a
**set piece**:

| id | what it is |
|---|---|
| `warband` | a line of folk with a captain, coming up the road *in front of you* |
| `hunting_pack` | beasts that have already caught your scent |
| `ambush` | spawns inside your aggro range, already awake |
| `rare_prowler` | a rare with a couple of ordinary bodies around it |
| `champion_duel` | one champion, alone, in the open |
| `feeding` | something busy that will not notice you until you are close |
| `swarm` | eight to twelve weak bodies — what area skills are for |
| `raiding_party` | a champion leading its own kind |
| `casters` | a circle that keeps its distance and shoots |
| `night_hunt` | after dark only, and harder |
| `beast_and_prey` | a brute with lesser things around it, busy |

`where` places it (`ring` out of sight, `ahead` down the line you are walking, `close` on top of
you); `prefer` filters which table entries may fill it; `aggro` decides whether it has already seen
you. The same set piece never runs twice in a row.

## 5. Dungeons — `js/dungeon.js` + `js/dungeon-plan.js`

Phase 4's honest limit was "dungeons are markers, not places". Now a `dungeon` node on the map gets
a **stone archway** you walk up to, and `E` takes you inside.

`dungeon-plan.js` is pure (no Three.js, so `node --test` drives it): rectangles scattered without
overlapping, joined nearest-first into a spanning tree of L-shaped corridors, plus one or two extra
loops so it is not a pure backtrack. The entrance is the room nearest the middle; the boss room is
the one furthest from the entrance.

`dungeon.js` builds it: two merged vertex-coloured geometries (floor, walls) plus one instanced
sconce mesh, so a whole dungeon is three draw calls. Every wall segment files a cylinder into an
`ObstacleField`. Doorways are the segments a corridor passes through.

**There is no ceiling, on purpose.** A third-person camera inside a closed box spends its life
clipped into the roof. Tall walls, a black sky (the sky scene is skipped entirely while you are
inside) and fog at 70 m read as "inside" from the floor and leave the camera somewhere to go.

Going in swaps the **floor**: `control.setTerrain(dungeon.terrain)` — which is why `player.js` reads
its terrain through a binding and exposes `setTerrain`. The enemy field and the companions follow.
`field.paused = true` (nothing wanders in from outside) and `field.rankBonus = 1.7` (more champions
and rares than in the open).

Killing the boss clears the dungeon and pays a reward screen.

## 6. Treasure — `js/chests.js`

Four grades — wooden, iron-bound, gilded, warded — placed deterministically from the world seed and
the 64 m cell they sit in, and **remembered once opened**, so a chest cannot be farmed by walking
away and back. A warded chest glows, pays the most, and has a 22% chance of not being a chest at all.

Bosses and rares drop a **loot bag** instead of pushing five items silently into the inventory: it
sits there bobbing, and walking over it hands the lot over at once. The walk is the beat that makes
a kill feel finished.

Everything with a haul worth stopping for goes through `shared/rewards.js` — the same reward popup
Emberveil uses: a chest lands, bursts, the gold and xp count up, and the items fly out one at a time
in their rarity colour.

## 7. Crafting — `js/craft.js` + `data/crafting.json`

The rule the user set: **no mining, no chopping trees.** Every material comes out of an item you
recycled, or off something that was hard to kill. That makes the bench part of the loot loop rather
than a second game bolted on: a bad rare is not rubbish, it is four Bound Essence.

**Materials** are a separate bag (`Materials`), and there is **no cap on any of it**. Twelve of
them over four tiers: Scrap Iron / Torn Cloth / Cured Hide, Bound Essence / Beast Sinew / Ground
Bone, Resonant Dust / Emberglass / Rime Shard / Void Salt, and Legend Core / Rune Plate.

**Recycling** reads three tables: the item's rarity, the base's armour tier (or, for weapons, what
it is made for), and its quality. A unique or set piece always leaves a Legend Core.

**The bench** has 16 recipes: forge a weapon / armour / trinket / a fine piece / a masterwork;
temper (quality up); promote (rarity up, plus a new property); inscribe (one more property);
reweave (trade one property for another — each reweave of the same item costs more); recast (throw
the whole set back); re-roll the numbers; brand with fire / rime / void; reinforce; hone.

**Advanced work needs rarer components** — a node test asserts it: a masterwork needs tier-4
material where a plain forge needs tier-1. Costs also scale with the item's level band.

Every button is drawn from a `quote()`, so a greyed-out button always has a reason next to it
("needs 4 Bound Essence more", "all 4 property slots are full — reweave one instead").

## 8. Effects — `js/effects.js`

Emberveil has a 359-id registry, but it is written for a turn-based party fight: `roundStart`,
`pickTargets`, `per_source`, two arrays of actors. None of that exists here. Porting it would have
produced a file full of hooks nobody could call, so this is the same **ids** rebuilt around a clock.

**All 63 affix stats `items.json` can roll, and all 24 legendary powers.** Nothing is inert. The
`inert` list on the character sheet is kept as a guard and a node test fails if anything lands in it.

Five of the legendary powers were written for Emberveil's *travel* layer (camping, foraging, map
nodes, night raids). Each is translated to the nearest thing that is real in Farhold and the
translation is written down in the file — `camp_mend` lifts anything that mends you, `forage_feast`
makes a won fight leave crafting material, `road_cache` pays out at every new place you reach.
`initiative` (turn order there) becomes **attack speed** here, which is the stat it was always
standing in for.

Hooks: `derive`, `dmgOut`, `dmgIn`, `armorPen`, `critBonus`, `onHit`, `onCrit`, `onKill`, `onSwing`,
`onCast`, `onDamaged`, `combatStart`, `preLethal`, plus scalar look-ups (`manaShield`, `costCut`,
`boltSplash`, `petPower`, `statusLonger`, `statusPower`, `echo`, …).

The per-character scratch (how long you have been fighting, hit streaks, whether cheat-death is
spent) lives in the `Effects` runtime rather than on the character, so a save never carries a
half-finished hit streak.

## 9. Skills — `data/skills.json` + `js/skills.js`

From 12 skills to **39**, from four per class to **six**, unlocked at levels 1, 3, 7, 12, 18 and 24 —
so a new character has one button and earns the rest.

Four new shapes: `beam` (a line out from you), `ground` (lands where you are looking), `dash` (you
move, everything on the way is hit), `summon` (a temporary companion). Eight new statuses: bleed,
web, shock, curse, weaken, haste, stoneskin, regen, rally.

`cooldownReduction` and `cond_skillMpCostReduce` are applied here, not in the data, so the bar
always shows the real number.

## 10. Classes and companions — `data/classes.json`, `js/pets.js`

All **thirty** Emberveil classes are playable: look, role, armour tier, weapons, starting kit,
six skills, and — for thirteen of them — companions.

A necromancer raises two Bone Thralls and a Bone Archer; a druid calls two Grove Wolves; a shaman
calls up a Spirit Bear; a warlock binds an imp and a familiar; a tinker winds up a Clockwork Sentry.
Ten companion bodies, built by the same Chibi 2 / creature builders the enemies use, so they
animate for free.

The AI is three states: **follow** (a slot around the owner so they do not stack), **engage**
(something is bothering the owner), **return** (too far — come back). A companion that falls a very
long way behind catches up rather than being lost. Companions scale off the **owner's** level, so
they never fall behind, and `companion_might` / `pet_fury` multiply them in one place.

## 11. Light — `js/light.js`

Night looked good and was unplayable. Now:

- **Every character starts with a torch** in the off hand — a real point light, 34 m and warm, not a
  glow sprite. `F` lights and snuffs it; it fades out in daylight so carrying one at noon does not
  wash the world out.
- **World light sources** — braziers, camp fires, dungeon sconces, warded chests, dungeon mouths —
  hand this module a position, and the nearest ten get one of a fixed pool of point lights. Point
  lights are not free with Lambert materials, which is why the pool is fixed and recycled.
- **A floor under the ambient**, so a moonless night is dim rather than black.

## 12. The sheet — `js/hud.js`

Five tabs: **Character** (worn gear, attributes, companions, stats, and every power on your gear in
plain language), **Inventory** (the bag, with a recycle button on every row and a "recycle everything
normal" button), **Skills** (the six, with what they do and when they unlock, plus talents and
passives), **Crafting** (materials, the bench, and the recipe board), **Journal** (objectives, work
in hand, what you have killed, and the region table).

**Opening it releases the pointer lock immediately** — this was a real bug: the mouse stayed
captured, so the cursor was invisible and none of the buttons could be clicked. `createInput` now
exposes `release()`, `grab()` and `setBlocked()`, and a panel being open blocks the click that would
otherwise re-capture the mouse.

## 13. The sky — `js/sky.js`

Two problems the user pointed at. The backdrop was `scene.background = skyColor`: one flat colour,
which made the sky read as a wall *behind* the planets, with discs of rock pasted onto a blue sheet.
And there was nothing up there but a few points of light.

- **A galaxy**, generated procedurally into a 2048×1024 canvas (a dark base, a band of dust along a
  sine so the plane is not a ruler-straight stripe, dust lanes, and 7,000 stars whose brightness
  follows a power law). It is a `BackSide` sphere at 2.4 × the dome with depth writing off, so every
  planet and moon is genuinely in front of it. It varies with the star, so two systems do not share
  a sky.
- **An atmosphere in front of the bodies.** Air is between you and the sky, not behind it. A shell
  at 0.45 × the dome — *inside* every body's shell (bodies live at 0.60–0.98) — with a shader that
  is densest at the horizon and thinnest at the zenith. So a planet low on the horizon goes pale and
  soft, and in daylight the sky washes the lot out instead of leaving crisp discs on a blue sheet.

## 14. A new run starts in daylight

`sky.js` gives every world a **local time**: the sun's angle is
`elapsed/dayLength + startFraction + longitude`, where longitude is where you are on the map, 0..1.
So `startFraction: 0.34` only meant "morning" at longitude 0 — landing two thirds of the way across
the map added 0.66 and started you at half past ten at night. `morningElapsed()` winds the clock
back by the player's own longitude, so `startFraction` means what it says wherever you come down.
A browser test checks three seeds.

---

## The bug worth writing down

Giving enemies and companions a small `derived` bag (so modifiers could hang off them) made
`attacker.derived` **truthy** — and `derived.damage` is undefined on an enemy. `strike()` was
written as `a ? a.damage : attacker.dmg`, so it rolled `rng.range(undefined, undefined)` and every
number in the fight came out `NaN`.

The fix is `a?.damage || attacker.dmg || [3, 5]` — and the lesson is **never** `a ? a.x : fallback`
when `a` is a bag that may or may not carry `x`. There is now a table-driven node test that strikes
every enemy in the bestiary at every rank in both directions and asserts no `NaN`, plus a last-ditch
guard in `strike()` that turns a non-number into 1 damage and warns, so it can never reach a health
bar silently again.

Two others from the same round, both caught by tests rather than by eye:

- `Object.assign` copies the *value* a getter returns, so `control.obstacles = [dungeon.solids]`
  wrote a dead plain property while `unstick` kept reading the original closure — the dungeon's
  walls would not have stopped anybody. Accessors go on with `Object.defineProperties`.
- The weather view writes `scene.fog` every frame, so setting the dungeon's fog once on the way in
  was not enough — the horizon came straight back.

---

## Where the knobs are

| what | where |
|---|---|
| band width, start level, pack chance | `data/balance.json` `zones` |
| how often a champion or a rare turns up, and what a rank multiplies | `balance.json` `ranks` |
| ring size, how many are alive at once, how often one spawns | `balance.json` `spawn` |
| how often a set piece runs, and how many at once | `balance.json` `encounters` |
| chest grades, what they hold, how rare each is | `balance.json` `chests` |
| room counts, corridor width, wall height, sconce spacing | `balance.json` `dungeon` |
| leash, follow distance, how far a companion will engage | `balance.json` `pets` |
| torch range and brightness, the night ambient floor, how many world lights | `balance.json` `light` |
| materials, recycling yields, recipes and costs | `data/crafting.json` |
| the set pieces themselves | `data/encounters.json` |

---

# Round 4b — the live play-test

Everything below came out of the user playing the round-4 build and reporting what was wrong or
missing. It is listed in the order it was reported, because the order is the story.

## Bugs found in play

| what | why it happened |
|---|---|
| **Every damage number was `NaN`** | Enemies were given a small `derived` bag so modifiers could hang off them, which made `attacker.derived` truthy — and `derived.damage` is undefined on an enemy. `strike()` was written `a ? a.damage : attacker.dmg`, so it rolled `rng.range(undefined, undefined)`. Never write `a ? a.x : fallback` when `a` is a bag that may not carry `x`. There is a table-driven test over the whole bestiary now, and a last-ditch guard in `strike()`. |
| **A new run started at night** | `sky.js` gives every world a *local* time: the sun's angle is `elapsed/dayLength + startFraction + longitude`. `startFraction: 0.34` therefore only meant "morning" at longitude 0; landing two thirds across the map added 0.66 and started you at half past ten at night. `morningElapsed()` winds the clock back by the player's own longitude. |
| **Arrows landed to the right of the crosshair** | The camera sits over the left shoulder, so the crosshair's ray starts ~0.85 m left of the body. Firing from the body along the same direction gives two parallel lines. `aim()` now finds the point the crosshair is actually on and aims the shot *at that point*, so the two converge. |
| **The galaxy's stars drew over the planets** | Three renders the whole opaque list before the whole transparent list; `renderOrder` only sorts *within* a list. A transparent backdrop with depth testing off therefore painted itself over every opaque planet. The galaxy is opaque now and fades by darkening its colour. |
| **The view snapped to straight up or straight down** | Pointer lock occasionally reports an enormous `movementX/Y` — after the lock is taken, when the OS warps the pointer, on some drivers at a screen edge. One such event is bigger than the whole pitch range. Events over 110 px are dropped. |
| **The minimap arrow pointed north while you walked south** | The map draws +z downward and the player's facing is `(sin yaw, cos yaw)`. The rotation that carries a tip-up arrow onto that heading is `π − yaw`, not `−yaw`. |
| **City walls stood parallel instead of joining** | The wall segment was modelled along **X** while being placed with the codebase's **+Z** yaw convention, so every piece came out turned ninety degrees — a row of dominoes. It is modelled along +Z now, and the gates are placed where roads actually meet the ring. |
| **Terrain had kilometre-high spikes** | Not noise: `universe/` hands back a planet's *true* relief (8.5 km on the world this was found on) and the map is 90–160 km across, not 40,000. `reliefScale` matches the vertical scale to the horizontal one, and a median despike pass removes lone needles. Worst neighbour step fell from 6,807 m to ~600 m. |
| **`skills cost 188% less mana`** | `cond_skillMpCostReduce` rolls 1–3 in items.json and was being read as a fraction. It is a flat saving. |
| **`0.1 gold for every champion`** | `cond_goldOnEliteKill` rolls 0.1–0.3 and was a flat gold bonus on elites only. It is a share of all gold now. |
| **"Enemies keep draining my mana"** | Nothing did. `cond_manaShieldOnHit` took a share of every hit out of the player's own mana pool, emptied it, and read as an enemy mechanic. It is a plain damage reduction now. |
| **A live set bonus showed as inactive** | `loot.setInfo()` does not know about `cond_setThresholdReduce`, so the *card* said 2-piece inactive while the bonus was being applied. The card counts the reduction now. |
| **`[object Object]` in the planet card** | `planet.resources` and `rareElements` are objects out of `universe/js/elements.js`, not strings. |
| **Space went first-person** | Atmospheric flight re-parented `space.ship` into the ground scene. A Three object has one parent, so the ship left the space scene entirely. Air flight has its own hull. |
| **The world did not stream while flying** | `rebuildWorldAround()` hard-coded the *character's* position, so a square of detailed ground sat where you took off. It takes a point now, and the flight passes the ship's. |
| **`W` always went up** | The ship was boarded nose-up, and lift was capped at 1 so it never sank. It boards level, lift is capped below 1, and Space/C are direct vertical thrust. |
| **Seams between clipmap rings when flying** | The skirt that hides a ring seam is sized for head height. From two kilometres up you look straight down it. `view.setSkirtScale()` deepens it with altitude. |
| **You could fly into the edge of the world** | The map is an equirectangular projection of a sphere, so longitude now **wraps** and only latitude clamps. |
| **Trees shifted when crossing a chunk** | Each prop cell is a pure function of its coordinates, so nothing moved — but every prop kind has an instance cap and the scan ran row by row from the top-left of the block. Which cells reached the cap changed as you walked. It scans nearest-first now. |
| **Enemies walked through walls** | The enemy field never consulted the obstacle fields. It does, unless the thing is airborne. |
| **Attacked while talking to a shopkeeper** | Nothing spawns inside a settlement's watch, and guards kill what wanders in. |
| **Villages with nobody in them** | `HEADCOUNT[0]` was 0, so the smallest settlements were built, named and empty. Three minimum, with a trader and somebody with work guaranteed. |

## Things added

- **The level-band overlay** on the map, as a `levels` chip beside Regions, with the band written
  under each region's name and in the hover readout — and a **banner on screen** when you cross into
  a new region, which is the one piece of Hack/Mine's presentation worth copying outright.
- **Bands that tile the whole range.** They used to be placed independently, which left holes:
  "1-4, 7-10, 8-11, 16-19" with nothing to fight at 5-6 or 12-15. They are laid out by rank and the
  band is *widened* when there are too few regions to cover thirty levels. `zones.gaps()` returns
  the uncovered levels and a test asserts it is empty.
- **Set-piece encounters** (`js/encounters.js`, 11 of them) on top of a much denser spawn ring,
  because "the map is so expansive but enemies are few and far between".
- **Rich item tooltips** with every property in plain language, set progress, lore, a comparison
  against what you are wearing, and **Shift to compare against the other slot**.
- **Three materials instead of twelve**, a separate **Upgrade** tab, and both benches laid out as a
  list plus a detail panel rather than sixteen recipes at once.
- **Forging lets you pick the base**, and magic find can carry the rarity higher.
- **Ring, mount and light slots.** There was one ring slot (so Shift-to-compare had nothing to
  compare against), the horse was a key rather than a thing you owned, and a torch cost you your
  shield.
- **Elemental wands**: every wand is attuned to an element, fires a real bolt of it, routes through
  magic resistance rather than armour, and leaves that element's status behind. Crafting brands work
  the same way on any weapon.
- **Affix weighting.** Emberveil's generator picks uniformly from 59 affixes, 40 of which are exotic
  conditionals, so a weapon almost never rolled plain damage. Plain properties are ~79% of rolls now
  and damage is the most common thing on a weapon; nothing was removed.
- **A pause menu on Escape** (resume, settings, save, main menu) with the control list in it — the
  controls used to sit permanently across the bottom of the screen on top of the log — and the
  Playground link moved off the HUD onto the title screen.
- **World knobs on the title screen**: region size, planet scale, levels per zone, enemy density.
- **Seamless take-off and landing** (`js/atmos.js`): you fly the ship in the world, in metres, up
  through the air until the ground has faded, and the space scene takes over there with the sky
  already black. Terrain collision is a bounce, never damage.
- **Moons** exist in space, are landable, and are much smaller and lighter underfoot.
- **Reticles and an information card** on whatever the crosshair is on in space — including stars
  and gas giants, which say why you cannot land on them.
- **Minimap zoom** on `+`/`-`, shop and quest pips on it, and **badges over the heads** of anyone
  worth talking to.
- **World map zoom** on the wheel, in five steps, with crosshairs through the player when the whole
  planet is on screen.
- **You start in a town.** The spawn used to merely *prefer* one, which on most seeds put you a
  couple of kilometres from anything.
- **The player's damage climbs with level**, and enemy health and damage are separate curves — they
  used to share one, so a five-level gap doubled an enemy's damage as well as its health and the
  fight stopped being winnable.
- **Accuracy and attack speed do something.** `hit` cancels the target's dodge; `initiative` is
  attack speed and the controller's swing clock reads it. Both were carried and ignored.
- **Every number is rounded** where it is computed as well as where it is printed — the health bar
  read `513.4100000000000000001`.
