# Thousandvale — talents and the perk forest (owner guide)

Play-test 1, item P6: *"Skills auto-unlock; add TALENTS (skill-specific, each changes the skill meaningfully, not % changes) and a PERK FOREST with several branches, much more expansive than Farhold."*

Two separate things you spend on as you level. Both are the same for every class and both are saved with the character.

## Skill talents — every skill has its own small tree

- Every one of the 180 skills has **4 tiers**, opening at **levels 3, 8, 18 and 28**.
- Each tier offers **2 or 3 choices**; you take **one** per tier. So a fully built skill has 4 picks out of about 11.
- **Every choice changes how the skill works** — a new shape, something it leaves behind, a trigger on a kill or a crit, a combo with another skill. None of them is a plain "+X% damage" or "Y% shorter cooldown". A number can come *with* a change (a bolt that now splashes, for 20% less per hit), never instead of one.
- Picking into an empty tier is free and instant. Changing your mind is the **Unbinder**'s job in town, for gold (the same prices as Farhold: 60 gold + 8 a level for one talent, 250 + 30 a level for all).

How the trees were made: they start from Farhold's own trees (two hand-written nodes per tier for that skill, plus one shared node). Thousandvale then:

- dropped the shared nodes that were only numbers ("Heavy", "Overload", "Quickened", "Widened", "Crescendo", "Deepening") — **333** of them;
- dropped any shared node that would do nothing on that skill (a "fan of three bolts" offered on a sword swing) and put a working rule node in its place — **293** replacements;
- rewrote the **59** hand-written nodes that were only a bigger number ("the width becomes 4 m", a song's "+15% move speed") as real rules — a second strike, a pull, a root, a stance that makes you untargetable for a second.

A test fails if any node in any tree is only a number, does nothing on its skill, or leaves the skill exactly as it was.

**Example — Gnawing Dark (Warlock):**

- **Tier 1 (level 3)**: *Splatter* — The impact splashes everything within 3 m, 20% less damage. · *Hungry Split* — Splits into 2 shards when it kills, each striking an enemy within 8 m for 50% of the damage. · *Seeking* — The projectile turns onto any target within 6 m of its flight path.
- **Tier 2 (level 8)**: *Deepening Dark* — Applies no status, the status is worth 60% of the usual. Adds 1 Gnawed stack to each target hit, up to 3. · *Weakening Dark* — Also applies Weakened (deals 15% less damage) for 8s. · *Bursting* — Bursts on impact, hitting everything within 3 metres.
- **Tier 3 (level 18)**: *Soul Feed* — A kill with this skill: you heal 3% of your maximum health. · *Spread Thin* — Copies Gnawed from the target to up to 2 enemies within 6 m. · *Branding* — What it hits takes 20% more damage from every source for 6s.
- **Tier 4 (level 28)**: *Devour* — Deals 60% of the remaining Gnawed damage on each target at once. · *Hungry Dark* — A kill with this skill: the body bursts for 50% weapon damage within 4 m. · *Cascade* — Bursts on impact, hitting everything within 2 metres. Jumps to 3 more enemies behind the first, each jump for 15% less.

## The perk forest — one big tree, twelve directions

- **One forest for everyone**, starting in the middle. You get a point every level, plus one more every fifth level (58 points by level 50), and spend each one on a node **next to** something you already have. The shape is the price: a keystone on the far edge costs the walk to reach it.
- **382 nodes** (Farhold's has 169), in **12 arms**. Every arm splits into **2 to 4 paths** past its sixth ring, and **every path ends in a keystone** — 41 keystones in all (the game shows them as **Cornerstones**: "keystone" is on the banned-names list). Neighbouring arms are bridged at ring 4 and there is an odd node on every seam, so builds can wander sideways, not only outward.
- Node kinds: small stat nodes, bigger stat nodes, **named nodes** (two stats together, or a rule — Riposte, Quarry, Shared Hide…) and **keystones** that change how you play, most with a cost.
- Every card is written from its own numbers, and a test fails if any node grants something nothing in the game reads.
- Giving back: the Unbinder takes back one node at the **end** of a walk (80 gold + 12 a level) or the whole forest (400 + 45 a level).

### The twelve arms and where their paths lead

### The Close Ground — Reach, weight and the willingness to be hit.

35 nodes. Paths:

- **Two Great Weights** → **Doubled Grasp**: Hold a two-handed weapon in each hand. +18% attack area. *Cost: −20% attack speed.*
- **The Single Weight** → **Full Swing**: With a two-handed weapon and nothing in the other hand: +30% damage, and every 3rd swing lands as a slam that hits everything within 3.5 metres for 60% and throws it back. *Cost: −12% attack speed with those hands.*
- **Twin Edges** → **Flurry**: With a one-handed weapon in each hand: +20% attack speed, and every hit has a 25% chance to land again for 50%. *Cost: −25% armour with those hands.*
- **Sword and Board** → **Shield Wall**: With a one-handed weapon and a shield: +15% chance to block, a block stops 30 more damage, and every block answers with a shockwave that hits everything within 3.2 metres for 70%. *Cost: −10% damage with those hands.*

### The Hunter's Eye — Pick the moment, and make the moment count.

30 nodes. Paths:

- **The Kill** → **Finishing Blow**: Your skills deal 30% more to an enemy under 25% health. +10% critical damage. *Cost: None but the walk.*
- **The Fresh Start** → **Fresh Blood**: While you are above 80% health every hit you land deals 12% more. +30 maximum health. *Cost: Nothing extra once you are hurt.*
- **The Sixth Sense** → **Sixth Sense**: +8% critical chance and +25% critical damage. *Cost: −40 maximum health.*

### The Long Shot — Distance, precision and the shot you only get once.

30 nodes. Paths:

- **The Far Line** → **Far Shot**: An arrow or a bolt deals more damage the further it has flown: nothing extra at 4 m, up to +50% at 46 m. +5% critical chance. *Cost: Anything within 4 m of you takes 25% less damage.*
- **Patience** → **Planted Feet**: After 1.5s standing still every hit you land deals 25% more, until you move. *Cost: −8% dodge chance.*
- **First Blood** → **First Blood**: A hit on an enemy that is still at full health deals 50% more. *Cost: −15% critical damage.*

### The Quick Hand — Skills that come back sooner, cost less, and chain into each other.

30 nodes. Paths:

- **The Weave** → **The Weave**: Cast a different skill from your last one within 3s and it costs no mana. *Cost: +5% skill cooldowns.*
- **Momentum** → **Momentum**: Every killing blow you land takes 1s off every one of your cooldowns. +4% attack speed. *Cost: Nothing on a long fight against one enemy.*
- **Mind over Body** → **Mind over Body**: A quarter of every blow you take is paid from your mana instead of your health, while you have mana. +40 maximum mana. *Cost: Your mana drains when you are hit.*

### The Deep Study — Power that comes out of a book and goes back into one.

39 nodes. Paths:

- **Flame and Frost** → **Pyre Heart**: A Burning enemy that dies bursts, hitting everything within 4 metres for 80% as fire and setting it Burning — a crowd burns down in a chain. Your Burning lasts 3s longer. +6% spell damage. *Cost: −20% damage of every kind but fire.* / **Shatter**: A Chilled enemy takes 30% more from you, and one that dies Chilled throws 3 shards at the nearest enemies within 7 metres for 70% each. +6% spell damage. *Cost: −20% damage of every kind but ice.*
- **Storm and Venom** → **Storm Within**: In a fight, lightning leaves you on its own every 1.5s and strikes the nearest enemy within 10 metres for 50%, Shocking it. +6% spell damage. *Cost: −20% damage of every kind but lightning.* / **Plague Bearer**: A Poisoned enemy that dies passes its poison to every enemy within 5 metres, 25% stronger each time it moves on. +6% spell damage. *Cost: −20% damage of every kind but poison.*
- **Dusk and Dawn** → **Hollow Pact**: A Cursed enemy that dies passes its curse to every enemy within 5 metres, and every hit of shadow damage you land heals you for 8% of it. +6% spell damage. *Cost: −20% damage of every kind but shadow.* / **Halo**: Every 2.5s in a fight a ring of light burns every enemy within 5 metres for 50% as holy and Weakens it, and every hit of holy damage you land heals you for 5% of it. +6% spell damage. *Cost: −20% damage of every kind but holy.*
- **The Inner Study** → **Overflow**: Every 3rd skill you cast goes off a second time for 60%, free. +10% spell damage. *Cost: Skills cost 25% more mana.* / **Blood Price**: Skills are paid for in health instead of mana, and never fail for want of mana. +14% spell damage. *Cost: Your mana pool stops mattering, and a skill can leave you on 1 health.*

### The Hexwork — Burns, poisons, bleeds and curses — the damage that keeps working after you look away.

30 nodes. Paths:

- **The Scent of Blood** → **Blood Scent**: Every hit you land on an enemy suffering a burn, poison, bleed or curse deals 20% more. +10% damage from your burns, poisons, bleeds and curses. *Cost: Nothing extra against an enemy that is clean.*
- **Contagion** → **Contagion**: When an enemy carrying your burn, poison, bleed or curse dies, each of them jumps to the nearest enemy within 6 metres. +10% damage from them. *Cost: None but the walk.*
- **Deep Rot** → **Deep Rot**: +40% damage from your burns, poisons, bleeds and curses. *Cost: −10% damage from every hit.*

### The Kept Company — What follows you, and what keeps it standing.

30 nodes. Paths:

- **The Pack** → **The Pack**: +2 follower slots, +2 of each thing you summon, and +20% companion damage. *Cost: −15% damage of your own.*
- **The Early Bond** → **Early Bond**: Your class companion comes to you now instead of at level 10, and its second body at level 12 instead of 20. +10% companion damage. *Cost: Only a class that has a companion gains from it.*
- **Hunting Together** → **Pack Tactics**: Your followers deal 25% more to whatever you hit last. *Cost: −10% armour.*

### The Open Hand — Healing, shielding and standing beside the people you came with.

30 nodes. Paths:

- **The Brimming Cup** → **Brimming Cup**: Healing that would go past full health goes on to the most hurt member of your party within 30 metres. +10% healing you do. *Cost: None but the walk.*
- **The Banner of the Road** → **Banner of the Road**: You and every member of your party within 20 metres of you deal 6% more damage. +3% resistance to all damage. *Cost: Two banners do not stack.*
- **The Healer's Oath** → **Healer's Oath**: +30% healing you do. *Cost: −15% damage.*

### The Held Line — Armour, a shield, and the patience to be the one who does not move.

30 nodes. Paths:

- **Held Ground** → **Held Ground**: +40% armour, +10% resistance to all damage, and a block stops 25 more damage. *Cost: −15% damage.*
- **Iron Presence** → **Iron Presence**: Your damage makes 60% more threat, and your taunts hold 2s longer. +20% armour. *Cost: −10% damage.*
- **Unbroken** → **Unbroken**: A blow that would kill you leaves you on 1 health instead — once every 90 seconds. *Cost: −8% damage.*

### The Slow Mend — Nothing on this arm makes a hit hurt less. It gives back what the hit cost you.

30 nodes. Paths:

- **Slow Blood** → **Slow Blood**: 14% life steal, and +5 health a second on top. *Cost: −70 maximum health. You live on what comes back, not on what you had.*
- **The Second Wind** → **Second Wind**: The first time a blow takes you under 35% health you heal 20% of your maximum health — once every 45 seconds. +1 health a second. *Cost: None but the walk.*
- **Spoils of the Fallen** → **Spoils of the Fallen**: Every killing blow you land gives you a barrier worth 8% of your maximum health for 6s. +10 health on every kill. *Cost: None but the walk.*

### The Light Step — The hits that never land, and the fights you choose not to be noticed in.

30 nodes. Paths:

- **The Wind Walk** → **Wind Walk**: +15% dodge chance and −25% enemy notice range. *Cost: −35% armour — nothing that does land is softened.*
- **Soft Footfall** → **Soft Footfall**: Your damage makes 40% less threat. −10% enemy notice range. *Cost: Hard to hold an enemy's eye when you need to.*
- **Back to the Wall** → **Back to the Wall**: While you are under 35% health every hit you land deals 25% more. *Cost: −30 maximum health.*

### The Long Odds — What the dead leave behind, and how much of it you notice.

25 nodes. Paths:

- **Fortune's Tithe** → **Fortune's Tithe**: +70% magic find and +30% gold found. *Cost: −12% damage — your eye is on the ground rather than on the fight.*
- **The Collector** → **The Collector**: +25% experience and +40% gold found. *Cost: −8% damage.*

## Companions come later now (P4)

Nothing follows a new character. A class with a companion (warlock, ranger, necromancer, druid, …) gets it at **level 10** and its second body (the warlock's familiar, the necromancer's archer) at **level 20**. A quest can hand it over earlier, and the **Early Bond** keystone (The Kept Company arm) brings it as soon as you take it. Summoning *skills* still unlock with their slot (levels 1/3/6/12/18/24).

---
For the code: `js/rules/talents.js`, `js/rules/perk-forest.js`, `js/rules/perk-rules.js`, data in `data/rules/`; the API is in `js/rules/README.md` ("Build: talents and perks").
