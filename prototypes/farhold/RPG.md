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

---

# Round 5 — the six that were flagged

Six things from the round-4 play-test were called out as **not built** rather than quietly dropped.
This is what each of them turned into.

## 1. The star chart, and travel between stars — `js/starchart.js`, `js/warp.js`

*"Pressing M for map while outside of a planet should instead open a galaxy map… start zoomed in all
the way at the solar system level… zoom out several levels to view adjacent stars, or the entire
galaxy… make it so you can travel to 'adjacent-ish' stars… enter 'warp drive' mode with star-trail
effects for about 5 seconds until you appear in the new system."*

**`M` now branches.** On the ground it is the world map it always was. In the air, in space or mid-jump
it is the chart, and it opens on the system view every time.

**Four steps**, `CHART_LEVELS`:

| step | what it draws |
|---|---|
| `system` | the star, the habitable band, every world on its real orbit at its real angle (taken from the live space scene when there is one), moons as a ring of specks, and your ship |
| `neighbourhood` | the current star, every lane out of it, and a dashed ring showing exactly how far the drive reaches |
| `sector` | a slice of the arm — a few dozen stars |
| `galaxy` | all 180, with the arms visible |

The wheel steps between them; on the system view it zooms instead. Every view is centred on you and
every view draws *you are here*, which is asserted by a test rather than eyeballed.

**A star on the chart IS a system.** Star Forge gives every star its own seed, and a seed is all
`createSystem` needs — so jumping to a star means building that seed's system. The one join is where
you start: the habitable search picked a seed, not a place in a galaxy, so `galaxy.stars[0]` is
rewritten to be the run's own system (same seed, name and class) and the rest of the disc is left
exactly as the generator made it.

**Reach.** `JUMP_RANGE` is 0.18 map units, which `LY_PER_UNIT` (4000) quotes as ~720 light years.
`reachFrom()` answers with a reason either way, and a test walks all 180 stars to check that fewer
than 6% of them are dead ends you could never leave. A fuel system has a distance to charge against
whenever it wants one.

**The jump** (`js/warp.js`) is one buffer of line segments in a tube parented to the camera, each
stretched along the flight axis by an intensity that ramps in hard, holds, and eases out — so the
snap into the tunnel and the settle at the far end come from one number. Five seconds, then the old
system is disposed and the target's is built and entered. Only the *system* is built: a surface map
is 256×128 cells of erosion and rivers and there is no reason to pay for it until somebody decides
to land.

**Different systems look different.** The space backdrop was already seeded by the system, but the
nebulae were the same four colours everywhere. The palette now comes off the star's class — a blue
giant gets cold clouds, a red dwarf rust and ember, a black hole almost nothing.

## 2. Quests, landmarks and pins — `js/markers.js`

*"These type of quests/landmarks/pins should be displayed on the map and minimap. If it's too far to
display on the minimap, an arrow indicating its direction should show instead. You should be able to
track or untrack… It should also work on a planet scale."*

There used to be two unrelated things: a bare `pins` array owned by the map screen, and quest
destinations copied into it once on accept and then forgotten. Nothing knew which world a pin was
on, so flying somewhere else scattered the last planet's pins over the new one's map.

One `MarkerBook` now owns all of it. Every marker carries `{ systemSeed, planetId }`, so:

- `here()` is what this world shows, `elsewhere()` groups the rest by world, `inSystem()` is what
  space mode rings, `systems()` is what the galaxy chart rings.
- `syncQuests(active)` mirrors the quest log both ways — a job taken puts its marker down, a job
  turned in takes it away, and running it twice does not duplicate anything.
- `tracked()` is what the minimap draws. Untracked markers stay on the world map; they just stop
  following you.
- `bearing()` takes the **short way round the seam**, because the map is a sphere unrolled and a
  marker at the far left may be a short walk west.

On the minimap a marker in range is its glyph; out of range it is an arrow parked on the rim at the
true bearing with the distance beside it, nearest-first so two arrows on top of each other do not
print two labels over each other. On the world map a tracked marker wears a dashed ring, and the
side panel is a **Tracking** list with a star per row. In space, a world holding markers wears their
glyphs above its bracket and lists them on its card.

## 3. Coming down out of orbit — `js/space.js`, `js/terrain.js`

*"Getting close to a planet should cause you to slow down and cause the planet to get more detailed…
eventually entering the atmosphere. At this point you should see many chunks away but at lower
resolution. As you get lower altitude the planet should get more detailed and eventually props
should appear."*

Four pieces, all in body radii above the surface (`balance.json` `space`):

- **The throttle is governed by how close you are** — full cruise past `slowFrom` (26 radii), easing
  to `slowTo` (25%) at the deck, so a world stops going from speck to wall in one frame.
- **Warp locks out** inside `noWarpWithin`, which is what stops you folding into a planet.
- **The body you are closing on is rebuilt at a finer sphere and a bigger texture** in two steps
  (`far` → `near` at 14 radii → `close` at 3.5), one rebuild every 0.35 s at most, and everything
  else drops back to cheap. Coming home, the real surface map is drawn at double size.
- **`atmosphereEntry()` fires below `entryAltitude`** (0.5 radii) over a landable world, and the
  descent picks up from there. You fly into an atmosphere; you no longer press a key at it.

Inside the air, `view.setViewScale(k)` **stretches every clipmap ring for the same triangle count**.
A ring is a fixed grid over a fixed patch, so multiplying its extent, cell, hole and skirt by one
number covers more world at a coarser step — and the ring-local shape is unchanged, so the index
buffer is still valid and nothing is reallocated. At the ceiling the view reaches ten kilometres for
the 13,552 triangles it always drew; on the way down it tightens back to 1× and the grass returns.

## 4. The habitable start — `js/planet.js`

*"Can we make it so the starting planet is always a multi-biome system, and always starts in a town
with a few NPCs? Maybe there can be a setting when creating a new world for 'Habitable start' that
defaults to on."*

`isHabitableStart()` wants a world somebody lives on whose archetype is not locked to a single
biome. About a quarter of seeds do not have one in their own system, so `createWorld({ habitable })`
walks `seed + 1`, `seed + 2`… up to 24 until it finds one, and reports `systemSeed` and `movedSeed`
so the log can say it moved. The checkbox is on the title screen, on by default; `?habitable=0` is
the other way. Seed 1 goes from `Kitraexeath` (void-touched, no towns, 2 biomes) to `Hes-Subud IV`
(tundra, 61 towns, 3 biomes).

## 5. The creature brainstorm — `BESTIARY-IDEAS.md`

About forty new creatures written out properly: fifteen pieces of **neutral wildlife** (the game had
none — everything charged you, which makes a planet a shooting gallery), eight kinds of **people who
are not in a town**, and hostiles filling the four thin biome families (`ice`, `crystal`, `void`,
`toxic`). Each one is described the way Dwarf Fortress describes things — what it is covered in, how
it moves, what it does when it sees you — and tagged **variation / variation+ / bespoke / chibi** so
the cost of building it is on the page.

## 6. Water that meets its bank — `js/water-plan.js`, `js/planet.js`

*"The water layer should touch the edge of the ground, you should not be able to peek under the
water."*

The river sheet was exactly as wide as the water, and `js/planet.js` carved the channel to full depth
across that same width — so the sheet's edge hung a couple of metres above a bed that only started
climbing further out, and from the side you could see straight under the river.

`waterRibbon()` pushes the sheet **outward, per point and per side**, until the carved ground has
come back up to the water line; the bank then hides the extra, which is how a real shoreline works.
Where the bank never gets that high — a river running out onto a flat delta — a short **skirt** hangs
off the edge past the ground, so there is nothing to see under even there. Both are asserted at every
vertex of the first eight rivers on a real world.

And **lakes now have water in them.** They had a carved basin and no surface at all: a dry hole with
a blue dot on the map. A flood fill over `water === 2` gives one entry per lake with one surface
height, `lakeSheet()` lays a sheet of it, and the carve digs from that flat level rather than from
each cell's own elevation — which used to leave half a lake standing above its own water line.

> A trap found on the way: filling the lake level **outward** a ring, to grade the rim, dug a 240 m
> trench right round every lake. A lake in a bowl sits well below the ground around it, so handing
> the rim the lake's level tells the carve to cut the bank down to it. The blurred `lakeField` was
> already fading the depth out at the rim; that is all the grading it needed.

---

# Rounds 6–9 — the second play-test list

Forty-six items, in four rounds. The full list and its state is in
`~/claude/agent/farhold-feedback2-checklist.md`.

## Round 6 — items, affixes and loot

**The seven reported affix bugs were one bug.** `0.1% critical chance on the first hit`,
`0% Critical chance`, `skills come back 0% sooner`, `0.1% experience`, `0.1% better loot`,
`0.1% critical damage` and `1993% damage to the undead` all came from the same place: **the data and
the reader disagree about what the number means.**

Emberveil's `items.json` is not consistent with itself — some percentages are stored as a fraction
(`critChance: 0.02–0.1` meaning 2–10%), some as a plain percentage (`dmg_vs_undead: 8–20`). And
Farhold's two consumers are each internally consistent and picked opposite sides: the plain stats in
`STAT_FIELDS` are read as **percentage points** (`rng() * 100 < critChance`), and the `cond_*`
effects are read as **fractions** (`1 + v`). Hand the first one 0.02 and it prints "0%" and does
nothing; hand the second one 19.93 and it prints "+1993%".

`js/affixes.js` states, per stat, which unit its own consumer reads, restates the whole table once
at load, and then applies the balance pass on top: floors under everything, caps on the
multiplicative ones, and slot rules. 10,787 sampled rolls, zero unreadable values.

| | |
|---|---|
| `ENGINE_UNIT` | `pct` / `frac` / `flat` / `flag`, per stat. **The authority.** |
| `AFFIX_TUNING` | the level-1 range for every affix, in engine units, with its minimum item level |
| `AFFIX_CAP` | a ceiling applied to a roll **and again after crafting** |
| `SLOT_RULES` | experience on a helm only; the odd conditionals on jewellery and their one home |
| `AFFIX_TIERS` | crude → mythic, chosen by the item's level |

**Item levels.** Every drop carries an `ilvl`, a wearer requirement and affixes rolled inside its
tier. An affix has a minimum item level — damage from 1, crit from 3, the "first hit against a
target" conditionals from 8 — so early gear is simpler without being weak. `of Early Promise` lowers
the requirement, **on its own item while it is still in the bag** and on everything else once worn,
and the card turns that line a different colour.

Multiplicative conditionals grow at 1.7× rather than 3× across the tiers, because a share of
everything compounds with every other share you are wearing. Without that, the top tier reached
"critical hits ignore 90% of armour".

**Three things found while in there.** `Effects.update()` ticked its timers and nothing ever rebuilt
the derived sheet, so the move-speed proc never reached the legs — and `cond_sustainedDmgBonus`,
`cond_killInitBonus`, `cond_afterSkillSpellPow` and cheat death's cooldown were dead the same way.
Poison paid out `perSecond * dt` sixty times a second, which is the same total and reads as "1
damage"; DoTs land in whole one-second ticks now. And the 23 road-weapon properties had **no
description at all**, which is how a bow came to say "Starwake: 2".

**Loot beacons.** Every chest and bag stands under a shaft of light coloured by the rarity it is
*guaranteed* to hold, with the beam count climbing — one for common, four plus motes for legendary.
The same `floor` drives the beam and the roll, so it cannot lie.

**`js/gear.js`** draws the line between loot and unlockables. Mounts, lights and quivers are loot:
they roll rarities, carry slot-exclusive affixes, upgrade and price like anything else. Boats and
ships are not: bought once, owned for the run, chosen from a dropdown, never in a drop table.

## Round 7 — combat and the perk forest

**A weapon is a pattern, not a number** (`js/weapons.js`). Each base maps to a sequence of strike
shapes, each with its own reach, arc, damage share and timing; you walk the sequence and it resets
when you stop. A longsword is slash-slash-overhead at 3.0 m; a rapier is thrust-thrust at 3.3 m; a
dagger is jab-jab-slash at 1.9 m and twice the speed; a halberd is thrust-sweep-overhead at 4.6 m.
The pattern is drawn on the card as glyphs and said in words.

That one idea covers all four asks: dual wielding is two patterns on two clocks, a two-hander is a
pattern with a wider arc, a staff is a pattern whose strikes are spells, and `areaPct` scales every
strike's reach, arc and splash — and the drawn arc — together.

**The perk forest** (`js/perks.js`) replaced attribute point-buy, the passive ladder and the talent
picks: three screens that each spent a different currency and none of which was a decision. 89
generated nodes — a hub, four arms, oddballs between them, a keystone at the end of each. A node is
reachable when something touching it is taken, which makes **the shape of the tree the cost**: a
keystone is a dozen points of walking, and those points are stats you may not have wanted.

**A tree per skill** (`js/skilltalents.js`): three tiers, one pick each. Tier 1 is how it is thrown,
tier 2 what happens when it lands, tier 3 what it does to the fight. Nothing is a stat — every node
changes the plan that gets cast — and each names a visual change, so a fully-talented spell is
visibly not the one you started with.

## Round 8 — the world

Twelve bespoke buildings and a real town **plan**: a square, streets radiating from it with a bend,
plots either side, buildings facing their street. What a settlement wants is ordered so the trades
come first — whatever runs out of plots is what a hamlet does without.

The quiet ring round a town is measured from its own footprint (it used to be a flat 57 m, inside a
city's 95 m wall), and anything that chases you in **gives up at the line and walks out** — the half
that was missing, since the old rule only stopped things spawning inside.

Four water fixes: lakes are drained out of settlement footprints before the carve; roads sit above
water **and** on the ground (pinned within 3.5 m outside a real crossing, which took floating spans
from 37/23/48 points on three seeds to 2/1/1); a **sea lane is not drawn as a road at all**; and
`plantable()` is the stricter question props ask, because `underwater()` asks about a point and a
lake's sheet is a whole cell wide.

Level 50, with a curve in three sections — 30→40 costs 1.00× the whole first thirty, 40→50 costs
1.90×. Planets are banded low/medium/high and a world's regions are laid **inside** its band, so the
softest corner of a far-reach world is level 30. Every system carries all three bands.

Meteors fall for thirty seconds on a real arc, marked on the map with a countdown, and leave a chest
that is never worse than rare.

## Round 9 — space, the map and the chart

Seed 777's neutron star was drawn at 1540 units with two planets orbiting *inside* it at 491 and
862. The floor on the drawn radius is right — a neutron star is twenty kilometres across — but it is
now also capped at 42% of the closest orbit. Checked across sixty seeds.

**Flying again.** The throttle took nearly a second to reach full and the wing could only carry 92%
of the ship's weight, so holding W got you a slow sink with some drift. It eases to full in a third
of a second and the wing reaches just over 1 at speed, so level flight holds its line and the nose
is what changes altitude — 6.5 km in ten seconds on W alone. A soft floor keeps you off a rise you
are passing over. Props reach further as you climb rather than switching off.

The warp lockout was nine body radii — nearly half an AU. Three now. Leaving a planet points the
ship away from it, and the system streaks past while the drive runs.

Six skies (`js/sky-looks.js`) instead of one, picked by the star's seed and recoloured within the
look. The map drags to pan, zooms out to the whole planet, and past 4.2× draws World Forge's own
region detail — thirty-six times the cells over the patch you are looking at — rather than a bigger
blur. The chart lets you click a world for what it knows, and a **Survey** panel lists what orbits
any star you select.

## Round 10 — where you start, the tree, the sheet, and the ground between the towns

Seven things came back from a play-test, and they turned into three pieces of work: the seven bugs,
a full-screen interface, and an expansion that gives a zone people in it.

### 1. A level-1 character in a level 30-33 zone

`bandForPlanet` decided a world's difficulty partly from `seed % 3`, so one seed in three promoted a
perfectly friendly breathable world to the far reach for no reason a player could see — and the list
of "nasty" archetypes it checked contained `volcanic` and `irradiated`, which are not archetype keys,
so the genuinely hostile lava and toxic worlds never got their bump. The intent was inverted in
practice. Over 120 seeds the starting planet came out low 63, medium 41, high 16: **47% of new
characters started on a world whose softest corner was level 30.**

The band now comes only from things you can read off the survey panel before you fly there — the
archetype's own `difficulty`, breathable air, the star's water zone, how far out it orbits — and
`balanceBands` claims the **low band first**, for whichever world `chooseLanding` would hand a
newcomer, handing the rest out around it. New game, load and the star-chart survey all use the same
picker, so all three agree. 120/120 seeds now start low.

"Every system has at least one planet for every level range" is guaranteed by keeping the star and
re-rolling its worlds until there is a landable body for each band, with **moons counted** — a moon
is a small planet here, with its own id, seed and surface map, and the game already lets you land on
one. "At least one habitable planet in the starting system" is guaranteed by running the seed search
whether or not the box is ticked.

And that made the box a no-op, because the default landing score already prefers settled breathable
worlds. So **Habitable start off now means something**: you come down on the harshest rock in the
system, no towns and no trade, with the blue world one short flight away.

### 2 and 3. The perk tree

**Clicking selected whatever was about 100px below the cursor.** Two faults, both in `js/hud.js`.
`drawForest` sized the canvas's backing buffer from `wrap.clientWidth` — the *parent*, which also
holds the 270px side panel and the gap — so the buffer was 832 CSS px wide while the canvas's real
box was 558. Then `perkUnder` worked out one device-pixel ratio from the width and applied it to the
height as well: x was right and **y was inflated by about 1.49x**, which at the middle of the canvas
is 111 px of error, growing with distance from the centre. (It also drew the forest squashed to 67%
horizontally, which is part of why the layout read as scattered.)

Both are gone. `perkView()` measures the canvas's own box, builds one projector with a real inverse,
and `drawForest` and `perkUnder` both go through it — the forward transform used to be hand-inlined
in six places. A third fault turned up while fixing it: a canvas is a replaced element, so
`position: absolute; inset: 4px; width: auto` takes its *intrinsic* width and ignores `right`, which
left the canvas at whatever the last buffer was and made each redraw measure that and grow it again.

Checked at 1920x1080, 1366x768 and 1280x720, fitted and at 2.4x zoom with a pan on: **every one of
the 89 nodes hit-tests to itself, 0 wrong.**

**The layout is a lattice, not a scatter.** Every node was at `ring.radius + wobble * 0.22` and
`arm.angle + wobble * 0.18`. There is no jitter at all now: rings at whole units, and a ring's nodes
on exactly even angular steps centred on their arm — the step is the smaller of a constant tangential
gap (so ring 6 does not fan into a wall of dots) and the arm's own quarter of the circle (so ring 1,
where the first rule wants 49° between three nodes, cannot spill into the arm next door). The
oddballs went two to a diagonal: `i / 8 * 2π + π/4` put **four of the eight exactly on an arm
centreline** at radius 3.5, on top of ring-3 and ring-4 nodes — the opposite of the "sitting between
the arms" the comment claimed. Closest pair in the forest is now 0.52 units.

Scroll to zoom (keeping what is under the pointer under the pointer), drag to pan, double-click or
**Fit to view** to reset, and node names appear once you are zoomed in far enough to read them.

### 4. The sheet is a full screen

See `research/ui-round10-design.md` for the spec this was built from. The short version: `#sheet` is
`position: fixed; inset: 0` on a grid of a persistent header and a tab rail, every track is
`minmax(0, 1fr)`, `#sheet` is `overflow: hidden`, and the only thing that scrolls anywhere in the
interface is a `.pane-body` — whose scroll position `renderSheet` now restores, so recycling the
fortieth item in the bag does not throw you back to the first.

The header carries the materials, which used to be on the Crafting and Upgrade screens only — the two
screens where you already know, and neither of the screens you recycle from. The rail carries a badge
for anything unspent, which was invisible unless you happened to open the screen it belonged to.

Per screen: a paper-doll equip figure (placed entirely by `[data-tip-slot]`, so `slotGrid` did not
change); grouped stats, four-column at 1500px+; inventory filter and sort chips, a rarity-coloured
grid view, and a **standing compare panel** that holds the last thing you pointed at rather than a
tooltip that covered the row under it and blanked when you moved; the in-game skill bar as a strip
you click to pick a skill, with three dots a key for its talents; the talent tree as three visible
tier columns with what each tier is *for* written on it; the perk canvas at full size (2.4x the
spread at 1920); crafting in three columns with the Forge button no longer below the fold at 768px;
`#up-pick` freed from a 190px window that held thirty-odd rows five at a time, and the bench showing
the item's full card so you can read the affix list while choosing which one to reweave; and the
journal as nine panes with the bestiary no longer truncated to twelve.

**Three bugs the design pass found, all real.** The Perks screen was titled "Character" (`setTab`'s
title map had no `perks` key). **Every skill in the game was offered the *bolt* talent tree**, because
`js/skills.js` `state()` built its object from an explicit field list that did not include `shape`,
so `chosen.shape || 'bolt'` always fell through — a ground rune was offered "Fanned". And the XP bar
was wrong above level 30, because `hud.js` kept a private copy of only the pre-30 curve. Plus: `Tab`
closed the sheet instead of moving focus once it was open, so keyboard navigation was impossible.

### 5. W and S fly the ship forward again

`clampToWorld`'s longitude wrap, `((x % w) + w) % w`, is **not an identity for an x already in
range** — `x + widthM` loses a low bit and the value comes back about 1e-11 out. 68% of in-range
values failed a `wrap(x) === x` check. `js/atmos.js` compared its position against that result to
decide whether it had hit the edge of the map and scaled horizontal velocity by −0.4 when it
differed, so the brake fired **about forty-five times a second, in the middle of the map**. Holding W
for twenty seconds moved you 80 m at 7 m/s. It only flew correctly along an exact compass axis, where
x never changed and stayed an exact float — which is why it seemed intermittent.

Measured after: 15.3 km in twenty seconds at 890 m/s, at every heading.

There is no edge to hit either. East and west are the same line and the top and bottom of the map are
the poles, so `terrain.wrapAround` carries the ship over a pole — down the other side, half a world
round in longitude, turned about. Four pole crossings in 400 seconds of straight flight.

### 6. Planet size

**Tiny** (33 × 16 km) and **Super tiny** (16 × 8 km) join the list, the floor on `setMetresPerCell`
drops from 40 m to 16 m, and the default is **Small** rather than Full — the complaint was that the
planet is enormous, and the honest answer to that is to stop starting people on the biggest one.

The knob now reaches everything. `js/sites.js` and `js/dungeon.js` were both reading a hard-coded
640 m a cell out of `balance.json` and placing camps and dungeon doors at `cell * 640`, so at any
other scale they landed outside the world — up to 2.9× outside at the old Tiny. The terrain view's
ring extents follow the scale (at the square root of it, so a small world still draws a horizon
rather than a dinner plate), and so do the flight ceiling, top speed and thrust — a 9 km ceiling on a
16 km world is most of the way to space.

"Region size" is relabelled **Zones per world**, because that is what it does: it cuts the same
ground into more level bands, it does not shorten a walk in metres.

### 7. Saved in a town, loaded into the Shallows

`snapshot()` destructures a fixed argument list, and `world`, `quests` and `campaign` had never been
added to it. `main.js` passed all three on every save and **none of them were written.** Three bugs
came out of that one omission.

`world` holds the title screen's knobs, `planetScale` among them. Without it a load fell back to
re-reading the boot form — and the player's position is stored in **metres**, so a run played at
Small reloaded at Full put the saved numbers on a world 1.8× wider. Reproduced exactly: played at
0.75 in Herdalkeep, reloaded at 1.0 into `Shallows`, 38 m of water. `teleport` wraps east-west and
clamps north-south, so an out-of-range position lands somewhere plausible-looking instead of
throwing, which is why it failed silently into the sea.

The other two: **every load silently emptied the quest log**, and forgot the campaign.

On top of that the restored spot is now checked — in range, and not under water — and falls back to
the run's own spawn point if it is not; a save taken underground carries the surface spot you dropped
in from, because a dungeon's terrain is a *local* space a few hundred metres across and restoring
those numbers on to a 163 km planet put you at the map corner; and `playtime` is read back, having
been written on every save since round 3 and never read.

### The Territory

`EXPANSION.md` is the plan; `tests/expansion.test.js` is the proof. Twelve factions whose standing
moves for things you actually did, and a deed for one is a third of a deed against everyone they are
at odds with — so there is no state where everybody likes you. A territory record per zone: who holds
it, how firmly, its real camps, its open trouble, generated from `(worldSeed, zoneId)` so a zone you
have never entered already has a holder, with only the deltas saved. Patrols on real road nodes,
caravans you can trade with, escort, rob or find the wreck of, fourteen kinds of person on the road,
twelve things that can happen to a zone, and rumours — the only thing in the game allowed to talk
about somewhere you are not, and it is a sentence, never a pin.

And a job generator with twenty-two frames that will only offer a frame when **every one of its slots
binds to something that exists right now**: a camp still standing, a caravan really late, a named
enemy that really did beat you. Nothing is invented, so nothing can send you to an empty field, and
the pin is in the zone you are standing in.
