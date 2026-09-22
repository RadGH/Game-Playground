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

### The review, in five batches

`research/review-round10.md` is a play-and-inspect pass over the whole game — title screen, landing,
first five minutes, combat, all seven sheet screens, the map, the star chart, a town, a shop, a
dungeon, space, night — 45 findings, 2 blocker and 14 high. Its headline was that the *screens* were
in good shape and the **connective tissue** was missing: the game never told you what to do, never
explained the systems it had just built, and a large part of the Territory expansion was loaded at
boot and thrown away.

All 45 are implemented. The worth-knowing ones:

**The first five minutes.** The level-up message promised "3 points to spend (press I)" and
`pendingAttr` was never incremented anywhere — the perk forest replaced attribute point-buy in round
7 and the message was never changed, so the game's own tutorial line sent you to four dead buttons.
There is a tracked objective strip on the HUD now, the title screen says what the game is instead of
"Round 4", and a class preview panel fills in as you scroll the thirty-entry dropdown: the four
skills with their one-line descriptions, the starting weapon, the companion if there is one.

**Two content files were parsed at boot and discarded.** `data/landmarks.json` (14) and
`data/faction-rewards.json` (12 × 2 ranks) were read into `landmarkData` and `rewardData`, which had
no other references. Landmarks are placed on real map nodes and usable; rank rewards are shown on the
Journal and two are wired.

**Three promised standing effects had no call sites.** Prices, hostility and patrol reaction were all
in `EXPANSION.md` and none of them existed. Prices are wired; the band ladder and the deeds table are
on the Journal; the full faction name is used the first time each one is mentioned.

**The map named everywhere before you had been anywhere.** All 59 regions, every settlement, every
node, from the first second — which made the rumour system redundant with a screen you already had. A
region's name is now something you learn, by crossing into it or hearing about it. The danger wash,
the level band, the towns and the roads are all still drawn, so route planning is unchanged.

**Every key can move.** Fourteen actions, click a row and press a key, over a capture-phase listener
that sits in front of every other key listener in the game — there was no binding table to build
over, so the panel translates the event instead. Rebinding two actions to the same key swaps them.
The pause menu's control list is built from the real bindings, because a hard-coded "M map" is a lie
the moment somebody rebinds it.

**Two measurement bugs on the star chart.** `fit()` measured the wrapper, which has 10px of padding,
so the canvas ran off the bottom of the screen; and every size in the system view was in raw canvas
pixels on a buffer that is 2× the box on a retina screen, which is why five worlds drew as 3px
specks. Orbits fill the height now, the world you are on says "you are here", and moons are indented
under their parent with breathable / band / levels on every row.

**The torch was a spotlight.** A Three.js point light with `distance` set multiplies its falloff by
`(1 - (d/distance)^4)^2`, which holds nearly full brightness most of the way out and then dumps the
rest over the last fifth — on flat ground that last fifth is a crisp yellow ring. The cutoff is
pushed out 2.2× and the decay does the fading, so by the time the hard edge arrives the light is a
fortieth of what it was. Plus a 6 Hz two-sine flicker at an untidy ratio, so it never settles into a
pulse you can count.

**The hooded mage was a dome with a person somewhere under it.** Two causes, both in the shared
`avatar-3d/js/chibi2.js`: the cowl's radii stood it wider than the character's own shoulders, and the
back of it — the only part a third-person camera ever sees — was one unbroken sheet of one colour.
Trimmed to just over the head, the rows behind the ears shaded, a piped seam up the crown.

**Rumours were signed "somebody in The Bleak Moor"**, which is exactly the flavour a rumour system
exists to avoid. A rumour is a person saying a thing; it is signed by a real one out of
`folk.roster()` now — "Vera Thorne, the merchant in Hollowcrown".

### Mounts, lights, boats and ships

> "Where shops sell boats and ship, they should also sell torches and mounts. 3 of each should be
> implemented. Boats should automatically equip when you start swimming and increase water travel
> movement speed."

Three of each already existed in `js/gear.js` — three mounts, three lights, three boats, three ships —
and most of it was unreachable.

**The shop stocked one of each and rolled for the rest.** `stockFor` guaranteed the cheapest mount and
the cheapest light and then picked ONE of the remaining better ones at random, so the Dray Elk and the
Wisp Lamp could go unseen for hours of walking between towns. Every shelf carries all three of each
now; the rarity still rolls on the two dearer ones, so a shelf is worth a second look.

**They were also invisible.** Mounts and lights file under the Other tab, behind Weapons, mixed in
with rings and quivers. The Other tab is sorted into racks with headings — Mounts, Lights, Quivers,
Trinkets — each with a line saying what the thing is for, the same treatment the boats and ships fold
already had. And a shop row carries its own one-line spec, because a shelf you have to hover item by
item is a shelf you cannot scan: slot, damage or armour, speed, how far a light reaches, the level it
needs, and one word on whether it beats what you are wearing (from `itemScore`, the same number the
inventory sorts by, so the row and the hover card can never disagree).

**A Wisp Lamp was on the shelf for 30 gold.** The shared `Loot.price()`
(`prototypes/emberveil/js/loot.js`) prices everything off one global `basePrice` in the data,
multiplied by quality and rarity. That is right when every item comes off the same weapon-and-armour
table, and it threw away every price `gear.js` sets — so the Pitch Torch (20) and the Wisp Lamp (620)
cost the same, and the whole "buy a better light" ladder was free. Farhold's `rpg.price()` honours an
item's own `basePrice` on the same quality/rarity curve; Emberveil's `loot.js` is shared and has its
own tests, so it is untouched, and anything without a `basePrice` falls through exactly as before.

**The boat was wired to nothing at all.** `js/player.js` never read the vehicle data and swimming was
a flat 2.7 m/s whatever you owned. The controller takes a `boat` accessor, boards you on entering deep
water — there is no key and no slot, because a boat is an unlockable, not loot — and takes its speed
from the hull: raft 3.4, skiff 5.6, cutter 8.2, against a 5.4 walk and an 11.3 sprint. So the cheapest
boat already beats swimming, the best one beats walking, and none of them beats running on dry land,
which keeps water a choice rather than a shortcut. `js/boat.js` draws the three hulls so a faster
crossing looks like a boat.

The trap, and the reason the page test was worth writing: the boat was put away by watching for the
**transition** out of swimming, and the transition is not the only way to stop swimming. `teleport()`,
loading a save and stepping into a dungeon all skip it, and `wasSwimming` was already false by the
next update — so the raft stayed equipped on dry land for the rest of the run. It reads the state now.

## Rounds 11 and 12 — the world got denser, and then it got a base in it

Two play-test rounds and the building expansion, run together. The full request list is in
`~/claude/agent/farhold-MASTER-outstanding.md`; what follows is what was actually wrong, because in
almost every case the feature already existed and was not connected to anything.

### The theme: finished modules that nothing called

This round's bugs were nearly all the same shape. Somebody (often me, in an earlier round) wrote a
complete, tested, pure module — and then no line of `main.js` ever imported it, or imported it and
never called the one function that feeds it. From the player's side that is indistinguishable from a
feature that does not exist, and it is much harder to spot than a crash.

The count, by the end: **seven joins that had never been made.**

| What looked finished | What was actually missing |
|---|---|
| Build mode | nothing called `build.confirm()` — clicking drew a sword |
| The build ghost | aimed at `control.x, control.z`, the player's own feet |
| The power grid and storage pools | nothing called `grid.add` or `stores.add` |
| The save | `stores` and `grid` were not in it — reloaded crates were empty |
| Ore in the ground | `createNodeField({ data, seed, terrain })` takes none of those |
| The refining layer | nothing called `works.place`; 16 machines, 61 recipes, empty list |
| Raids | `js/raid.js` was imported by nothing at all |
| The colony | `colony.setBase()` was never called: appeal 0, tax 0, prosperity 1.00 |
| Ground vehicles | neither `js/vehicles.js` nor `ground-vehicles.js` was imported |
| The ship's tanks | `canLaunch` refuses, `spendFlightFuel` spends, nothing ever added any |

All of it is written up in detail in **`BUILD-MODE.md` §§0, 12–18**, which is now the document for
the whole building side of the game.

### The ones that were genuine bugs

**A road with a gap in it** (seed 14343310, Baus-Beinen II, x 9720, z 16259). One stray `wet: true`
flag on a point of dry land, which split the ribbon in half. The wet test now asks the terrain as
well as the flag, so a single wrong flag between two dry neighbours cannot cut a road any more.

**Houses sitting in the middle of the road.** The town planner's `buildable` predicate never asked
`terrain.roadAt()`. It checked water, rivers and slope — so a plot could not be in a lake, but could
be squarely across the highway. My earlier claim that this was "structurally impossible" was true
only of the town's *own* streets, which the planner cuts itself; the world road network is a
different thing entirely and the planner had never heard of it.

**"E to read the notice board" followed you around the whole town.** Mine. I had hung it on
`features.settlementAt()`, which is the entire settlement, so it also sat on top of every other
thing you might have pressed E on. It is a real object at a real spot now, with five metres of reach.

**The perk tree's phantom lines.** '+8% experience', 'companions deal 18% more damage' and '18%
critical damage' all sit at radius 3, and `drawForest` painted a faint guide *ring* at every radius
in almost exactly the colour of an untaken link — so the ring-3 circle threaded through exactly
those three nodes and looked like edges between them. The forest data was right the whole time.

**Square snowflakes in the desert.** A `PointsMaterial` with no map IS a square, and the snow
arithmetic never asked what biome it was falling on.

**The map took 3.28 seconds to open.** Two wrong guesses first (the rasteriser, then the border
loop). The real cause was `getImageData(ox, oy, world.width * scale, world.height * scale)` — a
13,670² buffer, about 747 MB. Clamped to the canvas: 35 ms, and flat at every zoom.

**Climbing to space took 75 seconds.** My regression from the upper-atmosphere work: the rate
control was acting as a *speed limit*, dragging 510 m/s at 4 km down to 260. `Math.max(velocity.y,
wanted)` instead, ceiling 46,000 → 20,000: 19.3 s, and accelerating the whole way.

**And W became up.** Twice. The rule is written into a test now: it fails if the climb rate control
ever reads `forward` again. W is forward. S is backward. Always.

### The new modules this round

| File | What it is |
|---|---|
| `js/build-ui.js` | The panel `B` puts up: first steps, tools, catalogue, live prices, why the ghost is red |
| `js/homes.js` | Every base you ever raised, and the route home from another star system |
| `js/mining.js` | Drills on seams, and the route whose length decides the transfer rate |
| `js/ore-view.js` | The seams, drawn — one InstancedMesh per kind |
| `js/defence.js` | The raid you ring for, and the turrets that answer it |
| `js/questhelp.js` | What to do now that you are standing on the marker |
| `js/terraform.js` | Terrain edits as brushes, not a heightfield |
| `js/buildplan.js` | The build ledger: snapping, validity, claims, costs, blueprints |
| `js/stores.js` `js/power.js` `js/refine.js` | Storage pools, the grid, and the benches |
| `js/colony.js` `js/farm.js` `js/work.js` | The people, their fields, and ten units of work |
| `js/portal.js` `js/waypoints.js` `js/shipyard.js` | The town portal, the network, and the sky |

### The eye check that found a real bug

`3.2` on the list was "check the other eleven megaflora by eye" — the kind of task that usually ends
in a shrug. Rendering all twelve side by side against a 9 m conifer for scale turned up something
much worse than a badly-shaped tree.

**`mergeParts` was transforming shared geometry.** `p.geometry.toNonIndexed()` returns **the same
object** when a geometry is already non-indexed — Three.js says so in the console, and
*"BufferGeometry is already non-indexed"* has been scrolling past in every test run for weeks. The
base geometries (`BOX`, `CYL`, `ICO`, `OCT`, `CONE`, `SPH`) are module-level consts shared by every
part that uses them, so `applyMatrix4` was mutating the shared one and each reuse compounded the
last: the second slab of a tor built on the first slab's transform, the third on that.

Four giants reuse one base several times, and all four were coming out at coordinates in the
thousands — a 65 m tor, a 167 m stone arch, a crystal spire 20 km across. That is a very large part
of *"it's full of other giant shapes everywhere. They don't look like trees."*

`js/features.js` had the identical line, so **every building in every town** was built the same way.
`js/chests.js`, `js/sites.js` and `js/dungeon.js` all clone first, which is why nobody noticed.

The other two were ordinary shape problems: the Shelf Palm was *still* a 16 m bare post with a 4 m
tuft on it (trunk down to 14, crown up, eleven fronds in two ranks), and the Rib Arch was six
straight poles in a triangle, which reads as scaffolding — each rib is an elliptical arc now, with
the tangent worked out properly rather than borrowed from the circular case.

`tests/megaflora.spec.js` measures all twelve: between 15 and 32 metres tall, and the **narrow**
horizontal span under 1.4× the height — which is exactly the "giant thin disc" that was reported,
while still letting a ribcage be forty metres from skull to tail.

### The last eight dead stats

`8.4` on the list was a row of affix and talent keys that `js/effects.js` derived faithfully onto
the character sheet and **nothing anywhere ever read**. Same shape as everything else this round,
one layer down: the derivation was tested, the tooltip was right, and the number went nowhere.

| Key | What it does now |
|---|---|
| `arrowHoming` | Widens the shot's own hit test. An arrow that *curves* is a projectile simulation; what the affix promises is that you hit the thing you pointed at. |
| `arrowBurst` | A real area hit where the arrow lands. |
| `stealth` | Shortens the aggro range in `js/actors.js`, with a floor of 0.25 — a foe you are standing on top of notices you however quiet your boots are. |
| `revealRange` | Widens the minimap. Kept as `hud.revealMul` and **not** folded into `minimapSpan`, because `+`/`-` write that directly and the player's own setting would drift every frame. |
| `cond_nightWard` | Reads `unit.atNight`. Nothing ever set it on the player. |
| `cond_watch` | Reads `unit.moving`. Same. |
| `cond_vehicleDmg` | Already read `self.mounted`, which the controller does set — this one was fine. |

And the talent **`linger`**. `PENDING_MODS` in `js/skilltalents.js` has carried `ground` and
`groundRadius` since round 7 with the note *"no lingering ground pool exists"* — which was true, and
meant a tier-2 talent offered on four of the six skill trees did nothing whatever when taken.

There are pools now: `dropPool` / `tickPools`, a translucent disc that fades as it burns out so you
can see how long you have to stand clear of it, ticking on a **clock** rather than per frame. That
last part is not an optimisation — a pool paying `perSecond * dt` sixty times a second reads as
"1 damage" however correct the total, which is exactly the trap the damage-over-time effects fell
into in round 6 and is written up above.

### Two flaky tests, fixed at the root rather than retried

Both had been passing most of the time for rounds, which is the worst way for a test to fail.

**The sun-shaft test threw four hundred `Math.random()` darts** across thirty kilometres and kept
the first reading with the sun between 20% and 90% occluded. Measured properly, this world at that
sun angle produces a spread of *zero* with a handful of readings around 0.04–0.14 — so the test was
waiting for a tail event and failing about one full-suite run in three. It sweeps an even 16×16 grid
now, every run the same, and keeps the worst-occluded spot it saw. What is under test is the
relationship (ground in the way takes the shafts down), not a particular fraction.

**The greeting test demanded more than five characters.** Lingo generated "Aye?" and the suite went
red. An arbitrary length was never the point; an empty line or a stray `{` from a binding that did
not resolve is what would actually be a bug, so that is what it checks.

### The last five, and the lesson holding

Clearing the five items that were still half-done at the end of the round found five more of the
same thing. That is now the defining fact about rounds 11 and 12: **twelve finished modules with no
way in**, and not one genuine algorithmic bug among them.

* `js/shipyard.js` had `stationProgress`, `stationGate`, `buildStationModule` **and** `nextStep`,
  and nothing imported any of them — so §9.15's orbital yard and §9.16's "here is what to build
  next" were both unreachable.
* `js/work.js` did every part of the ten-units work system and had no screen whatever.
* `colony.recruitOffer` and its refilling `townPool` had no way in.
* And `board` was declared **twice** on `window.farhold` — the work board and the zone's notice
  board — so the later one silently won and nothing outside `main.js` could reach `js/work.js` at
  all. A duplicate key in an object literal is not an error in JavaScript; it is a shrug.

### The density falloff, and the bug the test found in my own fix

§1.4 was the last of the graphics round: *"density should radiate out from the player position to
avoid pop-in."* The cap and the nearest-cell-first scan had already stopped trees **shifting**; what
remained was the outer ring arriving all at once as a wall.

The fix has one rule that makes it safe rather than merely different: **a thinned cell is a subset
of the dense one**, never a different scatter. Every tree standing there at arm's length was already
standing there at the horizon, so approaching a wood adds trees *between* the ones you could see.

The obvious implementation — `break` out of the scatter loop when the quota is met — is wrong, and
`tests/density.spec.js` caught it on the first run. The cell's `rng` is shared with everything after
the trees: the ruin roll, the megaflora, the grass. Stopping early consumed fewer numbers, so all of
those got a different answer, and the bushes jumped while the trees stood still — worse than the
pop-in it was meant to cure. The item is drawn in full now and only the write to the mesh is
skipped, so the stream ends in the same place whatever the thinning decides.

---

## Round 13 — the play-test list: build tools, gathering, and the roads

Eleven items, and eight of them were the same fault wearing different clothes: **a rule written into
the data and read by nobody, or a module finished and never called.** Rounds 11 and 12 found twelve
of those; this round found eight more and one genuine design mistake.

### "Titan's Grip (we should change the name)"

Two things in one line. The name is a warrior talent out of another game and the playground's one
hard content rule is that nothing player-facing borrows a name from somebody else's — it is
**Doubled Grasp** now (`js/perks.js`). A player's save holds the *node* id (`melee:7:0` — where the
node sits in the forest, not what it is called), so renaming it costs nobody their point. Moving a
keystone to a different ring or arm would; that is the change to be careful with.

### "…tried to equip a second greatsword, it just replaced my main hand"

The keystone exists to let you carry two two-handers, and the one click the inventory has could
never do it. `rpg.equip`'s auto-slot rule opened with `if (slot === 'weapon' && !into &&
oneHanded(item))` — the single case the keystone is *for* was excluded by the guard on the branch.

The branch asks the right question now: not "is this a one-hander" but **"would the off hand
actually take it"**, which `offhandRefusal` already answers, keystone and all, in the one place that
knows the rule. So the keystone works without `js/rpg.js` ever learning what a keystone is.

While it was open, the same branch got the other half right. It used to fill the off hand only when
the new weapon was the *worse* of the two and drop the loser in the bag otherwise — so upgrading
half of a pair silently unequipped the other half. **With a hand free, both go on, best in the main
hand.** And a two-hander no longer sweeps the off hand into the bag when Doubled Grasp is taken.

### "I found iron ore but it says I need a steel tool. How do I get steel if I can't mine iron?"

A wall with no door in it, made out of one unread flag. `deep_vein` has carried `indoors: true`
since the day it landed and its own description reads *"Underground, and something is usually
standing in front of it"* — but `kindsForBiome` filtered on `fromPlanet` and the biome list only, and
an empty biome list means "anywhere on land". So deep veins were scattered across open grassland.
They are hardness 2, their heaviest resource weight is iron ore, and the only hand tool that clears
hardness 2 is a steel weapon you cannot have yet.

Three fixes, and a test that keeps them:

* `kindsForBiome` reads `indoors` and `placedOnly`. Deep veins now live where their own data always
  said they did, and `enterDungeon` puts one in about half the rooms — which also means the pack
  already standing in that room *is* the guard the description promised.
* `meteor_site` is `placedOnly`, because the test written for the first fix immediately caught it
  doing the same thing: hardness 2, holds iron ore, scattered in fields where nothing had fallen.
  `js/meteors.js` places one in the crater now, so meteoric iron comes from a meteor.
* **The refusal says what to do.** Nothing anywhere in Farhold tells a player that a tool tier is
  read off the weapon in their hands — there is no pick slot to go and fill — so "you need a Steel
  Tool" was a true sentence that left them stuck. Every tool in `data/resources.json` carries a
  `from` line now, and the refusal prints it: *"too hard for an Iron Tool. You need a Steel Tool.
  That means carrying a steel weapon: forge Steel at an Alloy Forge from iron ingots and charcoal."*

The standing rule, pinned by `tests/round13.test.js`: **whatever the surface offers, a brand new
player holding a starting weapon must be able to work it.** Crystal and obsidian may be a "come back
later"; nothing holding iron ore may be.

### "The build Clear tool doesn't do anything"

It did not. `js/main.js` wired it to `props.clearAround?.(x, z, r)` — a method `js/props.js` never
had — and the optional-chaining swallowed the whole call, so the tool reported *"Cleared 0 of it"*
and the player learned the build interface lies. Underneath that sat a second one: `build.js`'s
`clear()` called `store.give(res.materials)` when `give` takes `(id, n)`, so even once the felling
worked every log would have gone into the void.

`js/props.js` now keeps a **harvest ledger** — the only place it *could* keep one, because the
scatter is a pure function of the cell seed and there is nowhere to write "this tree is gone" except
a list of exceptions beside it. Two lists, two questions: `felled` names one prop by position
(`propKey`, rounded to a tenth of a metre — far inside the gap between neighbouring scatter points
and exact enough to hash the same on every rebuild) and carries its regrow clock; `cleared` is a
circle of ground, which keeps working on cells that have not been generated yet. Both go in the save
and both are tiny — a whole base is a couple of dozen circles.

The skip in the scatter loop follows the rule round 12 learned the hard way: **the numbers are all
drawn and only the write to the mesh is skipped**, so felling one tree cannot shuffle the bushes
around it.

### "Raise/lower/level do not affect the grass/trees"

Two faults in one sentence — nothing was cleared out of the brush, *and* every instance keeps the
height it was scattered at, so a levelled plot left its trees hanging in the air. `js/build.js` has
an `onGround` callback now; a terrain edit fells what is inside the brush (you keep the timber, same
as Clear) and rebuilds, which re-reads `heightAt` for everything left standing.

### "More fun to attack these objects than press E on them"

Right, and there is no new key and no gathering mode: **the swing you already make sixty times a
minute is the thing that gathers.** `PROP_HARVEST` in `js/props.js` gives every tree, bush, reed,
rock and boulder an hp, a tool tier, a verb and a drop list. A swing that lands on nothing living
goes to the scenery instead — a seam first, because it is the smaller target and the one you walked
out here for, then whatever is standing in the arc.

The tool tier is the *same ladder a seam uses*, read off your weapon, so a crystal refuses a bronze
sword with the same sentence a crystal seam would. One rule to learn, not two. Woods regrow; a
broken boulder does not — the same split `js/resources.js` already makes with `respawnSeconds`.

### "Add a scan tool with fixed resource deposits like Satisfactory"

We had the deposits — a seam's position has been a pure function of the world seed since round 11,
so the one you found yesterday is where you left it — and no way to know one was there except to
walk over it. They are sparse on purpose, about fourteen to a 512 m tile.

**Scan** is a build tool. It sweeps from the cursor (not your feet: "what is over that ridge" is the
question you actually have), and the panel answers the one a player is really asking — *where is the
iron* — with **one row per material**, the best of each judged by what it would deliver from where
you are standing. Bearing, distance, richness band, and a **Pin it** button that drops a `seam`
marker into the one marker book, so it is on the map, on the minimap, and on the rim as an arrow
when it is off the edge.

### "We should not require the user to click the route button"

A drill with no route fills a capped little stockpile and stops, and the old interface made that the
default: you had to know the Route tool existed, pick it, and click two objects. Now **a drill lays
its own route** the moment it bites, and a new crate re-routes every drill that had none — because
the usual order of play is drill first, storage second.

"Maybe just use a pathfinding to route the way" turned out to fix a real number, not just a click. A
route's distance was `Math.hypot` between its ends, straight into `haulThroughput` — so a crate on
the far side of a lake was "forty metres away" and delivered as if the hauler swam. `js/haulpath.js`
is A\* over an 8 m grid where **water is a wall, a bank costs what it costs, and the answer is the
length actually walked**, plus the points, so the route can be *drawn*. `bestStoreFor` then picks the
store that delivers most rather than the one that is nearest, which is a distinction that only means
anything once the walk is measured. The tracks are laid on the ground by `js/ore-view.js`; a route
that goes twice as far as the crow flies explains itself the moment you look at it.

### "Pressing B should also free up the cursor"

It is a panel with forty buttons and the pointer was locked to the middle of the screen. Build mode
joins the blocked list, so the click that would re-take the pointer does not, and `aimSpot`
unprojects the **real cursor** instead of the camera's nose — otherwise you point at one patch of
ground with the mouse and build on another in the middle of the screen. Left-drag still turns the
camera (`js/player.js` has always supported that), so the two jobs are told apart the way every
desktop application tells them apart: **did the mouse move between press and release.** Six pixels.

The fixed dot in the middle is a lie while the cursor is free, so it goes, and the canvas carries a
real crosshair. The × on the panel leaves the *mode*, not just the panel — closing only the panel
left build mode running with a freed pointer, no catalogue and no way back.

### "The Road tool doesn't seem to do anything"

It did exactly what it was written to do — every click pushed a point onto an array and Enter turned
the array into a road — and **none of that was visible**. Four clicks and a silent array is
indistinguishable from a broken tool, and the player is right to call it one.

Now: a peg at every corner, a band of ground between them, a dashed leg from the last peg to the
cursor, using the *piece's own half-width* so what you see is where the road goes. The first click
says so in the log, because that is the one that looked like nothing happened. `finishRun` reports
what it laid rather than only its failures. Esc drops a half-drawn run before it leaves the mode.
And picking the Road tool **picks a road** — it used to fall back to `road_dirt` deep inside
`finishRun`, after the run was drawn, so the panel was quoting the price of whatever crate you had
selected.

### "Random flat rectangles in town… can they connect to the real roads?"

Two separate things, and both are in `proctown/js/townplan.js` so the tuning page gets them too.

**One network.** The cuts that make the blocks are in principle already connected — a child street
runs from one edge of its block to the other, and those edges are its parent's streets. Three things
break that in practice: a drifting child block *shrinks* to stay in its slot, so its alleys stop
short; `clipPolyline` cuts every street to the wall circle and can leave a stub with both junctions
outside; and the renderer drops any span that lands in water. Any of those leaves paving with no
road attached to it — a flat rectangle in a field, which is exactly what the player saw.
`connectStreets` groups the streets into connected components, takes the one containing the square
as the town, gives every other component a **spur** to reach it, and throws away whatever will not
join. 462 towns across seven cultures now come out in exactly one piece, with about 0.7 orphan
streets dropped each.

**The highway comes in.** `linkRoads` takes the points where the world road crosses the town's ring
— `js/features.js` walks the route's own polyline looking for the step from outside to inside — and
lays a main street from each to wherever the plan comes closest. A road reaching a town becomes its
high street, which is what a road does.

Both run **before a single plot is cut**, because a spur is a street and cutting plots first would
put houses on roads again — the one thing this planner exists to make impossible. A spur crosses a
block rather than bounding it, so the plots are trimmed against the added streets afterwards;
`overlaps()` stays at zero over 462 towns.

### The one nobody reported, found by fixing the one they did

"Since we need timber and stone now, can we update the existing wood and stone to be mineable?" —
and once a tree gave you logs, the next question was what a log is for. **Nothing.**

`data/structures.json` prices everything in short names — `timber`, `iron`, `parts`, `block` — and
says so in its own header, in as many words:

> *"the ids in `cost` are a CONTRACT, not an inventory. §1 (gathering) and §2 (refining) belong to
> another part of this expansion and will decide where `iron` or `plank` actually comes from."*

They decided. They decided on `log`, `iron_ingot`, `machine_part`, `cut_stone`. And nobody ever went
back and joined the two vocabularies, so **a palisade cost six units of a thing that has never
existed**. Twenty-two pieces of the catalogue were priced in `timber`, twenty-six in `iron`,
twenty-four in `steel`, sixteen in `parts` — none of which any bench, seam or tree has ever
produced. Two more, `wire` and `concrete`, were not aliases for anything: ten structures spent wire
and no recipe in the game made a single unit of it.

This is the thirteenth join of exactly this kind, and the worst one, because there is no crash and
no wrong number — the prices are simply unpayable, for ever, and the only symptom is that building
anything feels impossible.

* `MATERIAL_ALIASES` in `js/buildplan.js` is the table. Ten short names, one line each.
* `alignCatalogue(structureData, resourceData)` runs **once at boot**, at the boundary, so nothing
  downstream has to know there were ever two words for the same thing — and it carries the display
  names across, so the panel still says "6 timber" while the pool spends logs.
* `wire` and `concrete` are real materials now, with real recipes: `draw_wire` at the smelter (Copper
  Ore's own description has read *"wire, fittings, and half of bronze"* since the day it landed) and
  `pour_concrete` at the stonecutter.
* `tests/round13.test.js` states the rule: **every build cost must be something the game actually
  produces** — dug out of the ground or made at a bench. A cost you cannot obtain is not a price, it
  is a wall.

And `tests/industry.test.js`'s §3.20 — *"no recipe is a dead end"* — had the same blind spot from the
other side: it counted refining and power as consumers and not the build catalogue, which is the
biggest consumer in the game. It counts it now, in the right vocabulary, and is finally asking the
whole question.

### What this round is really about

Eight of eleven items were a join that had never been made or a flag that nothing read — nine, with
the material vocabulary the ninth found on its way past. The two that
were not — the equip rule and the straight-line haul distance — were both *wrong questions* asked in
the right place: "is this a one-hander" instead of "would the off hand take it", and "how far apart
are these" instead of "how far is the walk". Neither crashes, neither shows up in a test that was
not written to look for it, and both are invisible until somebody plays the game and says so.

---

# Round 14 — a play-test list, and three redesigns

Twenty items off a play-test, plus three pieces the user asked a design agent to plan first: the
map, the ambient events, and the Civilization expansion. The designs are in `research/` —
`map-redesign.md`, `events-redesign.md`, `civilization-expansion.md`, `combat-redesign.md` — and
each one starts with an audit rather than a proposal, which is why they are worth keeping.

## The shape of the round

Nine of the twenty items turned out to be **a rule written into the data and read by nobody**. That
is now the third round running where it has been the dominant fault, and it is worth stating as a
pattern rather than as a list of bugs:

| the rule | where it was written | what nobody did with it |
|---|---|---|
| `nearWater: true` on `clay_bank` | `data/resources.json` | `kindsForBiome` never looked, so clay was scattered over six biomes instead of on riverbanks |
| `named` scope budgets | `data/job-frames.json` `scopes` | `fits()` had no distance test, so a "local" job could bind a town 40 km away |
| `label` on every key binding | `js/settings.js` BINDINGS | the pause menu read `b.name`, so every row said "W undefined" |
| `MARKER_LOOKS[kind].icon` | `js/markers.js` | the world map drew six identical dots; the minimap and the side panel both drew the glyph |
| `node.type === 'landmark'` | World Forge `nodes.js` | `markFor` tested `family`, which World Forge nodes do not have — 10 of 11 kinds never drawn |
| `portal.mapMarkers()` | `js/portal.js:211` | imported by nothing. The thirteenth module of this kind |
| `encounters.events` | `js/encounters.js:428` | a finished activity feed with positions and clocks, read by nothing |
| `TWO_HANDED_SCALE.damage` | `js/weapons.js:102` | `profileOf` never returns `damage`; its only effect was making bows 20% slower |
| `claim_stone` costing 2 iron | `data/structures.json` | iron needs a furnace, a furnace needed a claim — your second base was impossible |

The lesson the round keeps teaching: **a flag that nothing reads is indistinguishable from a missing
feature, and much harder to find**, because the data says the feature is there. The defence is a
test that walks the data and asserts somebody consumes every field — `tests/landmark-gives.test.js`
does it for landmarks, `tests/scanner.test.js` now does it for node kinds and biomes, and
`tests/round14.test.js` does it for the build catalogue.

## The exploit

> "I found a node 'E look at field of cairns' and it allows me to repeatedly press E to gain
> infinite experience."

`atLandmark` paid out a landmark's whole `gives` block on every press of E. The landmarks with
`steps` were safe *by accident* — `workLandmark` counts them down and only pays on the last one —
but twelve of the sixteen kinds carry `solve: false`, have no steps, and so had nothing stopping
them at all. Stand still, hold E, gain a level a second.

`territory.takeLandmark()` is true exactly once per landmark for the life of the save. What it gates
is the things that only make sense once: the reward, the curse, the events that change the world.
What it does not gate is the **standing offer** a place makes — you can rest at a shrine again
tomorrow, the bench is still a bench, the ford is still a ford, and a toll is charged every time,
because that is what a toll is. Splitting those two was the whole of the fix.

And while in there: the Field of Cairns was built out of `rubble`, a 1.8 m heap of broken stone,
while its own blurb promised "thirty piles of stone, laid out in rows by somebody careful". There
was no cairn in the file and the layout schema could say "ring" and "scatter" and not "rows".

## What "they happen too often" actually was

Five separate bugs, each of which alone would have been survivable:

1. **Open water is a zone** (`id: -1`), and the main loop treated any change of zone id as walking
   into new territory. Wading into a river and back re-announced the region, re-rolled the trouble,
   re-populated the road and heard another rumour — several times a minute, on every world with
   rivers.
2. **Dusk and dawn** cleared `boardZone` to rebuild the notice board, which is right, by pretending
   you had just arrived, which is not. Twice an in-game day, for ever.
3. **`describe()` is a status readout** and was printed as news, so an incident that started forty
   minutes ago was announced again.
4. **`grudge` starved everything else.** It is a forced incident (chance 1, no roll) sitting fourth
   in `data/incidents.json`, and the loop returned on the first thing that fired. So from the first
   time the player died, the eight interesting incidents could never start in a zone they were newly
   entering. The blandest line in the game was the only one anybody ever saw, and it was not bad
   luck — it was the mechanism.
5. **Two clocks disagreed about an hour**: the territory ran one per 60 real seconds against the
   sun's 37.5, so a "24 hour" incident lasted 1.6 in-game days.

On top of those, `js/ambient.js` is the budget every ambient source now draws on: two lines a
minute, never the same sentence twice in a run, nothing at all during a fight or underground, and a
line whose `{tokens}` cannot be filled is refused rather than printed. Measured in the browser: 40
offers in, 1 through, 39 refused.

All 22 ambient strings named nothing — not a creature, not a faction, not a place. Each has a
`named` variant now, filled from the creatures that actually spawned, with the generic line kept as
the fallback. That fallback is the important half: `{beast} is out here` with no beast is worse than
the line it replaced.

## The new modules

| file | what it is |
|---|---|
| `js/ambient.js` | the purse, the no-repeat window, `bind()`. Pure; `tests/ambient.test.js` |
| `js/nearby.js` | what is worth a row, nearest first, clocks first. Pure; `tests/nearby.test.js` |
| `js/nearby-ui.js` | the five-row panel under the minimap, at 4 Hz, on a cached node pool |
| `js/beacon.js` | six columns of light, shared by the Nearby panel and the scanner |

The one rule that makes the beacon work: **it is the same size on screen at any distance.** A
pointer that shrinks is invisible at exactly the range you need it, because you can see the cart at
40 m — the beacon is for 400 m.

The one rule that makes the Nearby panel work: **a clock under 30 seconds beats distance.** A rescue
you are about to fail is the thing you need to see, and it is hardly ever the nearest thing.

## Where do you find clay?

`clay_bank`: marsh, grassland, rainforest, temperate forest, beach, savanna. Hardness 0 — bare hands.
It was never rare, it was invisible, and clay gates the furnace *and* the kiln, which are the first
two machines in the game. Three causes, in order of how badly each one hurt:

* `nearWater: true` was read by nobody, so clay banks were not on banks;
* the scanner was a tool inside build mode, three clicks deep;
* its default reach was 144 m on a world that scatters about fourteen seams to a 512 m tile.

The Find panel on the map is the fix: 28 materials in a dropdown, each with one line saying where it
lives — **on screen before you sweep**, because a sweep that comes back empty still has to teach you
something.

The same audit found `water_source` listing `lake` and `coast`, and `ice_field` listing `seaIce` —
all water biomes, and `createNodeWorld` deletes any node standing on water, so the one seam that
never runs out only ever existed in marsh. And `gas_vent` listing `toxic`, which World Forge has
never had. `tests/scanner.test.js` now fails if any node kind names a biome that does not exist or
is under water.

---

# Round 14 — combat

> "Critique the current combat system and provide suggestions to make all weapon types more unique,
> interesting, and have satisfying physics. Hammers should smash, swords should slash, and polearms
> should add some range. Add more animation and effects to all sort of attacks and spells. Revamp
> all melee weapons to have better and more satisfying visuals. Ensure the character holds weapons
> and shields properly. Melee weapons are currently terrible compared to ranged and wands, and
> staves are lacking their magical appeal."

The plan is `research/combat-redesign.md` — 1,328 lines, measured against the real modules. This is
what was built. What could not be built, because `main.js` and `hud.js` belonged to another agent
this round, is written out as copy-pasteable patches in `research/round14-combat-handoff.md`.

## The short version

**The user was right, and the gap was bigger than "terrible" suggests.** At level 20 with identical
gear, a greatsword — the heaviest weapon in the game, both hands, no shield — did **165** damage a
second. A bow did **336**, at eleven times the range. Over ten realistic seconds (something notices
you at 30 m and closes at 3.6 m/s, so a melee character gets two and a half of the ten) it was
**462 against 3,362**. The best melee weapon in the game was a pair of daggers, and every two-handed
weapon sat in the bottom seven.

But the arithmetic was not the real problem. **A melee swing was one flat white ring drawn on the
grass, resolved on the frame the button went down**, with no wind-up, no impact, no recoil, no
knockback, and one animation — a single overhead chop that played whether you were stabbing with a
rapier or loosing an arrow. There was nothing to feel. Ranged felt better because `spellfx.js` was
doing real work for it and *nothing at all* for melee.

## The bugs, and they were most of it

Nine mechanisms made the gap and twelve bugs sat under them. In rough order of how much each one
cost:

* **`TWO_HANDED_SCALE.damage` was dead data.** It declared `damage: 1.25` and `profileOf` returned
  `reach`, `arc` and `every` and never `damage`. Two-handers paid a 1.2× slower clock and collected
  none of the bonus it was written for. **And the scale fired on the wrong weapons anyway**: its
  guard was `two && !WEAPON_PATTERNS[key]`, and every real two-hander is *in* that table — so the
  only weapons it ever touched were `bow`, `shortbow` and `crossbow`. The one effect
  `TWO_HANDED_SCALE` has ever had on this game was **making bows 20% slower**, which is the opposite
  of what it was for. The bonus lives in `WEAPON_TRAITS` now and reaches the weapons it was written
  for; what is left of the scale is an honest default for an unlisted two-hander.
* **A bow's rate of fire was an accident.** `bow` was in neither weapon table, so `profileOf` fell
  through to `CATEGORY_PATTERNS.light` — *the light-melee swing clock*. 1.91 shots a second with no
  draw, no nock, no aim and no reload. Nobody designed it.
* **Every arrow was a free 2.6 m area attack at full power.** `onArrowLand` calls
  `field.strikeArea(...)` with no `power`, which defaults to 1, and `arrowSplash` was 2.6 m at 0.45
  falloff. A melee jab was 0.65 of a hit inside a 0.3 m splash that *excluded everything the swing
  had already hit*. The bow's area was larger, cheaper and unconditional.
* **The off hand lent only its clock, never its damage.** `rpg.strike` reads `a.damage`, which
  `derive` computes from `equipment.weapon` alone, and the off hand's share was 0.62 of the **main
  hand's** numbers. So the mathematically correct off-hand weapon was always the fastest weapon in
  the game regardless of its damage. Longsword-and-dagger did 490 against dual longswords' 344.
  That is not a build, it is an exploit, and it sat at the top of the damage table.
* **`damageFlat` was added to the weapon's dice before everything else multiplied**, so gear diluted
  the weapon. At level 20 with a modest +12 flat, a greatsword's 15–29 became 27–41 and a dagger's
  3–7 became 15–19: a 4.4× difference in raw weapon damage collapsed to 1.9×, while the greatsword
  still paid the whole of its 0.88-swings-a-second clock.
* **A quarterstaff was a wand.** `items.json` files it `weaponCategory: "magic", twoHanded: true`,
  which is exactly the test `isStaff()` uses — so it cast a free shaped area spell on its own
  four-strike pattern, **one every 0.41 seconds, the highest sustained area damage in the game**.
  It is also the starting weapon of the monk, the bard, the druid, the shaman and the scavenger.
  That file is shared with Emberveil, so the fix is written onto the **item** in `attuneWeapon`, the
  same way `ranged`, `castElement` and every `describeWeapon` field already are.
* **The staff nova drew nothing at all.** `spellfx.aoe` walks a `points` array; the call passed
  `{ at, radius }`, so the loop ran zero times. Every other call site in the file gets it right.
  *(Still live — patch 1 of the handoff.)*
* **An ordinary steel sword hit drew no impact effect whatsoever**, because of one condition:
  `if (element !== 'physical')`. `spellfx.impact({ element: 'physical' })` has always built two
  crossed slash planes, a spark burst and a dust puff, and nothing ever asked it for them.
* **A greatsword rendered as an axe.** `HELD_BY_SUBTYPE` sent `greatsword`, `sword2h`, `battleaxe`
  and `axe2h` all to `'greataxe'`. A `halberd`, a `spear` and a `javelin` were all a bare pole. A
  `wand` was a cone of fire floating in the palm — there was no wand model anywhere in the game.
* **Statuses had no auras.** `applyStatus` mutated `target.statuses` and drew nothing; all 23 auras
  exist and Farhold wired them only to enemy *modifiers*. A burning enemy did not look like it was
  burning.
* **A kill drew nothing.** The only `spellfx` call in `onEnemyKilled` is behind a legendary.

## What a hit is now — `js/combat-feel.js` (new)

Six things make a blow read as a blow. Greps for `shake`, `hitstop`, `knockback`, `timeScale` and
`recoil` across the whole playground came back with nothing but unrelated comments — **five of the
six did not exist**.

| | what | where the numbers are |
|---|---|---|
| hit-stop | the world runs at 0.05× for 35–150 ms and eases back over 40 ms. ×1.6 on a crit, ×2.2 on a kill, capped at 260 ms. One at a time; a longer one replaces a shorter one. **The camera and the mouse are exempt** — a hit-stop that fights your aim is nausea, not weight | `STRIKES[*].hitstop` |
| screen shake | 4 mm to 32 mm of camera **position**, never rotation; two out-of-phase sine pairs at 38 Hz rather than `Math.random()`, which reads as static; biased 70% along the way the blow went; decays to nothing over 180 ms, hard ceiling 0.12 m | `STRIKES[*].shake` |
| knockback | 0.15 m for a jab, 1.1 m for an overhead, **2.2 m for a slam**, eased out over 0.18 s. Champion ×0.70, rare ×0.50, boss ×0.25, hovering ×1.25. A body with a wall behind it absorbs the push and **takes extra damage instead** | `STRIKES[*].push` |
| stagger | it cannot walk **and it cannot swing** — `swingTimer` is held rather than decremented, which is the half that matters, or a 0.65 s stagger removes movement and no attacks. Diminishing returns: the second inside six seconds is 60%, the third 30%, the fourth nothing, so a maul cannot lock a boss | `STRIKES[*].stagger` |
| recoil | the body is nudged 8 cm along the blow and eases back over 120 ms. Costs nothing, independent of the physics, and it is the difference between "a number appeared" and "I hit something" | fixed |
| **weight** | a swing is three parts now: `press → [wind-up] → the damage lands → [recovery] → next swing`. You walk at 55% while committed. A press during recovery is **buffered for 180 ms** rather than dropped. The off hand may not wind up while the main hand is | `FAMILY_WIND` |

**The invariant, and there is a test for it:** `wind + recover` comes **out of** the weapon's
existing `every`, never on top of it, so the rate of fire — and therefore every damage-per-second
number — is exactly what it was. Splitting a swing into three is pure feel; if it changes the
balance of the game by accident it has done more harm than good.

Both hit-stop and shake are a Settings toggle, on by default, next to Damage numbers.

## Weapon identity

Three new strike shapes, and physics on all nine:

* **`arc`** — the sword finisher. A 2.3-radian sweep that carries you 0.6 m forward and hits
  everything in front of you.
* **`slam`** — the hammer finisher. 2.25× damage, 2.2 m of knockback, 0.65 s of stagger, 150 ms of
  hit-stop and the heaviest shake in the game.
* **`lunge`** — the point-weapon finisher. 1.4 m of ground covered and 40% of armour ignored.

…and a `WEAPON_TRAITS` table, read the way patterns are:

| family | what it is now |
|---|---|
| **hammer, maul, mace** | **it smashes.** `slam` finisher, and **armour break**: 7% of what is left of the target's armour stripped for 8 s, floored at 45% of base — which helps everything else hitting the same body, and is what a hammer is *for*. `guard: 0` — a hammer does not parry |
| **sword, longsword** | **it slashes.** `slash, slash, arc`; **momentum** — each consecutive connecting strike is +8%, up to +16% on the third, reset by a miss; alternating `slash`/`slashBack` clips so a combo reads as one |
| **greatsword, two-handed sword** | the sweep. `sweep, overhead, arc`, the resurrected **1.20** two-hander bonus, 4.2 m reach — every strike is an area strike |
| **axe, battleaxe, greataxe** | **it bites.** `bleed` on a connecting cleave — low up front, high in total, and it goes on working while you back off |
| **halberd** | **it adds range.** `pierceLine: 3` — a thrust is not a cone, it is a **0.9 m line out to 7.4 m** that hits every body along it. That out-reaches every enemy in `data/enemies.json` by nearly three metres, *and there is a test that says so*. Plus `brace: 0.35` — standing your ground against something that closed on you is worth more |
| **spear** | the one-handed polearm: 6.2 m line, two bodies, and **the shield stays on**. The first time a spear has been different from a sword |
| **rapier** | the point. `thrust, thrust, lunge`, 25% and 40% armour pierce, and the gap closer melee never had |
| **sabre / scimitar** | the flow: connect twice and the third strike costs 0.35× its clock |
| **dagger** | the back. Family damage **0.80** — a dagger should not be the highest sustained damage in the game — in exchange for **2.2× from the rear 100°**, plus a bleed. The enemy's facing was already tracked; it is one angle and one comparison |
| **quarterstaff** | a real pole at last: `jab, sweep, jab, sweep`, 3.5 m, physical damage (so it loses the `spellPower` multiplier it should never have had), and `guard: 0.12` — a staff parries, which is the monk's defence |
| **bow** | **a draw.** Under 0.35 s it refuses — you have not nocked. 0.95 s is full draw and 1.60×. Past 1.6 s the arms start to shake and the power bleeds away. Splash 2.6 → 0.9 m: an arrow hits what you aimed at, and the quiver's `arrowBurst` affix goes back to being the thing that makes it an area shot |
| **crossbow** | one heavy bolt at 1.80×, then a **1.25 s reload** you are defenceless through |
| **javelin** | counted: six in hand, thrown, picked back up. *(Data and plan are live; the counting itself is handoff patch 4.)* |
| **wand** | unchanged in character — it always works, never runs out, is never the biggest number — with the splash pulled from 2.2 to 1.3 m. It is a bolt, not a grenade |
| **sceptre** | a real mace pattern, and the one weapon whose *swings* get `spellPower`, because its element is not physical |

### One deliberate softening of the design

The plan refuses a bow release under 0.35 s outright — *"you have not nocked"*. With the draw meter
not yet on the HUD (it is `js/hud.js`, patch 12 of the handoff), a refusal reads as a broken bow
rather than as a lesson. So a draw that has not reached the nock **keeps going on its own** after
the button comes up: a click gets you the weak 0.55× shot a third of a second later, holding gets
you the 1.60× one, and nothing you pressed is ever thrown away. A draw or a channel held past its
ceiling also **releases itself**, because "holding the mouse button repeatedly attacks" is an older
standing request and a weapon you have to let go of to fire would have broken it.

## The staff — a siege engine, not a pistol

A staff cast a free shaped area spell every 0.6 s with no cast time, no mana and no choice. It was
simultaneously the most powerful weapon in the game and the least interesting: you held the button
and area damage came out.

It charges now. A **tap** is still free and still weak (0.60×). Holding drinks **4 mana a second**
and builds: 0.60× at 0.35 s, 1.00× at 1.40 s, **1.60× and twice the radius** at 2.60 s. You move at
60% while it builds. `STAFF_CHARGE` and `chargeAt()` are in `js/weapons.js`, tested, and the release
folds into the strike through `withArea` so the radius and the damage both scale.

`CHARGED_FORMS` says what each shape *should become* at full charge — a cone into a sustained jet, a
nova into a dome that shoves everything out, a wave into a wall that stands for three seconds, a lob
into an aimed mortar. **That part is not built**: each is a new branch of `swingWith`, which is
main.js. It is the largest single thing still owed and it is written up in the handoff.

Every staff also wears the topper its element asks for. Five toppers already existed in
`chibi2-gear.js` and four of them were unreachable, because `HELD_BY_SUBTYPE` sent every staff in
the game to `staff_orb`.

## Animation — `avatar-3d/js/chibi2-motion.js`, additively

**Fourteen new clips**: `slash`, `slashBack`, `thrust`, `overhead`, `sweep`, `jab`, `arcCut`,
`slam`, `lunge`, `shoot`, `reload`, `castPoint`, `castStaff`, `channel`. They are in a **separate
exported list** (`CHIBI2_COMBAT_ANIMS` / `CHIBI2_COMBAT_ALL`), so `CHIBI2_ANIMS` and
`CHIBI2_ALL_ANIMS` are byte-for-byte what they were and Emberveil builds exactly what it always
built. Farhold asks for the longer list in `makeActor`.

The slam is the one worth describing: both arms go overhead and **stay there for 0.42 s** — the
pause *is* the weight — then come down through the target in 0.14 s with the hips dropping under it.

## New weapon models — `avatar-3d/js/chibi2-weapons.js` (new file)

Eighteen procedural weapons on new `fh_` ids, reached through **one dispatch line** in
`chibi2-gear.js`, so every id Emberveil uses is untouched. Built from a shared parts vocabulary —
`grip` with five wrap bands, four `pommel` kinds, a `guard` with a real forward sweep and thickness,
a `blade` with a spine, a fuller and two lighter edge stripes, a `haft` with ferrules, `langets`, a
`collar`, an `axeHead` crescent with a beard, and a `gem` that only appears at rare and above.

**And the grip fix, which is probably what "ensure the character holds weapons properly" meant.** In
hand space `+y` runs UP THE FOREARM toward the elbow and `−y` is out past the fingertips — it says
so at the top of `chibi2-gear.js`. The greataxe head sat at **y +0.44**, the hammer at +0.40, the
warhammer at +0.46, the mace at +0.42. All of them behind the fist. The `attack` clip swings the arm
about the shoulder, so **as the character chopped down, the head travelled up and back**: you were
hitting things with the butt of the handle. Every weapon in the new kit has its head at negative y
and its butt at positive y, and `tests/round14-combat.test.js` asserts it family by family.

A **shield is strapped to the forearm**, on `elbowL`, not gripped in the fist on `handL` — which is
how a buckler is held and how nothing else is. It is also about twice the size it was.

`avatar-3d/js/chibi2-weapon-ids.js` holds the catalogue with no Three.js in it, the same way
`creature-types.js` does, so the node tests and the tools can read it.

## The rebalance

| change | before | after |
|---|---|---|
| the damage formula | `(dice + flat) × attr × talent × level` | **`(dice × level + flat) × attr × talent`** — the weapon scales, the flat bonus does not |
| `damagePerLevel` | 0.10 | 0.11, to hold the curve where the simulator tuned it |
| the off hand | 0.62 of the **main hand's** dice | **its own dice**, at 0.60 |
| `arrowSplash` | 2.6 m | 0.9 m |
| `TWO_HANDED_SCALE.damage` | dead `1.25` | gone; the live 1.20 is in `WEAPON_TRAITS` |
| wand splash | 2.2 m | 1.3 m |

The greatsword-to-dagger ratio of average hit goes from **1.99× to about 2.9×** — the difference a
player reads on the item card is finally the difference they feel in the fight. In the measured
table the best sustained damage in the game is now a **two-handed melee weapon**, the crossbow is
mid-table, and the whole spread across seventeen options is under **2.5×**. `tests/round14-combat.test.js`
asserts all three, so the day it drifts, something fails.

## The channel, and why it exists

`js/main.js` was not ours this round, and it is where `swingWith` lives — it computes the strike
shape once and then hands the **pieces** of it (a reach, an angle, a power) to four different
systems, none of which is told which of the nine shapes they came from. That is precisely why a
hammer smash and a dagger jab drew the same white ring.

`js/weapons.js` `withArea` is called exactly once per swing, in `swingWith`, on the frame the swing
happens. It posts the whole shape to `js/combat-feel.js`, and `combat-fx.js`, `actors.js` and the
clip chooser read the one record instead of each guessing. It is a side effect in an otherwise pure
function and it is documented at length where it happens. The same channel carries a bow's draw to
the arrow that lands two seconds later and a staff's charge to the spell it becomes.

Handoff patches 6, 8 and 9 replace the indirection with the direct call the day main.js is free.
None of them is needed for the game to play correctly.

## Files

| file | what |
|---|---|
| `js/combat-feel.js` | **new** — hit-stop, shake, the stagger book, knockback resistance, the swing channel |
| `js/weapons.js` | 9 strike shapes with physics, `WEAPON_TRAITS`, `RANGED`, `FAMILY_WIND`, `swingTiming`, `drawPower`, `STAFF_CHARGE`/`chargeAt`, `CHARGED_FORMS`, `clipFor`; the suffix now beats the subtype (`obsidian_scimitar` is filed under the subtype "sword", so the sabre rhythm never fired on a real item) |
| `js/player.js` | the three-part swing, the input buffer, the off-hand interleave, the bow draw, the staff channel, the commitment on the legs, the camera shake |
| `js/actors.js` | `land()` — impact, sparks, recoil, knockback, stagger, hit-stop, all in one place; the pierce line; backstab; brace; momentum; armour break; bleed; status auras; the death effect |
| `js/rpg.js` | the damage formula, `offDamage`, the swing plan on `derived`, armour pierce, the sunder read, the whole held-model mapping, the quarterstaff reclassification |
| `js/combat-fx.js` | the arc drawn in the weapon's own plane, opening as it travels; dust at the feet; the hit box behind a debug switch |
| `js/skills.js` | `setStatusFx`/`setStatusPulse` — everything that applies a status lights up, without every call site remembering |
| `avatar-3d/js/chibi2-weapons.js` | **new** — 18 weapons, 3 strapped shields |
| `avatar-3d/js/chibi2-weapon-ids.js` | **new** — the catalogue, Three.js-free |
| `avatar-3d/js/chibi2-motion.js` | **shared, additive** — 14 combat clips in their own opt-in list |
| `avatar-3d/js/chibi2-gear.js` | **shared, additive** — two dispatch lines |
| `avatar-2d/js/parts/gear.js` | **shared, additive** — a 2D entry for every new id, so a portrait still draws a weapon |
| `data/balance.json` | the formula constants, and `combat` / `ranged` / `staff` blocks |

## Round 15 — the industry you can find your way through

A twenty-item play-test list. The theme was the same one as round 14, from the
other end: round 14 was *rules written into the data and read by nobody*, and
round 15 was **doors**. Almost everything asked for existed and could not be
reached.

| what the player said | what was actually true |
|---|---|
| "I built a furnace. Now what? How do I interact with it?" | `drawBench` has listed every recipe a machine can make since the building expansion. The only way in was pressing B and noticing a panel halfway down a sidebar. **E did nothing.** |
| "How do you even get better tools? I do not see a slot" | There is no slot: your weapon IS your tool. `data/resources.json` has carried a sentence explaining every rung of that ladder the whole time and never put one on a screen. |
| "The useful stuff is still at the bottom" | True. Round 14 fixed what the map *drew* and left the sidebar in the order it had grown in — Layers, key, biome breakdown, and only then the reason you opened it. |
| "I don't know how to get iron ore or transport it to my base" | `FIRST_STEPS` in the build panel answers exactly that, and `drawSteps` opens with `if (started) return` — so it is on screen for the one minute you do not need it and gone for the hour you do. |
| "Add a motorcycle, car and truck… same slot" | All three existed and were already faster than a horse. They lived in a slot of their own on a key of their own, so the game had two unrelated answers to "what am I travelling on". |

### The two the end-to-end test found

Writing *"a few drills next to an outpost marker with a chest, and have that base
generate ore"* as a spec turned up two things nothing else would have:

* The join that makes a placed drill a working drill read
  `entry.key === 'drill' || entry.key === 'pump'` — **two literal names**. So the
  Small Drill added an hour earlier placed correctly, cost its iron and dug
  nothing. It asks `def.needs === 'node'` now, which is the catalogue's own word.
* **The furnace was broken for everybody playing alone.** The Civilization
  Expansion's labour gate is meant to stay off until you have workers; I turned
  it on from minute one. A player alone in the world was told "Standing cold —
  nobody is working this". You count as labour when you stand at a machine now,
  which is what `refine.js`'s own comment says work units mean.

### `js/nextstep.js`

Twelve rules in dependency order; the first whose condition is true is the
answer, with one sentence for what, one for why, and one for where. Every field
comes from what is actually STANDING — pools, machine queues, drill routes,
generator output, outpost count — rather than a flag somebody remembered to set,
because a flag that drifts tells you to do something you have already done.

It is pure, so the test walks a whole playthrough in a loop and asserts the two
things that matter more than any sentence: the chain always terminates, and it
never tells you to do something you cannot do yet. That loop found a real
ordering flaw on its first run.

### And the staff

`CHARGED_FORMS` and `chargedForm()` had been exported since round 14 and called
by nobody — six forms written down, zero reachable, so a full charge was the same
spell at 1.6x damage. All six are branches now: jet, dome (shoved through
`e.push`, so it resists by rank the way a hammer does), wall, field, mortar and
storm. A javelin's `carried: 6` was read by nobody too; it runs out now, and the
ones you threw stick in the ground to be picked back up.

---

# Round 16 — the play-test list of 2026-09-21

Seventeen items, from the user's own session notes. What follows is what each one turned out to be,
because in more than half of them the reported symptom was not the bug.

## The short version

| # | Reported | What it actually was |
|---|---|---|
| 1 | "the Gibbet marker stayed after I used it, and there was no model there" | **Two landmark systems that had never been introduced.** `js/territory.js` invents a few landmarks per zone with state, a save slot and *no geometry*; `js/sites.js` builds the set pieces you can see, with **numeric** ids. `atLandmark` looked a mark up by id — so a set piece never matched, paid nothing ever, and a `solve: true` one dead-ended with E doing literally nothing. The marker stayed because `state` only reached `'done'` when *work* finished, and a gibbet has none. |
| 2 | "'Somebody in a cage' — no person, nothing to interact with" | Exactly right. `js/encounters.js` was proud of owning no meshes, so a rescue was four idle guards in a field. **And** events closed at 520 m while their bodies despawned at 300, so in that band a rescue **won itself** and dropped a gilded bag on empty grass. |
| 3 | "a wall on the road with no gate" | The gate scan looked at road **sample points** for one landing inside a 19 m annulus on the wall ring. Samples are 45–128 m apart, so it found none and fell through to "put a gate at a random bearing". |
| 4 | "road clipping into water; water lower on one side" | `heightAt` re-imposed the road deck as a 12 m **earth plug** across the channel. And `waterRibbon` widened each bank independently until it hit ground, so a raised road stopped one side at 6 m while the other ran to 32. |
| 5 | "the raft tilts and the character leans back" | Two things. The hull is symmetric; the **rotation order** was `XYZ`, which puts yaw in the middle, so "lift the bow" became a diagonal roll on any heading but north — pinned at its clamp, because a raft does 11.3 m/s. And he was not sitting, he was **swimming**: a boat leaves you `control.swimming`, and that clip tips the root back 64° on purpose. |
| 6 | "the horse stutters" | `createCreature().setAnim` reset its clock **on every call**, and the game calls it once a frame. Every beast in the game was frozen on the first 16 ms of its gait. The humanoid rig has had the guard since it was written. |
| 7 | "the health bar is almost never accurate" | It asked `field.target()` — a 2D yaw score from the player's **feet**, no pitch, no line of sight. `aim()` has done a proper 3D hitscan down the crosshair since round 4 and the bar never read it. |
| 8 | "ranged characters can't harvest" | The tool tier was **a regular expression on the weapon's name**. A bow is made of yew, so an archer was bare-handed at every seam in the game — and the refusal ("you need a Steel Tool") pointed at a slot that did not exist. |
| 9 | "meteors before I can mine one" | A crater seam is hardness 2. The fall also filed a quest and a map pin, so the early game pinned a thirty-second sprint to a rock you could not touch. |
| 12 | "each JS file takes 2–5 seconds over wifi" | Not the wifi. The dev server spoke **HTTP/1.0**, so all 190 modules got their own TCP connection — and turning keep-alive on exposed a Nagle/delayed-ACK stall that added 40 ms to every single response. |
| 14 | "add four corner quadrants" | Done — and doing it turned up `thorns: 6` on a wildcard node where the code reads a **fraction** (a 600% reflect), and `goldFind`, which is on the sheet, on an affix, on a perk, and multiplied by **nothing**. |
| 16 | "drills on their own menu, manufacturing needs work" | The split was a data change. The interesting part was that routing the player's effort through `js/work.js` revealed that labour was only paid when a **whole order finished** — two minutes of cold furnace, then a lump sum. |
| 17 | "javelins cost nothing — I don't want ammo" | Round 15's own feature, removed. The 9-fuel launch was `launch 6 + a held-back landing 3`. |

## The theme, again

Eight of the seventeen were **a finished thing with no way in**, which is now this project's signature
fault and the reason it keeps being worth writing down:

* `gives.namesFoe` threw `rng is not a function` on the line that names a foe — unreachable for the
  whole life of the game, because a set-piece landmark could not pay out at all. Fixing item 1 made
  it reachable and it fell over within a minute.
* `reward.extras` had been built out of `data/job-frames.json` since the day `jobgen.js` was written
  and read by nobody: four frames promised a perk point, an opened dungeon, a revealed zone and a
  branded weapon, and paid none of them.
* `m.enabled` is checked in three places in `js/refine.js` and nothing has ever set it.
* `works.queue(id, recipe, count)` has always taken a count, and `count <= 0` has always meant "keep
  going". The panel only ever sent `1`.
* `WorkBoard.toJSON` wrote its orders and the constructor read only `now` — every load emptied it.
* `js/water-plan.js`'s `roadDeck` carried a "NOT WIRED YET" header. It is wired now.
* `BUILDING_INFO.bridge.solid` was `[0, 0]` — a bridge filed no collider at all, and you only walked
  on one because of the earth plug that was damming the river.
* `meteor_site` seams and `deep_vein` before them: a rule written into the data and read by nobody.

## What is new

**`js/tools.js` + `data/tools.json`** — a Tool is an item in a slot of its own, built rather than
inferred, carrying a `toolKey` that is a row in `data/resources.json`'s existing tool table, so every
hardness gate and refusal line in the game reads exactly what it read before. One tool is pick *and*
axe. Rarity is speed, yield, reach and scan range. The mouse wheel turns a ring of *what you own* —
weapon, tool, scanner, rod — and a mode with nothing behind it is not in it. You start with a Knapped
Tool, because it costs timber and fibre and both come off things the game files as tier 1: the
cheapest tool in the game was behind a tool.

**Gathering is a bar.** `createGathering` is deliberately generic — a point, a clock, a payout and a
cancel rule — which is what lets a seam, a tree and a manufacturing bench all use it. `E` **or** the
attack button with the tool out starts one, which is the half that lets an archer gather at all.

**The scanner** sweeps short and remembers for ever: what it finds becomes a marker, so it is on the
map, in the Find tab, and in the save. While it is running the map and minimap show **only** deposits,
each wearing its material's name.

**`js/eventprops.js`** — a small disposable set of meshes an event can put down and take away, built
from `js/sites.js`'s own `PIECES`. Every one of the 22 events (up from 11) now has a `dressing`, and a
rescue has a `captive`: a real body inside the cage who tells you why they are in it.

**`data/instances.json`** — twenty instanced places, each a mouth on the surface and a parameterised
interior: a cave, an abandoned farmstead, a flooded cistern, a sealed vault, a dragon's lair. They
reuse the dungeon machinery whole; what is new is that `createDungeon` takes a `shape`, a `nodeId` and
what the place `holds`.

**`js/population.js`, `js/command.js`, `js/townhall.js`** — houses are a population cap, the Town Hall
in every settlement of size three or more is a door you can open, and the Command Rod is the first
thing in this game that lets the player give an order.

**`js/questrewards.js`** — one function pays a quest out, whatever kind it is, and all four paths go
through it. Five reward kinds, including picking one of three rare-or-better items.

**The title screen** is four screens: menu, load, character (with a live figure and an appearance
editor built on avatar-2d's catalogue) and world (with the real planet drawn in a Web Worker).

## Two traps worth keeping

**Temporal dead zones, twice.** `createCommand({ colony, build })` reads its arguments eagerly and
both are `const`s declared further down; `node --check` cannot see it, because a TDZ is perfectly
good syntax. The rod takes accessor functions now — which it needed anyway, since `folk` is rebuilt
from scratch every time you land on a new world.

**A `modulepreload` tag says "this is a JavaScript module".** The generator emitted six for `.json`
files it had found behind dynamic imports, and the browser refused each one with a console error —
enough to fail every spec that asserts a clean console, with nothing whatever wrong with the page.

## Round 17 — the interface, the keys, and what the lead agent joined up

The round's own write-ups are the five sections below this one, one per cluster. This is the part
that belongs to no cluster: the shared files (`js/main.js`, `js/hud.js`, `style.css`,
`index.html`), every handoff patch applied, and the four reports that were nobody's system in
particular.

**"[object HTMLElement]" over the weapon name.** `el(tag, cls, text)` takes three arguments and
sets the third with `textContent`. The held-mode ring was calling
`el('div', 'hm-ring', ...modes.map(m => el('i', …)))`, so the FIRST pip element was stringified
into the ring's text — which is what "[object HTMLElement]" is — and every pip after it was dropped
on the floor. The ring is built by appending now.

**…and it stayed up over the open inventory.** `hud.tick` is the only thing that asks the readout
whether it should be on screen, and `tick()` returns early the moment any panel opens
(`if (uiPaused()) { input.sample(); return; }`), so the last thing drawn before the inventory came
up stayed drawn on top of it. One `hud.refreshHeld()` in that early-return branch covers the sheet,
the map, a conversation, the settings and the pause menu, because all five come through
`panelOpen()`.

**The title tagline.** Centred as TEXT, inside a 560px box with no auto side margins, inside a
1040px panel — so the words were centred in a box that was itself shoved to the left.
`margin-inline: auto`. `text-align` was never the problem.

**Mount 1.6 m/s vs Ride 8.6 m/s.** A mount's `speed` is a MULTIPLIER on the walk (the Trail Horse is
1.6×) and `toolFunction` was stamping "m/s" on the end of it; the Ride row multiplies by the walk
speed and gets the real 8.6. Both read the Ride row's own option now, so they cannot drift again.
The ship dropdown was a blank box because `owned.ship` is `[]` by design — it says **(None)**.

**THE KEYS, which had two owners.** `js/settings.js` had the `log` action on **KeyK** while
`js/main.js` had the Holding hard-coded on **KeyK** and had never put it in the binding table — so
one press ran both, the Holding got the cursor, and rebinding could not separate them. `torch` had
taken KeyL, so the key the title screen still advertised for the log did nothing at all. On top of
that `js/hud.js` was listening for a raw `KeyK` of its own, which is how a second owner got in
without the table ever knowing.

Every key goes through `settings.BINDINGS` now. The Holding, build mode and the Followers screen are
real rows (all three were hard-coded and unrebindable); the log has **no default key**, because it
is the eighth tab of the character sheet, which is what was asked for. **L stays the light**, on
foot and in the ship, because that is what round 15 asked for.

The rule, rather than the instance: `tests/round17-ui.test.js` fails if any `e.code === 'KeyX'` in
js/main.js is absent from `BINDINGS`. It caught KeyB and KeyF within a minute of being written.

**The log and the Holding are tabs.** Both were full-window overlays on keys of their own that knew
nothing about each other or about the pointer lock — which is the whole of *"it does not free up the
cursor so I have to press ESC afterwards"* and *"it also opens the combat log though it shows up
behind the window"*. As tabs they inherit one Esc, one close button, one cursor hand-off and one set
of number keys. `js/civics-ui.js` gained `embedded`, which drops its fixed positioning and its own
close button and changes nothing else.

**The rail numbers itself.** Round 17 added four tabs (Log, Holding, Research, Followers). A
hand-numbered keycap in the markup is how a rail ends up saying "7" twice, so `numberRail()` stamps
the digits from `SCREENS` order, hides any tab nothing has mounted, and renumbers what is left.
`hud.mount(tab, screen)` is the one door the three external screens come through — js/hud.js never
imports any of them.

**Shops and jobs on the minimap** now appear inside 70 m (`MINIMAP_NEAR`), which is about 230 feet
and roughly where an enemy pip starts. A mark opts in by carrying `near`; a stronghold, a meteor and
a dungeon mouth are destinations and stay visible at any range.

**Resource amounts print with one decimal.** The amount STAYS a float — a gather pays
`base * toolYield * richness` and rounding the store would lose material a grain at a time — but
`shared/format.js` gained `mat()` and all five places that turn a quantity into words go through it:
`craft.costText`, `buildplan.costText`, the build catalogue's price line, a station's recipe list
and the material chips. A test walks them by source rather than trusting five separate fixes.

**The town was still in the river.** The worldgen cluster stopped every individual thing a town
builds from standing in water, and left the harder half: at Feafungate the map NODE is eighteen
metres down under five metres of river, so 41% of the ground inside the town ring was water and the
builder was simply dropping sixteen of the hundred and thirty-nine things it wanted to put down.
Nothing looked broken any more — there was just a hole where half a town should be.

The CELL does not move (roads are routed to it, and `js/map.js`, `js/quests.js`, `js/markers.js` and
`js/waypoints.js` each derive their own metres from it). The ANCHOR does, by less than a cell, which
is under the precision of all of them: `settlementAnchor()` in `js/town-plan.js` scores candidates
by how much of the town's own ring would be dry and takes the first strictly better one on a fixed
spiral, so a town is in the same place every time you come back. **41% underwater → 8%, and the
centre stands dry.** A town that is already fine (85% dry) is not touched at all.

**And the cheapest test in the round.** Moving `settlementAnchor` into js/town-plan.js and
forgetting to widen js/features.js's import of that file took the whole game down. `node --check`
cannot see it — the name is legal, it is simply never bound — and no node test can either, because
js/features.js imports Three.js. `tests/round17-ui.spec.js` now just loads the game and asserts the
console said nothing red. This round added nine modules and touched eleven files; that is the only
thing that covers the class.

## Round 17 — onboarding

> *"Let's add a brief onboarding quest line that holds the hand of the player and guides them
> through accepting a quest at the starter town, harvesting basic resources, and starting a basic
> base. This quest should require you to get enough resources to build the necessary stuff required
> to smelt iron ore."*

### The gap it fills, which is not the one round 10 filled

Round 10's review found that *"the game never said what to do"*, and the answer was the tracked
objective line under the health bars. That line has always said **where** something is. It has never
once said **what to press** — and the first ten minutes of Farhold are nothing but keys nobody has
been told about: `E` on a tree, `B` for the build panel, `E` on a furnace, `M` for the map's Find
tab. `js/nextstep.js` writes those sentences already and has since round 15, and every one of them
is inside the build panel, which a player who does not know `B` exists will never open.

So this is the same sentences, on the line the player is already reading, in order, paying out as it
goes.

### The line — `data/onboarding.json`, `js/onboarding.js`

Five steps, because "brief" was the ask and a tutorial you cannot see the end of is one people turn
off. It is **one** quest in the log rather than five, because five rows in the journal for the first
ten minutes is a journal nobody opens again.

| # | Step | What the strip says | How it notices it is finished |
|---|---|---|---|
| 1 | Take the job | `E to talk · take the job` | the act of accepting |
| 2 | Cut timber and break stone | `E on a tree, then on a boulder` | 8 log and 20 stone, anywhere — bag or pool |
| 3 | Put a crate on the ground | `B for build · Storage` | a store is standing **and** a storage pool has formed |
| 4 | Dig clay and raise a furnace | `B for build · Refining` | a `furnace` is standing |
| 5 | Smelt your first iron | `E on an ore seam, then E on the Furnace` | one `iron_ingot` exists |

The numbers in step 2 are not invented: 20 stone is exactly what a Campfire and a Furnace cost
between them in `data/structures.json`, and `tests/round17-onboarding.test.js` §2.1 asserts the
gather step asks for at least what the rest of the line goes on to spend — so if somebody makes a
furnace dearer, the test says the tutorial is now under-collecting rather than the player finding
out the hard way.

The line deliberately does **not** require a campfire. `data/refining.json` lets a furnace burn
plain logs, so demanding one would be a step you could skip, and a tutorial that asks for something
optional teaches people to ignore it.

### Every way in, written down

This project's signature fault is a finished module with no way in — twelve of them in round 11
alone — so each join is named:

* **offered** — `js/quests.js` gained `setFirstJob`. `makeQuest` asks it before it rolls anything,
  and `js/town.js`'s `questFrom` is the only door a settlement's work comes through and calls
  `makeQuest` six times. So whoever in the starter town gives out work offers this first, through
  the talk screen that already exists. **`js/town.js` is untouched.**
* **in the log** — the ordinary `accept:` handler. It saves, loads, appears in the journal and
  turns in like any other job, because it *is* one.
* **on the HUD** — `onboard.objective()`, from main.js's own `objective:` provider. Before the job
  is taken it points at the town and says how far; after, it is the step; when the line is over it
  returns `null` and the strip goes straight back to the marker book.
* **advancing** — `onboard.tick(dt)`, one call in the frame loop, throttled to twice a second.
* **spoken** — `js/questhelp.js` gained an `onboard` case, so the frame loop's existing helper says
  the step out loud when it changes. Its `away` is `Infinity` on purpose: `helpersNear` sorts on it,
  so a real destination you are standing on always wins and the tutorial never elbows out "the door
  is the way in".
* **paid** — `js/questrewards.js` `grantReward`, injected. There is no second payer. Steps 1–4 pay
  small coin and experience on the spot; step 5 sets `quest.done` and the quest's own reward (a
  crate) is paid by the ordinary turn-in.

### Two decisions worth keeping

**It is not a `STARTED_KIND`.** A raid and a meteor pay themselves because there is nobody to walk
back to. This has a giver, and `js/town.js` caches `npc.offered` — only the turn-in path clears it.
A line that paid itself in a field would leave the one person who helped you with nothing else to
say for the rest of the run.

**The step writes itself onto the quest.** `stepName` and `stepHud` are copied onto the quest object
each time it advances. That is denormalised on purpose: `js/questhelp.js` is pure and has never been
handed a data file, and giving it one so it could look a step up would mean every caller of
`helperFor` — the frame loop and four test files — learning about onboarding. A quest that can
describe itself needs none of that, and it survives the save for free.

### Nothing can send you to an empty field

`js/jobgen.js`'s rule is *"nothing is invented, so nothing can send you to an empty field"*, and it
matters most in a tutorial, because the tutorial is the one part of the game a player has no way to
second-guess. Two other agents were re-cutting the early crafting chain in this same round, so
`resolveTargets()` checks every id the line names against the file that would have to contain it —
`storage_crate`/`storage_box` and `furnace` against `data/structures.json`, `smelt_iron` and
`iron_ingot` against `data/refining.json`, `log`/`stone`/`tree`/`boulder` against
`data/resources.json` — and against the recipe's own `machine`, so the line cannot build one thing
and smelt at another.

A problem fails `tests/round17-onboarding.test.js` loudly; at runtime it logs the problem and **turns
the whole line off**. A broken tutorial must never be the reason somebody cannot play.

### Ignorable, by construction

There is no decline button in the talk screen's job card (`js/talkui.js` draws only "Take the job"),
so declining is walking away — which means the gates have to carry the whole weight of "do not nag
me". It is never offered to a character above level 6, never to a save with an iron ingot in it,
never to one with anything at all already standing, and never again once taken or finished. Not
taking it blocks nothing: the test builds the entire base and smelts an ingot with the line sitting
unoffered, and nothing is paid, nothing is logged and nothing is added.

### Research

Each finished step calls `research.award('onboarding:<step>', n)` — 1, 1, 2, 2, 4, ten for the line.
The module is found either as an injected option or as `window.farhold.research` at award time, and
the call is wrapped: until the research system lands, a missing module is silence rather than a
thrown error in the middle of the frame loop.

### Files

`data/onboarding.json` (new), `js/onboarding.js` (new), `js/quests.js` (`setFirstJob`,
`ONBOARD_KIND`, the `onboard` progress row), `js/questhelp.js` (the `onboard` case), `js/nextstep.js`
(a note saying how the two differ), `tests/round17-onboarding.test.js` (new, 22 checks).
The five lines `js/main.js` needs are written out in `research/round17-quest-handoff.md`.

## Round 17 — the map

Six items, and five of them turned out to be one sentence each about something that was **already
drawn and being asked about wrongly**. Nothing on this list was a missing feature.

### Item 8 — the map must not move

> *"When you hover over the full screen planetary map a bar appears with your hover tooltip. Can
> that bars space be reserved so that the map doesn't shift position and size when you hover? Also
> when I open the map the first time I click on the map canvas element the sides shrink in."*

There is no tooltip involved and there are not two bugs. The mousemove handler read

```js
readout.className = 'readout' + tone;
```

which **replaces** the class list rather than adding to it — so the first time the pointer crossed
the canvas, the strip under it lost `map-readout` (12px monospace, `min-height: 18px`) and `small`.
`.readout` is a class style.css has never defined, so the strip fell back to the body font and its
reserved height went with it.

That is the whole of it, both halves. The strip shares a column flex with the canvas, the canvas is
`flex: 1` in that column, and `viewBox()` fits the entire planet into whatever height the canvas
ends up with — so a strip that grew by a few pixels took them out of the map and the map redrew
**smaller**, its left and right edges moving inward. "The sides shrink in", exactly; it happened on
the first pointer move rather than on the click, which is why it read as a click.

Two fixes, because either alone leaves the trap set. The class list is added to, and `map17.css`
(new, injected by `js/map.js` the way `js/civics-ui.js` injects `civics.css`, so neither style.css
nor index.html is touched) turns `.map-canvas-wrap` into a **grid** whose legend and readout rows
are a fixed height and whose readout is `nowrap` — nothing written into them can resize the map
again, at any window width.

### Item 9 — the hit-test was the reverse of the paint order

> *"There is only a few pixels at the top-left of the icon that give me the correct World Boss
> tooltip."*

Nothing was offset. `drawPlaces()` sorts its marks smallest-last so a capital is never hidden under
the hamlet beside it — which puts the world boss, first in `MARK_ORDER` and therefore painted on
top, at the very **end** of the hit list — and the hover then walked that list forwards and took the
first circle containing the pointer:

```js
for (const h of placeHits) if (near(h.x, h.y, h.r)) { hover = …; break; }
```

So whatever was painted **underneath** won every overlap. An ancient wood a short way off had its
hit circle over most of the burst, and the only pixels left for the boss were the ones outside that
circle: the sliver at the top-left.

Two more faults were tangled into it. Places and pads were separate lists consulted in a fixed
order, so a pad under a landmark could never be pointed at. And the marker branch destructured
`{ scale, ox, oy }` out of `viewBox()`, which returns `offsetX`/`offsetY` — every marker's screen
position was `NaN`, so **a marker could not be hovered at all**, in any circumstance, since R14.
Separately the hit radius was written in backing-buffer pixels (`Math.max(9, …)`), which is four and
a half real pixels on a retina display: every target on the map silently changed size with the
machine.

`js/map-hits.js` (new, pure, node-tested) is the rule: one list in paint order, and **the mark whose
centre is nearest the pointer wins**, ties going to whatever was painted last. Ground is never in
the list, so an icon always beats the terrain under it. The hover card now shows the icon itself
beside the name, drawn by `markSwatch()` → `drawMark()` — the same function that put it on the map,
so a swatch cannot go stale.

### Item 10 — the roads and rivers were buried, not removed

`renderWorld()` draws the world image and then strokes the rivers and roads on top as vectors.
`drawDetail()` calls it for the ground underneath and then paints the opaque region-detail raster
over the lot — so the moment the zoom crossed `DETAIL_FROM` every river and road on screen was
covered by a sharper picture of the same ground with no water and no roads in it, and the detailed
map was harder to navigate than the blurry one it replaced.

`drawWays()` re-draws them on top, from two sources: the world's own rivers, sea lanes and roads,
which carry on past a region border and are what a route is planned along; and each detail's own
`streams` and `paths` — the same drainage model run six times finer, generated since R14 and never
once drawn. So zooming in now adds tributaries rather than fattening the same blue line. Both obey
the `rivers` and `roads` layer chips, which at these zooms had been doing nothing.

### Item 11 — one place, one marker

> *"the markers for ore is confusing. It shows a star icon to the top-left and a green circle to the
> bottom-right. It is not clear which of these is the actual location of the ore."*

Half of that was the drawing: a favourite's star was painted at `px - r*1.5, py - r*1.5`, with a
comment explaining that this was so it "never sits on the glyph it belongs to" — which is precisely
the problem. Two sprites a dozen pixels apart, neither labelled, and the one that catches the eye is
the one that is **not** where the ore is. A favourite is a gold rim around the marker's own disc now
(`drawMarkerDot`), and the key says so.

The other half was real duplication: `MarkerBook.save()` de-duplicated only against
`kind === 'saved'`, so a deposit could carry a `seam` marker from the scanner **and** a `saved`
marker from the Keep button, one cell apart. It absorbs any co-located `saved`/`seam`/`pin` now, so
favouriting a tracked deposit stars the marker that is there rather than laying a second one on it.

And the Find tab's favourite state was worked out by rounding a row's **metres** and looking the
string up in a set built from marker **cells** multiplied back into metres — which agreed only by
coincidence — with no un-star anywhere at all. Both questions are asked of the marker standing on
that ground now, so there is one answer and it toggles from either end.

The tabs are re-cut to match what the user actually asked for:

* **Places** → a **Selected** group (what you last clicked, named from the same hit list the
  tooltip uses, with **Add to Favorites**), **Favorites** (was "Places you keep"), **Places**, and
  **Waypoints** with a star and the two switches on each lit pad.
* **Find** → the sweep and the survey as before, each row with a two-way ★ and a new ◈ that
  **tracks** a deposit, plus a persistent **Tracked Resources** list. A tracked resource *is* a
  `seam` marker — that is the whole implementation, which is why "persistent until you untrack it"
  came free rather than as a second list to remember to put in the save.

### Item 19 — favourited and tracked were two checkboxes and only one reached the minimap

Every marker now carries `showOnMap` and `showInWorld`, saved, defaulting to on — and an **absent**
switch reads as on, so one patch cannot blank every marker in every existing run. `book.minimap()`
is tracked **or** starred, minus anything switched off, which is the bug: the minimap was fed
`tracked()` and starring something does not track it. Waypoint pads get the same three switches in
`js/waypoints.js`, stored as deltas keyed by pad id so a world with sixty settlements costs nothing
until you star one — and pad `0` is deliberately in the test, because a settlement id is a number
and the first one is 0.

### Item 20 — an outpost is a place on the map

`js/outposts.js` knew what an outpost was, `js/markers.js` knew how to put something on a map and on
a minimap and in space, and **nothing joined them** — this project's signature fault, for the
fourteenth time. So the base you spent an hour building was the one thing on the planet you could
not navigate back to.

`syncOutpostMarkers()` makes the join, from `draw()`, because that is the file that already has both
ends of it. The marker is `locked`, and the lock is enforced in `MarkerBook.remove()` rather than by
hiding the × — a hidden button is a rule nothing checks — with a `force` flag for the one caller
that owns it, which deletes the marker when the ledger stops mentioning the outpost. It is
renameable inline, and `renamed` is recorded, because without it the next sync (every draw) would
write "Mine 3" back over "Ironrest" a quarter of a second after you typed it. It wears its role's
colour and glyph, and the supply layer stops drawing its own disc where a marker book exists — two
discs and two copies of the name on one pixel is item 11's complaint made again.

### Files

`js/map.js`, `js/markers.js`, `js/waypoints.js`, `js/outposts.js`, new `js/map-hits.js`, new
`map17.css`, new `tests/round17-map.test.js` (16 checks). `tests/round11-ui.spec.js` asserts the
number of rows in the key, which went 37 → 38 with the outpost row. The four joins `js/main.js` and
`js/hud.js` need — the minimap feed, the star on a minimap favourite, the whole waypoint book, and
the world-beacon consumer for `showInWorld` — are written out in
`research/round17-map-handoff.md`.

## Round 17 — the custom class, followers and mercenaries

> *"I've been thinking it would be really cool to build a custom class in this game… We can extract
> all the existing classes into a spell tier list and allow choosing spells… You should be able to
> unlearn a skill at any time… If you have 5 follower slots and hire 4 mercenaries, you can only
> summon one wolf."*

The full write-up is **[`CLASSES.md`](CLASSES.md)** — the builder, the tier list format, the follower
rules and the mercenary data format. This is the short version and the three things worth keeping.

**A custom class is a CLASS.** The title screen's picker has a thirty-first entry at the top —
*"Custom — build your own class"* — and choosing it turns the class card into a build summary with
an **Open the builder** button. The builder is four tabs: Loadout (eighteen of them), Spells (the
point-buy), Opening (a companion or a sealed chest) and Look. When it is done,
`installCustomClass()` writes a synthetic entry into the three data objects `main.js` has already
loaded: a class called `custom` in `classData.classes`, the six chosen spell ids in slot order in
`skillData.classes.custom`, and a body in `classLooks.classes.custom`.

Everything downstream then works with **no change at all** — `classData.classes.find(...)` finds it,
`createSkillBar` reads `data.classes[player.classId]`, `classDef.pet` summons the companion,
`classDef.starter` and `classDef.startingArmour` equip the loadout. There is not one "if the class
is custom" branch in the game. The alternative was a dozen of them, in files this round did not own.

**The spell tier list is derived, not generated.** `data/classes.json` and `data/skills.json`
already say which class gets which skill and at what level. A committed `spells.json` would have
been a third statement of the same fact — right on the day it was generated and silently wrong the
first time somebody added a skill to a class, with nothing failing, because a tier list missing a
spell just quietly does not offer it. A spell's tier is the **earliest** level any of the thirty
hands it out on; the six rungs ARE `skills.json`'s own `unlockAt`, and `data/classbuild.json`'s copy
of the levels is compared against it at load and **throws** if the two disagree.

**The Kept Company grants a LIMIT now, not a count.** Round 16 had the green arm granting
`petSlots`, which `js/skills.js` added to `petCount` — how many bodies one *cast* puts down. So
casting Raise Thrall three times gave you nine thralls, because nothing anywhere counted what was
already standing there. The arm grants `followerSlots`, which raises two numbers: how many things
may walk with you at all, and how many of each creature a summoning spell may have standing.
`The Pack`, the keystone at the end of the same arm, gives two of each.

### The rule that made the whole thing one system

Three completely separate things summon a body: a summoning skill in `js/main.js`, a hire in
`js/followers.js`, and the class companion at the start of a run. A limit checked at the call sites
is a limit with three copies and three chances to be missed, which is this project's signature fault
written out as an architecture. So the gate is installed **on `js/pets.js`** — `pets.setGate` — and
`pets.summon` is the one door every one of them goes through.

That is the whole of the user's sentence, as a test:

> *"If you have 5 follower slots and hire 4 mercenaries, you can only summon one wolf."*

Five slots is level 30 with no perks. Four contracts fill four of them. The fifth admits exactly one
wolf, and the second wolf is refused with *"You have 5 of 5 follower slots filled."* It is also why
a cast that cannot fit everything it asked for **puts down what it can and stops** rather than
refusing the whole thing — `pets.summon` leaves the reason on the returned array as `made.refused`.

### What a player notices

* **F opens your company.** Three tabs: who follows you (with a dismiss on everything that can be
  dismissed, and a slot strip that makes "three of five" a picture rather than a sentence), the
  mercenary board in whatever settlement you are standing in, and the **spell respec** — because
  *"at any time"* has to mean in a field at level 22 and not only on the title screen.
* **Three follower slots at level 1, four at 20, five at 30**, plus the perk arm. A class companion,
  a bought mercenary and a summoned wolf all take one of the same slots.
* **Ten kinds of mercenary** over four roles, each with its own spells on its own cooldowns, its own
  body, and upgrades it grows into — a Blade for Hire trades up to a longsword at 10, learns to open
  a guard at 20 and buys plate at 30; a Field Mender learns what to do when it has gone badly at 20.
  A broker's board is deterministic per settlement and restocks every few days.
* **The road captain sells one of the ten** rather than always the same sellsword. Which one is a
  hash of who they are, so the same person always sells the same thing.
* **Followers keep up with you, always.** Re-costed off the owner's level every frame, so a sentry
  summoned at level 1 is never still swinging for 1 at level 20 — and a mercenary hired at level 4
  and looked at again at 22 has already learned everything below 22, because the upgrades are read
  where a level change is *noticed* rather than at a level-up event that would have missed it.

### Two traps this round hit

**A weapon upgrade cannot be swapped on.** An avatar is baked into a merged skinned mesh at build
time, so `p.look.avatar.held.id = 'fh_longsword'` does nothing at all — the body has to be rebuilt.
`refit()` does it, guarded, because it is an `await` inside a frame: the follower keeps fighting with
the body it has until the new one is ready, and if it dies in the meantime the new actor is disposed
rather than left standing in the scene.

**An upgrade must multiply the BASE numbers, not the current ones.** `retune` runs every time the
owner's level changes; compounding a 1.16 damage bump on each pass would have a level-40 mercenary
hitting for thousands. `applyUpgrades` returns the cumulative multipliers and `scaleFollower` applies
them once, to the table's own numbers — which is also why that arithmetic lives in the (Three.js-free)
`js/followers.js` and has a test over it.

### Files and the handoff

`data/classbuild.json`, `data/mercenaries.json`, `js/classbuild.js`, `js/classbuild-ui.js` +
`classbuild.css`, `js/followers.js`, `js/followers-ui.js` + `followers.css`, and edits to
`js/pets.js`, `js/skills.js`, `js/perks.js`, `js/hire.js` and `js/newgame.js`. 25 tests in
`tests/round17-class.test.js`.

The eight joins `js/main.js` and `js/save.js` need — loading the two data files, handing them to the
title screen and to `begin`, the one-line opening-kit hook, creating the follower book before the
class companion is summoned, the Followers screen on `F`, routing the road hire through the book,
and carrying `build` and `followers` on the saved player — are written out in full, with anchors, in
**`research/round17-class-handoff.md`**, along with four optional tidy-ups (`js/rpg.js` declaring
`followerSlots`, `js/effects.js` restating the companion affix, a Mercenary Broker role in
`js/town.js`, and the screen as a character-sheet tab).

## Round 17 — weapons, tools and seams

Five reports, and **four of them were a join that had never been made** rather than an algorithm
that was wrong. That is now this project's signature fault for the fifth round running, and the
shape of it barely changes: two halves of a system exist, both finished, and the one line that
introduces them to each other was never written. A missing join is indistinguishable from a missing
feature from the player's chair, and much harder to find than a crash.

### Item 3 — the staff tooltip, the spell glyph, "Unmaking", and the charge that did nothing

> "The staff tooltip 'A two-handed staff, attuned to (element) … off hand stays empty' is repeated
> twice in the tooltip. It also appears to show a dot and a slash as the attack style like a melee
> weapon … Also it seems I can hold to charge the spell before releasing, does holding it actually
> do anything?"

Five separate faults under one report.

**The sentence was printed twice because two printers had the same string.** `describeWeapon` writes
`weaponFacts().line` onto the item as `item.weaponLine` and js/hud.js prints it; then, because a
staff is **not** `ranged` (only a wand is — `RANGED_CASTERS` in js/rpg.js has one entry), the card
fell into its `rangeClass === 'melee'` branch and printed `patternText(item)` underneath — and
`patternText` opened with `if (f.ranged || isStaff(item)) return f.line;`, the identical string.
Neither printer could know about the other. `patternText` now returns the one thing only it knows —
what the button does — and the melee branch had the same duplication (reach and clock in both
lines), so that went too.

**The dot and the slash were a melee fallback a staff has never used.** `patternGlyphs` walks
`profileOf(item).pattern`; a magic weapon has no pattern row, so it fell through to
`CATEGORY_PATTERNS.magic` = `['jab', 'slash']`, whose glyphs are `·` and `⟋`. The card was not
describing the staff at all. `js/spellshapes.js` is a nine-shape vocabulary — `nova`, `cone`,
`wave`, `lob`, `ground`, `chain`, `bolt`, `beam`, `self` — where **the glyph and the caption come
out of the same row**, so a staff cannot draw a cone and be captioned "area surrounding you". The
shapes key off the `shape` field `STAFF_SPELLS` entries already carried, so nothing had to be
invented; a wand gets `bolt`, because a wand's variety lives in `WAND_BEHAVIOURS` instead. Fixing
that turned up a smaller one of the same kind: `isWand()` is "magic and one-handed", which is a
wand, a sceptre, an orb AND a tome — but only a wand is made `ranged`, and js/main.js throws a bolt
only `if (weapon.castElement && weapon.ranged)`, so an orb is SWUNG. Those three get the `brand`
shape ("your swing carries it"), which is what actually happens, and they keep their rhythm row. The
glyphs are plain SVG with presentation attributes and `stroke="currentColor"` — no stylesheet, so
they work in an item card, a shop row or a tooltip without any of them loading anything.

**"Unmaking" is now "Arc Burst".** It was the name of the arcane nova and it described nothing:
"unmaking" is a mood, not a shape. `STAFF_SPELLS` is Farhold's own table — not in the shared
`data/items.json`, not in Emberveil — so the rename is local, and a save stores the spell's KEY, so
nobody's staff changed.

**And holding the staff genuinely did nothing.** The channel had a reader and no writer:
js/player.js builds `self.windCharge` on release and hands it out as `out.charge`; js/main.js never
reads `step.charge`; js/weapons.js `withArea` reads **`feel.swing.charge`**, which a grep shows is
assigned nowhere in the codebase. So `shape.charge` was permanently `undefined`, which took the
whole of round 15 with it: `chargedForm()` is gated on `shape.charge && !shape.charge.tap`, so the
jet, the dome, the wall, the field, the mortar and the storm — six charged forms and about 130 lines
of main.js — had **never once fired**, and the 0.60x–1.60x damage and 0.7x–2.0x radius were both
multiplied by one. `chargeAt()` is the one function both halves already call (every frame while the
button is down, and once more on release), so it posts the answer now and `withArea` consumes it —
for a two-handed magic weapon only, so a sword can never pick up a charge left lying on the channel.

**One input mode per weapon, in the data.** `WEAPON_TRAITS` carries `input: 'repeat' | 'charge'` and
`inputOf(item)` is the single answer. Repeat: hold the button and it swings, shoots or casts on its
clock, and nothing builds. Charge: hold and it BUILDS, let go and it goes off, and nothing swings on
a clock. Staves and drawn bows charge; crossbows, javelins, wands and every melee base repeat. A
charge weapon still releases itself at its own ceiling, which is the ceiling of one mode rather than
a second mode. A test asserts that `inputOf` and `rpg.swingPlan`'s own two tests (`isStaff()` and
`rangedPlan().kind`) can never disagree.

**And the ramp is visible at last, which needed a third fix nobody had reported.**
`hud.chargeMeter()` has built `<div class="charge-meter"><i></i></div>` on every frame the button is
held since round 15 — and `grep -rn charge-meter` across the whole project returned that one line
and nothing else. **There was no `.charge-meter` rule in any stylesheet.** An unstyled div has no
size and a width percentage on an inline `<i>` does nothing, so the bar has been running invisibly
for two rounds. `combat.css` is the four states (`short` / `ready` / `near` / `full`, named once in
`chargeState()` so the bar and the caption cannot disagree), with the full state glowing and pulsing
because a colour change on a 7 px bar is not an announcement. On the character's side,
`js/combat-fx.js` `channel()` grows a ring on the ground **at the radius the spell will actually
cover** and orbits one to three motes at the hands, going gold with a pop at the ceiling.

### Item 12 — the mega-trees you could not cut down

> "I found one of the new mega-trees … but was disappointed I could not cut it down. Could these
> trees be updated to be cut down and reward ~15 times more than a normal tree?"

One line. `standing` is the list `near`, `nearest`, `describe` and `strike` all read, and the
megaflora loop in js/props.js never pushed onto it — the line that files an ordinary tree as
hittable sits two hundred lines above the giant one. Everything else about a giant already worked.

`data/megaflora.json` now carries an explicit `wood: true` flag (explicit, because "hollow_snag" and
"crown_conifer" share no word and "crystal_spire" and "shelf_palm" both end in a plant) and a
`harvest` block beside the drops: fifteen times the ordinary tree of the same family **to the log**
(an Elder Broadleaf is 135 logs against a broadleaf's 9), one tool tier higher, a gather bar four to
seven times as long, and a regrowth clock measured in days rather than the six hours an ordinary
tree takes — a giant is a landmark and one that grew back over lunch would stop being one.

The eight giants that are not wood are on `standing` too, deliberately, each carrying a `why`
sentence: a giant that refuses **silently** is indistinguishable from the bug being fixed. The Clear
tool and the terrain brushes leave every giant alone, so levelling a building plot cannot make a
landmark vanish.

The bar length was its own small join. js/main.js works it out from two generic sizes
(`secondsFor('prop')` = 2.4 s) and could not know about a sixteen-second tree. Copying the number
into `data/tools.json` would be a second copy that drifts, so `js/harvestinfo.js` is a registry with
no dependencies at all that js/props.js writes and js/tools.js reads — the numbers stay beside the
drops, and the gather clock looks them up by the kind it parses out of the job id (`propKey`'s
format puts the kind in there exactly, which is a fact rather than a guess at a display name).

### Item 13 — a mining animation

> "Generate a mining animation to use when a tool is being used, to differentiate it from the
> attack animation."

Three of them, in `avatar-3d/js/chibi2-motion.js` on their own opt-in list (`CHIBI2_WORK_ANIMS`),
following the round-14 pattern exactly: `pickSwing` (both hands on a pick, overhead, driven straight
down with the body folding over the blow), `chopSwing` (an axe, diagonally across the body, the
chest turning into the wind-up) and `forage` (bent over a bush, hands low, alternating). All three
**loop**, so none is in `ONE_SHOTS`, and each is built to return to the neutral pose at both ends of
its cycle so the loop point is invisible.

`CHIBI2_ANIMS`, `CHIBI2_SWIM_ANIMS`, `CHIBI2_ALL_ANIMS`, `CHIBI2_COMBAT_ANIMS`, `CHIBI2_COMBAT_ALL`
and `CHIBI2_RIDE_ANIMS` are byte-for-byte what they were; only the composed `CHIBI2_COMBAT_RIDE` —
whose one importer in the whole playground is `prototypes/farhold/js/actors.js` — gained them.
Emberveil takes the default twelve and imports none of the opt-in lists, which a test asserts by
grepping its source.

Which clip plays is a property of the THING, not of the animation code — you chop a tree, you pick
at a rock, you stoop over a bush — so `work` is an explicit field on every `PROP_HARVEST` row and
every wood giant, published through the same registry as the bar length.

### Item 14 — the Scanner that was never in the mouse wheel

> "I asked for scrollwheel to reveal Weapon, Tool, Scanner, but I don't see the Scanner option."

**`heldModes()` was never wrong.** It has put `scanner` in the ring the moment
`player.devices.scanner` is true since round 16. Nothing could ever set it: `giveDevice` is only
called by `buildTool` in js/main.js, which refuses unless `canAfford`, and the Prospector's Scanner
costs `{ iron_ingot: 3, crystal: 1, wire: 2 }` — and **there is no material called `crystal`**. The
table in `data/resources.json` calls it `crystal_raw`. `have('crystal')` returned 0 for ever, the
Build button was permanently disabled, and the scanner could not be built by any honest route. Nor
could the Command Rod or the Powered Cutter, which are priced the same way.

This is exactly round 13's rule — **a cost you cannot obtain is not a price, it is a wall** — broken
again in a different file. It was fixed for `data/structures.json` by `alignCatalogue()` in
js/buildplan.js, and `data/tools.json` was never put through it because the tool bench was written
three rounds later. `priceRow()` in js/tools.js asks the **same** alias table (`crystal → crystal_raw`
was already in it) rather than keeping a second copy, and carries the catalogue's word along so the
panel still says "1 crystal" while the pool is charged `crystal_raw`. A test now walks every cost in
`data/tools.json` and fails on anything the game does not produce.

On top of that: **three scanner tiers** in data (Prospector's Scanner, Deep Scanner, Survey Array —
each reaching further, sweeping faster and, through `detects`, able to notice kinds of thing the one
below cannot), with the ring carrying **one** scanner, the best one you own, so building an upgrade
improves the thing you already use instead of adding a fourth entry to the wheel. And **right-click
opens a chooser** (`js/scanner-ui.js` + `scanner.css`, its own module and its own stylesheet, the
way `js/civics-ui.js` does it): the materials your survey has actually found, each a toggle, plus
"Everything" and "Forget survey". The list is built from what has been found rather than from the
whole seventy-row material table, because a chooser that offers you a material this world does not
have is the "sent to an empty field" failure the job generator was rewritten to avoid. Right-click
was completely unclaimed in Farhold — `grep contextmenu` and `grep 'button === 2'` over `js/`
returned nothing at all — so the panel takes it, and only while the scanner is the held mode.

### Item 26 — the resource graphics

> "It's a single color orange rock right now. Can we add some iron 'crystals' growing out of it and
> make it have a mix of regular rock texture and the ore texture … I did once find a plant fiber
> source that looked like a tiny cone-shaped tree."

`SHAPES` in js/ore-view.js was **one primitive per kind**, painted in the ORE's colour from tip to
base — so an iron outcrop was a solid orange rock, which is not a thing that exists in any ground
anywhere, and a fibre patch was a 1.2 m cone. The comment above the table said the shapes were
"deliberately low-poly and slightly wrong-looking", which is how a stand-in survives ten rounds.

Every kind is a merged composite in two material groups now: **group 0 is the host** (ordinary rock,
ordinary bark, ordinary sand, in the dull colour the surrounding ground already is) and **group 1 is
the seam** (the crystals growing out of the cracks, the wet clay in the scoop, the cut logs at the
foot of the tree). Two materials is still one InstancedMesh — the geometry carries two groups — so
a hundred outcrops is two draw calls, not two hundred.

Three things keep a seam reading as interactive from thirty metres, which is what the old flat glow
was doing and must not be lost. The **glow is concentrated**: emissive was 0.35 over the whole rock
and is now 0 on the host and 0.55 on the seam, so the same light comes off a fifth of the surface.
The **silhouette is wrong on purpose**: js/props.js scatters single round lumps and single trunks,
and every seam here has spikes, steps or a cluster standing off the host. And **nothing in props.js
has two colours meeting at an edge** — its props are one tint with a brightness wobble.

The specific two: an iron outcrop is broken grey rock with blades of ore leaning out of the seam
line, and a fibre patch is a clump of nine splayed blades and two pale seed heads over a low mound,
with nothing resembling a trunk. The node tree is a tree **with a felling notch and two bucked logs
at its foot**, which is a silhouette no scenery tree has. And three node kinds — `wreck`,
`camp_scrap` and `meteor_site` — had no row in `SHAPES` or `LOOKS` at all and had been drawing as
iron outcrops in the fallback brown; a crashed lander, an abandoned camp and a meteor crater were
three orange rocks. They have their own shapes now, and a test fails if a node kind ever loses one.

`tests/three-loader.mjs` is a small resolver hook that points the bare `three` specifier at the file
index.html's import map already points it at, so `node --test` **builds** all seventeen composites
and checks the groups rather than reading the table as text. That also caught the trap js/props.js
documented in round 16: `toNonIndexed()` hands back the same object when a geometry is already
non-indexed, so a shared base transformed in place puts the next part at coordinates in the
thousands — the test asserts every vertex is inside a ten-metre box.

### Tests

`tests/round17-combat.test.js`, 34 of them. The shape of most is not "does this compute correctly"
but "do these two halves of the game agree", because that is where four of the five bugs were.

`tests/three-loader.mjs` is new and is worth reusing: it maps the bare `three` specifier to the file
index.html's import map already names, so `node --test` can drive any module that draws something.
Three.js only touches WebGL when you make a renderer; a `BufferGeometry` is arithmetic.

### Found on the way past, not fixed (not ours this round)

`js/rpg.js` `attuneWeapon` undoes its own quarterstaff fix. It sets `weaponCategory = 'light'` and
`castElement = null`, and then two lines later `if (CASTERS.has(sub) && !item.castElement)` fires —
because `sub` is the SUBTYPE, and items.json files a quarterstaff's subtype as `staff`, which is in
`CASTERS`. So every quarterstaff is re-attuned, gets an element affix and is renamed "Storm Staff".
`isStaff()` still says no (it checks `weaponCategory`), so it swings as a pole and no free area spell
comes back — but `elementOf()` returns the element, so a quarterstaff's hits go through magic resist
and leave a status. Cosmetic plus one small gameplay leak, in a file this round does not own.

## Round 17 — worldgen

Three reports, one coordinate. *"At the location (seed 56138, Chodikvraun III, biome Grassland,
x 11572, z 2995, altitude 24) the center of the town has a bunch of stuff semi-underwater. The water
does not touch the shoreline. There is a tower inside of the bridge. And the bridge only connects to
one side of the road (I think the road just stops)"*; *"the river collides with a road here and
messes with the water, can we make sure crossings like this generated raised bridges instead"*; and
*"try to prevent spawning Clay and other resources directly on the road."*

### The world the user was standing on

Finding it was the first job, and worth writing down: **a world position means nothing without the
planet-size knob.** A metre is `M_PER_CELL_DEFAULT * planetScale` of a map cell, so x 11572 z 2995 on
seed 56138 is Grassland at 21 m with a town seventeen metres away on **Super tiny** (0.1) — and Sea
Ice 1,178 m under the ocean on Full. The report said Grassland and altitude 24, so 0.1 is the world.
`tools/probe-worldgen.mjs` builds it exactly — same seed search, same map size, same `balance.terrain`
knobs — runs the real town planner over the real ground, and prints a number for every claim in the
report. It is kept; `--seed`, `--planet`, `--x`, `--z`, `--scale` and `--ore` point it anywhere.

The town at that spot is **Feafungate**, and the probe's first line explains the whole of item 4:
its map node sits in the middle of a river channel, 5.4 m under the water, with 57% of the ground
inside its ring under the surface.

### Item 6 — three separate reasons a crossing was not a bridge

`findCrossings` had to agree that a road was over a river before `heightAt` would leave the channel
open; where it did not, the deck clamp raised the ground to meet the road, which is the earth plug
the user saw. Twenty-four of the fifty-nine road samples sitting over water around Feafungate had no
bridge, and they failed for three different reasons.

**The lift was sampled at the road's corners, not walked along it.** `lift[i]` asked the river index
about each road POINT and nothing in between. A road point is a fifth of a map cell — 12.8 m on the
smallest planet and 128 m on the largest — and the deck between two points is a straight
interpolation, so a river passing between two points got a lift at neither of them and the deck ran
through the water. It is the same blind spot round 16's `ringCrossings` fixed for town gates: a
question asked of a polyline's samples instead of of the polyline. Each leg is now walked every four
metres and the WORST water on it charged to both of its ends, which is what makes the straight line
between them clear it too. The lake and sea floors are walked the same way.

**The junction pass pulled finished bridges back into the river.** *"A junction is one height, not
two"* lowers the last six points of a merged road onto its trunk's height, and it had no idea what
those points were standing over. Road 8's crossing came out 1.37 m over the water where the lift had
put it 2.40 — under the clearance `findCrossings` demands — so no crossing was recorded and the
ground was plugged instead. Road 12 lost 1.19 m the same way. Every road point now carries `floor`,
the water it may never go under, written before the junction pass and applied after it, with the
approaches ramped back up to it.

Worth keeping: **it is the RESTORATION that ramps, not the road.** The first version of that fix
ramped `surface` itself, the way the lift pass appears to — but the lift ramps a DELTA that is zero
nearly everywhere, and ramping an absolute height says "a road may never descend more than half a
metre between two points", which on a full-sized planet is two points 128 m apart. Seed 7's road 4
came down off a pass, so its 140 m descent was flattened into a 140 m viaduct and the deck clamp
built the embankment under it. `planet.test.js`'s *"a lifted road is something you can stand on"*
caught it within a minute.

**And the angle was a veto it had no business being.** `crossesSquarely` refused to call anything a
crossing if the road met the river at under 44 degrees, on the reasoning that a road running
alongside a river is a quay. That reasoning is sound and this was the wrong place for it: the quay in
`heightAt` is already guarded by `river.dist >= river.path.half`, which is to say a quay is a thing
you build BESIDE the water, while `findCrossings` tests `dist <= half` — the road is over the water
itself. Road 63 sat at dist 0.00 of a six-metre river and was called "alongside" because it met the
water at 41 degrees. Seven of the twenty-four misses were nothing but this.

That change then exposed a fourth thing, which is the interesting one: **the quay rebuilt the dam
round 16 removed.** It was kept off a crossing by `!crossesSquarely`, which was only sound while the
two agreed about what a crossing IS — so a forty-degree road now got a bridge AND a quay shelving the
channel up underneath it. The footprint is the authority on where a bridge is; nothing else gets to
fill it.

Around the user's town: **35 of 59 wet road samples had a bridge before, 58 of 59 after.** The one
left is a road stub that dead-ends inside a river channel at a junction, two decimetres outside a
neighbouring deck's edge.

### Item 4d and 4c — a bridge where the road is not

*"The bridge only connects to one side of the road (I think the road just stops)."* It does. `back`
and `fwd` measured how far the WATER reached along the crossing's tangent and nothing asked whether
there was any road out there — and road 58 ends at the exact cell of Feafungate's town node, which is
in the middle of the river. So `fwd` ran thirty-seven metres past the road's last point and half the
deck landed in an empty field, with `roadAt` reading 0.00 for the last nineteen of them.

That is also the whole of *"there is a tower inside of the bridge"*, and it is why the two are one
fix. A crossing's footprint is a HOLE: `heightAt` leaves the river channel carved under every metre
of it so the water can run through. The part that ran past the road was ground the town planner was
entitled to build on (`roadAt` says 0.00 there) and that the terrain had dug out to the river bed.
A tower stood in a bridge because the bridge was somewhere the road was not.

So both walks now stop at the end of the carriageway, the centre shifts to sit between what is left
(and only as far as it can go while the middle is still over the water — a forty-degree road is over
water for a long way along its own line, and one crossing's middle had ended up 12.1 m from a
six-metre channel), and a merged pair's union is clamped to the road as well as grown to cover it.
Belt and braces on top: `terrain.bridgedAt(x, z, pad)` publishes the footprint, and the town planner,
`place()`, the street lanes and `js/sites.js`'s set-piece slots all ask it.

**Not done, and deliberate:** the town is still in the river. Moving a settlement means moving
`node.x/node.y`, which is a map cell — 64 m at this planet size, 224 at the default — and World
Forge has already routed every road to the old cell, while `js/map.js`, `js/quests.js`,
`js/markers.js` and `js/waypoints.js` all derive their own metres from it. A sub-cell offset would
have to be read by every one of those, and four of them belong to other people this round. What is
fixed is everything the town DOES about it: its square, its plots and its structures now all stay out
of the water, and the river through it is bridged rather than dammed.

### Item 4a — "semi-underwater" is a question about a footprint

Every water test in `js/features.js` asked `underwater(x, z)` of ONE point: the exact middle of the
thing being placed. A hut is three and a half metres across, a warehouse eleven and the waypoint pad
six, so anything whose centre cleared the water by a few centimetres went down with a third of itself
in the river and passed every check there was. At Feafungate that was the well, the waypoint pad, a
market stall and a length of the town wall — four of the hundred and forty things the builder stands
on the ground. `dryFor` walks a ring of samples at the thing's own radius with 40 cm of freeboard,
and `place()` takes the kit's real footprint rather than the generic radius for its building type.

And in `proctown/js/townplan.js`, **the square goes where you can stand.** It took whichever block sat
nearest the middle, whatever was there, and Farhold hangs the well, the market stalls and the civic
district off it. The planner already knew which ground it may not use; it simply was not asking here.

Measured at Feafungate: **four things built partly in the water before, none after**; six street
lanes planned across the bridge deck, none drawn there.

### Item 4b — the channel had no rim for the water to stop against

*"The water does not touch the shoreline."* `waterRibbon` has pushed the drawn sheet outward, per
point and per side, until the carved ground climbs back to the water line since round 5 — that is how
a real shoreline hides the edge of a sheet. What it cannot do is find a bank that was never built.
The carve blends from the flat bed back to the NATURAL ground at `reach`, and the natural ground is
`naturalHeightAt`, which piles up to 78 m of relief noise on the map's elevation. So the rim of the
channel was wherever that noise happened to leave it: measured across three worlds, **between 9% and
28% of river edges had no point anywhere out to `reach` that reached the water line**, and the sheet
then ran the full thirty metres and stopped in mid-air — 5.59 m of open edge at the user's own town.

The shortfall is nearly always small (97% under five metres, two thirds under one) because it is
noise rather than topography, so the outer part of the channel is brought UP to the water line where
it falls short, fading in from the water's own edge so the river keeps its width, capped at
`bankRise` so a river genuinely running along a shelf gets no thirty-metre wall built round it. It
never touches the water itself, never fills a bridge's footprint (it fades out over eight metres
rather than switching off — a rim that is absent inside a footprint and full height a metre outside
it is a five-metre cliff around every bridge, and the round-16 walk measured a player being asked to
climb 5.14 m in one step onto one), never dams a river mouth, and never towers over a road beside it
(a road running along a river whose surface sits above the carriageway is the quay case, and it
started getting a five-metre wall of earth along its verge).

Second half, in `js/water-plan.js`: **the walk then bisects back onto the waterline.** The coarse
walk steps in half a channel width — three metres on an average river, eight on a big one — and took
the first step where the bank had come back up, which on anything but a cliff is somewhere UP the
bank. Five halvings put the edge within a tenth of the step of the real crossing.

One thing this turned up that is worth keeping: **`waterAt` and the drawn sheet were measuring
against different numbers.** `waterAt` asks about the NEAREST point of the river line; the sheet is
built per point and runs out across the channel from the point it belongs to, so on a bend the two
are a quarter of a metre apart. That never mattered while the ground in that band was random noise;
the rim makes the ground sweep smoothly through exactly that quarter metre, and `water.test.js`
caught dry land 0.15 m under a drawn river on the first run. `riverTopAt` is now the one answer both
of them use — the higher of the quad's two corners, which is the band the sheet is actually drawn in.
It is deliberately NOT a window of several points: three points is 384 m on a full-sized planet and a
mountain stream falls ten metres in that, which reported a river ten metres above the road beside it
and dropped the player into it.

Near the user's probe: **31 open sheet edges before, 6 after.** World-wide the "no bank at all"
figure goes from 28%/9%/19% to 8%/2%/4% on three test worlds; what is left is river mouths and rivers
spilling into basins, where the bank really does not come back and the skirt closes it as before.

### Item 7 — nothing is dug out of the middle of a road

`createNodeWorld.tileAt` picks a spot, asks the biome what grows there and puts a seam down. It had
never known where the roads are, so a clay bank on the carriageway was not a rare accident: 1.8% of
the seams around the user's town were on one, boulders and felled-tree stumps included. `roadAt` is
the same field the megaflora and the town planner already keep clear of, `0.45` is the same threshold
`js/features.js` uses for a building (the carriageway and its kerb, not the whole eighteen-metre
influence field — a seam BESIDE a road is exactly where a seam wants to be), and `bridgedAt` is asked
as well. The node's own radius is in the question: a two-metre seam whose centre is a metre off the
kerb still has half of itself in the road.

**It runs AFTER the scatter, never inside it.** Round 12's density bug is the reason: the tile's rng
is shared by everything generated after it, so rejecting a spot mid-loop — or breaking out of one —
consumes a different number of rng calls and every seam downstream moves. Marking `gone` is how the
underwater and cliff rejections already work and it costs the rng nothing; there is a test that
generates the same tiles with only the road filter switched off and checks every surviving seam is in
the same place, with the same contents, in the same amount.

Around the user's town: **144 seams on a road before, 0 after**, out of 7,579.

### Files

`js/planet.js` (the lift, the floor, the crossing walk and footprint, the bank rim, `bridgedAt`,
`riverTopAt`), `js/water-plan.js` (the bisection), `js/features.js` (`dryFor`, the bridge-aware
`buildable` and street `skip`), `js/resources.js` (`onTheRoad`), `js/sites.js` (a slot is never on a
bridge), `proctown/js/townplan.js` (the square goes on buildable ground), `tools/probe-worldgen.mjs`
(new) and 14 tests in `tests/round17-worldgen.test.js`. Three assertions in `tests/round16-roads.test.js`
were re-aimed rather than relaxed — each is commented with what changed underneath it and why the
thing the test exists to catch is unchanged.

## Round 18 — the five red specs, and the staircase under the river

Round 17 closed with five red Playwright specs and a standing note: **do not publish to stable until
those are green or re-aimed.** Four of them were tests that had gone stale under features round 17
had deliberately added. The fifth was a real bug, and it was the largest thing in the round.

The pattern worth keeping from this one: **three of the four "stale" specs failed with a message
that pointed at the wrong component.** "The furnace made nothing (Out of fuel)" was a storage rule;
"Cannot read properties of undefined (reading 'x')" was the onboarding line; "the crate would not
take the coal" was the crate working correctly. In each case the spec has been given an assertion
that fails EARLIER, at the thing that actually moved, so the next person does not start by reading
the furnace.

### Item 1 — the water surface was a staircase, and the drawn one is a ramp

`round3.spec.js:106` read the swim clip as `jump` in the middle of a river. Round 17 had guessed at
a one-frame artifact of the spec's own force-clear of `control.boating`. It was not.

`js/planet.js` `riverTopAt` answered `Math.max(surface[i], surface[i + 1])` — the higher END of a
segment, for the WHOLE length of that segment. That is constant along a segment and it STEPS at
every boundary. `waterRibbon` in `js/water-plan.js` pushes one vertex per river point at that
point's own height and fills the quad between two points with two triangles, so what is actually
**drawn** between point i and point i+1 is a linear ramp.

So the water the game measured against and the water you could see were two different surfaces:

| | measured | drawn |
|---|---|---|
| along a segment | flat, at the upstream height | a ramp between the two heights |
| at a boundary | a step | continuous |

Measured: a **12.21 m** step on seed 7, **11.4 m** between the worst pair of points on seed 19, and
the measured surface **10.01 m** away from the drawn sheet at one point.

In play that is: swim down a river, cross a segment boundary, and the surface drops several metres
at once. `js/player.js` computes `swimming = depth > swimDepth && y < surface + 0.2`, finds the body
above the new surface, and `swimming` goes false — so you are falling through the air over water
that is still drawn underneath you. The spec caught it as the clip going to `jump` with 6.9 m of
water below.

`makePathIndex.nearest` has always returned `t`, the fraction along the segment, so the ramp was
free to evaluate. `riverTopAt` interpolates now and the two answers agree everywhere.

**The old max was also papering over a second thing, and that is now explicit.** `waterRibbon` draws
one FLAT slab per point — both its edges at that point's height — while `waterAt` measures a ramp
along the nearest SEGMENT. On a bend, the nearest segment to a spot out near the bank is not the
slab that was drawn over it, and the two land about 0.10 m apart (measured on seed 7, 24 m off the
centre line). The max was generous enough to cover that, which is precisely what made it an 11 m
staircase. `waterAt` now carries a constant **0.25 m `EDGE`** at the waterline with the depth floored
at zero: a spot within a hand's breadth of the sheet is water you cannot swim in, rather than dry
land with a blue layer drawn over it. Nothing wades at 0 m (`boardDepth` is 0.55), so it changes what
GROWS in the shoreline sliver and what the sheet agrees with, not how anybody moves — and being
constant, it cannot come back as a step.

Two tests in `tests/water.test.js`, both of which fail hard against the old code (12.21 m and
10.01 m). The first walks the middle of a river **half a metre at a time** rather than a fixed number
of steps per segment: these points are ~10 m apart on a stream that drops a metre between two of
them, so a whole segment is a metre of honest gradient and reads like a cliff whatever the shape in
between. Walking a fixed short distance is what separates "this river is steep" from "this river is
a staircase".

### Item 2 — a quarterstaff, carried forward from round 17

Round 17 found this and recorded it, on purpose, as **not fixed**: "a quarterstaff is re-attuned by
`rpg.js`'s `attuneWeapon` — `CASTERS.has(sub)` fires because `sub` is the subtype, which items.json
files as `staff`."

The shape of it is worth writing down because it is a fix defeating itself. `attuneWeapon` clears
`castElement` for a quarterstaff; the very next branch asks `CASTERS.has(sub) && !item.castElement`.
`sub` is `staff`, `staff` is in `CASTERS`, and **the clear had just made the second half true** — so
the de-attune was the thing that re-armed the attune. Calling it on the raw base returned
`Arc Quarterstaff`, arcane, with a `cast_arcane` affix on the card and a glowing element topper out
of `heldLookFor`.

It also had to be read independently of `weaponCategory`, because the de-attune only fires while
that still says `magic`: on a second pass over the same item — a reload, a re-roll at the bench — the
block was skipped and the caster branch went through unopposed.

`spellShapeOf` was already null for a quarterstaff, because `isStaff()` excludes it BY NAME, so
round 17's test passed throughout and none of this appeared in it. The new test asks about the
attunement itself, plus a companion test that wands, scepters, orbs and tomes are still attuned, so
the guard cannot be widened into turning the feature off. `items.json` is shared with Emberveil and
has its own test over it, so the fix is on the ITEM in `attuneWeapon`, exactly like `ranged`,
`offHandOk` and `markHands`.

### Items 3–5 — the specs that had gone stale

* **`base-roundtrip.spec.js:45`** expected a crate to hold 200 coal and got 120. Round 17 made the
  Storage Box the no-metal FIRST store (6 slots = 120) and added the Storage Chest above it
  (20 slots = 400). `put` capping at 120 is the store system working correctly. The spec builds a
  chest.
* **`mining.spec.js:268`** — "the furnace made nothing (Out of fuel)". Neither number in it was
  arbitrary and neither was a bug: `roomFor` caps ONE raw material at 25% of a store and ALL raw
  materials together at 50% (`data/power.json` `storeShare`, there to stop three drills filling
  every crate with ore and jamming the base). Seven of the eight ids the spec fed are raw, so the
  iron and the copper ate the entire raw budget of a 120-unit box and the COAL got exactly zero
  room. Now a chest and 24 of each, inside the 200 the raw share allows — and a `stocked` assertion
  that blames the pool rather than the furnace when a capacity rule next moves.
* **`town.spec.js:124`** — `Cannot read properties of undefined (reading 'x')`. Not a quest bug:
  round 17 gave `js/quests.js` a `firstJob` hook and `js/onboarding.js` registers on it, so the
  first job ANY giver hands over is now the five-step tutorial. Its kind is `onboard`, which is none
  of the three the spec knew how to finish, so it fell to the `else` branch and read a `place` an
  onboarding quest has never had. That the tutorial comes first is the feature, so the spec asserts
  it, files it finished — which is what `offerFor`'s own `finishedAlready` gate reads — and asks
  again for the ordinary work it is actually about.
* **`round4.spec.js:100`** ("the world is busy") was already green. It was flaky, not broken.

### Files

`js/planet.js` (`riverTopAt` interpolates, `waterAt`'s `EDGE`), `js/rpg.js` (`isQuarterstaff`),
`tests/water.test.js` (+2), `tests/round17-combat.test.js` (+2), and re-aims in
`tests/base-roundtrip.spec.js`, `tests/mining.spec.js`, `tests/town.spec.js`, `tests/round3.spec.js`
— each commented with what moved underneath it.
