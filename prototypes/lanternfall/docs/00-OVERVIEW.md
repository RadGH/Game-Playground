# LANTERNFALL — Design Bible (page 00: overview and canon)

> *"The Rain has not stopped for forty years. Go down, Lamplighter. Light them again."*

This page is the **canon**. Every other page in `docs/` expands one part of it, and must use the names,
ids and numbers fixed here. If another page disagrees with this one, this one wins until it is changed on
purpose (and the change is logged in `docs/CHANGELOG.md`).

| Page | Covers |
|---|---|
| `00-OVERVIEW.md` | this page: pitch, pillars, canon lists (acts, classes, flames, shapes, charms, bosses, shops, modes) |
| `01-WORLD-STORY.md` | Vessmere, history, every district, NPCs by name, story beats, dialogue plan (Lingo + Voice Lab) |
| `02-CONTROLS-UI.md` | every hotkey, gamepad, menus, HUD, full-screen map, minimap, inventory, pause screens, settings |
| `03-SPELLS.md` | the Wick builder: flames, shapes, charms, knots, overcharge, burn-in, every number, material interactions |
| `04-CLASSES-PROGRESSION.md` | 8 classes, their kits, attributes, skill boards, levelling, unlock challenges |
| `05-BESTIARY-BOSSES.md` | every monster, AI behaviour, elites, all 6 bosses phase by phase, telegraphs and void zones |
| `06-PHYSICS-RENDER.md` | the cell world, materials, water/steam/fire/ice, rain, light, reflections, render pipeline, performance |
| `07-TRAVERSAL-PUZZLES.md` | movement, ropes, grapple, levers, buttons, doors, traps, building, puzzle catalogue |
| `08-ITEMS-SHOPS.md` | inventory, gear, consumables, currencies, loot tables, every shop and its quirk |
| `09-MODES-MAP.md` | campaign act maps (branching), room types, Waves, Endless, Daily Wick, Boss Rush, challenges |
| `10-TECH-DATA.md` | architecture, file layout, data files and schemas, save format, room authoring, tests, perf budgets |

---

## 1. The pitch

**Lanternfall** is a side-scrolling action RPG drawn at the pixel level. Every pixel of the world is a
simulated cell: stone crumbles, wood burns, water pours and pools, oil floats and ignites, steam rises,
frost freezes a waterfall into a ladder. You are small: a Lamplighter a dozen pixels tall, carrying a lantern
on a pole down the side of a drowned chasm-city. You **braid your own spells** ("wicks") out of a *Flame*
(element and light colour), a *Shape* (how it travels) and *Charms* (what it does besides). Every spell you
cast is also a **coloured light**: it lights the rain, glints off wet stone and reflects in the black water
below. The whole game is pushing colour back into a dark, flooded city.

## 2. Pillars

1. **Light is the story and the mechanic.** Every flame is a colour; every relit Great Lamp changes the whole
   district's palette and behaviour. The art direction's job is to make light feel earned.
2. **The world is made of stuff.** Pixel physics is not decoration. Every spell element has a rule against
   every material, and the rules are the puzzles.
3. **Build the spell, then prove it.** The Wick builder is the main character progression. Gear and levels
   support it; they never replace it.
4. **Each act changes the verbs.** Each act adds one mechanic big enough that the game plays differently
   afterwards (see §6). Act 1 is easy on purpose.
5. **Readable danger.** Telegraphs, void zones and enemy eyes always light themselves. Darkness hides
   *terrain*, never the attack that is about to kill you.
6. **Small and fast.** The player is small, the camera is close, the rooms are dense. A room takes 30 s to 4 min.

## 3. Art direction (summary; full detail in page 06)

- **Logical resolution 480 × 270** cells visible (16:9), integer-scaled to the window (×2 at 960p … ×4 at
  1080p with letterbox-free fitting by cropping up to 1 cell row). One world cell = one art pixel.
- **Palette:** the unlit world is a narrow band of blue-greys and wet blacks (a 24-colour "drowned" ramp).
  Colour comes **only from light**: the 7 flames, the Great Lamps, lanterns, bioluminescence. A relit
  district shifts its ambient ramp warmer.
- **Rain always.** Two layers of rain (foreground streaks in the cell sim; background parallax streaks in the
  shader) until the final act.
- **Reflections** on every water surface and on wet ground (a sheen mask), done in a shader pass (page 06).
- **Bloom** on light sources; **no** chromatic aberration, **no** screen-wide blur. Crisp pixels.
- **The player** is 6 × 12 cells, a hooded figure with a pole-lantern whose light colour is the equipped
  flame of the currently selected wick.
- Typeface: pixel font (our own 5×7 bitmap font, drawn in code) for in-world text; `Spectral` / `Cinzel`
  (already used in Emberveil) for menus.

## 4. Setting in one paragraph

**Vessmere** was a trading city built down the walls of the **Hollow**, a chasm a mile deep. Its light came
from the **Great Lamps**: six vast lanterns, one per tier, fed with lamp-oil drawn from the chasm's black
springs by the **Lamplighters' Guild**. Forty years ago the **Cloudwarden Ossery Vane** tried to end a drought
by binding the sky. The binding held too well: the **Rain** began and never stopped. The Hollow filled,
the lower tiers drowned, the Lamps guttered out one by one, and things came up out of the dark water.
Only the top tier, **Lanterncrown**, is still lit. You are the last apprentice of the Guild, sent down
to relight the Lamps and to find out what is keeping the Rain alive.

## 5. Acts (canon)

| # | Act / district (id) | Great Lamp | Mechanic that arrives | Boss (id) |
|---|---|---|---|---|
| 1 | **Lanterncrown & the Wax Stair** (`act1`) | the Crown Lamp | Wicks (Flame + Shape), melee pole, jump, plank-building | **Mother Tallow** (`boss_tallow`) |
| 2 | **The Gutterways** (`act2`) | the Gutter Lamp | **Grapple hook + ropes**, levers/buttons/doors, 1 Charm slot | **Saint Gnaw of the Rat Choir** (`boss_gnaw`) |
| 3 | **The Sluice Ward** (`act3`) | the Sluice Lamp | **Water matters**: sluice gates flood/drain rooms, swimming, the Tide flame, 2 Charm slots | **The Sluicemaw** (`boss_sluicemaw`) |
| 4 | **Blackwater** (`act4`) | the Deep Lamp | **Darkness + oil light economy**, the Unlit hunt in the dark, **Knots** (spell triggers) | **The Lampless Widow** (`boss_widow`) |
| 5 | **The Bellwell** (`act5`) | the Bell Lamp | **Gravity lanterns** flip local gravity, bells that shake loose terrain | **The Bellfather** (`boss_bellfather`) |
| 6 | **The Cloudroot** (`act6`) | the Sky Lamp | **The Rain stops**: every held body of water falls, Overcharge mastery, the final climb up | **Ossery Vane, the Cloudwarden** (`boss_ossery`) |

Act 6 is climbed *up* (the Cloudroot is a colossal root of bound cloud growing up the Hollow): the camera and
the flooding run in reverse.

## 6. The mechanic ladder (the "starts easy" promise)

| Unlocked at | Mechanic | What changes |
|---|---|---|
| Start | Move, jump, pole swing (melee), 1 wick slot with **Ember** + **Bolt** | A plain action platformer |
| Act 1 room 3 | **Wick builder** (Flame + Shape), 2 wick slots | You invent your ranged attack |
| Act 1 mid | **Plank kit** (build planks/braces from scrap) | You make your own ledges |
| Act 2 start | **Grapple hook**, rope swinging, rope-climb | Rooms become vertical and swingy |
| Act 2 mid | **Charm slot 1**; levers, buttons, pressure plates, timed doors | Spells get modifiers; puzzles begin |
| Act 3 start | **Sluice control + swimming**, **Tide** flame, Charm slot 2, 3 wick slots | Water is terrain you change |
| Act 4 start | **Darkness & oil**: your lantern burns oil, light is finite, the Unlit hunt in darkness; **Knots** | Spells can chain; light management |
| Act 5 start | **Gravity lanterns** (place/flip local gravity), 4 wick slots | Every room is two rooms |
| Act 6 start | **The Rain stops**; **Overcharge mastery** (safe overcharge); Charm slot 3 | The world falls; the game is your build at full power |

Every unlock is also a **tutorial room** with no enemies (a "Lesson room", page 09) that teaches it with a
physical puzzle before any fight uses it.

## 7. Classes (canon; kits in page 04)

Three start unlocked. Five are unlocked by challenges.

| Class (id) | Role | Starts with | Unlock challenge |
|---|---|---|---|
| **Lamplighter** (`lamplighter`) | balanced caster-duelist | pole lantern, +20% oil, Ember Bolt + Gleam Ring | default |
| **Sluicewarden** (`sluicewarden`) | tank, water control | hook-staff, bulwark shield, Tide Wave + Rime Arc | default |
| **Tinker** (`tinker`) | builder, traps, turrets | wrench, big plank kit, Spark Rune + Ember Lob | default |
| **Ferrywitch** (`ferrywitch`) | summoner of drowned dead | oar-staff, raises "Oarsmen" from corpses in water | Defeat the Sluicemaw without leaving the water for more than 10 s at a time |
| **Bellringer** (`bellringer`) | sound, stagger, area control | hand-bell and maul; spells can carry a "toll" | Ring all 12 Silent Bells hidden across Acts 1–4 |
| **Drowned Knight** (`drowned_knight`) | lifesteal bruiser, breathes water | anchor-blade, no drowning | Die 3 times underwater and then clear an act without dying |
| **Moth Oracle** (`moth_oracle`) | light-sight, crits in darkness | moth-lamp, sees in darkness, marks | Clear Blackwater (Act 4) without your lantern ever going out |
| **Chimneysweep** (`chimneysweep`) | agile skirmisher, rope master | brush-spear, double jump, wall-run | Swing 2,000 m on ropes in one run, or finish the Rope Gauntlet challenge room |

## 8. The spell system (canon ids; numbers in page 03)

A **Wick** = 1 **Flame** + 1 **Shape** + 0–3 **Charms** (+ 0–1 **Knot** from Act 4). Wicks cost **oil**.

**Flames (7)** — each is an element *and* a light colour:

| id | Name | Light colour | Core effect | Unlock |
|---|---|---|---|---|
| `ember` | Ember | amber `#ff8a2a` | burn (DoT), ignites oil/wood/wax, boils water to steam, melts ice/wax | start |
| `rime` | Rime | cyan `#6fe3ff` | chill/slow, freezes water to ice, puts out fire | Act 1 |
| `spark` | Spark | white-yellow `#fff27a` | chains between targets, electrifies water (hurts all in it), powers machines | Act 1 |
| `bile` | Bile | acid green `#8dff4a` | corrodes armour and dissolves metal/brick cells, poison pools | Act 2 |
| `gleam` | Gleam | gold-white `#ffe6b0` | holy/light: heals allies, burns Unlit, lights dark areas longest | start (Lamplighter) / Act 1 |
| `tide` | Tide | deep blue `#3f7bff` | creates/pushes water, knockback, puts out fire | Act 3 |
| `shade` | Shade | violet `#b25cff` | void: drains light and life, ignores armour, darkens | Act 4 |

**Shapes (8):** `bolt` (fast straight projectile), `arc` (close melee sweep), `lob` (gravity-arcing
grenade), `beam` (continuous line while held), `ring` (expanding nova around you), `rune` (a trap glyph
placed on a surface), `wave` (travels along the ground, climbs slopes), `tether` (a line between two
points: a rope you can climb, and damage to anything crossing it).

**Charms (12):** `split`, `bounce`, `pierce`, `linger`, `heavy`, `swift`, `seek`, `vast`, `siphon`,
`echo`, `volatile`, `steady`. **Knots (4, Act 4+):** `on_hit`, `on_kill`, `on_timer`, `on_land` — a
Knot fires a second (cheaper) wick from the first.

**Overcharge:** hold cast to pour in up to 2× oil for up to +80% power; past the safe line the wick may
**gutter** (burst in your hand). Act 6 mastery removes the burst chance for a single charm slot.

**Burn-in:** each wick levels 1–5 with use (+6% power per level, its light gets brighter).

## 9. Attributes (canon; formulas in page 04)

**Might** (melee, carry, knockback), **Wick** (spell power), **Draught** (max oil, oil regen),
**Nerve** (max health, stagger resistance), **Knack** (crit, build speed, lever/trap speed, loot find).
+3 attribute points and +1 skill point per level. Level cap 30 in the campaign; Endless goes past it.

## 10. Bosses (canon; phases in page 05)

Each boss has 3 phases (the final has 4), every attack telegraphed, and at least one **void zone** type
(a patch of ground or air that hurts while you stand in it, always drawn with a lit rim).

| Boss | Where | Gimmick |
|---|---|---|
| **Mother Tallow** | Wax Stair chapel | a giant candle-woman; she melts as she burns, dropping wax that hardens into terrain; wax pools are void zones while molten |
| **Saint Gnaw of the Rat Choir** | the Gutter Cathedral | a rat-saint conducting a swarm; rope-swinging arena; plague puddles; "choir" phases |
| **The Sluicemaw** | the Great Reservoir | a colossal pike-thing; the arena floods and drains on a cycle; you work sluice levers mid-fight |
| **The Lampless Widow** | the Moth Nave, Blackwater | a moth-spider that eats light; she snuffs your lantern; fight lit by your own spells |
| **The Bellfather** | the Bellwell shaft | a giant bell automaton; each toll flips gravity in a band; shakes the ceiling down |
| **Ossery Vane, the Cloudwarden** | the top of the Cloudroot | 4 phases; controls the rain itself; phase 4 happens as the Rain stops and the flood falls |

## 11. Shops (canon; quirks in page 08)

| Shop (id) | Keeper | Sells | Quirk |
|---|---|---|---|
| **Wick & Tallow** (`shop_wick`) | Odile Pennywax | flames, shapes, charms, oil | prices drop as the district's Lamp is relit; she "tastes" your spells and names them |
| **Crane's Pawn** (`shop_pawn`) | Hollis Crane | anything | buys anything; remembers every item you sold and haggles by mood (Lingo) |
| **The Drowned Market** (`shop_drowned`) | the Pale Congregation | rare charms, pearls | only reachable when a room is flooded; pays and prices in **pearls** |
| **Brisket's Soup Barge** (`shop_soup`) | Mother Brisket | meals (timed buffs) | the menu changes each visit; the "mystery bowl" can be anything |
| **The Mothwife's Gamble** (`shop_gamble`) | the Mothwife | sealed lanterns (random gear) | gamble; a sealed lantern's glow colour hints its rarity |
| **Scrapwright's** (`shop_scrap`) | Tobiah Clink | building parts, blueprints, gadgets | trade-ins; builds a custom gadget from 3 parts you bring |
| **The Bell Tithe** (`shop_tithe`) | Deacon Marl | blessings and curses | prices climb for each bell-cultist you have killed; curses pay you |
| **The Ferry** (`shop_ferry`) | Charon-that-isn't (Old Wenna) | map reveals, fast travel, respec | takes payment in **max health** as well as coin |

Currencies: **pennies** (common coin), **pearls** (rare, underwater), **Guild marks** (earned by relighting
lamps and challenges; spent on permanent unlocks between runs).

## 12. Game modes (canon; detail in page 09)

| Mode (id) | What | Unlocked |
|---|---|---|
| **Campaign** (`campaign`) | 6 acts, branching act maps, story | start |
| **Floodgate** (`waves`) | hold a lit Lamp against 30 waves while the water rises; build between waves | after Act 1 boss |
| **The Long Descent** (`endless`) | infinite procedural descent, rising flood chase, scaling enemies, leaderboard on this device | after Act 2 boss |
| **Daily Wick** (`daily`) | a seeded Long Descent with a fixed class and a fixed starting wick; one scored try a day | after Act 2 boss |
| **Boss Rush** (`bossrush`) | the bosses you have beaten, back to back, with a timer | after beating 3 bosses |
| **Trials** (`trials`) | hand-made challenge rooms (Rope Gauntlet, No-Oil, Pacifist Sluice…) that unlock classes and cosmetics | after Act 1 |

## 13. Built from the playground

| Piece | Used for |
|---|---|
| `lingo/` (+ a new pack `lingo/data/packs/lanternfall.json`) | every NPC line, shop haggling, boss openers/phase lines, enemy barks, companion chatter |
| `voice-lab/` + `shared/voices.js` | voices for NPCs, bosses, the Narrator, gibberish **babble** for rats/moths |
| `meters/` | the **Ledger** tab: damage/healing/taken per source (each wick is a source), per-room and per-run |
| `sfx/` | every sound by logical id |
| `shared/` | `store.js` saves, `tooltip.js`, `format.js` numbers, `ui.js` rng |

Everything else (the cell simulation, renderer, spells, AI) is new code in `prototypes/lanternfall/`.

## 14. Non-goals

- No 3D. No Three.js. The renderer is WebGL2 over a cell texture (Canvas2D fallback for tests).
- No online anything. No leaderboard server (local only).
- No third-party IP in player-facing text (playground rule 9).
- Visual polish **is** a goal for this prototype, unlike most of the playground: the brief asks for
  satisfying physics, rain, colour and reflections, and the pitch won on them.
