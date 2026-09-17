# Farhold — creatures worth adding

A brainstorm, not a build order. The bestiary is 46 hostiles, 6 bosses and 10 companions
(`data/enemies.json`), and it has three holes: **nothing is neutral**, **nothing is friendly outside
a town**, and four biome families share a short list between them. This is the pile to draw from.

## How to read an entry

Every entry says what the thing **is** in plain sentences rather than in stat lines — size against a
person, what it is covered in, how it moves, what it wants, what it does when it sees you, and what
it leaves behind. That is deliberate: Dwarf Fortress gets its creatures across in a paragraph, and a
paragraph like that is also a *specification*. "A flat, pale thing the width of a door that folds
along a ridge down its back and walks on the tips of eleven legs" tells you the model, the walk
cycle and the sound in one go.

Each also says how much work the body is:

| tag | what it means |
|---|---|
| **variation** | An existing `CREATURE_TYPES` entry with different proportions, colours, features and size. Costs a data row. |
| **variation+** | An existing type plus one new feature flag in `creatures.js` (a frill, a shell, a second head). An hour of geometry. |
| **bespoke** | A new entry in `CREATURE_TYPES`, and possibly a new body plan. A day. |
| **chibi** | A Chibi 2 humanoid — an avatar JSON and nothing else. Free. |

The six body plans that already exist: **quad**, **spider**, **bat**, **snake**, **biped**, **float**.
Thirty-seven types hang off them. Most of what follows is a variation, which is the point of having
built a procedural creature system.

**Original names only.** Nothing here borrows a creature, a name or a look from another game.

---

# 1. Neutral wildlife

Nothing in Farhold currently ignores you, and that is the single biggest thing missing from the
world. A planet where everything charges the moment it sees you is a shooting gallery; a planet
where most things run, or graze, or watch you and go back to eating, is a place.

**Three behaviours are enough**, and they are small additions to `js/actors.js`:

- **skittish** — flees at `aggroRange`, never attacks, drops hide and meat.
- **wary** — watches you, backs away, and fights only if you hit it. Most large herbivores.
- **territorial** — ignores you until you come inside a smaller radius, then warns (a bark, a
  raised head) before it charges. The warning is what makes it fair.

### Grass and tundra

**Stiltbuck** — *variation (deer)*. Waist-high at the shoulder and absurdly long in the leg, so it
stands eye to eye with a person. Dun, with a white stripe down each flank that only shows when it
runs. Grazes in loose groups of six or eight with one head always up. It sees you long before you
see it and leaves at a bounding, stiff-legged run that covers ground faster than you can. Leaves
hide and a great deal of meat if you can catch one. *skittish.*

**Rill Hog** — *variation (boar)*. Low, broad and the colour of wet clay, with a mane of bristles it
raises when it is unhappy. Roots along stream banks for tubers and will not move for you, or for
anything. Charges once, hard, and then loses interest. *territorial.*

**Meadow Crake** — *variation (frog)*, scaled down to knee height and given a longer hop. A dull
green thing that sits perfectly still in long grass until you are two paces away and then explodes
sideways, which is startling every single time. Worthless to kill. *skittish.*

**Pelt Ox** — *variation+ (bear, with `horns`)*. The size of a cart and covered in a matted coat that
hangs almost to the ground. Stands in the weather rather than sheltering from it. It will let you
walk right up; it will also lean on you if you annoy it, and it weighs a ton. *wary.*

### Jungle and marsh

**Canopy Loper** — *variation (cat)* at three times size, in dappled olive. Walks the ground on all
fours with its back arched high, as though it would rather be in the trees. Hunts the smaller
wildlife and gives you a wide berth. *wary.*

**Fen Strider** — *bespoke (a new `wader` plan, or `bat` with the wings read as legs)*. A tall bird
thing on two backward-jointed legs, grey and thin as a reed, that stands in shallow water on one
foot for minutes at a time. When it finally moves it is faster than anything that shape should be.
Hunts the frogs. *skittish.*

**Bramble Coil** — *variation (snake)*, short and thick, in bark browns. Lies along a fallen log and
looks exactly like the log. Not hostile, but stepping on one is a mistake. *territorial.*

### Desert and rock

**Pan Hare** — *variation (rat)* with the ears made long and the tail cut short. Sand-coloured,
almost invisible until it moves, and it moves in a zig-zag that is genuinely hard to follow. Hunted
by everything out here. *skittish.*

**Scute Grazer** — *variation (turtle)* scaled up and given legs. Plods across open ground eating
whatever it finds, protected by a shell you cannot get through from above. Tip it and it is
defenceless, which somebody will eventually make a quest out of. *wary.*

**Thermal Skink** — *variation (crocodile)* at a quarter size, in hot orange. Lies flat on bare rock
in the sun and will not move until the rock is cold. *skittish.*

### Ice

**Rime Elk** — *variation+ (deer, with `antlers` and a `frost` feature)*. Enormous, pale, and
antlered like a bare tree. Breath fogs. Moves through deep snow as though it is not there. It has
nothing to fear on this world and treats you accordingly: it will look at you, and then keep
walking. *wary.*

**Snowpad** — *variation (hound)* in white with black feet. Trots in pairs along the same routes
every day. Curious rather than hostile — they will follow you for a kilometre and then lose
interest. *skittish.*

### Ocean and coast

**Shingle Crab** — *variation (beetle)* with the legs lengthened and the body flattened. Moves
sideways at speed and holds its ground with both claws up, which is bluff. *territorial.*

**Sun Moth** — *variation (moth)* at half the Carrion Moth's size, in white and pale gold. Drifts
over water in clouds at dusk. Purely decorative, and the better for it. *skittish.*

---

# 2. Folk who are not in a town

Every person in the game currently stands inside a settlement. The roads between them are empty,
which makes a long walk feel like a loading corridor. All of these are **chibi** — an avatar JSON,
nothing else — and all of them are already supported by `js/town.js`'s conversation and trade code.

**The Roadwarden** — A guard in mismatched armour, sitting on a milestone with a spear across their
knees, paid by one town to walk a stretch of road they have no real hope of holding. Knows what has
been attacking travellers lately, and will say so. Gives directions that are actually correct.

**A pedlar and a cart** — `avatar-3d/js/vehicles.js` has seven builds with real creature bodies in
the shafts and not one of them appears in this game. A hand cart, a mule, a covered wagon: a moving
shop, with stock that is worse than a town's and prices that are better, because they want rid of
it before the next hill.

**The Surveyor** — Kneeling beside a tripod, mapping. Sells what they have charted: a marked cave, a
ruin nobody has emptied, the level band of the next region over. Buys maps back off you.

**Pilgrims** — Two or three walking to a landmark, slowly, in plain clothes. Harmless, and they will
tell you what the landmark is for, which is more than the map does.

**The Hermit** — Lives beside a spring a long way from anywhere, in a shelter made of what was to
hand. Will not trade. Will feed you, will let you rest, and remembers you next time, which is what
`lingo/js/memory.js` and `relations.js` were built for and Farhold does not yet use.

**A wounded soldier** — Sitting against a rock with a bad leg, a long way from their unit. Escort
them to a town, carry a message for them, or walk on. The only one of these that is a quest rather
than a person.

**Prospectors** — A pair working a rock face with hand tools. Buy crafting material at a good price
and sell it at a bad one. Know where the ore is, which will matter when resources go in the ground.

**Scavengers at a fresh kill** — Not hostile unless you approach the carcass. They will have looted
the body already; the question is whether you take it off them.

---

# 3. Hostiles, by biome

The gaps are `ice`, `crystal`, `void` and `toxic` — those four currently share a handful of
creatures with each other and with `any`.

### Ice

**Drift Lurker** — *variation (crocodile)* in white and pale blue, belly flat to the snow. Lies
submerged in a drift with only the ridge of its back showing, in ground that looks identical for a
kilometre in every direction. The first you know is the snow moving. Hits once, enormously hard, and
if that does not finish you it withdraws and tries again somewhere else. **Ambusher** — it wants the
`feeding` encounter's low aggro range and a very high first-hit multiplier.

**Hoarfrost Chorus** — *variation (wisp)*, three or four at once, in white. They do not approach.
They circle at the edge of your vision and sing, and everything else in the region comes to see what
the singing is about. A support enemy: no damage worth speaking of, but it keeps calling in packs
until you kill it, which makes it the thing you have to deal with first.

**Glacier Tick** — *variation (spider)* the size of a dog, translucent, with a body full of
something dark. Slow, stupid, and there are forty of them. What `swarm` was written for.

**The Long Winter** — *bespoke, boss.* A shape in the blizzard that is never entirely visible: you
fight the weather and something inside it. Mechanically a `float` body with the fog turned up and a
`chill` aura that never stops, so the arena itself is the fight.

### Crystal

**Facet Stalker** — *variation (saber_cat)* grown over in crystal, so it chimes when it moves and
throws your own torchlight back at you. Hunts by sound. Standing still genuinely helps.

**Refraction** — *bespoke.* Not a creature: a standing shape of angled glass that shows you a copy of
yourself, walking when you walk. It attacks with your own damage numbers, which is the joke and also
the mechanic — a mirror enemy scaled off `player.derived`. The `shard` body is close enough to start
from.

**Geode Brood** — *variation (beetle)*, a cluster of six that emerge from a single split rock when
you come near it. Each is armoured to the point of absurdity from the front and paper from behind,
which makes positioning matter for once.

**Chime Warden** — *variation+ (golem, with `core` and a ring of orbiting shards)*. Guards a specific
thing — a chest, a door, a monolith — and does not leave it. Will not initiate. If you take what it
is guarding it never stops following you, across the region, for the rest of the run.

### Void

**Absence** — *bespoke.* A person-shaped hole. Not black: the ground behind it simply is not drawn,
and the edges are sharp. Silent. Walks. When it reaches you it takes something — a status, a buff, a
skill for thirty seconds — rather than health, which is far more alarming than damage.

**Stitchwork** — *variation+ (horror)* assembled from pieces of other creatures, none of which match:
four legs from four animals, a wolf's skull on a spider's body. Moves badly and hits like a
landslide. Drops other creatures' materials, because it is made of them.

**Echo of a Warband** — *variation (chibi humanoids, translucent)*. Six figures repeating the last
minutes of a fight that happened here a long time ago. Ignore you completely until you step into the
middle of it, at which point all six are yours. A set-piece, not a spawn.

**Unmaker** — *bespoke, boss.* Undoes the terrain: over the course of the fight the arena's props
vanish, the grass goes, the colour drains out of the ground. Entirely achievable with what
`js/props.js` and the terrain colourer already expose, and nothing else in the game would look
like it.

### Toxic

**Bloom Host** — *variation+ (mushroom, with a `burst` feature)*. Bloated, pale, and walking slowly
toward you with obvious intent. Kill it at range or it opens, and what comes out is a cloud that
poisons for as long as you stand in it. The first enemy that punishes melee for being melee.

**Sump Crawler** — *variation (centipede)*, dripping, half in the water. Fast in the shallows and
almost helpless on dry land, which makes the fight about where you stand.

**Rot Kite** — *variation (moth)* in grey and yellow. Drops spores in a line behind it as it flies,
so it paints the ground you want to walk on and then waits.

**Chymist** — *chibi.* A person in a sealed hood and long gloves who is out here on purpose, which
is worse than anything that lives here. Throws flasks — a real `ground`-shaped attack from an enemy
for once. Drops crafting material by the bagful.

### Grass and jungle — filling out what exists

**Thornback Sow** — *variation+ (boar, with `spikes`)*. Twice the Thicket Boar and covered in
backward-facing quills. Charges in a straight line, cannot turn, and hurts whatever hits it.

**Nettle Wisp** — *variation (wisp)* in green, which lures. It drifts away from you at exactly your
walking speed, and where it stops there is a pack.

**Vine Hauler** — *bespoke.* Roots in the ground and does not move at all. Reaches. A tentacle takes
you off your feet and drags you toward the trunk, which is the first genuine movement-control enemy
in the game and would change how a jungle reads entirely.

**Grove Tyrant** — *variation (griffin)* at boss scale, in jungle greens. Nests on a landmark and
owns the airspace for a kilometre.

### Desert

**Dune Breacher** — *variation (worm)* at double the Waste Wyrm. Travels under the sand — a moving
ridge you can see and outrun — and comes up underneath whatever it has been following.

**Glass Caller** — *variation (imp)* in obsidian black. Screams. The scream is not damage; it brings
the pack, and the pack is already close.

**Mirage Walker** — *variation (chibi humanoid, shimmering)*. Looks exactly like an ordinary traveller
until you are within ten metres of it.

### Ocean and coast

There is nothing in the water at all, and swimming already works.

**Reef Gleaner** — *variation (crocodile)*, coast only, sunning on rocks.
**Tidewrack** — *variation (slime)* in kelp browns, on the shoreline, slow, and worth avoiding
rather than fighting.
**Shoal-Thing** — *bespoke.* Something large under the surface that never fully breaks it. You see a
shape and a wake. Whether it can reach you is the whole tension, and a swimming enemy is the one
genuinely new body plan on this list.

---

# 4. Things that would use what is already built

- **Pack leaders that actually lead.** `role: 'leader'` exists and only affects who spawns. A leader
  that buffs, that the pack routs when it dies, and that runs when it is alone is three lines in
  `js/actors.js` and changes every group fight.
- **Beasts that hunt each other.** The field has positions and damage. A predator that attacks the
  nearest *neutral* rather than the player would make the world look like it is running without you.
- **Corpses that stay.** Something to loot, something for the scavengers to gather at, and a reason
  to come back to where a fight happened.
- **Creature variants by zone band.** The same Moor Hound at level 2 and level 22 could be a
  different colour and a third bigger, with no new data at all — `makeEnemy` already scales the body
  for rank.
- **A bestiary page in the Journal** that fills in as you kill things, showing the description above.
  The text is the reward for the tenth kill.
