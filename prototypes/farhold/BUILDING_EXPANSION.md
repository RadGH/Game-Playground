# Farhold — Building, Refining and Getting Home

The plan for player-made structures: a base you build, a waypoint you raise yourself, a portal that
brings you home, and the industry you need before a planet will let you leave it.

**Nothing here is implemented yet.** This is the design, written first so the pieces fit together —
particularly the waypoint and portal rules, which touch the travel system in `TOWN_EXPANSION.md` §10.

---

## The premise, and what changes

Today the player lands with a Surveyor Lander in their pocket and can buy a better one from a village
merchant. That makes a planet a lobby. The goal instead:

> **You do not start with a ship and you cannot buy one. You build a base, you dig up ore, you refine
> it, you make fuel, and only then does the sky open.**

So the progression becomes: **survive → settle → refine → defend → leave.** Every system below
exists to serve one of those five words.

### Prior art to borrow, not reinvent

`prototypes/frontier-foundry/` already built most of this machinery for a different game: 77
resources, 101 structures, 67 recipes, a power grid with duty-cycled generators and load shedding,
storage pools, and tower-defence waves. Its data files and its **pool** idea (stores that reach each
other share everything; further away needs hauling) should be lifted wholesale rather than written
again. What Farhold adds is that it is all happening in third person, on a real planet, at walking
scale.

---

## 1. Raw materials: where things come from

Gathering has to be worth doing on foot, in third person, without becoming a second job.

| # | Source | Notes |
|---|---|---|
| 1.1 | **Ore nodes** — visible outcrops | Iron, copper, tin, coal, silver, gold. Biome-weighted. |
| 1.2 | **Deep veins** in caves and mines | Better yield, guarded. Reuses `js/dungeon.js`. |
| 1.3 | **Rare elements** on rare worlds | `universe/data/elements.json` already assigns 1–2 per planet — this is what makes leaving *this* planet possible. |
| 1.4 | **Trees** | Felled for timber; regrow over in-game days. |
| 1.5 | **Stone** from boulders and quarries | The bulk material; heavy, wants hauling. |
| 1.6 | **Clay and sand** from riverbanks and shores | Brick, glass, moulds. |
| 1.7 | **Plant fibre and reeds** | Rope, cloth, thatch. |
| 1.8 | **Hides, bone, sinew** from hunting | Ties the bestiary into the economy. |
| 1.9 | **Salvage** from wrecks and ruins | Worked metal without smelting — the early shortcut. |
| 1.10 | **Water** from rivers, wells, rain catchers | Needed for coolant and some refining. |
| 1.11 | **Crystal** from crystal-world biomes | Optics, focusing, high-tier power. |
| 1.12 | **Volcanic glass and sulphur** | Volcanic worlds; explosives and fuel precursors. |
| 1.13 | **Ice** on frozen worlds | Melts to water; some worlds have no liquid. |
| 1.14 | **Gas vents** | Captured with a collector structure, not by hand. |
| 1.15 | **Meteor fall sites** | Already in the game as an event — make them lootable for rare metal. |
| 1.16 | **Scrap from cleared bandit camps** | Another reason to clear one. |
| 1.17 | **Farm plots** for food and fibre | Slow, safe, renewable. |
| 1.18 | **Buying raw stock from towns** | Always possible, always the expensive route. |
| 1.19 | **Node richness varies by planet band** | A low-band starter world has enough to leave, and no more. |
| 1.20 | **Nodes respawn on a timer** | So a base site does not go sterile. |

**Recommendation:** hand-mining is a held-tool interaction with a swing and a yield-per-hit, and it
should stay slow enough that building a **drill** feels like a promotion rather than a convenience.

---

## 2. Refining: raw to useful

Three tiers, each a structure, each needing the one before it.

| # | Item | Notes |
|---|---|---|
| 2.1 | **Campfire** | Tier 0. Cook, boil, burn. Free, no power. |
| 2.2 | **Furnace** | Ore → ingot. Burns coal or wood. The first real structure. |
| 2.3 | **Kiln** | Clay → brick, sand → glass. |
| 2.4 | **Smelter** | Faster furnace, multiple inputs, needs power. |
| 2.5 | **Alloy forge** | Two ingots → an alloy. Gates mid-tier gear. |
| 2.6 | **Sawmill** | Logs → planks and beams at a sane rate. |
| 2.7 | **Stonecutter** | Rubble → block; the wall tool's feedstock. |
| 2.8 | **Tannery** | Hides → leather. |
| 2.9 | **Loom** | Fibre → cloth → rope. |
| 2.10 | **Chemical bench** | Sulphur, salt, water → reagents. |
| 2.11 | **Refinery** | Reagents + ore → refined compounds. Tier 2 gate. |
| 2.12 | **Fuel synthesiser** | The one that matters — see §9. |
| 2.13 | **Crusher** | Ore → dust; better yield, costs power. |
| 2.14 | **Washer** | Dust + water → concentrate. Another yield step. |
| 2.15 | **Assembler** | Components → machine parts. The gate to every tier-3 structure. |
| 2.16 | **Crystal cutter** | Crystal → lenses and focusers. |
| 2.17 | **Byproducts are real** | Slag, ash, tailings. Dump them or process them. |
| 2.18 | **Recipes unlock by doing** | Smelt iron ten times and the alloy recipe appears. No tech tree screen for tier 1. |
| 2.19 | **Everything queues** | Set a job and walk away; it runs while you fight. |
| 2.20 | **Refining is where power starts to matter** | Tier 0–1 burns fuel; tier 2+ needs a grid. |

---

## 3. Crafting: useful to useful

| # | Item | Notes |
|---|---|---|
| 3.1 | **Crafting table** | The tier-1 bench. Tools, basic gear, structure kits. |
| 3.2 | **Anvil** | Weapons and armour from ingots. Feeds the existing `js/craft.js`. |
| 3.3 | **Workbench** | Machine parts, furniture, decorative pieces. |
| 3.4 | **Enchanting altar** | Ties into the existing affix and upgrade system. |
| 3.5 | **Alchemy bench** | Potions, oils, explosives. |
| 3.6 | **Fletching bench** | Arrows and the quivers that already exist in `js/gear.js`. |
| 3.7 | **Cooking station** | Food buffs; ties to the travel/rations layer. |
| 3.8 | **Existing crafting stays** | `js/craft.js` recycles gear into materials — that becomes one input among several, not the only one. |
| 3.9 | **Blueprints as items** | Found, bought, or rewarded from raids. |
| 3.10 | **Recipe book in the sheet** | A tab, filtered by what you can actually make right now. |
| 3.11 | **Craft-from-storage** | If a store is in range, you do not have to carry the parts. |
| 3.12 | **Batch crafting** | Make ten, walk away. |
| 3.13 | **Quality from the bench tier** | A better anvil rolls better. |
| 3.14 | **Tools wear out** | Gently — this is not a survival sim. |
| 3.15 | **Ship parts are craftable** | Hull, drive, tanks, avionics. §9. |
| 3.16 | **Waypoint core is craftable** | The centrepiece. §5. |
| 3.17 | **Portal reagents** | Consumed by the town portal if we want it limited. Recommend: not limited. |
| 3.18 | **Deconstruct anything you built** | Most materials back. Building should not punish experimenting. |
| 3.19 | **Craft queue is shared with refining** | One job list, one UI. |
| 3.20 | **No recipe is a dead end** | Every output is an input to something, or is itself the goal. |

---

## 4. Building: the structures and the tools

### 4a. The build mode

| # | Item | Notes |
|---|---|---|
| 4.1 | **A build mode you toggle** | Ghost preview, green/red validity, rotate, snap. |
| 4.2 | **Grid snapping with free rotate** | Snap by default, hold a key for free placement. |
| 4.3 | **Snap to existing pieces** | Walls join walls; floors tile. |
| 4.4 | **Material cost shown on the ghost** | And what you are short of. |
| 4.5 | **Build from storage in range** | Not from your pockets. |
| 4.6 | **Structural sense, not structural simulation** | A piece needs support under or beside it. No full stress model. |
| 4.7 | **Deconstruct tool** | Refunds most of the cost. |
| 4.8 | **Copy/blueprint a built cluster** | Stamp it again elsewhere. |
| 4.9 | **Undo the last placement** | Cheap and hugely forgiving. |
| 4.10 | **Claim area** | A base has a boundary; it is what raids target and what stops a town generating on top of you. |

### 4b. Terrain transformation

| # | Item | Notes |
|---|---|---|
| 4.11 | **Smoothing tool** | Flattens ground to a level within a radius. The single most-needed tool — you cannot build on Farhold's terrain otherwise. |
| 4.12 | **Raise / lower** | Limited range so nobody digs to the core. |
| 4.13 | **Terrain edits are saved as a delta** | Like The Territory's zone deltas: store what changed, not the world. |
| 4.14 | **Road tool** | Paint a road; it conforms, gets a skirt, and flattens under itself — the same street mesh code as `TOWN_EXPANSION.md` §4. |
| 4.15 | **Road connects to the world road graph** | Your road can join the real one, and traffic will use it. |
| 4.16 | **Wall tool** | Drag a run of wall; it follows terrain, corners itself, and takes a gate where you put one. |
| 4.17 | **Foundation slabs** | Flatten and floor in one action. |
| 4.18 | **Water edits: channels and ponds** | Ties into the river/water plan work. |
| 4.19 | **Clearing tool** | Remove trees and rocks; they drop their materials. |
| 4.20 | **A limit on how much you may reshape** | Per claim, so the planet is not sculpted flat. |

### 4c. Decorative structures

Purely for making a place yours. None of them do anything, and that is the point.

Banner · brazier · bench · table and chairs · rug · bookshelf · barrel and crate stack · hanging
sign · statue · fountain · planter and flower bed · hedge · fence and gate · lamp post · wall
sconce · window box · shutters · weather vane · chimney pot · trophy mount · bed · chest of
drawers · wardrobe · cooking pot · washing line · well head · dovecote · beehive · scarecrow ·
paving and path tiles · carpet of moss · potted tree · wind chime · a nameplate over the door.

**Street lights specifically:** lamp post (oil), wall sconce, hanging lantern, brazier, and a
crystal lamp at high tier. They should genuinely light — the same `js/light.js` pool the torch
uses — and they should be the first thing a player builds after walls, because Farhold's nights are
dark and that is the point of them.

### 4d. Manufacturing structures

Crafting table · anvil · workbench · furnace · kiln · smelter · alloy forge · sawmill ·
stonecutter · tannery · loom · chemical bench · refinery · crusher · washer · **assembler** ·
crystal cutter · fuel synthesiser · drill (automated node mining) · pump · conveyor or hauler
drone · storage crate · storage silo · logistics pole (defines a storage pool) · power generator
(burner) · wind turbine · solar array · geothermal tap · battery bank · power pole.

### 4e. Defensive structures

| Structure | What it does |
|---|---|
| Palisade / stone wall / reinforced wall | Three tiers of the wall tool's output |
| Gate | Opens for you, not for them |
| Watchtower | Line of sight; a hired archer can stand on it |
| Arrow turret | Cheap, fast, low damage |
| Ballista turret | Slow, heavy, single target |
| Flame turret | Short range, area, good against packs |
| Frost turret | Slows — the only crowd control |
| Tesla coil | Chains; expensive, needs real power |
| Spike trap / caltrops | Cheap area denial |
| Pit trap | Terrain tool plus a cover |
| Barricade | Redirects pathing; the tower-defence primitive |
| Repair station | Heals structures between waves |
| Alarm bell | Early warning, and starts the wave on your terms |
| Hired guards | Spend gold instead of materials |
| Shield pylon | Absorbs a fixed amount per wave |
| Ammo hopper | Turrets need feeding; this is the logistics hook |

---

## 5. The waypoint, and building your own

**The design, corrected from the earlier draft:** a waypoint is **one design everywhere** — a round
concrete pad with arcane sigildry cut into its face. Identical on every world, in every culture, in
every town. Dark and inert until activated; the sigils light when it is live. It is not a local
monument, it is one network, and it has to read as one thing.

| # | Item | Notes |
|---|---|---|
| 5.1 | **Every town and city has one** | Placed by the town planner, in or beside the square. |
| 5.2 | **Hostile places never do** | No waypoint at a bandit camp, fort, cult site or ruin. |
| 5.3 | **Activated by entering the town** | Crossing the boundary is enough; you need not walk to the pad. |
| 5.4 | **Travel puts you ON the sigil** | Never beside it, never above it. |
| 5.5 | **The player can build one** | The one exception to "towns only" — see below. |
| 5.6 | **A Waypoint Core is the craft** | Tier-3: refined metal, a cut crystal, and a rare element from the planet. It should be a genuine milestone. |
| 5.7 | **The pad is built around the core** | Concrete, then the sigil ring, then the core is seated. |
| 5.8 | **Your waypoint joins the network** | It appears on the map like any other, with your base's name. |
| 5.9 | **One per base claim** | Not one per player — you may have several bases. |
| 5.10 | **It needs power to stay lit** | A dark waypoint cannot be travelled to. A reason to keep the grid up. |
| 5.11 | **Raids target it** | It is the obvious thing to defend. |
| 5.12 | **Rebuildable if destroyed** | The core survives; the pad is cheap. |
| 5.13 | **Travel costs in-game time** | Hours pass. Fast travel, not teleportation. |
| 5.14 | **Blocked in combat and underground** | As with town waypoints. |
| 5.15 | **Cross-planet travel is NOT a waypoint** | A waypoint moves you on one world. Leaving needs a ship. |
| 5.16 | **Waypoints are saved per world** | Part of the save, like learned region names. |
| 5.17 | **A journal list of them** | Zone, band, who holds the ground. |
| 5.18 | **On the minimap with a rim arrow** | As other markers already are. |
| 5.19 | **The sigil lights in your faction's colour** | Small touch, strong ownership signal. |
| 5.20 | **"Go here" stays, as a debug tool** | Explicitly labelled as one. |

---

## 6. The Town Portal

The piece that makes going home cheap and coming back free.

**The rule, in one paragraph.** When you travel to a waypoint, a **portal opens at that waypoint,
leading back to exactly where you were standing when you left.** Step through it and you are
returned. Opening a new portal **closes any existing one**, so there is never more than one open and
never any ambiguity about where it goes.

| # | Item | Notes |
|---|---|---|
| 6.1 | **Opens automatically on waypoint travel** | No item, no cost, no button. |
| 6.2 | **Anchored to the departure point** | The exact spot, the exact world. |
| 6.3 | **Exactly one exists at a time** | A new one closes the old one, with a clear message. |
| 6.4 | **Stands on the waypoint pad** | Rising out of the sigils — visually obviously related. |
| 6.5 | **Interact with `E` to return** | The same key as everything else. |
| 6.6 | **Two-way while open** | Walk back to town through it if you want. |
| 6.7 | **Closes on use** | Optional; recommend it stays open until replaced, which is kinder. |
| 6.8 | **Shown on the map and minimap** | Both ends. |
| 6.9 | **A timer, or not** | Recommend **no timer** — an expiring portal makes players rush, which is not fun. |
| 6.10 | **Closes if the anchor becomes invalid** | You left the planet; the dungeon collapsed. Say so plainly. |
| 6.11 | **Survives a save and reload** | Or it is useless. Part of the save. |
| 6.12 | **Blocked from inside a boss fight** | Or bosses become trivial. |
| 6.13 | **Works out of a dungeon** | Anchored to where you stood inside it. This is most of its value. |
| 6.14 | **A visible, readable effect** | Reuse `avatar-3d/js/spellfx.js`. |
| 6.15 | **Sound cue on open and close** | `sfx/` has the catalogue. |
| 6.16 | **Companions and pets come through** | Obviously, and it must be tested. |
| 6.17 | **A scroll item as a second route** | Opens a portal where you stand, back to your last waypoint — the reverse direction. Optional, but this is the classic. |
| 6.18 | **Never opens inside geometry** | Validate the spot; nudge if needed. |
| 6.19 | **The journal records where it goes** | "Portal: the Sunken Vault, level 3." |
| 6.20 | **One test per rule above** | Especially "exactly one" and "survives a reload". |

---

## 7. Raids: the base has to be worth defending

Waves that attack your base once it is big enough to notice — tower defence, in third person, with
you in the middle of it.

| # | Item | Notes |
|---|---|---|
| 7.1 | **Triggered by base size AND defences** | Both. A base with no turrets is not raided; that would be a punishment for building a house. |
| 7.2 | **A "notoriety" score** | Structures + refining throughput + waypoint + wealth. Crossing thresholds unlocks raid tiers. |
| 7.3 | **Warning first** | A rumour, then an alarm, then the wave. Never a surprise. |
| 7.4 | **You may start it early** | The alarm bell. Fight on your terms, get a bonus. |
| 7.5 | **Waves, with a breather between** | Three to seven, scaling. |
| 7.6 | **Composition from the local bestiary** | A raid on a marsh base is marsh creatures. Not a generic horde. |
| 7.7 | **Faction raids too** | If you are hated enough, people come — and they use the roads and the gates. |
| 7.8 | **They path to the waypoint or the refinery** | Something specific, so defences can be placed meaningfully. |
| 7.9 | **Barricades redirect, walls stop, turrets kill** | The three-way that makes tower defence work. |
| 7.10 | **Structures take damage and can be repaired** | Between waves, by hand or by a repair station. |
| 7.11 | **Losing is not catastrophic** | Broken structures, stolen materials. Never a deleted base. |
| 7.12 | **A boss on the final wave** | Named, with modifiers, from §C's new modifier set (Giant, Fiery, and the rest). |
| 7.13 | **Reward: a rare loot crate, minimum** | Guaranteed. Higher tiers give better. |
| 7.14 | **Plus materials and blueprints** | Raid-only blueprints are a strong pull. |
| 7.15 | **Plus faction standing** | Whoever hates the raiders likes you. |
| 7.16 | **Raid history in the journal** | What came, what you lost, what you won. |
| 7.17 | **Difficulty scales with your level and your defences** | Not with calendar time. |
| 7.18 | **Night raids are harder and pay more** | The world already has a night-raid rule; reuse its balance block. |
| 7.19 | **A toggle in settings** | Some players want to build in peace. Respect that. |
| 7.20 | **Frontier Foundry's wave code is prior art** | Lift it. |

---

## 8. Power and logistics

| # | Item | Notes |
|---|---|---|
| 8.1 | **Storage pools, not belts** | Frontier Foundry's idea, and the right one: stores within reach of each other share everything. |
| 8.2 | **Logistics pole defines the pool radius** | Visible on the ground. |
| 8.3 | **Further away needs hauling** | A cart, a pack animal, or a drone. |
| 8.4 | **Power grid with generation, storage and draw** | Burner → wind → solar → geothermal. |
| 8.5 | **Load shedding when short** | Lowest-priority machines idle first, and say so. |
| 8.6 | **Power poles and a visible network** | You should be able to see what is connected. |
| 8.7 | **Batteries carry you through the night** | Which makes solar a real decision. |
| 8.8 | **Machines show their state** | Running, idle, starved, unpowered — at a glance, on the machine. |
| 8.9 | **A base overview panel** | Throughput, power, storage, notoriety. |
| 8.10 | **Alerts for starvation and outage** | In the log, not a modal. |

---

## 9. Leaving the planet: the real gate

The endgame of this document, and the reason the rest exists.

| # | Item | Notes |
|---|---|---|
| 9.1 | **You do not start with a ship** | The Surveyor Lander goes away as a starting item. |
| 9.2 | **You cannot buy one** | Remove ships from shop stock entirely. Boats stay buyable. |
| 9.3 | **A wreck is the tutorial** | You start near a crashed hull. It is the blueprint and some of the parts. |
| 9.4 | **Four subsystems to build** | Hull, drive, tanks, avionics. Each a tier-3 craft. |
| 9.5 | **Each needs a different refined material** | So all of §2 gets used. |
| 9.6 | **One needs a rare element** | From `universe/data/elements.json` — and not every planet has every element, so you may have to go somewhere for it. By boat, on foot. |
| 9.7 | **Fuel is separate and consumable** | The fuel synthesiser is the last structure. |
| 9.8 | **A launch pad is a structure** | Flat ground, power, clearance. The terrain tools exist for this. |
| 9.9 | **First launch is a set piece** | It should feel enormous. |
| 9.10 | **Fuel is needed per flight** | Not per launch only — so the industry stays relevant. |
| 9.11 | **Better ships are built, not bought** | The three hulls in `js/gear.js` become buildable tiers. |
| 9.12 | **A ship can be lost** | And rebuilt from the pad. |
| 9.13 | **The pad is a waypoint for ships** | Return-to-pad from orbit. |
| 9.14 | **Other planets need their own bases** | Which is the whole second act. |
| 9.15 | **Interstellar travel needs a further tier** | The warp drive, gated behind a second rare element. |
| 9.16 | **Quest chain scaffolds it** | So the player is never guessing what to build next. |
| 9.17 | **The campaign already has a ledger** | `data/campaign.json` — hang this on it. |
| 9.18 | **Skipping is possible but expensive** | Buying a finished drive from a city at an absurd price. Keeps the world open. |
| 9.19 | **Existing saves need a migration** | Anyone mid-run keeps their ship. |
| 9.20 | **The whole gate is one balance block** | In `data/balance.json`, tunable without code. |

---

## 10. Order of work, and what it touches

1. **Terrain tools** (§4b) — smoothing first. Nothing can be built until the ground can be levelled.
2. **Build mode + basic structures** (§4a, 4c) — placement, snapping, deconstruct.
3. **Gathering + tier-1 refining** (§1, §2.1–2.9) — furnace, sawmill, stonecutter.
4. **Storage pools and power** (§8).
5. **Crafting benches** (§3) — folding in the existing `js/craft.js`.
6. **The waypoint and the portal** (§5, §6) — the quality-of-life payoff, delivered early.
7. **Defences and raids** (§4e, §7).
8. **Tier-3 refining and the ship gate** (§2.10–2.20, §9) — last, because it ends the arc.

**Files this will touch:** a new `js/build.js`, `js/refine.js`, `js/power.js`, `js/raid.js`,
`js/portal.js`; terrain deltas in `js/planet.js` and the save; new data in
`data/{structures,recipes,materials,raids}.json`; the town planner for the town waypoint; the map and
minimap for waypoints and portals; and `js/gear.js` to stop handing out a free starship.

**Tests this will need:** terrain deltas survive a reload; a structure never floats or intersects;
exactly one portal exists; a portal survives a save; a waypoint needs power; a raid never spawns
inside the walls; every recipe's output is some other recipe's input or a goal; and the ship gate is
completable from a fresh start on a low-band world.
