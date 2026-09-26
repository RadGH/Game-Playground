# Five pitches — side-scrolling pixel-physics action RPG with a spell builder

Shared by all five (these come from the brief and are not repeated below): side view, falling-sand pixel
world, small player who builds / swings on ropes / pulls levers / presses buttons, a spell builder, level ups
with skills + attributes, a branching act map, full-screen map + minimap, inventory, shops with quirks, bosses
with phases + telegraphs + void zones, a campaign plus Waves and Endless, Lingo + Voice Lab for speech, a
damage meter, three starting classes and more unlocked by challenges, rain/water/coloured light/reflections.
Tech for all five: plain ES modules, WebGL2 renderer over a cell grid, no build step.

---

## 1. LANTERNFALL — "the city drowned, and the lamps went out"

**Setting.** Vessmere, a vertical canal city built down a chasm. The Rain has not stopped for forty years;
the lower wards are flooded and dark. You are a Lamplighter — a tiny figure with a lantern on a pole — sent
down from the last lit tier to relight the Great Lamps, one per act, each at the bottom of a deeper district.

**Spell builder — "Wicks".** A spell is a lantern wick braided from three strands: a **Flame** (the element:
ember, frost-light, spark, bile, gleam, shade), a **Shape** (bolt, arc, lob, beam, ring, rune-trap, wave)
and up to two **Charms** (split, bounce, linger, pierce, siphon, heavy, echo). Strands are found as loot
and bought; a wick costs "oil" (mana). Every Flame is also a *light colour*, so your spells literally light
the level in their colour, and darkness is a real threat (things live in it).

**Mechanic unlocks (acts).** Act 1 lantern + jump; Act 2 grapple hook and ropes; Act 3 **water physics**
matters — you can drain and flood chambers with sluice levers, spells behave differently underwater;
Act 4 the **Lamp-oil economy** — light is finite, creatures hunt in the dark; Act 5 **gravity lanterns**
flip local gravity; Act 6 **the Rain stops** and everything that was held in water falls.

**Classes.** Lamplighter, Sluicewarden, Tinker (start); Ferrywitch, Bellringer, Drowned Knight, Moth
Oracle, Chimneysweep (unlockable).

**Hook.** Light + water + reflections are the story itself: the whole game is about pushing colour back
into a dark flooded city. Easy to make beautiful with the requested rain/reflection tech.

**Risk.** Darkness gameplay can frustrate; dark palettes can read muddy.

---

## 2. RUNEWEALD — "a forest that writes back"

**Setting.** A thorn-overgrown kingdom where the trees grew around the old wizard towers and absorbed
their runes. You are a Seedling, a small woodland spirit-knight.

**Spell builder — "Grafting".** Spells are grown on a branching tree: root rune (element) → stem rune
(delivery) → leaf runes (modifiers). Each graft slot has a sap cost; spells level up with use.

**Mechanic unlocks.** Growing vines as ladders/bridges, burning thorns, seasons that change the terrain
(autumn leaves fall as physics particles, winter freezes water into walkable ice, spring floods).

**Classes.** Seedling, Thornguard, Mossmage (start); Beekeeper, Stagcaller, Lichen Hermit, Ashwarden.

**Hook.** Seasons as mechanic gates — whole levels change state.

**Risk.** Seasons quadruple level design work; forest palettes skew green; less natural reason for
coloured lighting and reflections.

---

## 3. TIDEBOUND — "every act, the sea comes higher"

**Setting.** A storm archipelago. You are a Wreck-diver salvaging a sunken empire's spell-engines.

**Spell builder — "Engines".** Spells are small machines: a Core (element), a Housing (shape) and
Gears (modifiers), with heat and pressure limits — overload and it explodes in your hand.

**Mechanic unlocks.** Diving bell, harpoon rope, tides that rise and fall on a clock, ship boarding.

**Classes.** Diver, Harpooneer, Stormcaller (start); Lighthouse Keeper, Coral Witch, Bosun, Drowned
Priest.

**Hook.** Tides make every level two levels.

**Risk.** Lots of water simulation over large volumes is expensive in a browser; underwater combat is
often slow and unfun.

---

## 4. CINDERSPIRE — "climb the volcano before it wakes"

**Setting.** A vertical climb up the inside of a living volcano. Tiny Ashling hero; lava, obsidian,
steam.

**Spell builder — "Forge".** Spells are forged at anvils from ore-runes; heat is both mana and a danger
meter.

**Mechanic unlocks.** Lava cooling into stone (build your own platforms with frost spells), steam lifts,
magma rising timer, pressure vents.

**Classes.** Ashling, Smelter, Cinder Monk (start); Glassblower, Obsidian Knight, Salamander, Bellows-
Priest.

**Hook.** Relentless vertical pressure; fire + ice interplay.

**Risk.** Red/orange everywhere; the brief asks for rain and water, which a volcano fights.

---

## 5. STORMGLASS — "spells are circuits"

**Setting.** A clockwork city under a permanent lightning storm, where magic is conducted through glass
wires. You are a Spark, a tiny courier automaton.

**Spell builder — "Circuits".** A visual node graph: Trigger (on cast, on hit, on timer, on death) →
Carrier (bolt, beam, arc…) → Payload (element) with wires between; nested triggers.

**Mechanic unlocks.** Conductive water, magnets, gears, powering machines with your own spells.

**Classes.** Spark, Governor, Arc-Welder (start); Bellwright, Lens-Grinder, Coilwitch, Porcelain Duelist.

**Hook.** The deepest spell system of the five — real programming-lite combos.

**Risk.** A node graph is intimidating early and hard to balance; "start easy" fights it.
