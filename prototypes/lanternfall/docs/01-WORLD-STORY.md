# LANTERNFALL — page 01: World, Story and Dialogue

> One line: **Vessmere and the Hollow in depth — history, the six districts, every named character, the story act by act with its cutscenes and endings, and exactly how every spoken line is produced (Lingo pack, intents, memories, voices, anti-repeat).**

Canon lives in `00-OVERVIEW.md`. This page only ADDS names (places, people, rooms, items); it never renames
anything fixed there. Room layouts and the act maps are in `09-MODES-MAP.md`; monsters and boss phases in
`05-BESTIARY-BOSSES.md`; shop stock and prices in `08-ITEMS-SHOPS.md`; palette maths and the light buffer in
`06-PHYSICS-RENDER.md`; data file schemas in `10-TECH-DATA.md`.

## Table of contents

1. [Vessmere and the Hollow](#1-vessmere-and-the-hollow)
2. [History timeline](#2-history-timeline)
3. [The six districts](#3-the-six-districts)
   - 3.1 Lanterncrown & the Wax Stair · 3.2 The Gutterways · 3.3 The Sluice Ward · 3.4 Blackwater · 3.5 The Bellwell · 3.6 The Cloudroot
4. [The Silent Bells (12)](#4-the-silent-bells)
5. [Factions](#5-factions)
6. [Characters (28 named NPCs)](#6-characters)
7. [Companion: Hush the lanternmoth](#7-companion-hush-the-lanternmoth)
8. [The Narrator (the Lamp Ledger)](#8-the-narrator-the-lamp-ledger)
9. [The story, act by act](#9-the-story-act-by-act)
10. [Cutscene scripts](#10-cutscene-scripts)
11. [Endings](#11-endings)
12. [How dialogue is produced](#12-how-dialogue-is-produced)
    - 12.1 Pipeline · 12.2 The Lingo pack · 12.3 Intents used where · 12.4 New intents with sample lines · 12.5 Memories and relations · 12.6 Voices · 12.7 Subtitles and speech bubbles · 12.8 Anti-repeat
13. [Data files this page implies](#13-data-files-this-page-implies)
14. [Build order and cheap fallbacks](#14-build-order-and-cheap-fallbacks)
15. [Proposed canon changes](#15-proposed-canon-changes)

---

## 1. Vessmere and the Hollow

### 1.1 The shape of the place

**The Hollow** is a chasm roughly one mile deep and a quarter-mile across, a crack in a high limestone plateau.
Its two walls are called the **Sunward Face** (east) and the **Shadeward Face** (west). **Vessmere** was built
*down* the walls: terraces cut into the rock, houses bolted to the faces on iron brackets, bridges and
chain-walks spanning the gap, and a spine of stairs, lifts and chutes connecting it all.

The city is divided into six **tiers**. Each tier had one **Great Lamp** hung in the middle of the chasm on
chains anchored to both faces. A Great Lamp is the size of a house: a brass cage around a glass
chamber, fed by pipes of lamp-oil. Lit, one Lamp lit its whole tier, warmed it, and (this is the part the
Guild kept quiet) kept the things in the deep water from coming up.

| Tier (top → bottom) | District (act) | Depth below the rim | Great Lamp |
|---|---|---|---|
| 1 | Lanterncrown & the Wax Stair (`act1`) | 0 – 260 ft | the Crown Lamp |
| 2 | The Gutterways (`act2`) | 260 – 700 ft | the Gutter Lamp |
| 3 | The Sluice Ward (`act3`) | 700 – 1,500 ft | the Sluice Lamp |
| 4 | Blackwater (`act4`) | 1,500 – 3,000 ft (mostly flooded) | the Deep Lamp |
| 5 | The Bellwell (`act5`) | 3,000 – 5,000 ft (a shaft, fully flooded until relit) | the Bell Lamp |
| 6 | The Cloudroot (`act6`) | the Hollow floor, then **up** the root to above the rim | the Sky Lamp |

**The Sky Lamp** was the lowest Lamp, hung at the Hollow floor and pointed *upward*: the floor-dwellers never
saw the real sky, so the Guild gave them one. Ossery Vane took the Sky Lamp's flame to bind the clouds. From
its empty socket the **Cloudroot** grew: a colossal braided root of solid cloud, grey-white and wet, that
climbs the whole height of the Hollow and out into the storm above. Act 6 is climbed up it.

### 1.2 Lamp-oil and the black springs

Lamp-oil ("**wellblack**" in the old trade) seeps from **black springs** in the lower walls. It floats on
water, burns bright and long, and is the city's whole economy: pennies were first minted as oil tokens.
In the game, wellblack is the `oil` material (page 06) and the player's mana (page 03). An oil-soaked room
is both a resource and a bomb.

### 1.3 The Rain

The Rain is not ordinary weather. It is a bound storm held over the Hollow by the Cloudroot. Things to know:

- It has fallen for **forty years without a single dry minute**. Children under forty have never seen a dry roof.
- It is **heavier the deeper you go** (the Cloudroot pulls it down). Act 1 drizzle, Act 4 downpour, Act 5 a solid
  curtain in the shaft. Numbers per district in §3.
- It **carries no light**: lamps set out in the Rain gutter faster (in play: exposed flames lose oil 25% faster;
  see 03-SPELLS.md for the exact rule).
- Where it pools deep and still for years, the **Unlit** grow (§5, and 05-BESTIARY-BOSSES.md).
- In Act 6 it **stops** (canon). The first dry moment in forty years is the game's big set piece (§9.6).

### 1.4 Tone

Dark and wet, never hopeless. People are poor, damp, funny, stubborn. Every district has at least one
person cooking something. The dark tone of Lingo's core grammar suits the enemies; townsfolk lean on the
`jolly`, `gruff`, `cynical` and `kind` traits so the hubs feel alive rather than grim.

---

## 2. History timeline

Years are counted in the city's own way: **R.Y.** ("Rain Year"). R.Y. 0 is the year the Rain began.
The game takes place in **R.Y. 40**. Negative years are before the Rain.

| Year | Event | Where the player learns it |
|---|---|---|
| R.Y. −640 | Salt-miners find the Hollow's first black spring on the Shadeward Face. The first settlement, **Brinkhold**, is built on the rim. | Plaque in Lanterncrown (Guild Archive) |
| R.Y. −602 | The **Oil Compact**: rim families agree to share the springs. The penny (an oil token) is struck. | Hollis Crane (lore line) |
| R.Y. −571 | The first lamp hung inside the Hollow, a ship's lantern on a chain, over what becomes the Wax Stair. | Brother Seld |
| R.Y. −540 | The **Lamplighters' Guild** is chartered. Its oath: *"No tier left dark."* | Opening cutscene |
| R.Y. −512 | The **Crown Lamp** is lit. Lanterncrown grows around it. | Act 1 relight |
| R.Y. −480 | The chandlers of the Wax Stair found the **Tallow Chapel**, a church of candles. | Act 1 |
| R.Y. −455 | The **Gutter Lamp** is lit. The Gutterways (the city's drains, markets and slums) spread below. | Act 2 |
| R.Y. −430 | A plague of rats; the ratcatchers' guild founds the **Rat Choir** — they train rats to sing so they can hear the swarms coming. | Nell Gutterby |
| R.Y. −390 | The **Sluice Works** are built to control spring-water; the **Sluice Lamp** is lit. | Act 3 |
| R.Y. −344 | Divers find the **Deep Springs**. **Blackwater** is founded as an oil town. The **Deep Lamp** is lit. | Act 4 |
| R.Y. −300 | The **Bell Lamp** is hung in the shaft below Blackwater and the **Bellwrights** cast the great bells that warn of floods. | Act 5 |
| R.Y. −261 | The **Sky Lamp** is lit on the Hollow floor, pointed up. The floor-town **Understar** is founded. | Act 6 |
| R.Y. −200 → −50 | Vessmere's golden age. Trade in wellblack reaches the plains. The **Cloudwardens** (a small order of weather-readers) are invited to the rim. | Scribe Tolliver Pask |
| R.Y. −71 | **Ossery Vane** is born in Understar, son of a lamp-keeper. | Merrit Vane |
| R.Y. −38 | Ossery joins the Cloudwardens. | Merrit Vane |
| R.Y. −9 | The **Long Dry** begins. The springs slow; the rim fields fail. | Old Wenna |
| R.Y. −3 | Ossery's wife **Elsbet** dies of the fever that follows the famine. | Merrit Vane, Act 6 |
| R.Y. −1 | The Guild Council votes to let Ossery attempt a **Binding of the Sky** with the Sky Lamp's flame. Lampwarden **Corvin Crake** votes against. | Guild Archive, Act 1 |
| **R.Y. 0** | **The Binding.** Ossery takes the Sky Lamp's flame up the Hollow. Rain falls. Everyone cheers for eleven days. It never stops. The Cloudroot begins to grow from the empty socket. | Opening cutscene |
| R.Y. 1 | Understar floods. The first **Unlit** are seen in the floor-water. | Act 6 |
| R.Y. 3 | The Bell Lamp gutters. The Bellwrights ring the great bells for a year, then turn to worship them (the **Bell Tithe**). | Deacon Marl, Act 5 |
| R.Y. 7 | The Deep Lamp goes out. Blackwater sinks into darkness. **The Lampless Widow** is first sighted. | Act 4 |
| R.Y. 12 | The Sluice Works fail; the Sluice Ward floods. Sluicemaster Voss seals himself in the pump house. | Act 3 |
| R.Y. 19 | The Gutter Lamp goes dark. The Rat Choir's saint-rat, **Gnaw**, grows huge in the dark. | Act 2 |
| R.Y. 22 | Lampwarden Corvin Crake leads the **Last Descent** to relight the lower Lamps. None return. | Aldra Crake |
| R.Y. 31 | The Tallow Chapel's candle-mother (Mother Tallow) stops being a statue. | Act 1 |
| R.Y. 38 | The Guild's last master dies. Only **Lampwarden Aldra Crake** (Corvin's widow) and one apprentice remain. | Opening |
| **R.Y. 40** | The Crown Lamp starts to gutter. The apprentice (the player) is sent down. **The game begins.** | Opening |

### 2.1 What actually went wrong (the secret history)

Revealed in pieces, fully in Act 6:

1. A Binding needs a **keeper**: someone who holds the tether and lets it go when the work is done.
2. Ossery was meant to release the Rain after eleven days. On the eleventh day he could not let go. The rain
   on his face was the only thing that stopped him thinking about Elsbet. He held on "one more day" for forty years.
3. The Cloudroot is Ossery's grip made physical. It drinks the Hollow's water and throws it back up as cloud.
4. The Unlit are what forty years of lightless, still, grieving water becomes. They are drawn to light because
   they want it and hate it at once.
5. Every Great Lamp that goes out loosens the city's hold on the deep; every Lamp relit shortens the root.
   (In play: each relit Lamp removes one segment of the Act 6 climb — see §9.6 and 09-MODES-MAP.md.)
6. Corvin Crake reached the Cloudroot in R.Y. 22 and was taken into it. He is inside the root in Act 6.

---

## 3. The six districts

Each district entry follows one shape:

- **Look** (unlit): materials, silhouette, what the rooms are made of.
- **Palette**: the unlit ambient ramp and the ramp after its Great Lamp is relit (hex; 06-PHYSICS-RENDER.md
  owns how a ramp is applied). Ramps are listed dark → light, 6 keys, interpolated to the full 24-colour ramp.
- **Weather**: rain density (drops per 100 columns per second in the cell sim), wind, and extras.
- **Hazards**: what hurts or kills you here besides monsters.
- **Sub-areas**: 3–4 named zones that form the branches of the act map (09-MODES-MAP.md).
- **Named locations**: 8–12 places with ids (room ids start with the act prefix).
- **After relight**: what changes in play, not just in colour.

A relit district keeps its rain (until Act 6) but the Lamp's light warms the ambient ramp, lowers enemy
density on revisits by 30%, opens its shop discounts (08-ITEMS-SHOPS.md), and adds townsfolk chatter
(`idle_chatter` pools, §12).

### 3.1 Lanterncrown & the Wax Stair (`act1`)

**Look.** The top tier. Lanterncrown is the last lit town: slate roofs, brass gutters, chimneys, laundry
lines strung across the chasm, the Guild Hall with its green copper dome. Below it the **Wax Stair**
spirals down the Sunward Face: a chandlers' quarter where everything is wax — candle-shops, a chapel
built of tallow blocks, stairs slick with drips, wax statues of saints. Wax is a material here: it melts
under Ember into liquid wax that cools back into solid terrain (06-PHYSICS-RENDER.md).

**Palette.**

| State | Ramp (dark → light) |
|---|---|
| Unlit (Wax Stair) | `#0b0e14` `#161b25` `#232a36` `#353d4b` `#4f5867` `#76808e` |
| Lit (Lanterncrown hub, always) and Wax Stair after relight | `#140d0b` `#2a1b16` `#45301f` `#6b4a2c` `#a3753e` `#e2b774` |

The Crown Lamp's light is amber-honey. After relight the wax glows faintly translucent (subsurface tint
`#f3c98b` at 20% on wax cells).

**Weather.** Drizzle: 18 drops/100 cols/s, wind 0–4 cells/s drifting east, occasional gusts (every 20–40 s,
+12 cells/s for 1.5 s) that bend rain and flicker small flames. Fog layer thin (fog density 0.08).

**Hazards.** Molten wax pools (burn 6/s while standing in them, slow 40%), falling icicles of wax from
eaves when heated, slick wet slate (friction 0.6 ×), gusts that snuff an unshielded Ember wick on a
lantern post, collapsing laundry-line bridges.

**Sub-areas.**

| id | Name | Branch | Feel |
|---|---|---|---|
| `a1_crown` | Lanterncrown | hub (safe) | lit town, shops, the Guild Hall |
| `a1_roofs` | The Slate Roofs | upper branch | rooftop running, gusts, chimney shafts |
| `a1_stair` | The Wax Stair | main spine | spiral stair, candle shops, dripping wax |
| `a1_chapel` | The Tallow Chapel | boss wing | cathedral of candles, Mother Tallow |

**Named locations.**

| id | Name | Sub-area | What it is |
|---|---|---|---|
| `a1_guild_hall` | The Guild Hall | `a1_crown` | Aldra Crake's hall; the Lamp Ledger lectern; save point and wick-bench |
| `a1_guild_archive` | The Guild Archive | `a1_crown` | Scribe Pask's stacks; lore plaques; the Ledger tab unlock |
| `a1_crown_lamp` | The Crown Lamp | `a1_crown` | the last lit Great Lamp, hanging on four chains over the gap |
| `a1_wick_tallow` | Wick & Tallow | `a1_crown` | Odile Pennywax's shop (`shop_wick`) |
| `a1_cranes_pawn` | Crane's Pawn | `a1_crown` | Hollis Crane (`shop_pawn`) |
| `a1_watch_house` | The Rim Watch House | `a1_crown` | Captain Hask; the Floodgate mode unlocks here |
| `a1_sweeps_loft` | Sweeps' Loft | `a1_roofs` | Chimneysweep guild; Dobb Ashcroft; Rope Gauntlet trial door |
| `a1_gull_chimney` | Gullet Chimney | `a1_roofs` | a 300-cell vertical chimney climb (Lesson room: wall-slide) |
| `a1_first_step` | The First Step | `a1_stair` | Lesson room: move, jump, pole |
| `a1_candlemarket` | Candlemarket | `a1_stair` | ruined candle shops; Lesson room: Wick builder (room 3, canon) |
| `a1_drip_gallery` | The Drip Gallery | `a1_stair` | wax falls and hardening pools; Lesson room: plank kit |
| `a1_tallow_chapel` | The Tallow Chapel | `a1_chapel` | boss arena, Mother Tallow (`boss_tallow`) |

**After relight.** The Crown Lamp does not go out (it was guttering; relighting it in Act 1's end cutscene
steadies it). The Wax Stair's molten pools crust over (−50% molten pools on revisit), candle-shops reopen
as a waystation, and Brother Seld's chapel choir sings in the idle chatter.

### 3.2 The Gutterways (`act2`)

**Look.** The city's drains, markets and slums, stacked along both faces and linked by rope-bridges and
chain-walks — which is why the grapple arrives here. Brick sewers, iron grates, rotted timber shanties on
stilts, market awnings, a cathedral built over the biggest drain. Rats everywhere, in cells: small rats are
2×1-cell critters that flow like a liquid through gaps.

**Palette.**

| State | Ramp |
|---|---|
| Unlit | `#0a0d0c` `#141a18` `#1f2724` `#2f3a35` `#46554d` `#6b7c72` (sewer green-grey) |
| Relit (Gutter Lamp, a sodium orange-pink) | `#130b0c` `#2a1618` `#462526` `#6e3b36` `#a8604d` `#e89a74` |

**Weather.** Rain 32 drops/100 cols/s. Heavy runoff: every grate has a stream of water falling through
it (cell-sim water, capped per chunk). Steam puffs from warm drains. Wind low.

**Hazards.** Plague puddles (Bile-like green water: poison 4/s, from rats and Saint Gnaw), rotten planks
(break after 0.6 s of standing), swinging market signs, grates that open under you (timed traps, see
07-TRAVERSAL-PUZZLES.md §8), rat floods (a swarm pours from a pipe like water: 1 dmg per rat touch, 0.25 s
per-rat cooldown).

**Sub-areas.**

| id | Name | Branch | Feel |
|---|---|---|---|
| `a2_market` | The Dripmarket | hub | a half-lit market; Brisket's barge moors here first |
| `a2_chainwalks` | The Chainwalks | upper branch | pure rope and grapple traversal between the faces |
| `a2_sewers` | The Brickgut | lower branch | sewer tunnels, levers and doors, rat floods |
| `a2_cathedral` | The Gutter Cathedral | boss wing | Saint Gnaw and the Rat Choir |

**Named locations.**

| id | Name | Sub-area | What it is |
|---|---|---|---|
| `a2_dripmarket` | The Dripmarket | `a2_market` | hub town; Crane's second shop, Clink's first stall |
| `a2_soup_mooring` | Brisket's Mooring | `a2_market` | first stop of the Soup Barge (`shop_soup`) |
| `a2_scrapwrights` | Scrapwright's | `a2_market` | Tobiah Clink's workshop (`shop_scrap`) |
| `a2_hook_forge` | Hookwright's Forge | `a2_market` | where you get the grapple hook (Lesson room: grapple) |
| `a2_lockhouse` | Pickering's Lockhouse | `a2_sewers` | Old Tam Pickering; Lesson room: levers/doors/timed doors |
| `a2_ratcatchers` | The Ratcatchers' Den | `a2_sewers` | Nell Gutterby's crew; rat-trap puzzles |
| `a2_widows_span` | The Long Chain | `a2_chainwalks` | the longest rope run in Act 2, 1,400 cells |
| `a2_gallows_awning` | Gallows Awning | `a2_chainwalks` | an abandoned market of hanging stalls |
| `a2_charm_shrine` | The Charmwife's Niche | `a2_chainwalks` | Charm slot 1 unlock (Lesson room: charms) |
| `a2_choir_loft` | The Choir Loft | `a2_cathedral` | pre-boss gauntlet; Cantor Ebb |
| `a2_gutter_cathedral` | The Gutter Cathedral | `a2_cathedral` | boss arena, Saint Gnaw (`boss_gnaw`) |

**After relight.** The Gutter Lamp's pink-orange light makes the rats avoid lit rooms (rat swarms spawn
only in cells whose light < 0.3). Market stalls reopen; Clink adds his blueprint tier 2. The cathedral
becomes a rope-swing practice room (the Rope Gauntlet trial door appears in the loft).

### 3.3 The Sluice Ward (`act3`)

**Look.** The waterworks: great stone chambers with bronze sluice gates, pump-houses with iron wheels,
aqueducts crossing the chasm, cisterns the size of cathedrals. Half flooded. Green copper pipes, moss,
dripping everywhere. Water is the terrain: each room has **chambers** whose water levels you change.

**Palette.**

| State | Ramp |
|---|---|
| Unlit | `#060b10` `#0d1620` `#152332` `#223447` `#3a5068` `#62809c` (drowned blue) |
| Relit (Sluice Lamp, a sea-glass teal) | `#061210` `#0c231f` `#153a33` `#22594d` `#3f8a78` `#7fcab3` |

After relight the water itself changes: its tint shifts from ink-blue to teal and the reflection pass gets
+20% brightness in this act.

**Weather.** Rain 48 drops/100 cols/s. Mist over every open water surface (mist particles rise 3 cells/s).
Periodic **surge** events: every 90 s in outdoor rooms, rain doubles for 8 s and waterfalls swell.

**Hazards.** Drowning (breath 12 s, page 07 §2.10), undertow at open sluices (pulls 50 cells/s toward the
gate), crushing gates (a closing gate deals 40 and shoves), electrified water (from Spark, including your
own), cold water (in unlit cisterns: −1 hp/s after 20 s submerged, removed after relight), pump wheels.

**Sub-areas.**

| id | Name | Branch | Feel |
|---|---|---|---|
| `a3_pumpworks` | The Pumpworks | hub | a dry island of machines; Voss's pump house |
| `a3_cisterns` | The Nine Cisterns | lower branch | drown/flood puzzles, swimming |
| `a3_aqueducts` | The High Aqueducts | upper branch | narrow stone channels across the gap; current riding |
| `a3_reservoir` | The Great Reservoir | boss wing | the Sluicemaw |

**Named locations.**

| id | Name | Sub-area | What it is |
|---|---|---|---|
| `a3_voss_pumphouse` | Voss's Pump House | `a3_pumpworks` | Sluicemaster Voss; sluice control Lesson room |
| `a3_tide_font` | The Tide Font | `a3_pumpworks` | where the Tide flame is found |
| `a3_gauge_tower` | The Gauge Tower | `a3_pumpworks` | a tower of water-level gauges; the district map |
| `a3_first_cistern` | The First Cistern | `a3_cisterns` | Lesson room: swimming and breath |
| `a3_drowned_market` | The Drowned Market | `a3_cisterns` | the Pale Congregation (`shop_drowned`), reached only flooded |
| `a3_kells_rest` | Kell's Rest | `a3_cisterns` | Ser Aubry Kell's sunken chapel |
| `a3_fennick_loft` | The Fennick Loft | `a3_cisterns` | Ada Fennick's hiding place |
| `a3_long_channel` | The Long Channel | `a3_aqueducts` | a 2,000-cell water slide on the current |
| `a3_broken_arch` | The Broken Arch | `a3_aqueducts` | a snapped aqueduct; a waterfall you freeze into a ladder |
| `a3_oarly_landing` | Oarly's Landing | `a3_aqueducts` | Mag Oarly the Ferrywitch |
| `a3_great_reservoir` | The Great Reservoir | `a3_reservoir` | boss arena, the Sluicemaw (`boss_sluicemaw`) |

**After relight.** Cistern water warms (no cold damage), the Ferry (`shop_ferry`) can dock at every
cistern, and gates you have set stay set on revisit.

### 3.4 Blackwater (`act4`)

**Look.** An old oil town sunk in darkness, mostly under a black flood with an oil slick on top. Timber
derricks, pumping jacks, tar-paper houses on pilings, catwalks, a church turned into a moth nest (the
Moth Nave). Oil is everywhere: on the water, in barrels, soaking the planks. Almost no ambient light.
This is the act where your lantern burns oil and the Unlit hunt in the dark (canon).

**Palette.**

| State | Ramp |
|---|---|
| Unlit | `#030305` `#08080d` `#101019` `#1b1b28` `#2c2c3e` `#4a4a60` (ink violet; floor readability value clamps at `#2c2c3e` — never darker for walkable edges, per the verdict's risk #1) |
| Relit (Deep Lamp, a pale moon-white with violet edge) | `#0a0911` `#171526` `#27243f` `#3f3b62` `#6d6a96` `#b8b5dc` |

**Weather.** Rain 64 drops/100 cols/s, but half of it lands on oil and beads (visual only). No wind.
**Darkness**: ambient light 0.06 (vs 0.35 in Act 1) until relit, then 0.28. Fog 0.25, lit by your lantern.

**Hazards.** Oil slicks that ignite (fire spreads across oil at 30 cells/s; standing in burning oil 14/s),
gas pockets under the water (a Spark or Ember near one = explosion 60 damage, 24-cell radius), sinking
pilings, total darkness (the Unlit get +50% damage on targets in light < 0.1), moth swarms that snuff
flames, tar (slow 60%, sticks ropes).

**Sub-areas.**

| id | Name | Branch | Feel |
|---|---|---|---|
| `a4_derricks` | The Derricks | hub | the last oil-camp: Jory Wickett, the Mothwife |
| `a4_slick` | The Slick | lower branch | floating oil fields, fire puzzles |
| `a4_stilts` | Stilt Town | upper branch | dark catwalks, the Unlit hunt |
| `a4_nave` | The Moth Nave | boss wing | the Lampless Widow |

**Named locations.**

| id | Name | Sub-area | What it is |
|---|---|---|---|
| `a4_last_derrick` | The Last Derrick | `a4_derricks` | hub camp around a working pump; Lesson room: oil and darkness |
| `a4_mothwife_tent` | The Mothwife's Gamble | `a4_derricks` | `shop_gamble` |
| `a4_wickett_still` | Wickett's Still | `a4_derricks` | Jory Wickett refines oil; oil refills |
| `a4_knot_house` | The Knot House | `a4_derricks` | Knots unlock (Lesson room: knots) |
| `a4_tar_pits` | The Tar Pits | `a4_slick` | tar and fire puzzles |
| `a4_floating_chapel` | The Floating Chapel | `a4_slick` | a church on an oil raft; Deacon Marl's first tithe box |
| `a4_gas_field` | Bubbling Field | `a4_slick` | gas-pocket chains |
| `a4_lune_lighthouse` | The Dead Lighthouse | `a4_stilts` | Lune the moth-girl; Moth Oracle unlock hints |
| `a4_hanging_houses` | The Hanging Houses | `a4_stilts` | houses hanging off chains over the black water |
| `a4_no_light_lane` | Lampless Lane | `a4_stilts` | a pitch-dark gauntlet lit only by spells |
| `a4_moth_nave` | The Moth Nave | `a4_nave` | boss arena, the Lampless Widow (`boss_widow`) |

**After relight.** Ambient 0.28, the Unlit stop spawning in lit rooms, oil slicks are marked by a faint
sheen so you can read them, and Wickett sells oil at half price.

### 3.5 The Bellwell (`act5`)

**Look.** A vertical shaft below Blackwater where the Bellwrights hung their great flood-bells, rings of
bronze galleries stepping down the shaft wall, bell-frames on chains, clockwork everywhere. The bell-cult
(the Bell Tithe) lives here. The shaft is drowned when you arrive; draining it is the act's first job.
Gravity lanterns (canon) arrive here: bell-shaped lamps that flip gravity in a band.

**Palette.**

| State | Ramp |
|---|---|
| Unlit | `#0a0906` `#16130c` `#241f13` `#3a321f` `#584c31` `#857454` (tarnished bronze) |
| Relit (Bell Lamp, a clear bell-bronze gold) | `#110c05` `#281c0a` `#473212` `#72521e` `#b3843a` `#f2c66e` |

**Weather.** Rain 80 drops/100 cols/s falling straight down the shaft. **Inverted rain**: inside a gravity-
lantern band, rain falls up (the cell sim applies the band's gravity to rain cells too). Tolls: every
bell toll sends a visible shockwave ring (pressure wave, 06-PHYSICS-RENDER.md) that knocks loose rubble.

**Hazards.** Falling rubble after tolls (8–30 damage by size), gravity bands (fall damage both directions),
crushing clockwork gears, resonance (standing next to a ringing bell: deaf + stagger 0.8 s), bell-cultist
ambushes, drop-offs of 2,000+ cells.

**Sub-areas.**

| id | Name | Branch | Feel |
|---|---|---|---|
| `a5_tithehall` | The Tithe Hall | hub | the Bell Tithe's temple; Deacon Marl, Osk Tamberlane |
| `a5_galleries` | The Ring Galleries | main spine | rings of galleries down the shaft |
| `a5_clockworks` | The Clockworks | branch | gear rooms, gravity puzzles |
| `a5_bottom` | The Bellwell Bottom | boss wing | the Bellfather |

**Named locations.**

| id | Name | Sub-area | What it is |
|---|---|---|---|
| `a5_tithe_hall` | The Tithe Hall | `a5_tithehall` | `shop_tithe`; Deacon Marl |
| `a5_bellwright_forge` | Tamberlane's Foundry | `a5_tithehall` | Osk Tamberlane; gravity lantern Lesson room |
| `a5_drain_valves` | The Nine Valves | `a5_galleries` | draining the shaft (set piece) |
| `a5_whisper_gallery` | The Whisper Gallery | `a5_galleries` | a gallery where sound carries; bell puzzles |
| `a5_upside_chapel` | The Upside Chapel | `a5_galleries` | a chapel built on the ceiling |
| `a5_precentor_loft` | The Precentor's Loft | `a5_galleries` | Hallow Dunmere, the cult's leader |
| `a5_escapement` | The Great Escapement | `a5_clockworks` | a giant clock mechanism puzzle |
| `a5_counterweight` | Counterweight Row | `a5_clockworks` | lifts and counterweights |
| `a5_cracked_bell` | The Cracked Bell | `a5_clockworks` | a fallen bell you can live in (camp) |
| `a5_bellwell_bottom` | The Bellwell Bottom | `a5_bottom` | boss arena, the Bellfather (`boss_bellfather`) |

**After relight.** Tolls no longer drop rubble in cleared rooms, gravity lanterns you placed stay, and the
cultists split: those loyal to Hallow Dunmere keep fighting, the rest become a neutral faction.

### 3.6 The Cloudroot (`act6`)

**Look.** The Hollow floor first: **Understar**, a drowned town under the empty socket of the Sky Lamp,
lit by nothing. Then the Cloudroot itself: a colossal root of solid cloud rising the whole height of the
Hollow, its surface soft grey "cloudstuff" cells (06-PHYSICS-RENDER.md: walkable, absorbs water, frozen by
Rime into hard ice, burned by Ember into steam that rises). Inside the root: hollow chambers holding what it
has drunk — lakes floating in cloud, drowned houses, Corvin Crake. At the top: above the rim, in the storm,
Ossery Vane holding the Sky Lamp's flame.

**Palette.**

| State | Ramp |
|---|---|
| Unlit (floor and lower root) | `#07090b` `#101419` `#1b2129` `#2c343f` `#48525f` `#788391` (storm grey) |
| Each relit Lamp from Acts 1–5 adds a coloured band of light up the root (its Lamp colour) | — |
| After the Rain stops (phase 4 of the final fight onward) | `#0e0d14` `#1f1c2c` `#3a3150` `#6a4f73` `#b77f86` `#ffd3a0` (a dawn) |

**Weather.** Rain 96 drops/100 cols/s at the floor, thinning as you climb (−10 per 1,000 cells climbed),
wind up to 30 cells/s sideways near the top, lightning every 12–25 s (a white flash, bolt cells that ignite
wood and electrify water). Then, at the story beat in §9.6, **the Rain stops**: rain density to 0 over 3 s,
every held body of water in the root lets go (canon).

**Hazards.** Wind (pushes you and your lobbed spells), lightning strikes (telegraphed by a 0.8 s bright
line), cloudstuff that gives way when wet-saturated (turns to falling water after 2 s of standing), the
**falling flood** after the Rain stops (the set piece: water pours down past you as you climb), Unlit
everywhere on the floor.

**Sub-areas.**

| id | Name | Branch | Feel |
|---|---|---|---|
| `a6_understar` | Understar | hub | the drowned floor-town; Merrit Vane |
| `a6_socket` | The Empty Socket | spine | where the Sky Lamp hung; the root's base |
| `a6_rootway` | The Rootway | main climb | climbing the outside of the root |
| `a6_rootheart` | The Root's Heart | branch | inside the root: floating lakes, Corvin Crake |
| `a6_crown_of_cloud` | The Crown of Cloud | boss | above the rim; Ossery Vane |

**Named locations.**

| id | Name | Sub-area | What it is |
|---|---|---|---|
| `a6_understar_well` | Understar Well | `a6_understar` | the floor-town's last dry room; camp |
| `a6_vane_house` | The Vane House | `a6_understar` | Merrit Vane's home; Elsbet's grave |
| `a6_sky_socket` | The Empty Socket | `a6_socket` | the Sky Lamp's cradle; Overcharge mastery Lesson room |
| `a6_first_coil` | The First Coil | `a6_rootway` | the first loop of root; wind Lesson |
| `a6_lamp_bands` | The Lamp Bands | `a6_rootway` | five coloured bands of light, one per relit Lamp |
| `a6_floating_lake` | The Floating Lake | `a6_rootheart` | a lake held inside cloud |
| `a6_corvins_cell` | Corvin's Hollow | `a6_rootheart` | Corvin Crake, held in the root |
| `a6_last_wall` | The Last Wall | `a6_rootway` | the rim, seen from inside for the first time |
| `a6_storm_eye` | The Storm's Eye | `a6_crown_of_cloud` | boss arena, Ossery Vane (`boss_ossery`) |
| `a6_dry_rim` | The Dry Rim | epilogue | where the endings play |

**After (the Rain stops).** Act 6's lower rooms become Endless-mode-only "dry" variants; the Campaign
epilogue lets you walk back down to any district with the rain off (it looks new — every district's
lit ramp, no rain layer).

---

## 4. The Silent Bells

Canon: the Bellringer unlocks by ringing all 12 Silent Bells hidden across Acts 1–4. A Silent Bell is a small
bronze bell with a cracked tongue; you ring it by hitting it with the pole (it will not ring from spells).
Each one plays one note of a 12-note tune; the Ledger tracks which you have rung.

| # | id | Act | Where | Why it is hidden |
|---|---|---|---|---|
| 1 | `bell_silent_01` | 1 | inside the Gullet Chimney, a side ledge at 220 cells up | needs a wall-jump off the soot |
| 2 | `bell_silent_02` | 1 | under the Crown Lamp's cage | grapple-only on revisit after Act 2 (the only backtrack bell) |
| 3 | `bell_silent_03` | 1 | behind a wax wall in the Drip Gallery | melt the wax with Ember |
| 4 | `bell_silent_04` | 2 | on a chain between two market awnings in Gallows Awning | swing and pole mid-air |
| 5 | `bell_silent_05` | 2 | at the bottom of a rat pipe in the Brickgut | lure the rats out first |
| 6 | `bell_silent_06` | 2 | in the Choir Loft's rafters | burn a rope to drop a beam, climb the beam |
| 7 | `bell_silent_07` | 3 | at the bottom of the Third Cistern | flood the cistern, dive |
| 8 | `bell_silent_08` | 3 | under the Broken Arch waterfall | freeze the fall with Rime |
| 9 | `bell_silent_09` | 3 | in the Drowned Market's back room | pay the Pale Congregation 3 pearls |
| 10 | `bell_silent_10` | 4 | in the dark on Lampless Lane | you can only see it by its moth-glow if you let your lantern go out |
| 11 | `bell_silent_11` | 4 | floating on an oil raft in the Slick | it drifts; burn the oil around it and it sinks to a ledge |
| 12 | `bell_silent_12` | 4 | inside the Floating Chapel's steeple | a spark machine lift |

When all 12 ring, a thirteenth note sounds from the Bellwell (foreshadowing Act 5) and the Bellringer class
unlocks. Osk Tamberlane recognises the tune in Act 5 and gives a unique line (intent `lore`, id
`tamberlane_silent_tune`).

---

## 5. Factions

| id | Name | What they are | Stance toward the player | Lexicon form |
|---|---|---|---|---|
| `f_guild` | the Lamplighters' Guild | your order; two members left | friendly | `{people: "the Lamplighters", member: "Lamplighter"}` |
| `f_watch` | the Rim Watch | Lanterncrown's guard | friendly, weary | "the Watch", "watchman" |
| `f_sweeps` | the Sweeps | chimney-sweeps' guild, rope experts | friendly, cheeky | "the Sweeps", "sweep" |
| `f_ratcatchers` | the Ratcatchers | Gutterways pest guild | neutral → friendly | "the Ratcatchers", "ratcatcher" |
| `f_rat_choir` | the Rat Choir | the rats and their human cantors | hostile | "the Choir", "chorister" |
| `f_sluicemen` | the Sluicemen | the old waterworks crews (mostly dead) | friendly | "the Sluicemen", "sluiceman" |
| `f_pale` | the Pale Congregation | drowned-but-not-dead folk who live underwater and trade in pearls | wary, fair | "the Pale", "one of the Pale" |
| `f_oilrunners` | the Oilrunners | Blackwater smugglers | mercenary | "the Oilrunners", "oilrunner" |
| `f_tithe` | the Bell Tithe | the bell cult | hostile (Dunmere's) / neutral (Marl's) | "the Tithe", "tithe-sworn" |
| `f_cloudwardens` | the Cloudwardens | Ossery's order; only Merrit left | complicated | "the Cloudwardens", "cloudwarden" |
| `f_unlit` | the Unlit | the things of the dark water | hostile (Hush excepted) | "the Unlit", "unlit thing" |

Faction standing uses Lingo relations (§12.5) averaged over a faction's named members plus a
`faction:<id>` pseudo-target that the player's deeds move (RELATIONS.md "Group feelings").

---
## 6. Characters

### 6.1 How to read an entry

Every named character is a lexicon `person` entry in the Lingo pack (§12.2) plus a speaker record in
`data/npcs.json` (§13) that follows the shared character JSON's `speech` and `voice` sections
(`shared/character-schema.md`). Each entry below gives:

- **id / name / role / where** — `where` uses location ids from §3; "moves" says where they go later.
- **Speech** — Lingo traits (only the 25 real ones: abrasive kind shy pompous bloodlust pious cynical jolly
  nervous greedy brave coward gruff romantic scholar drunkard grieving paranoid archaic honorable cruel loyal
  sarcastic hungry third_person), sliders as `F/V/C/A/Co` = formality / verbosity / cheer / aggression /
  confidence (0..1), tics (only real ones: um drawl shout whisper hesitant archaic lisp growl clipped flowery
  curses thirdperson pirate posh), and custom slots. Catchphrases use `{~a|b|c}` so each has several sayings.
- **Voice** — the `shared/voices.js` role, gender, a fixed seed, and knob overrides applied *after*
  `voiceFor()` (`Object.assign(voiceFor({...}), overrides)`), plus any `fx`.
- **Wants** — what they are after (drives their quest, 09-MODES-MAP.md side rooms).
- **Across the acts** — how they change, where they move, and what the player can change.

Portraits are 32×32 pixel busts (page 02), one neutral + one mood variant each.

### 6.2 Roster at a glance

| # | id | Name | Role | First met | Voice role |
|---|---|---|---|---|---|
| 1 | `npc_aldra` | Lampwarden Aldra Crake | head of the Guild, your mentor | `a1_guild_hall` | elder (f) |
| 2 | `npc_pask` | Scribe Tolliver Pask | Guild archivist, keeps the Ledger | `a1_guild_archive` | mage (m) |
| 3 | `npc_hask` | Captain Garrow Hask | captain of the Rim Watch | `a1_watch_house` | knight (m) |
| 4 | `npc_odile` | Odile Pennywax | keeper of Wick & Tallow | `a1_wick_tallow` | merchant (f) |
| 5 | `npc_hollis` | Hollis Crane | pawnbroker | `a1_cranes_pawn` | merchant (m) |
| 6 | `npc_seld` | Brother Seld | wax-monk of the Tallow Chapel | `a1_candlemarket` | priest (m) |
| 7 | `npc_dobb` | Dobb Ashcroft | captain of the Sweeps | `a1_sweeps_loft` | swashbuckler (m) |
| 8 | `npc_pim` | Pim Rooke | apprentice sweep, eleven | `a1_gull_chimney` | child (f) |
| 9 | `npc_brisket` | Mother Brisket | soup barge cook | `a2_soup_mooring` | villager (f) |
| 10 | `npc_rennet` | Rennet Brisket | her son, deckhand | `a2_soup_mooring` | villager (m) |
| 11 | `npc_clink` | Tobiah Clink | scrapwright | `a2_scrapwrights` | tinker (m) |
| 12 | `npc_pickering` | Old Tam Pickering | lock-keeper | `a2_lockhouse` | elder (m) |
| 13 | `npc_nell` | Nell Gutterby | head ratcatcher | `a2_ratcatchers` | rogue (f) |
| 14 | `npc_ebb` | Cantor Ebb | a Rat Choir cantor who ran | `a2_choir_loft` | cultist (m) |
| 15 | `npc_voss` | Sluicemaster Hendry Voss | last engineer of the Sluice Works | `a3_voss_pumphouse` | runesmith (m) |
| 16 | `npc_ada` | Ada Fennick | a girl who survived alone | `a3_fennick_loft` | child (f) |
| 17 | `npc_kell` | Ser Aubry Kell | a knight who breathes water | `a3_kells_rest` | knight (m) |
| 18 | `npc_oarly` | Mag Oarly | Ferrywitch of the cisterns | `a3_oarly_landing` | necromancer (f) |
| 19 | `npc_unna` | Sister Unna of the Pale | voice of the Pale Congregation | `a3_drowned_market` | undead (f) |
| 20 | `npc_wenna` | Old Wenna | the ferrywoman ("Charon-that-isn't") | first dock, Act 2 | elder (f) |
| 21 | `npc_jory` | Jory Wickett | oilrunner and distiller | `a4_wickett_still` | scavenger (m) |
| 22 | `npc_mothwife` | the Mothwife | gambler with sealed lanterns | `a4_mothwife_tent` | oracle (f) |
| 23 | `npc_lune` | Lune | a moth-sighted girl, fifteen | `a4_lune_lighthouse` | oracle (f) |
| 24 | `npc_marl` | Deacon Marl | tithe-keeper of the Bell Tithe | `a4_floating_chapel` | cultist (m) |
| 25 | `npc_osk` | Osk Tamberlane | the last Bellwright | `a5_bellwright_forge` | runesmith (m) |
| 26 | `npc_dunmere` | Precentor Hallow Dunmere | leader of the bell-cult | `a5_precentor_loft` | cultist (f) |
| 27 | `npc_merrit` | Merrit Vane | Ossery's daughter | `a6_vane_house` | stormcaller (f) |
| 28 | `npc_corvin` | Corvin Crake | Aldra's husband, lost in the root | `a6_corvins_cell` | elder (m) |
| — | `npc_hush` | Hush | companion lanternmoth (§7) | Act 1 | babble |
| — | `narrator` | the Lamp Ledger | the Narrator (§8) | everywhere | narrator |

The bosses speak too; their speakers are in §6.4.

### 6.3 Entries

#### 1. Lampwarden Aldra Crake (`npc_aldra`)
- **Role / where.** Head of the Guild. `a1_guild_hall`. Stays in Lanterncrown; after Act 3 she comes down to
  the camp at each relit Lamp (she takes the lifts you repaired).
- **Speech.** traits `honorable`, `gruff`, `grieving`. F/V/C/A/Co `0.7/0.35/0.3/0.4/0.8`. tics `clipped`.
  greeting `"{~Apprentice|Lamplighter|You}"`, farewell `"{~Keep it lit|Mind the oil|Down you go}"`,
  catchphrase `"{~No tier left dark.|A Lamp is only a promise with oil in it.|Light first. Questions after.|Corvin would have liked you. Don't let it go to your head.}"`,
  yes `"Aye"`, no `"No."`, curse `"Drowned hells"`.
- **Voice.** `voiceFor({ role:'elder', gender:'f', seed:1101 })` + `{ speed: 0.4, rough: 0.28, intonation: 0.45 }`.
- **Wants.** The Lamps lit. Secretly: Corvin found, or at least his lantern.
- **Across the acts.** A1 stern teacher. A2–3 letters via Pask (read by the Narrator). A4 she comes down and
  admits the Last Descent was her idea. A6 if you free Corvin (§9.6) she walks up the Cloudroot with him in
  the good ending's epilogue. Her relation with the player starts at warmth 0.1, respect 0.3, trust 0.5.

#### 2. Scribe Tolliver Pask (`npc_pask`)
- **Role / where.** Archivist; keeper of the Ledger (the damage meter tab, `meters/`). `a1_guild_archive`.
  Stays; sends letters.
- **Speech.** traits `scholar`, `nervous`, `kind`. `0.8/0.8/0.55/0.1/0.3`. tics `um`, `hesitant`.
  greeting `"{~Oh! You're back|Ah, the apprentice|Mind the scrolls}"`, catchphrase
  `"{~It's all in the Ledger, you know.|Numbers don't lie. People do. Numbers are people, though, in a sense.|I've catalogued that. Twice.}"`.
- **Voice.** `mage`, m, seed 1102 + `{ pitch: 0.58, speed: 0.62, breath: 0.25 }`.
- **Wants.** Every lore plaque transcribed (a collectible count, 60 plaques).
- **Across the acts.** Gains a line per 10 plaques brought. In A5 he decodes Ossery's binding notes and warns
  you about the keeper rule (sets flag `knows_keeper_rule`, which unlocks ending choice C).

#### 3. Captain Garrow Hask (`npc_hask`)
- **Role / where.** Rim Watch captain. `a1_watch_house`. Floodgate mode giver.
- **Speech.** traits `brave`, `cynical`, `loyal`. `0.5/0.4/0.35/0.6/0.8`. greeting `"{~Lamplighter|Guild|Well}"`,
  catchphrase `"{~Walls hold till they don't.|I've buried better than you. Don't make me bury you.|Watch holds the rim. You hold the rest.}"`.
- **Voice.** `knight`, m, seed 1103 + `{ rough: 0.25, depth: 0.78 }`.
- **Wants.** Lanterncrown to survive the winter. Floodgate high scores are "his" defence drills.
- **Across the acts.** A1 sceptical. After each relit Lamp his respect +0.15. A6: if respect ≥ 0.7 he brings the
  Watch to the Dry Rim in the epilogue.

#### 4. Odile Pennywax (`npc_odile`) — `shop_wick`
- **Role / where.** Chandler and spell-seller. `a1_wick_tallow`; opens a branch stall at every relit Lamp camp.
- **Speech.** traits `jolly`, `scholar`, `romantic`. `0.55/0.75/0.8/0.15/0.7`. tics `flowery`. greeting
  `"{~Darling|Ooh, a customer|Lamplighter, my candle}"`, farewell `"{~Burn bright|Don't gutter|Come back smelling of smoke}"`,
  catchphrase `"{~Every flame has a flavour.|Hold still, I want to taste that.|Smoke never lies about what burned.}"`.
- **Voice.** `merchant`, f, seed 1104 + `{ intonation: 0.7, tone: 0.72 }`.
- **Wants.** To taste all 7 flames (canon quirk: she "tastes" your spells and names them). Uses intent
  `spell_taste` (§12.4).
- **Across the acts.** Her prices drop per relit Lamp (08-ITEMS-SHOPS.md). In A4 she runs out of wax and
  asks for 20 wax from Mother Tallow's arena (side quest `q_odile_wax`).

#### 5. Hollis Crane (`npc_hollis`) — `shop_pawn`
- **Role / where.** Pawnbroker. `a1_cranes_pawn`, second shop at `a2_dripmarket`, cart at every hub after A3.
- **Speech.** traits `greedy`, `sarcastic`, `paranoid`. `0.35/0.55/0.4/0.35/0.75`. tics `drawl`. greeting
  `"{~Well well|Look who's selling|Mind the counter}"`, no `"Not a chance"`, catchphrase
  `"{~Everything's worth something to somebody.|I remember that one. You sold it cheap.|A pawn's just a promise that didn't come back.}"`.
- **Voice.** `merchant`, m, seed 1105 + `{ speed: 0.45, pitch: 0.44, rough: 0.2 }`.
- **Wants.** A profit, and the one thing he pawned himself: his dead brother's lantern (found in A4, `item_crane_lantern`).
- **Across the acts.** Remembers every item sold (canon; memory type `sold_item`, §12.5) and haggles by mood.
  Give him the lantern back instead of selling it: warmth +0.5 and a permanent 10% better sale price.

#### 6. Brother Seld (`npc_seld`)
- **Role / where.** A wax-monk. `a1_candlemarket`; flees to the Guild Hall after the boss.
- **Speech.** traits `pious`, `nervous`, `grieving`. `0.75/0.5/0.25/0.05/0.2`. tics `whisper`. oath
  `"By the Mother's wick"`, catchphrase `"{~She was only a statue. Once.|We fed her candles. We didn't know.|Wax remembers every hand that warmed it.}"`.
- **Voice.** `priest`, m, seed 1106 + `{ breath: 0.5, pitch: 0.48 }`.
- **Wants.** Mother Tallow put to rest without being "hated". If you use only Rime and Tide in the boss's
  last phase ("cool her"), he rewards the charm `steady` early.
- **Across the acts.** After A1 he runs a candle vigil in the Guild Hall and gives a blessing (+5% Ember
  power, 1 room) once per visit.

#### 7. Dobb Ashcroft (`npc_dobb`)
- **Role / where.** Sweep captain. `a1_sweeps_loft`. Chimneysweep unlock and Rope Gauntlet trial.
- **Speech.** traits `jolly`, `brave`, `abrasive`. `0.15/0.5/0.8/0.55/0.9`. tics `clipped`. greeting
  `"{~Oi, soot-face|Lamp-kid|Look sharp}"`, catchphrase `"{~Up's easy. Down's where they bury you.|Never trust a rope you didn't tie.|Swing first, scream later.}"`,
  curse `"Soot and cinders"`.
- **Voice.** `swashbuckler`, m, seed 1107 + `{ speed: 0.66, intonation: 0.65 }`.
- **Wants.** His sweeps back: three are lost in the Gutterways (side quest `q_lost_sweeps`, found in A2).
- **Across the acts.** Counts your rope distance (the 2,000 m challenge); says so at 500/1,000/1,500 m.

#### 8. Pim Rooke (`npc_pim`)
- **Role / where.** A sweep apprentice, eleven. Stuck in `a1_gull_chimney`. Then Sweeps' Loft; later she
  sneaks down after you and turns up at camps.
- **Speech.** traits `brave`, `hungry`, `jolly`. `0.05/0.6/0.9/0.3/0.8`. greeting `"{~Hiya|It's you!|Lamp!}"`,
  catchphrase `"{~I'm not scared, I'm just shaking.|Can I hold the lantern? Just once?|Mum says the rain's crying. I think it's just rain.}"`.
- **Voice.** `child`, f, seed 1108 + `{ speed: 0.68 }`.
- **Wants.** To be a Lamplighter. If you let her carry a lantern post at one camp per act (a choice), she
  appears in the good ending as the new apprentice.
- **Across the acts.** A2 found at Brisket's barge (fed). A3 missing (panic beat; found in the First Cistern
  on a crate, a rescue room). A5 she brings you Tamberlane's letter. Flag `pim_trusted` counts toward endings.

#### 9. Mother Brisket (`npc_brisket`) — `shop_soup`
- **Role / where.** Cook of the Soup Barge. First moored at `a2_soup_mooring`, then at one camp per act
  (the barge follows the water down; in A5 it is lowered on the counterweights).
- **Speech.** traits `kind`, `jolly`, `hungry`. `0.3/0.7/0.85/0.1/0.75`. greeting `"{~Sit, sit|There's my skinny one|Bowl's hot}"`,
  farewell `"{~Eat something|Take a heel of bread|Mind you're back for supper}"`, catchphrase
  `"{~Soup fixes most things. The rest needs more soup.|Don't ask what's in the mystery bowl. I don't ask it either.|Nobody fights well hungry.}"`.
- **Voice.** `villager`, f, seed 1109 + `{ depth: 0.62, pitch: 0.5, breath: 0.3 }`.
- **Wants.** Everyone fed. Specific ingredients per act (side orders, 08-ITEMS-SHOPS.md): rat-free flour,
  reservoir eel, oil-free fish, bell-mushrooms, cloud-cress.
- **Across the acts.** Uses intent `soup_menu` (§12.4). The more meals you eat, the more she worries when
  you come back hurt (reads player hp < 40%: `worried` intent).

#### 10. Rennet Brisket (`npc_rennet`)
- **Role / where.** Her son, 20, deckhand. On the barge.
- **Speech.** traits `shy`, `loyal`. `0.4/0.2/0.5/0.1/0.2`. tics `um`. catchphrase
  `"{~Mum says hello. Well, she didn't. But she would.|I'm, um, the ladle man.|Don't tell her I said so.}"`.
- **Voice.** `villager`, m, seed 1110 + `{ pitch: 0.46, speed: 0.44 }`.
- **Wants.** To leave the barge and see the dry world. Epilogue: he is on the Dry Rim if the Rain stopped.
- **Across the acts.** Silent A2, talks A3+. Carries the barge's ferrying of heavy parts (the barge brings
  you one Tinker turret part per act if warmth ≥ 0.4).

#### 11. Tobiah Clink (`npc_clink`) — `shop_scrap`
- **Role / where.** Scrapwright. `a2_scrapwrights`; a cart at each later hub.
- **Speech.** traits `scholar`, `gruff`, `greedy`. `0.3/0.55/0.45/0.3/0.8`. greeting `"{~Brought parts?|Hm|Tools down, hands where I see 'em}"`,
  catchphrase `"{~Three parts and a bad idea: that's a gadget.|Scrap's just a machine that hasn't met me yet.|It'll hold. Probably. Stand back.}"`.
- **Voice.** `tinker`, m, seed 1111 + `{ rough: 0.3, speed: 0.6 }`.
- **Wants.** The Bellwrights' escapement plans (A5), to build a pump that could drain the Hollow.
- **Across the acts.** Blueprint tiers unlock per act (07-TRAVERSAL-PUZZLES.md §9). A5 bring the plans:
  he builds the Tinker turret Mk III for free.

#### 12. Old Tam Pickering (`npc_pickering`)
- **Role / where.** Lock-keeper of the Brickgut. `a2_lockhouse`.
- **Speech.** traits `drunkard`, `cynical`, `archaic`. `0.4/0.65/0.35/0.2/0.5`. tics `drawl`, `archaic`.
  catchphrase `"{~Water goes where it's let. Same as folk.|Pull the red one. No, the other red one.|I kept these locks forty year. They kept me.}"`.
- **Voice.** `elder`, m, seed 1112 + `{ flutter: 0.2, speed: 0.32 }`.
- **Wants.** A drink, and the Gutter Lamp lit so he can see his gauges.
- **Across the acts.** Teaches levers/doors. After A2 he retires; his lockhouse becomes a Trials door.

#### 13. Nell Gutterby (`npc_nell`)
- **Role / where.** Head ratcatcher. `a2_ratcatchers`.
- **Speech.** traits `abrasive`, `brave`, `cruel`. `0.1/0.4/0.45/0.8/0.9`. tics `curses`. greeting
  `"{~What|You again|Keep your boots up}"`, catchphrase `"{~Rats don't sing. Something's teaching them.|Every rat's a copper. Every big rat's two.|Burn the nest. Then burn where the nest was.}"`.
- **Voice.** `rogue`, f, seed 1113 + `{ rough: 0.25, pitch: 0.55 }`.
- **Wants.** Saint Gnaw dead, and paid per rat tail (bounty: 1 penny per 10 rats killed, shown in the Ledger).
- **Across the acts.** After A2 she goes down to Blackwater hunting the Unlit ("same job, bigger rat").
  Dies in A4 if you skip her side room (`q_nell_last_hunt`) — the only NPC who can die; memory `death` for
  every NPC who knew her, and grief lines.

#### 14. Cantor Ebb (`npc_ebb`)
- **Role / where.** A human cantor of the Rat Choir who fled. `a2_choir_loft`.
- **Speech.** traits `coward`, `nervous`, `pious`. `0.65/0.6/0.2/0.05/0.1`. tics `hesitant`, `um`. catchphrase
  `"{~He hears everything. Everything.|We only wanted them to sing. So we'd know they were coming.|Don't hum. Please don't hum.}"`.
- **Voice.** `cultist`, m, seed 1114 + `{ pitch: 0.55, breath: 0.55 }`.
- **Wants.** Forgiveness from Nell, whose brother the Choir took.
- **Across the acts.** Teaches the Choir's "notes" (the boss's phase tells). If you bring him to Nell (escort
  side room), relation Nell→Ebb flips from fear to grudging trust and both appear at the A2 hub.

#### 15. Sluicemaster Hendry Voss (`npc_voss`)
- **Role / where.** Engineer sealed in `a3_voss_pumphouse` since R.Y. 12.
- **Speech.** traits `gruff`, `paranoid`, `scholar`. `0.55/0.7/0.25/0.45/0.85`. tics `clipped`. catchphrase
  `"{~Water is a machine. Nobody listens.|Shut the top gate first. Always the top gate first.|Twenty-eight years I've been right in here.}"`.
- **Voice.** `runesmith`, m, seed 1115 + `{ speed: 0.5 }`.
- **Wants.** To see the Sluice Lamp lit and the Works run again. Hates the Sluicemaw (it ate his crew).
- **Across the acts.** Shouts gate instructions over pipes during the boss (`flood_warning` intent).
  Afterwards he leaves the pump house for the first time in 28 years (a small cutscene, §10).

#### 16. Ada Fennick (`npc_ada`)
- **Role / where.** A nine-year-old who has lived alone in `a3_fennick_loft`.
- **Speech.** traits `shy`, `nervous`, `kind`. `0.3/0.2/0.4/0.0/0.1`. tics `whisper`. catchphrase
  `"{~I counted the drips. Forty thousand.|The big fish sings at night.|You can have my candle. It's the last one.}"`.
- **Voice.** `child`, f, seed 1116 + `{ pitch: 0.8, speed: 0.5, breath: 0.35 }`.
- **Wants.** Her mother, who went to the Drowned Market and became one of the Pale.
- **Across the acts.** Escort to Brisket's barge (she stays aboard). In A3's Drowned Market Sister Unna
  recognises her; a choice lets Ada visit her Pale mother. Both flags count as `kindness` events.

#### 17. Ser Aubry Kell (`npc_kell`)
- **Role / where.** A knight who drowned and did not die. `a3_kells_rest`. Drowned Knight class tie-in.
- **Speech.** traits `honorable`, `grieving`, `archaic`. `0.9/0.55/0.2/0.3/0.6`. tics `archaic`. greeting
  `"Well met"`, oath `"On the anchor"`, catchphrase `"{~The water took my breath and forgot to take the rest.|I kept my vow. The vow did not keep me.|Die thrice beneath and rise, and thou shalt know me.}"`
  (the last one hints the Drowned Knight unlock).
- **Voice.** `knight`, m, seed 1117 + `{ depth: 0.82, speed: 0.38 }`, fx `{ lowpass: 2600, reverb: 0.35 }`
  (always sounds underwater).
- **Wants.** To guard something again. He guards the A4 hub's water edge after A3.
- **Across the acts.** Fights beside you once (A4 set piece `a4_hanging_houses`, AI ally, 05-BESTIARY-BOSSES.md).

#### 18. Mag Oarly (`npc_oarly`)
- **Role / where.** Ferrywitch. `a3_oarly_landing`. Ferrywitch class tie-in.
- **Speech.** traits `cynical`, `jolly`, `cruel`. `0.25/0.6/0.6/0.45/0.9`. greeting `"{~Still breathing?|Oh, a warm one|Mind my oarsmen}"`,
  catchphrase `"{~The drowned row better than the living. Less complaining.|Everybody floats eventually.|Stay in the water, pet. That's where the work is.}"`.
- **Voice.** `necromancer`, f, seed 1118 + `{ breath: 0.5, intonation: 0.6 }`.
- **Wants.** Someone to learn the craft (hints the unlock challenge).
- **Across the acts.** A5 she is at the Bellwell drain valves raising oarsmen from the drained cultists.

#### 19. Sister Unna of the Pale (`npc_unna`) — voice of `shop_drowned`
- **Role / where.** The Pale Congregation speaks through her. `a3_drowned_market`, only when flooded.
- **Speech.** traits `archaic`, `kind`, `paranoid`. `0.85/0.4/0.35/0.1/0.5`. tics `archaic`, `whisper`.
  greeting `"{~Breathe slow, dry one|Welcome beneath}"`, catchphrase `"{~Pearls are only tears that held still.|We are not dead. We are waiting.|The surface is so loud.}"`.
- **Voice.** `undead`, f, seed 1119 + `{ pitch: 0.58, speed: 0.34 }`, fx `{ lowpass: 2200, chorus: 0.4, reverb: 0.4 }`.
- **Wants.** The water never drained from their market. If you drain the market cistern permanently
  (a choice in A3), the Pale leave and the shop closes for the run (and their relation goes cold).
- **Across the acts.** A6: the Pale sing as the Rain stops; if they were kept flooded, they give a pearl-light
  that shields you in the Falling Flood.

#### 20. Old Wenna (`npc_wenna`) — `shop_ferry`
- **Role / where.** The ferrywoman ("Charon-that-isn't", canon). First dock in Act 2; every hub after.
- **Speech.** traits `sarcastic`, `greedy`, `scholar`. `0.45/0.5/0.5/0.2/0.85`. greeting `"{~Fare's up front|In you get|Evening. It's always evening}"`,
  catchphrase `"{~Coin or blood, dearie. I'm not fussy.|I've ferried everybody once.|The river's short. The waiting's long.}"`.
- **Voice.** `elder`, f, seed 1120 + `{ speed: 0.4, tone: 0.35 }`.
- **Wants.** Nobody knows. In A6 she reveals she ferried Ossery up to the rim in R.Y. 0, and has waited forty
  years to ferry him back down.
- **Across the acts.** Takes max health as payment (canon). Ending C uses her ferry.

#### 21. Jory Wickett (`npc_jory`)
- **Role / where.** Oilrunner and distiller. `a4_wickett_still`.
- **Speech.** traits `greedy`, `brave`, `sarcastic`. `0.2/0.55/0.6/0.4/0.85`. tics `drawl`. catchphrase
  `"{~Oil's the only thing down here that shines honest.|Light's a luxury. I sell luxuries.|Mind the barrels. And the other barrels.}"`.
- **Voice.** `scavenger`, m, seed 1121 + `{ rough: 0.4 }`.
- **Wants.** The Deep Springs reopened so he can get rich. Conflicts with the Deep Lamp relight (it needs
  the springs' oil). A choice in A4: share the oil (Jory helps in the boss with oil barrels) or take it all
  (Lamp brighter, +10% light radius in A4 revisits, Jory hostile — he raises prices by 50%).

#### 22. The Mothwife (`npc_mothwife`) — `shop_gamble`
- **Role / where.** Gambler. `a4_mothwife_tent`; tent moves to each hub afterwards.
- **Speech.** traits `romantic`, `sarcastic`, `paranoid`. `0.6/0.55/0.55/0.1/0.75`. tics `whisper`. catchphrase
  `"{~Every lantern's a question. Pay to hear the answer.|Moths know which light is lying.|Shake it. Listen. Then decide.}"`.
- **Voice.** `oracle`, f, seed 1122 + `{ breath: 0.55, flutter: 0.2 }`, fx `{ tremolo: 0.15, tremoloHz: 7 }` (wing-flutter).
- **Wants.** The Widow gone — the Widow is her sister, turned. Ending the Widow fight with Gleam (a "mercy"
  finish, 05-BESTIARY-BOSSES.md) gives her closure and a free legendary sealed lantern.

#### 23. Lune (`npc_lune`)
- **Role / where.** A moth-sighted girl, fifteen, in `a4_lune_lighthouse`. Moth Oracle hints.
- **Speech.** traits `shy`, `scholar`, `paranoid`. `0.5/0.45/0.3/0.05/0.3`. catchphrase
  `"{~I see better with it off. Try it.|The dark isn't empty. It's crowded.|Your lantern's loud. Everything hears it.}"`.
- **Voice.** `oracle`, f, seed 1123 + `{ pitch: 0.7, speed: 0.46 }`.
- **Wants.** To see colour once. When the Deep Lamp is relit her line is the act's emotional beat (§10).
- **Across the acts.** Teaches the "lantern out" trick (hide from the Unlit). Joins Merrit in Act 6 as a guide.

#### 24. Deacon Marl (`npc_marl`) — `shop_tithe`
- **Role / where.** Tithe-keeper. First tithe box at `a4_floating_chapel`; his hall `a5_tithe_hall`.
- **Speech.** traits `pious`, `greedy`, `pompous`. `0.85/0.7/0.4/0.2/0.8`. tics `posh`. oath `"By the Toll"`,
  catchphrase `"{~Every bell asks. Every bell is answered.|A blessing is a debt the sky pays. A curse is one you pay.|The price rises with the dead, child. Mine, specifically.}"`.
- **Voice.** `cultist`, m, seed 1124 + `{ tone: 0.55, intonation: 0.62 }`, fx `{ reverb: 0.3 }`.
- **Wants.** Money, and Dunmere replaced by himself.
- **Across the acts.** Prices climb per bell-cultist killed (canon). In A5 he offers a deal: spare 10
  cultists in the galleries (knock them out with the pole's non-lethal charge, 04-CLASSES-PROGRESSION.md) and
  he turns on Dunmere, opening a shortcut past her loft.

#### 25. Osk Tamberlane (`npc_osk`)
- **Role / where.** The last Bellwright. `a5_bellwright_forge`.
- **Speech.** traits `gruff`, `honorable`, `scholar`. `0.5/0.5/0.35/0.3/0.8`. tics `growl`. catchphrase
  `"{~A bell's a warning, not a god.|Ring it true or not at all.|Gravity's just a habit. Bells break habits.}"`.
- **Voice.** `runesmith`, m, seed 1125 + `{ depth: 0.9, speed: 0.36 }`.
- **Wants.** The Bellfather stopped — he built its first frame. Gives gravity lanterns.
- **Across the acts.** Recognises the Silent Bells' tune (§4). If Bellringer is unlocked, he forges the class
  hand-bell cosmetic.

#### 26. Precentor Hallow Dunmere (`npc_dunmere`)
- **Role / where.** Leader of the bell-cult. `a5_precentor_loft`. Human mini-boss (05-BESTIARY-BOSSES.md,
  `elite_dunmere`) unless Marl's deal is taken.
- **Speech.** traits `pious`, `cruel`, `pompous`. `0.9/0.75/0.3/0.75/0.95`. tics `flowery`. oath `"By the Toll"`,
  catchphrase `"{~The Bellfather rings and the world obeys.|Kneel, and fall the right way.|Your little flames are so quiet.}"`.
- **Voice.** `cultist`, f, seed 1126 + `{ depth: 0.6, intonation: 0.8 }`, fx `{ reverb: 0.45, echo: 0.2, echoSec: 0.28 }`.
- **Wants.** To ring the Bellfather's last toll and flip the Hollow's gravity (she believes the flood will
  fall up and out). She is wrong; the Bellfather fight is the proof.

#### 27. Merrit Vane (`npc_merrit`)
- **Role / where.** Ossery's daughter, 51. `a6_vane_house`. A Cloudwarden herself.
- **Speech.** traits `grieving`, `kind`, `cynical`. `0.6/0.65/0.3/0.15/0.6`. catchphrase
  `"{~He isn't a monster. He's a man who wouldn't put the umbrella down.|I was eleven when it started raining. I'm fifty-one.|Keepers have to let go. That's the whole job.}"`.
- **Voice.** `stormcaller`, f, seed 1127 + `{ speed: 0.44, rough: 0.12 }`.
- **Wants.** Her father to stop. Not necessarily to die.
- **Across the acts.** Only A6. Explains the keeper rule (sets `knows_keeper_rule` if Pask did not).
  In ending B she takes the keeper's place instead of you if her warmth ≥ 0.6 and you ask.

#### 28. Corvin Crake (`npc_corvin`)
- **Role / where.** Aldra's husband, leader of the Last Descent, held inside the root at `a6_corvins_cell`.
- **Speech.** traits `loyal`, `grieving`, `brave`. `0.6/0.4/0.3/0.3/0.5`. tics `hesitant`. catchphrase
  `"{~Is it still raining? It's always still raining.|Tell Aldra I kept the oath. Mostly.|Eighteen years. It felt like a long night.}"`.
- **Voice.** `elder`, m, seed 1128 + `{ breath: 0.55, speed: 0.35 }`, fx `{ reverb: 0.5, lowpass: 3200 }` (inside cloud).
- **Wants.** To go home. Freeing him is a side room (burn the root around him without drowning him — the
  root holds a floating lake above his cell; see 07-TRAVERSAL-PUZZLES.md puzzle P6-4).
- **Across the acts.** Only A6 and the epilogue.

### 6.4 Boss speakers

Bosses are Lingo speakers too; their lines come from `boss_opener` / `boss_phase` plus the new boss pools in
§12.4. Phase mechanics are in 05-BESTIARY-BOSSES.md; this table is only their voice and manner.

| Boss | Speaks? | Traits | Sliders F/V/C/A/Co | Voice | Notes |
|---|---|---|---|---|---|
| Mother Tallow (`boss_tallow`) | yes, words | `pious`, `kind`, `cruel` (a smothering mother) | `0.7/0.6/0.5/0.6/0.9` | `cultist` f seed 2001 + `{ depth: 0.9, pitch: 0.35, speed: 0.3 }`, fx `{ reverb: 0.5, lowpass: 3500 }` | calls you "little wick"; lines soften as she melts |
| Saint Gnaw (`boss_gnaw`) | squeaks + choir; subtitled | `pious`, `bloodlust`, `pompous` | `0.8/0.5/0.4/0.9/1` | **babble** `simlish`, pitch 0.9, speed 0.8, fx `{ chorus: 0.8, reverb: 0.4 }`; the choir is 6 babble voices a third apart | subtitles in brackets: `[The Choir sings: "Feed. Feed. Feed."]` |
| The Sluicemaw (`boss_sluicemaw`) | no | — | — | no voice; the Narrator reads its lines (`named_beast`, `beast_snarl`) | sfx only (sfx catalog) |
| The Lampless Widow (`boss_widow`) | yes, in **stolen voices** | `cruel`, `romantic`, `grieving` | `0.6/0.4/0.2/0.7/0.8` | each line uses the voice JSON of an NPC the player has met (random from the met list), with fx `{ pitchShift: -3, reverb: 0.6, tremolo: 0.3 }` | her phase 2 line uses Aldra's voice to call you home |
| The Bellfather (`boss_bellfather`) | tolls + one word per phase | `pious` | `1/0.1/0/0.8/1` | `brute` seed 2005 + `{ depth: 1, speed: 0.25 }`, fx `{ robot: 0.6, robotHz: 40, reverb: 0.7 }` | words: "KNEEL." "FALL." "RING." "TOLL." |
| Ossery Vane (`boss_ossery`) | yes, a full character | `grieving`, `pompous`, `archaic` | `0.85/0.7/0.15/0.5/0.7` | `stormcaller` m seed 2006 + `{ depth: 0.7, speed: 0.4, flutter: 0.2 }`; fx per phase: P1 `{ reverb: 0.3 }`, P2 `+ echo 0.3`, P3 `+ robot 0.2` (the storm in him), P4 fx cleared (just a man) | the only boss with memories of the player (§12.5) |

---

## 7. Companion: Hush the lanternmoth

**What.** A lanternmoth larva, found in Act 1 in the Drip Gallery, stuck in wax. Freeing it (melt the wax
without burning it: Ember `bolt` at range > 40 cells, or the pole) makes it follow you. It grows each act.
It never dies (if it takes lethal damage it curls into its cocoon on your pole for 20 s).

| Act | Form | Size (cells) | Light | What it does |
|---|---|---|---|---|
| 1 | larva | 4×2, rides on the pole | glow radius 10, `#ffe6b0` | lights your feet; squeaks at hidden Silent Bells within 60 cells |
| 2 | grub | 5×3, crawls on ropes | 14 | sits on your rope: +10% swing reach visual (no mechanic) and marks grapple points within 140 cells with a sparkle |
| 3 | cocoon | 5×5, hangs on the pole | 8 | glows through water; lights submerged rooms (radius 20 underwater) |
| 4 | moth | 8×6, flies | 28, and can be **sent** (key per 02-CONTROLS-UI.md) to perch on a spot for 12 s | the act 4 light economy: a free second light source, 40 s cooldown; the Unlit attack it (it hides back to you) |
| 5 | moth | 8×6 | 28 | flies against gravity bands, shows which way "down" is inside a band with an arrow of dust |
| 6 | great moth | 14×10 | 40 | during the Falling Flood it carries you 60 cells upward once (a rescue, 1 per room) |

**Voice.** Hush speaks in babble only, `babbleMode: 'letters'`, pitch 0.95, speed 0.85, depth 0.1, tone 0.8,
with subtitles as a gloss in italics: `*Hush chirrs: "bell! bell!"*`. Its lines are a small private pool
(`hush_chirr`, §12.4) of 1–3 words. Hush has Lingo traits `jolly`, `loyal`, `hungry` so the gloss pool can
be tag-weighted like any speaker.

**Why a moth.** The Widow and the Mothwife are moths; Hush is the proof that moth and light can be friends.
In the Widow fight, if Hush is present, the Widow's "snuff" attack targets Hush first 30% of the time and
Hush survives it (it's cocooned) — the one fight where Hush matters to the boss.

**Cheap fallback.** Hush is a 2-frame sprite with a point light. No AI beyond "follow the player's head with a
spring (stiffness 40, damping 8)" and the perch command.

---

## 8. The Narrator (the Lamp Ledger)

**Who.** The **Lamp Ledger** is the Guild's great book: every Lamp ever lit, every Lamplighter who lit it.
The Narrator is the Ledger's voice — it reads scene text, act titles, relight lines, lore plaques and the
endings. The fiction: the Ledger writes itself as you go, and reads its new entries aloud. (The same Ledger
is the damage meter tab, `meters/`, so the UI and the fiction share a name.)

**Voice.** `voiceFor({ role: 'narrator', gender: 'n', seed: 40 })`, no overrides. The role is built to have
almost no jitter so it is the same voice all game. Lines are italic in the log and subtitles.

**Where it speaks.**

| When | Text source | Example |
|---|---|---|
| Act title card | `data/story.json` → `acts[n].title_line` (fixed text) | *"The Second Entry. The Gutterways, where the city drained, and the rats learned to sing."* |
| Entering a named location for the first time | Lingo intent `ledger_arrival` (§12.4) | *"The Drip Gallery. Wax falls here slower than rain."* |
| Relighting a Great Lamp | fixed text per Lamp + `ledger_relight` pool | *"Entered in the Ledger: the Gutter Lamp, relit, R.Y. 40. By an apprentice. No tier left dark."* |
| Reading a lore plaque | fixed text (60 plaques in `data/lore.json`) | — |
| A boss that does not speak | `named_beast`, `beast_snarl` narration pools | *"The Sluicemaw rolls in the dark water, and the gauges on the wall all jump at once."* |
| Scene text (anything written in third person) | Emberveil's `isSceneText()` test (`prototypes/emberveil/js/talk.js`) routes it to the Narrator automatically | — |
| Endings | fixed text per ending (§11) | — |

Reuse `talk.js`'s `narrate()` pattern: copy `isSceneText` and `narrate` into `lanternfall/js/talk.js`
(the prototype rule is copy, not import, for code that may diverge).

---
## 9. The story, act by act

### 9.0 Story rules

- **Fixed story text vs generated text.** Everything in a cutscene or a quest's key line is **fixed text**
  in `data/story.json` (so the plot never changes by random draw). Everything else — greetings, barks,
  haggling, idle chatter, boss taunts, camp talk — is **Lingo-generated** (§12). Fixed lines still go through
  `lingo.toSpeech()` so invented words are pronounced right.
- **Flags.** Story choices set boolean flags in the save (`save.flags`, 10-TECH-DATA.md). The flags that feed the
  endings are the **Kindling flags** (§11.1). Every flag is listed where it is set.
- **Beats** are numbered `A<act>.<n>`. A beat is either a room (id from §3 or 09-MODES-MAP.md), a cutscene
  (§10) or a conversation.
- **Length target.** Each act: 25–40 rooms along the chosen path (09-MODES-MAP.md), 60–90 minutes the first time.

### 9.1 Act 1 — Lanterncrown & the Wax Stair: "The Crown Lamp gutters"

| Beat | Where | What happens |
|---|---|---|
| A1.0 | cutscene `cs_opening` | The Crown Lamp flickers. Aldra gives you her husband's pole-lantern. (§10.1) |
| A1.1 | `a1_guild_hall` | Class pick happens here in fiction: Aldra asks "What will you carry down?" (the class menu, 02-CONTROLS-UI.md). |
| A1.2 | `a1_first_step` | Lesson: move, jump, pole. The first rain on your lantern. |
| A1.3 | `a1_candlemarket` | Lesson: the Wick builder (canon: room 3). Brother Seld gives you the Rime flame "for cooler heads". |
| A1.4 | `a1_stair` rooms | Wax-things (05-BESTIARY-BOSSES.md) attack. First Silent Bell nearby. |
| A1.5 | `a1_gull_chimney` | Pim Rooke stuck in the chimney; wall-slide lesson; rescue sets `pim_met`. |
| A1.6 | `a1_drip_gallery` | Lesson: plank kit. Hush found in wax (§7). Spark flame found here. |
| A1.7 | branch choice | Roofs (`a1_roofs`, Dobb, gusts) or deep Stair (more wax, Gleam flame shrine). |
| A1.8 | `a1_tallow_chapel` antechamber | Seld confesses the chapel fed Mother Tallow candles for nine years. Choice: "Can she be put out gently?" → sets `asked_gentle`. |
| A1.9 | boss | **Mother Tallow**. If `asked_gentle` and her last phase is finished with only Rime/Tide damage → flag `tallow_cooled` (Kindling). |
| A1.10 | cutscene `cs_relight_crown` | The Crown Lamp steadied with wax from Tallow's heart (a "heartwick"). The Narrator enters it in the Ledger. |
| A1.11 | hub | Floodgate mode unlocks (Hask). Trials unlock. Pim asks to hold a lantern post — **choice**: let her (`pim_trusted`, Kindling) or send her home. |

**Theme.** You are small. Light is fragile. People help if you help them.

### 9.2 Act 2 — The Gutterways: "The rats have learned to sing"

| Beat | Where | What happens |
|---|---|---|
| A2.0 | cutscene `cs_act2` | Descending by the old crane-lift. The singing starts below. |
| A2.1 | `a2_dripmarket` | Hub. Brisket's barge, Clink's shop, Crane's second counter. Old Wenna's first dock. |
| A2.2 | `a2_hook_forge` | Lesson: grapple hook. The hook was Corvin's spare (Aldra's note, read by the Narrator). |
| A2.3 | `a2_lockhouse` | Lesson: levers, buttons, timed doors (Pickering). |
| A2.4 | `a2_charm_shrine` | Lesson: Charm slot 1. Bile flame found in the Brickgut. |
| A2.5 | `a2_ratcatchers` | Nell's bounty. She says the rats sing *on purpose*. |
| A2.6 | side | `q_lost_sweeps`: three of Dobb's sweeps on the Chainwalks, one per sub-branch. |
| A2.7 | `a2_choir_loft` | Cantor Ebb hiding. He explains the Choir; choice: take him to Nell (escort room) → `ebb_forgiven` (Kindling) if you finish the escort without him taking damage > 50%. |
| A2.8 | boss | **Saint Gnaw of the Rat Choir**. |
| A2.9 | cutscene `cs_relight_gutter` | The Gutter Lamp relit; the rats scatter from the light. Nell laughs for the first time. |
| A2.10 | hub | The Long Descent and Daily Wick unlock (canon: after Act 2 boss). Nell announces she's going deeper. |

**Theme.** Things in the dark were taught to be what they are. The Guild's dark is not only the Rain's fault.

### 9.3 Act 3 — The Sluice Ward: "Water is a machine"

| Beat | Where | What happens |
|---|---|---|
| A3.0 | cutscene `cs_act3` | The lift cable snaps; you fall into the First Cistern. |
| A3.1 | `a3_first_cistern` | Lesson: swimming and breath. |
| A3.2 | `a3_voss_pumphouse` | Voss (talking through a pipe until you open his door). Lesson: sluice control. 3 wick slots, Charm slot 2. |
| A3.3 | `a3_tide_font` | The Tide flame. |
| A3.4 | `a3_fennick_loft` | Ada Fennick. Escort to the barge (Brisket moors at the Pumpworks this act). |
| A3.5 | `a3_drowned_market` | The Pale. Sister Unna. Ada's mother (if Ada was escorted). **Choice**: let Ada visit (`ada_mother`, Kindling). |
| A3.6 | `a3_kells_rest` | Ser Aubry Kell; the Drowned Knight hint. |
| A3.7 | `a3_broken_arch` | Freeze the waterfall. Pim is missing — rescue room at the First Cistern revisit. |
| A3.8 | **choice** at the Market Cistern valve | Drain the Market cistern for a shortcut to the Reservoir (saves ~6 rooms), which ends the Pale's market. Keep it flooded → `pale_kept` (Kindling). |
| A3.9 | boss | **The Sluicemaw**. Voss shouts over the pipes (`flood_warning`). |
| A3.10 | cutscene `cs_relight_sluice` + `cs_voss_door` | The Sluice Lamp relit. Voss steps outside. |

**Theme.** You can change the world's water now; each change has a cost for someone.

### 9.4 Act 4 — Blackwater: "Something eats the light"

| Beat | Where | What happens |
|---|---|---|
| A4.0 | cutscene `cs_act4` | Your lantern starts to burn oil. The light radius shrinks as the lift sinks into black. |
| A4.1 | `a4_last_derrick` | Lesson: oil and darkness. Jory Wickett. The Mothwife. |
| A4.2 | `a4_knot_house` | Lesson: Knots. Shade flame found in the Hanging Houses. |
| A4.3 | `a4_lune_lighthouse` | Lune teaches "lantern out" hiding. |
| A4.4 | `a4_hanging_houses` | Ser Kell fights beside you (set piece). |
| A4.5 | side `q_nell_last_hunt` | Nell hunting the Unlit in Stilt Town. Do it → `nell_alive` (Kindling). Skip past A4.8 → she dies (memory event `death`). |
| A4.6 | `a4_floating_chapel` | Deacon Marl's tithe box; he names his price for "the Toll's favour". Foreshadows Act 5. |
| A4.7 | **choice** at Wickett's Still | Share the Deep Springs' oil with Jory (`jory_shared`, Kindling) or take it all for the Lamp (brighter A4 revisits). |
| A4.8 | `a4_moth_nave` antechamber | The Mothwife tells you the Widow is her sister, "the one who loved the light too much". |
| A4.9 | boss | **The Lampless Widow**. A Gleam finish → `widow_mercy` (Kindling). |
| A4.10 | cutscene `cs_relight_deep` | The Deep Lamp relit. Lune sees colour (§10.6). Aldra arrives by lift and admits the Last Descent. |

**Theme.** Light costs something. Who pays.

### 9.5 Act 5 — The Bellwell: "Kneel, and fall the right way"

| Beat | Where | What happens |
|---|---|---|
| A5.0 | cutscene `cs_act5` | The shaft is drowned. The bells toll underwater. |
| A5.1 | `a5_drain_valves` | Set piece: open the Nine Valves in order to drain the shaft (07-TRAVERSAL-PUZZLES.md P5-1). |
| A5.2 | `a5_tithe_hall` | Deacon Marl; the Bell Tithe; 4 wick slots. |
| A5.3 | `a5_bellwright_forge` | Osk Tamberlane. Lesson: gravity lanterns. |
| A5.4 | `a5_galleries` | Cultists. **Marl's deal**: knock out 10 without killing → `marl_deal` (Kindling), shortcut past Dunmere. |
| A5.5 | `a5_precentor_loft` | Dunmere (mini-boss, or skipped by the deal). |
| A5.6 | letter | Pim brings Pask's letter: the keeper rule (`knows_keeper_rule`). |
| A5.7 | side | Clink's escapement plans in `a5_escapement`. |
| A5.8 | boss | **The Bellfather**. |
| A5.9 | cutscene `cs_relight_bell` | The Bell Lamp relit. The shaft floor cracks. Below: the Hollow floor, Understar, and the root. |

**Theme.** Faith, and choosing what to ring.

### 9.6 Act 6 — The Cloudroot: "Let go"

| Beat | Where | What happens |
|---|---|---|
| A6.0 | cutscene `cs_act6` | You drop through the cracked floor into Understar. The Cloudroot rises into the rain. |
| A6.1 | `a6_vane_house` | Merrit Vane. Elsbet's grave. The keeper rule, if not already known. |
| A6.2 | `a6_sky_socket` | Lesson: Overcharge mastery (canon). Charm slot 3. Old Wenna is waiting at the socket's dock. |
| A6.3 | `a6_rootway` | The climb. **The Lamp Bands**: each Great Lamp relit in Acts 1–5 is a band of its colour along the root; each band is a safe camp (09-MODES-MAP.md). |
| A6.4 | `a6_corvins_cell` | Free Corvin → `corvin_freed` (Kindling). |
| A6.5 | `a6_last_wall` | You pass the rim from the inside. Every NPC who is alive and has warmth ≥ 0.3 calls up from their district (a 15-line montage using `farewell`/`rally`, §10.8). |
| A6.6 | boss P1–P3 | **Ossery Vane** in the storm. |
| A6.7 | cutscene `cs_rain_stops` | Phase 3 ends. **The Rain stops.** Every held body of water in the root lets go. (§10.9) |
| A6.8 | boss P4 | Ossery in the dry, falling flood around the arena. At 10% health the fight freezes into the **final choice** (§11). |
| A6.9 | ending | §11. |

**The Falling Flood** (the set piece the canon promises): between P3 and P4 the arena's floor drops away and
you fall 1,600 cells down the root's inside while its lakes pour past you, then climb back up on the swollen
root as water pours down. Rules and fallbacks are in 06-PHYSICS-RENDER.md (held water "releasing") and
09-MODES-MAP.md (the room chain `a6_flood_1`…`a6_flood_4`).

---

## 10. Cutscene scripts

**Format.** Cutscenes are in-engine: the camera moves, sprites animate, text shows as speech bubbles and
subtitles, voices play. Each is a JSON list in `data/story.json` → `cutscenes.<id>` of steps:
`{ "cam": [x,y,zoom,sec] }`, `{ "say": "<speaker id>", "text": "..." }`, `{ "anim": "<actor>", "clip": "..." }`,
`{ "wait": sec }`, `{ "sfx": "<sfx id>" }`, `{ "flag": "name" }`, `{ "light": { "lamp": "crown", "to": 1, "sec": 3 } }`.
Every cutscene is skippable with a 0.6 s hold (02-CONTROLS-UI.md). Target length 20–60 s.

Below, `NARRATOR:` lines are the Ledger. `[ ]` are stage directions.

### 10.1 `cs_opening` — "Go down, Lamplighter" (45 s)

```
[Black. Rain sound. A single amber point far above: the Crown Lamp, flickering.]
NARRATOR: The Rain has not stopped for forty years.
[Camera pulls back: Lanterncrown on the rim, the Hollow a black throat below it. Dark tiers going down.]
NARRATOR: Six Lamps lit Vessmere once. Five went out. The sixth is going.
[Guild Hall. Aldra holds a pole-lantern out. The apprentice (the player's class sprite) takes it.]
ALDRA: This was Corvin's. He went down with it eighteen years ago. It came back up without him.
ALDRA: The Crown Lamp's guttering. Wax Stair's first. Then whatever's under that.
APPRENTICE: [no voice; the player character never speaks aloud — a small lantern flicker is their "reply"]
ALDRA: No tier left dark. Go down, Lamplighter. Light them again.
[The lantern lights: amber, the Ember flame. Title card: LANTERNFALL.]
```

### 10.2 `cs_relight_crown` — Act 1 relight (35 s)

```
[Mother Tallow's wax heart, a glowing lump, in the player's hand. The Crown Lamp's cage above.]
[The player climbs the chain; the camera follows up in one shot.]
[Heart dropped into the Lamp. It flares.]
{light: crown → 1.0 over 3 s; district ramp crossfade to lit}
NARRATOR: Entered in the Ledger: the Crown Lamp, steadied, Rain Year forty.
[Lanterncrown's windows light one by one. Pim waves from a roof.]
ALDRA: (from below, small) That's one.
```

### 10.3 `cs_act2` — descent to the Gutterways (25 s)

```
[The old crane-lift creaks down past the Wax Stair. Rain gets heavier.]
[From below: a faint many-voiced squeaking in harmony.]
NARRATOR: The Second Entry. The Gutterways, where the city drained, and the rats learned to sing.
HUSH: *chirr* (subtitle: *Hush hides in your hood.*)
```

### 10.4 `cs_relight_gutter` (30 s)

```
[The Gutter Lamp's cage, rusted. The player touches the lantern to its wick. Pink-orange light floods.]
[Thousands of rats pour away from the light down every pipe, like water draining.]
NELL: (laughing) Look at 'em run! Forty years I've wanted to see that.
NARRATOR: The Gutter Lamp, relit. The Choir is quiet.
```

### 10.5 `cs_act3` + `cs_voss_door` (25 s + 20 s)

```
cs_act3:
[Lift descending into the Sluice Ward. SNAP. Cable whips. The player falls into the First Cistern.]
NARRATOR: The Third Entry. The Sluice Ward. Water, and what it's for.

cs_voss_door (after the Sluice relight):
[Voss's pump-house door. Bolts slide back one at a time, eleven of them.]
[Voss steps out, blinking in teal light. Looks up at the Lamp.]
VOSS: Twenty-eight years. (pause) Top gate first. I told them. Top gate first.
[He sits down on the step.]
```

### 10.6 `cs_relight_deep` — Lune sees colour (45 s)

```
[The Moth Nave, dark. The Deep Lamp's shell, huge. Oil pumps thump.]
[The player lights it. White-violet light blooms across black water.]
[Lune at the Nave door with her hands over her eyes. She lowers them.]
LUNE: Oh. (pause) Is that what purple is?
[Aldra steps off the lift behind her.]
ALDRA: Apprentice. I owe you a truth. The Last Descent was my idea. Corvin went because I asked.
ALDRA: Find the bottom. If he's down there — (she stops) — just find the bottom.
NARRATOR: The Deep Lamp, relit. Four.
```

### 10.7 `cs_act5`, `cs_relight_bell` (25 s + 30 s)

```
cs_act5:
[Underwater. Enormous bells hang in the drowned shaft. One tolls: the water ripples in a ring.]
NARRATOR: The Fifth Entry. The Bellwell. The bells were warnings. Then they were gods.

cs_relight_bell:
[Bell Lamp relit; gold light down the shaft. A crack runs across the shaft floor. The floor falls away.]
[Below: a drowned town, and rising from its middle, a root of grey cloud as wide as a street, going up and up.]
OSK: (quietly) So that's where the sky went.
```

### 10.8 `cs_rim_montage` — at the Last Wall (up to 15 lines, 40 s)

```
[The player climbs past the rim from the inside of the Hollow. Below, each lit tier is a coloured band.]
For each NPC with alive = true and warmth(npc → player) ≥ 0.3, in tier order, top first:
  <NPC>: lingo.speak('rally' | 'farewell', { speaker: npc, listener: player, scene: 'rim_montage' })
  (bubbles float up from their tier; voices get quieter with depth: volume = 1 − tier × 0.12)
Cap at 15 lines; always include Aldra if alive, and Pim if pim_trusted.
```

### 10.9 `cs_rain_stops` — the big one (50 s)

```
[End of Ossery phase 3. He staggers; the Sky Lamp's flame gutters in his hand.]
OSSERY: No — not yet — one more day —
[The rain slows. Every drop in the air hangs for 0.5 s (sim frozen, rendered only), then falls. Silence.]
{rain density → 0 over 3 s; ambient music cuts to one sustained note}
NARRATOR: For the first time in forty years, nothing fell.
[Then the root creaks. Every lake inside it lets go at once. The floor goes.]
{cutscene hands control back mid-fall: the Falling Flood chain begins}
```

### 10.10 Endings

See §11. Each ending has its own cutscene (`cs_end_a` … `cs_end_d`), 60–90 s, then credits over the
district the player spent the most time in (Ledger stat), with the rain off.

---

## 11. Endings

### 11.1 Kindling flags

Eleven flags count as **Kindling**. The count is the `kindling` number used below. Each is set once.

| Flag | Where | How |
|---|---|---|
| `tallow_cooled` | A1.9 | finish Mother Tallow with Rime/Tide only, after asking Seld |
| `pim_trusted` | A1.11 | let Pim carry a lantern post |
| `ebb_forgiven` | A2.7 | escort Cantor Ebb to Nell |
| `ada_mother` | A3.5 | let Ada visit her Pale mother |
| `pale_kept` | A3.8 | keep the Market Cistern flooded |
| `hollis_lantern` | A4 | give Hollis his brother's lantern instead of selling it |
| `nell_alive` | A4.5 | help Nell's last hunt |
| `jory_shared` | A4.7 | share the Deep Springs' oil |
| `widow_mercy` | A4.9 | finish the Widow with Gleam |
| `marl_deal` | A5.4 | knock out 10 cultists without killing |
| `corvin_freed` | A6.4 | free Corvin from the root |

Also tracked: `knows_keeper_rule` (A5.6 or A6.1 — always obtainable, but the A6.1 path is optional if you
skip Merrit), `silent_bells` (0–12), `lamps_full` (6 if every Lamp was relit — always true in a finished campaign).

### 11.2 The final choice

At Ossery's 10% health in phase 4, time stops (a Lesson-room-style pause with no enemies) and three prompts
appear over Ossery. Each is a ground spot you walk to and press interact, so choosing is a physical act.

| Prompt | Shown when | Result |
|---|---|---|
| **Take the flame** (left) | always | Ending C |
| **Hold the tether** (above, reached by grapple) | `knows_keeper_rule` | Ending B |
| **Ask him to let go** (right, beside Ossery) | always shown; succeeds if `kindling ≥ 5` and `knows_keeper_rule` | Ending A (or D) on success; on failure Ossery answers with a fixed line ("You don't know what it's like to let go") and the prompt greys out — the other two stay |

### 11.3 Ending A — "The Long Dawn" (the good ending)

Ossery lets go. The flame goes back to the Sky Lamp's socket in a long fall of light down the root. The root
unravels into mist. Old Wenna's ferry takes Ossery down to Merrit. Dawn over a dry rim. Epilogue lines from
every living NPC with warmth ≥ 0.3 (Lingo `relief` + `thanks`). Pim, if `pim_trusted`, is shown as the
next apprentice. Aldra (and Corvin if freed) at the Guild Hall. Narrator: *"Entered in the Ledger: the Sky
Lamp, relit. Six. No tier left dark."*

### 11.4 Ending B — "The Keeper's Rain" (bittersweet)

You take the tether from Ossery. He falls asleep, released; Merrit takes him home. You stay in the Crown of
Cloud as the new keeper. The Rain returns as a gentle rain that stops and starts: "weather" again. The city
lives; you are a story they tell. If Merrit's warmth ≥ 0.6 you may instead ask her to hold it
(a second prompt appears); then she stays and you go home — a variant `cs_end_b2`.
Narrator: *"The Ledger has a keeper now. It rains when it should."*

### 11.5 Ending C — "Lanternfall" (the hard ending)

You strike the flame from Ossery's hand. He falls with the flood. The Rain stops for good, the root
collapses, and its water drowns Understar a second time; the Sky Lamp is relit on a flooded floor. The upper
city is dry and lit; the floor is lost. Aldra writes your name in the Ledger and does not say anything.
Narrator: *"The Lamps are lit. The Ledger does not say what it cost. It says: Lanternfall."*

### 11.6 Ending D — "No Tier Left Dark" (secret)

Ending A's conditions **plus** `kindling ≥ 9`, `silent_bells = 12`, `corvin_freed` and `nell_alive`.
As the flame returns to the socket it splits into six and runs up the Hollow; every Great Lamp flares at once,
and the Silent Bells ring the full tune by themselves. Everyone from the epilogue gathers at the Dry Rim;
Ossery rings the last Silent Bell. Unlocks the Guild-marks reward "Six Lamps" (cosmetic lantern) and the
Endless mode's "Dry" variant (09-MODES-MAP.md).

### 11.7 Ending unlocks

| Ending | Unlock |
|---|---|
| any | New Game+ ("Second Descent", 09-MODES-MAP.md), Boss Rush entry for Ossery |
| A | Gleam-gold lantern skin |
| B | "Keeper" title and a rain-toggle cosmetic (rain on/off in the hub) |
| C | "Lanternfall" hard mode (enemies +25% health, oil −20%) |
| D | "Six Lamps" lantern skin; Endless "Dry" variant |

---
## 12. How dialogue is produced

### 12.1 Pipeline

```
 game event ──► talk.js picks  ──► lingo.speak(intent, ctx) ──► { text, speech, tags }
 (bark, shop,   intent + speaker     (pack loaded, traits,        │
  boss phase,   + bindings + scene   sliders, relation, memory)   ├─► speech bubble + subtitle + log (§12.7)
  idle timer)   + exclude list                                    └─► voice: synthesize(speech, voice) → play(pan, vol) (§12.6)
```

- One module, `lanternfall/js/talk.js`, owns this (modelled on `prototypes/emberveil/js/talk.js`, copied
  not imported). It holds the `Lingo` instance, the `RelationGraph`, each NPC's `MemoryBank`, the voice cache
  and the on-screen bubble queue.
- **Load order at boot:** core `lexicon.json` / `grammar.json` / `traits.json` / `relations.json` /
  `events.json`, then `lingo/data/packs/lanternfall.json` (lexicon entries, loaded with
  `lingo.lexicon.add(e)` then `lingo.invalidatePronunciations()`), then the **grammar extension**
  `lanternfall/data/grammar-lanternfall.json` merged into `grammar.symbols` (new intents and extra tagged lines
  appended to existing intents; `meta.intents` / `meta.noRepeat` extended). The core grammar file is not edited.
- **The player never speaks aloud.** The player is a Lingo `Speaker` (id `player`, name from the save, pronouns
  from the class pick) so NPCs can address them (`{listener.name}`), but no intent is ever spoken by `player`.
  Their "voice" is Hush (§7) and the Narrator (§8).
- **Worker option (cheap fallback flag).** If `speak()` + `synthesize()` exceeds 3 ms in a frame, move voice
  synthesis to a Web Worker (the DSP is pure JS, voice-lab README). Text generation stays on the main thread.

### 12.2 The Lingo pack: `lingo/data/packs/lanternfall.json`

Shape is the same as `packs/emberveil.json`: `{ "_doc": "...", "entries": [ ... ] }`. Every proper name gets
`pron.respell` (capitals = stressed syllable). Tags carry the act (`act1`…`act6`) so lines can bind "a place in
this act" with `bind: { place: { type: 'place', tags: ['act3'] } }`.

#### Places (40)

| id | sg | respell | tags |
|---|---|---|---|
| `vessmere` | Vessmere | VESS-meer | city |
| `the_hollow` | the Hollow | HOL-oh | chasm |
| `sunward_face` | the Sunward Face | SUN-werd FAYSS | wall |
| `shadeward_face` | the Shadeward Face | SHAYD-werd FAYSS | wall |
| `brinkhold` | Brinkhold | BRINK-hohld | history |
| `lanterncrown` | Lanterncrown | LAN-tern-krown | act1 town lit |
| `wax_stair` | the Wax Stair | WAKS STAIR | act1 |
| `slate_roofs` | the Slate Roofs | SLAYT ROOFS | act1 |
| `tallow_chapel` | the Tallow Chapel | TAL-oh CHAP-ul | act1 church |
| `guild_hall` | the Guild Hall | GILD HAWL | act1 |
| `candlemarket` | Candlemarket | KAN-dul-mar-kit | act1 market |
| `drip_gallery` | the Drip Gallery | DRIP GAL-uh-ree | act1 |
| `gutterways` | the Gutterways | GUT-er-wayz | act2 |
| `dripmarket` | the Dripmarket | DRIP-mar-kit | act2 market |
| `brickgut` | the Brickgut | BRIK-gut | act2 sewer |
| `chainwalks` | the Chainwalks | CHAYN-wawks | act2 |
| `gutter_cathedral` | the Gutter Cathedral | GUT-er ka-THEE-drul | act2 church |
| `sluice_ward` | the Sluice Ward | SLOOSS WARD | act3 |
| `pumpworks` | the Pumpworks | PUMP-werks | act3 |
| `nine_cisterns` | the Nine Cisterns | NYN SIS-ternz | act3 |
| `high_aqueducts` | the High Aqueducts | HY AK-wuh-dukts | act3 |
| `great_reservoir` | the Great Reservoir | GRAYT REZ-er-vwar | act3 |
| `drowned_market` | the Drowned Market | DROWND MAR-kit | act3 market |
| `blackwater` | Blackwater | BLAK-waw-ter | act4 dark |
| `the_derricks` | the Derricks | DAIR-iks | act4 |
| `the_slick` | the Slick | SLIK | act4 |
| `stilt_town` | Stilt Town | STILT TOWN | act4 |
| `moth_nave` | the Moth Nave | MAWTH NAYV | act4 church |
| `lampless_lane` | Lampless Lane | LAMP-liss LAYN | act4 dark |
| `bellwell` | the Bellwell | BEL-wel | act5 |
| `tithe_hall` | the Tithe Hall | TYDH HAWL | act5 church |
| `ring_galleries` | the Ring Galleries | RING GAL-uh-reez | act5 |
| `clockworks` | the Clockworks | KLOK-werks | act5 |
| `understar` | Understar | UN-der-star | act6 town |
| `cloudroot` | the Cloudroot | KLOWD-root | act6 |
| `empty_socket` | the Empty Socket | EMP-tee SOK-it | act6 |
| `rootheart` | the Root's Heart | ROOTS HART | act6 |
| `crown_of_cloud` | the Crown of Cloud | KROWN uv KLOWD | act6 |
| `dry_rim` | the Dry Rim | DRY RIM | ending |
| `deep_springs` | the Deep Springs | DEEP SPRINGZ | act4 |

#### Factions (11)

Every row in §5, with `forms: { sg, pl, adj, people }`, e.g.
`{ "id": "f_tithe", "type": "faction", "forms": { "sg": "tithe-sworn", "pl": "tithe-sworn", "adj": "Tithe", "people": "the Bell Tithe" }, "tags": ["act5","cult","hostile"], "pron": { "respell": "TYDH" } }`.
Respellings: `f_guild` LAMP-ly-terz GILD, `f_watch` RIM WOCH, `f_sweeps` SWEEPS, `f_ratcatchers` RAT-kach-erz,
`f_rat_choir` RAT KWY-er, `f_sluicemen` SLOOSS-men, `f_pale` PAYL, `f_oilrunners` OYL-run-erz,
`f_tithe` BEL TYDH, `f_cloudwardens` KLOWD-war-denz, `f_unlit` un-LIT.

#### Creatures (family level, 24)

These are **family words** for speech ("rats", "wax-things"), not monster ids. 05-BESTIARY-BOSSES.md owns the
monster roster; each monster there carries a `family` field that must match one of these ids, and a monster
may add its own lexicon entry with the same shape if it is named in dialogue.

| id | sg / pl | respell | tags |
|---|---|---|---|
| `rat` | rat / rats | — | act2 swarm vermin |
| `choir_rat` | choir-rat / choir-rats | KWY-er-rat | act2 rat |
| `wax_thing` | wax-thing / wax-things | WAKS-thing | act1 wax |
| `candle_mite` | candle-mite / candle-mites | KAN-dul-myt | act1 wax |
| `drowned_one` | drowned one / drowned ones | DROWND WUN | act3 drowned |
| `oarsman` | oarsman / oarsmen | ORZ-man | act3 drowned summon |
| `eel` | eel / eels | — | act3 beast |
| `pike` | pike / pike | — | act3 beast |
| `sluice_crab` | sluice-crab / sluice-crabs | SLOOSS-krab | act3 beast |
| `unlit` | unlit thing / unlit things | un-LIT | act4 unlit dark |
| `lampmoth` | lanternmoth / lanternmoths | LAN-tern-mawth | moth |
| `moth_swarm` | moth-swarm / moth-swarms | MAWTH-swawrm | act4 moth |
| `tar_crawler` | tar-crawler / tar-crawlers | TAR-kraw-ler | act4 |
| `oil_bloat` | oil-bloat / oil-bloats | OYL-bloht | act4 |
| `bell_cultist` | bell-cultist / bell-cultists | BEL-kul-tist | act5 bell |
| `clapper` | clapper / clappers | KLAP-er | act5 bell construct |
| `gear_hound` | gear-hound / gear-hounds | GEER-hownd | act5 construct |
| `cloudling` | cloudling / cloudlings | KLOWD-ling | act6 cloud |
| `storm_crow` | storm-crow / storm-crows | STORM-kroh | act6 cloud |
| `rootworm` | root-worm / root-worms | ROOT-werm | act6 cloud |
| `mother_tallow` | Mother Tallow (proper) | MUDH-er TAL-oh | boss act1 |
| `saint_gnaw` | Saint Gnaw (proper) | SAYNT NAW | boss act2 |
| `sluicemaw` | the Sluicemaw (proper) | SLOOSS-maw | boss act3 |
| `lampless_widow` | the Lampless Widow (proper) | LAMP-liss WID-oh | boss act4 |
| `bellfather` | the Bellfather (proper) | BEL-fah-dher | boss act5 |

(Ossery is a `person`, below.)

#### Flames (spells, 7) and shapes (8)

Type `spell`, tags `flame` / `shape` plus the element. Flames: `ember` (EM-ber), `rime` (RYM), `spark`,
`bile` (BYL), `gleam` (GLEEM), `tide` (TYD), `shade` (SHAYD); forms `sg: "Ember", pl: "Embers", adj: "amber"` — the
`adj` form holds the flame's **colour word** (`ember` amber, `rime` cyan, `spark` white, `bile` green, `gleam` gold,
`tide` blue, `shade` violet) so a line can say "that {flame.adj} light". Shapes: `bolt arc lob beam ring rune wave tether` with
`forms: { sg, pl }` and no respell.

#### Items (22)

| id | sg / pl | tags |
|---|---|---|
| `pole_lantern` | pole-lantern / pole-lanterns | tool player |
| `grapple_hook` | grapple hook / grapple hooks | tool |
| `wick` | wick / wicks | spell |
| `charm` | charm / charms | spell |
| `knot` | knot / knots | spell |
| `lamp_oil` | lamp-oil (mass) | oil |
| `wellblack` | wellblack (mass) | oil old |
| `penny` | penny / pennies | coin |
| `pearl` | pearl / pearls | coin act3 |
| `guild_mark` | Guild mark / Guild marks | coin |
| `scrap` | scrap (mass) | build |
| `plank` | plank / planks | build |
| `wax` | wax (mass) | act1 |
| `heartwick` | heartwick / heartwicks | lamp story |
| `sealed_lantern` | sealed lantern / sealed lanterns | gamble |
| `gravity_lantern` | gravity lantern / gravity lanterns | act5 |
| `silent_bell` | Silent Bell / Silent Bells | act1-4 secret |
| `rat_tail` | rat tail / rat tails | bounty |
| `mystery_bowl` | mystery bowl / mystery bowls | food |
| `crane_lantern` | the Crane lantern (proper) | quest |
| `escapement_plans` | escapement plans (plural-only) | quest act5 |
| `sky_flame` | the Sky Lamp's flame (proper) | story act6 |

#### Food (8, for Brisket)

`eel_stew` (mass), `rat_free_bread` ("rat-free bread", mass), `pike_pie`, `cloud_cress` (mass),
`bell_mushroom` / `bell_mushrooms`, `tallow_toffee` (mass), `black_broth` (mass), `oil_fried_fish` (mass).

#### People (30, all proper, with pronouns)

| id | sg | short | respell | pronouns | title | tags |
|---|---|---|---|---|---|---|
| `npc_aldra` | Aldra Crake | Aldra | AL-dra KRAYK | she | lampwarden | guild act1 |
| `npc_pask` | Tolliver Pask | Pask | TOL-iv-er PASK | he | scribe | guild |
| `npc_hask` | Garrow Hask | Hask | GAIR-oh HASK | he | captain | watch |
| `npc_odile` | Odile Pennywax | Odile | oh-DEEL PEN-ee-waks | she | chandler | shop |
| `npc_hollis` | Hollis Crane | Crane | HOL-iss KRAYN | he | pawnbroker | shop |
| `npc_seld` | Brother Seld | Seld | SELD | he | monk | act1 |
| `npc_dobb` | Dobb Ashcroft | Dobb | DOB ASH-kroft | he | sweep | sweeps |
| `npc_pim` | Pim Rooke | Pim | PIM ROOK | she | sweep | child |
| `npc_brisket` | Mother Brisket | Brisket | BRIS-kit | she | cook | shop |
| `npc_rennet` | Rennet Brisket | Rennet | REN-it | he | deckhand | — |
| `npc_clink` | Tobiah Clink | Clink | toh-BY-uh KLINK | he | scrapwright | shop |
| `npc_pickering` | Tam Pickering | Tam | TAM PIK-er-ing | he | lock-keeper | act2 |
| `npc_nell` | Nell Gutterby | Nell | NEL GUT-er-bee | she | ratcatcher | act2 |
| `npc_ebb` | Cantor Ebb | Ebb | EB | he | cantor | act2 |
| `npc_voss` | Hendry Voss | Voss | HEN-dree VOSS | he | sluicemaster | act3 |
| `npc_ada` | Ada Fennick | Ada | AY-da FEN-ik | she | — | child act3 |
| `npc_kell` | Ser Aubry Kell | Kell | SUR AW-bree KEL | he | knight | act3 |
| `npc_oarly` | Mag Oarly | Mag | MAG OR-lee | she | ferrywitch | act3 |
| `npc_unna` | Sister Unna | Unna | OO-na | she | cantor | pale |
| `npc_wenna` | Old Wenna | Wenna | WEN-a | she | ferrywoman | shop |
| `npc_jory` | Jory Wickett | Jory | JOR-ee WIK-it | he | oilrunner | act4 |
| `npc_mothwife` | the Mothwife | Mothwife | MAWTH-wyf | she | gambler | shop |
| `npc_lune` | Lune | Lune | LOON | she | — | act4 |
| `npc_marl` | Deacon Marl | Marl | DEE-kun MARL | he | deacon | tithe |
| `npc_osk` | Osk Tamberlane | Osk | OSK TAM-ber-layn | he | bellwright | act5 |
| `npc_dunmere` | Hallow Dunmere | Dunmere | HAL-oh DUN-meer | she | precentor | tithe |
| `npc_merrit` | Merrit Vane | Merrit | MAIR-it VAYN | she | cloudwarden | act6 |
| `npc_corvin` | Corvin Crake | Corvin | KOR-vin KRAYK | he | lampwarden | guild act6 |
| `ossery_vane` | Ossery Vane | Ossery | OSS-er-ee VAYN | he | cloudwarden | boss act6 |
| `elsbet_vane` | Elsbet Vane | Elsbet | ELZ-bet VAYN | she | — | history |

Plus **titles** (`lampwarden`, `lamplighter`, `apprentice`, `sweep`, `ratcatcher`, `sluicemaster`,
`cloudwarden`, `bellwright`, `precentor`, `ferrywitch`, `cantor`, `deacon`), **concepts** (`the_rain` "the
Rain", `the_binding` "the Binding", `the_dark` "the dark", `the_toll` "the Toll", `no_tier_left_dark`
"No tier left dark"), **weather** (`drizzle`, `downpour`, `surge`, `the_dry` "the Dry"), and **deities / oaths**
(`the_toll_deity` "the Toll" — the bell-cult's god; `the_mother` "the Mother" — the Tallow Chapel's; `the_ledger`
"the Ledger" — the Guild swears on it). Total pack ≈ **190 entries**.

**Pack test:** `node --test` check that every id in `data/npcs.json`, every `family` in the bestiary data and
every place id in §3's tables that appears in grammar bindings resolves to a pack entry (§13).

### 12.3 Intents used where

| Situation | Speaker | Intent(s) | Trigger and rate |
|---|---|---|---|
| Walk up to an NPC | NPC | `greet` (then `greet_reply` is not used — the player does not talk) | on interact; 1 per interact |
| Leave an NPC | NPC | `farewell` | on closing the dialog |
| NPC talk menu "Chat" | NPC | `smalltalk`, `gossip`, `lore`, `rain_talk`, `recall_*` | one line per press; `recall_*` chosen when their memory bank has a salient memory (§12.5) |
| NPC talk menu "Ask about <place/person>" | NPC | `lore`, `answer`, `observe_person` (with the named person bound as `third`) | per press |
| Hub idle (NPC within 160 cells, not in a dialog) | NPC | `idle_chatter`, `rain_talk`, `worried`, `happy` | every 12–25 s per NPC, max 1 bubble in a 200-cell radius |
| Two NPCs near each other in a hub | both | `lingo.converse(a, b, { turns: 4, relations, banks, scene })` | once per hub visit per pair listed in §12.5 |
| Shop open | keeper | `trade_offer` | on open |
| Shop haggle / sell | keeper | `trade_haggle`, `trade_accept`, `trade_refuse`; Crane adds `pawn_recall`; Odile `spell_taste`; Brisket `soup_menu` | per haggle step (08-ITEMS-SHOPS.md owns the price maths) |
| Enemy notices you | talking enemy | `enemy_opener` with enemy-kind tag (§12.4.2) | 35% chance per pack, 1 per pack |
| Enemy fighting | talking enemy | `combat_taunt`, `combat_bark`, `combat_hurt`, `combat_kill` | at most one bark per enemy every 6 s; max 2 enemy bubbles on screen |
| Rats, moths, Unlit | babble | voice = babble; gloss from `choir_chant` / `unlit_whisper` / `beast_snarl` | 1 per swarm every 8 s |
| Boss intro | boss | `boss_opener` (+ boss tag) | once at the arena door |
| Boss phase change | boss | `boss_phase` (+ boss tag) | once per phase |
| Boss below 25% | boss | `boss_low` (new) | once |
| Boss kills player | boss | `combat_kill` (+ boss tag) | on death |
| Boss that cannot speak | Narrator | `named_beast`, `beast_snarl` | intro + each phase |
| Ally (Kell set piece, Nell's hunt, Jory's barrels) | ally | `combat_bark`, `warning`, `rally`, `ally_down`, `relief` | same bark limits |
| Flood / sluice warnings | Voss | `flood_warning` (new) | on each boss flood cycle and in sluice rooms he can "hear" |
| First entry into a named location | Narrator | `ledger_arrival` (new) | once per location per save |
| Lamp relit | Narrator + every NPC in that hub on next visit | `ledger_relight` (new), `lamp_relit` (new) | once |
| Camp (rest at a Lamp band, lantern post, or barge) | 2–3 NPCs present | `converse` with a `recall` beat, `rain_talk`, `relief` | on rest |
| Player hurt below 40% when talking | NPC | `worried` | replaces `greet` 60% |
| Hush | Hush | `hush_chirr` (new) | on its triggers (§7) |

### 12.4 New intents and new tagged lines

All of these live in `lanternfall/data/grammar-lanternfall.json` (merged at boot). Every new intent is added to
`meta.intents` with an `intentDoc`; the ones marked **NR** go in `meta.noRepeat`. Each list below is the
minimum set; more lines are welcome. Lines are original text.

#### 12.4.1 `spell_taste` — Odile names your wick (NR)
Bindings: `flame` (spell entry), `shape` (spell entry), `charm` (spell entry, optional). Odile's quirk (canon)
— the *name* she gives the wick is generated separately by `08-ITEMS-SHOPS.md`'s namer; this pool is her comment.
1. "Mm. {flame.sg} in a {shape.sg}. Tastes like a struck match on a cold morning."
2. "Oh, that's {flame.adj}. Very {flame.adj}. Almost rude."
3. "A {shape.sg}? Bold. I'd have braided it tighter, but I'm not the one getting bitten."
4. "Smoky finish. Somebody's been overcharging."
5. "That one's got a kick like cheap brandy. I approve."
6. "{flame.sg} and {charm.or(nothing else)}. Simple. Simple's honest."
7. "Hold it under my nose. No — closer. Ah. Wet wool and lightning."
8. "Did you braid this in the rain? You can taste the rain."
9. "That's a sad little wick. Feed it more oil, darling, it's starving."
10. "Ooh. That one's going to burn somebody's eyebrows off. Possibly yours."
11. "It tastes like the Lamp did, when I was a girl."
12. "Too much {charm.or(charm)}. Like salt in tea. Still, you'll drink it."

#### 12.4.2 New enemy-kind tags on `enemy_opener`, `combat_taunt`, `combat_kill`
Three new talking enemy kinds: `wax` (wax-things murmur in a chapel voice), `bell` (bell-cultists), `drowned`
(hostile drowned ones). Speakers turn on their own tag and zero the others, exactly as Emberveil's
`enemyKind()` does. `enemy_opener` additions (10 each):

- **wax**: "Hush, little wick. Hush." · "Mother wants you warm." · "Melt with us." · "Every candle comes home." ·
  "Don't be cold, child. Be soft." · "The Mother is so hungry." · "Drip, drip, drip." · "You smell of smoke. Good." ·
  "Kneel by the wick." · "Soon you'll be tallow too."
- **bell**: "Kneel, and fall the right way!" · "The Toll hears you, heretic." · "Ring out!" · "Your light is a
  noise. We are the only noise." · "Down! Down is holy!" · "Tithe or toll, Lamplighter." · "The Bellfather counts
  your steps." · "Every bell asks. Answer!" · "Silence the lantern!" · "Fall with us, it's so much easier."
- **drowned**: "Come down where it's quiet." · "Breathe in. It stops hurting." · "You're so loud up there." ·
  "Stay. Stay. Stay." · "We had lamps once." · "The water's warm, if you wait long enough." · "Put the light
  out, it stings." · "One more for the deep." · "You'll float. Everyone floats." · "Sink, Lamplighter."

#### 12.4.3 `boss_opener` / `boss_phase` / `boss_low` per boss
Tags: `tallow`, `gnaw` (as subtitle gloss), `widow`, `bellfather`, `ossery`. The Sluicemaw uses the Narrator.
`boss_low` is **new** (NR): a line when a boss drops below 25% health.

| Boss | `boss_opener` (3+) | `boss_phase` (3+ each phase) | `boss_low` (3+) |
|---|---|---|---|
| tallow | "Little wick. Come in out of the rain." · "They fed me nine years of candles. I'm still so cold." · "Sit by the Mother. Sit." | "You're hurting me. I'll hold you tighter." · "I'm melting — I'm *melting into you*." · "Every drop of me will find you." | "So warm. Why is it so warm." · "Put me out gently. Please." · "I was a statue. I was only a statue." |
| gnaw (gloss) | `[The Choir: "Feed! Feed! Feed!"]` · `[Saint Gnaw raises a claw; the swarm falls silent.]` · `[The Choir hums a note you feel in your teeth.]` | `[The Choir changes key.]` · `[Saint Gnaw conducts faster.]` · `[The swarm sings your name, wrongly.]` | `[The Choir falters. One voice keeps singing.]` · `[Saint Gnaw screams a note no rat can hold.]` · `[The swarm scatters mid-song.]` |
| widow (stolen voices) | "Come home, apprentice." (in Aldra's voice) · "Put the lamp down. You're safe now." · "I loved the light more than anyone." | "Your lantern is delicious." · "Dark, dark, dark — isn't it restful?" · "I'll wear your light." | "Sister? Is that you?" · "Too bright. Too bright." · "Let it go out. Let it all go out." |
| bellfather | "KNEEL." | "FALL." · "RING." · (P3) "TOLL." | "…TOLL…" · "…RING…" · "…kneel…" (fx robot drops to 0 — the last word is a person's voice) |
| ossery | "Forty years, and they send a child with a candle." · "Do you know what a dry sky looked like? I don't. Not anymore." · "Turn back. It's only rain." | P2 "You've lit their Lamps. You think that makes it day?" · P3 "Elsbet hated the rain. I keep it for her. I keep it." · P4 (dry) "Listen. Do you hear that? Nothing." | "One more day. I only wanted one more day." · "I can't remember how to open my hand." · "Is it morning?" |

#### 12.4.4 `pawn_recall` — Hollis remembers what you sold (NR)
Bindings from the `sold_item` memory (§12.5): `item`, `price` (number), `days` (in-game days since).
1. "You sold me {item.a} for {price} pennies. I sold it for four times that. Just so you know."
2. "Ah, the {item.sg} person. I remember."
3. "Still miss that {item.sg}? I don't. Found a good home. Mine."
4. "Last time you were here you practically gave me {item.a}. Do it again, would you?"
5. "{days, plural, one{Yesterday} other{# days ago}}, {item.a}. You're a creature of habit."
6. "That {item.sg} you pawned? A drowned fellow tried to buy it. Tried."
7. "I've got your {item.sg} in the back. Want it? Twice the price. Sentiment's extra."
8. "You don't haggle like somebody who sold {item.a} for {price}."
9. "I keep a book. You're in it. Several pages."
10. "Selling again? Your {item.sg} was the last thing I bought that didn't leak."
11. "The {item.sg}. Yes. I remember your face when you let it go. Priceless. Well — {price} pennies."
12. "Every time you walk in I think, what's this one going to cost me? Then I remember: nothing, it's you."

#### 12.4.5 `soup_menu` — Brisket's menu of the day
Bindings: `dish` (food entry), `dish2` (food entry). Menu contents are 08-ITEMS-SHOPS.md's; this is her patter.
1. "Today it's {dish.sg} and {dish2.sg}. Or the mystery bowl, if you're feeling lucky."
2. "{dish.sg.cap}, fresh as it gets down here, which isn't very."
3. "I've got {dish.sg}. Don't make that face, it's good for you."
4. "Mystery bowl's bubbling. It bubbled back at me earlier. Your call."
5. "Sit. {dish.sg.cap}. Eat. Then argue."
6. "Rennet caught {dish.sg}. Rennet's very proud. Tell him it's lovely."
7. "You look thin. Two bowls. No, I'm not charging for the second. Yes I am."
8. "There's {dish.sg} for the brave and {dish2.sg} for the sensible."
9. "Don't ask what's in the mystery bowl. I don't ask it either."
10. "Hot soup, cold rain, that's the whole of wisdom."
11. "I'd do you a pie, but the oven's underwater again."
12. "Last one who skipped supper went down the Brickgut and came back a rat. Eat."

#### 12.4.6 `idle_chatter` — townsfolk and hub NPCs
Tagged by district (`act1`…`act6`) and by lit state (`lit`, `dark`); a hub NPC turns on its act tag and
its lamp state. Minimum 18 lines, 3 per act:
- act1 dark: "Lamp's flickering again." · "Candles cost a week's wage now." · "My gran says the Stair used to be warm."
- act1 lit: "Did you see it flare? Whole street cheered." · "Wax is setting nice and hard now." · "I slept a whole night."
- act2 dark: "Hear the singing? Don't listen." · "Rats took the Pottle boy's boots. With him in them." · "Keep to the chains."
- act2 lit: "Rats won't come in the light. Can you believe it." · "Market's open past dark. Past *dark*!" · "Smell that? Somebody's frying something."
- act3: "Top gate first. Everybody knows." · "The water's warm now. Warm." · "I saw the Pale singing under the gauge tower."
- act4: "Don't whistle in the dark." · "Oil's cheaper if you don't ask where from." · "Light your lamp and they come. Put it out and they wait."
- act5: "The bells stopped. Doesn't feel right." · "My feet keep wanting to go up." · "Tithe-folk aren't all bad. Just most."
- act6: "Is that — is that a star?" · "It's so quiet. I hate it. I love it." · "Forty years of rain in my boots."

#### 12.4.7 `rain_talk` — about the Rain (used everywhere; replaces core `weathertalk` for this game)
1. "Forty years. You'd think it'd get tired."
2. "My roof has more holes than roof."
3. "My mother says she remembers dry. I think she's making it up."
4. "It's not raining harder. You're just deeper."
5. "Rain's got a sound down here. Like somebody breathing."
6. "Don't drink it. Well. Don't drink it much."
7. "I've stopped owning dry socks. It's freeing, in a way."
8. "It rained on my wedding. It rained on my christening. It'll rain on my funeral, I expect."
9. "Some nights I swear it's crying."
10. "When it stops — if — what'll we even talk about?"
11. "Rain keeps the dust down. That's the one good thing. I've been looking for forty years."
12. "The Cloudwardens did this. Don't say that too loud."

#### 12.4.8 `lamp_relit` — NPC reaction on the first visit after a relight
Bindings: `lamp` (item-like entry id for the Lamp: add `crown_lamp`, `gutter_lamp`, `sluice_lamp`, `deep_lamp`,
`bell_lamp`, `sky_lamp` as `item` entries, proper).
1. "You did it. You actually lit {lamp.the}."
2. "I cried. Don't tell anybody. I cried."
3. "{lamp.sg.cap}! My kids had never seen it lit."
4. "The whole tier's warm. I'd forgotten warm."
5. "They'll write you in the Ledger for that."
6. "I thought it was a story. {lamp.sg.cap}, lit. Look at it."
7. "Took you long enough. Thank you. Took you long enough."
8. "I can see my hands. Isn't that silly? I can see my hands."
9. "How many more? Don't tell me. Just go light them."
10. "Some of the old folk went down to the rail just to stare at it."
11. "Every window on the Face lit up at once. Like the Face was smiling."
12. "I'll never complain about the lamp tax again. Probably."

#### 12.4.9 `flood_warning` — Voss over the pipes (NR)
Bindings: `gate` (a gate name string from the room, e.g. "the top gate"), `sec` (number).
1. "Water in {sec} seconds! Get high!"
2. "{gate.cap}! Now! Pull it now!"
3. "Top gate first! Always the top gate first!"
4. "It's filling — you've got {sec}, maybe less."
5. "Don't touch the red wheel! The *other* red wheel!"
6. "She's draining! Mind the undertow!"
7. "The Maw's coming up with the water — get off the floor!"
8. "Close {gate.sg}! Close it or you'll drown the lot of us!"
9. "Hear that groan? That's the gate. Move."
10. "Level's dropping. Now's your chance, go go go!"
11. "Twenty-eight years I've watched that gauge. It's never been that high."
12. "Stop swimming and start pulling!"

#### 12.4.10 `choir_chant` — gloss for rat swarms and choir-rats (babble voice) (NR)
1. `[The rats sing: "Feed."]` 2. `[A hundred small voices, one note.]` 3. `[The swarm hums, rising.]`
4. `[Squeaking, in harmony. It's worse in harmony.]` 5. `["Saint, saint, saint," the rats seem to say.]`
6. `[The singing stops. Everything stops.]` 7. `[One rat sings off-key. The others turn on it.]`
8. `[The chorus swells behind the wall.]` 9. `[Tiny claws keep time on the pipes.]`
10. `[The swarm sings the note the Lamp used to hum.]` 11. `[A high thin descant from the ceiling.]`
12. `[They're singing your footsteps back to you.]`

#### 12.4.11 `unlit_whisper` — gloss for the Unlit (babble, whisper fx) (NR)
1. `[Something in the dark: "…warm…"]` 2. `[A wet whisper: "give it."]` 3. `[The dark says your name.]`
4. `[Breathing, very close.]` 5. `[A voice like a drain: "light… light…"]` 6. `[Something laughs under the water.]`
7. `[Many whispers at once: "put it out."]` 8. `[A child's voice that isn't: "come play in the dark."]`
9. `[The whisper stops when your lantern flares.]` 10. `[It hums the Guild oath, backwards.]`
11. `[Something drips from the ceiling, and it's talking.]` 12. `["We were lamplighters too," says the dark.]`

#### 12.4.12 `bell_chant` — cultist barks mid-fight (NR)
1. "Ring!" 2. "The Toll!" 3. "Down with the lantern!" 4. "Fall, heretic!" 5. "Bell and bone!" 6. "Hear it? That's your end ringing!"
7. "Kneel!" 8. "For the Precentor!" 9. "Silence!" 10. "The Bellfather sees!" 11. "Toll, toll, toll!" 12. "Every step is a prayer!"

#### 12.4.13 `ledger_arrival` — Narrator, first entry into a named location (NR)
Bindings: `place` (place entry). The Narrator's 12 generic lines; named locations may also have a fixed line.
1. "{place.sg.cap}. The Ledger has no entry here for forty years."
2. "{place.sg.cap}. Water stands in every doorway."
3. "{place.sg.cap}. Somebody lived here. Somebody left in a hurry."
4. "{place.sg.cap}. The rain is louder here."
5. "{place.sg.cap}. A lamp-hook on every wall, and no lamps."
6. "{place.sg.cap}. The air smells of old oil."
7. "{place.sg.cap}. Nothing moves. Nothing that wants to be seen."
8. "{place.sg.cap}. The last Lamplighter's mark on the lintel is thirty years old."
9. "{place.sg.cap}. Even the dark here is damp."
10. "{place.sg.cap}, where the city went to be forgotten."
11. "{place.sg.cap}. Something has been eating the candles."
12. "{place.sg.cap}. The Ledger opens a new page."

#### 12.4.14 `ledger_relight` — Narrator, after the fixed relight line
1. "The tier breathes out." 2. "Somewhere above, somebody opens a window." 3. "The water catches the colour and holds it."
4. "The rain goes on. It looks different now." 5. "The Ledger's ink is warm." 6. "One more light in the Hollow."
7. "The dark steps back. Not far." 8. "Children who have never seen the colour are looking at it now."
9. "The old brass remembers its work." 10. "Forty years of dark, and it took one wick."

#### 12.4.15 `hush_chirr` — Hush's babble gloss (NR)
Tags by trigger: `bell` (Silent Bell near), `grapple` (grapple point marked), `oil` (oil < 20%), `dark`, `hurt`
(player < 30% hp), `happy` (relight), `scared` (Unlit near). 14+ lines, italics in the log:
`*bell! bell!*` · `*ting?*` · `*up! hook up!*` · `*there — swing!*` · `*hungry lamp…*` · `*oil low. low.*` ·
`*dark. dark. stay close.*` · `*something breathing*` · `*ow — you ow?*` · `*hurt. hide.*` · `*bright! bright!*` ·
`*warm!*` · `*no no no*` · `*it sees us*` · `*sleepy*` · `*home?*`

#### 12.4.16 Existing intents: extra lines tagged for this world
Add 6+ lines each, tagged `lanternfall` (the game gives that tag weight 2 so they come up more often):
`greet` (e.g. "Keep it lit."), `farewell` ("Mind the oil."), `warning` ("Lantern's low!"), `rally`
("No tier left dark!"), `relief` ("Dry ground. Well — drier."), `fear` ("Don't let the light go out."),
`thanks` ("You're a proper Lamplighter."), `trade_haggle` ("Pennies, not promises."), `trade_refuse`
("I don't take wet coin."), `pray` ("By the Ledger."), `observe` ("Lamp-hook. No lamp.").

### 12.5 Memories and relations

**Memory banks.** Every named NPC has a `MemoryBank` (`lingo/js/memory.js`); the player's deeds are events
in the banks of the NPCs who saw them or heard of them. Hearsay: an NPC in a hub "hears" events from the same
act with importance ×0.5 on their next hub visit.

| Game event | Memory event type (existing unless marked new) | Who records it | Importance |
|---|---|---|---|
| Relit a Great Lamp | `deed` with tag `lamp` | every NPC in every hub | 0.9 |
| Boss killed | `kill` (binding `foe` = boss) | NPCs of that act | 0.8 |
| Rescued someone (Pim, Ada, lost sweeps) | `kindness` | the rescued + their close pair | 0.85 |
| Sold an item to Crane | **`sold_item`** (new; bindings `item`, `price`) | Hollis only | 0.3 (+0.2 if rarity ≥ rare) |
| Let an NPC die (Nell) | `death` | all who knew her | 0.95 |
| Spared cultists / mercy finish | `deed` with tag `mercy` | Marl, Mothwife, Seld | 0.7 |
| Player died near an NPC's hub | `wounded` | that hub | 0.3 |
| Ate at the barge | `meal` | Brisket, Rennet | 0.2 |
| Gave a gift / returned Crane's lantern | `kindness` | the recipient | 0.8 |
| Levelled up | `levelup` | Aldra, Pask (letters) | 0.2 |

`sold_item` is added to `lanternfall/data/events-lanternfall.json` with `recall` intent `pawn_recall`, half-life
30 in-game days. Recall lines (`recall_kill`, `recall_kindness`, `recall_deed`, `recall_death`) are the core ones.

**Ossery remembers you.** Uniquely among bosses, Ossery has a memory bank seeded by the Ledger: at the fight,
each relit Lamp and each Kindling flag is a `deed` in his bank, and `boss_phase` lines for him have
`cond: "has memory deed tagged X"` variants, e.g. P2 with `corvin_freed`: "You took the Lamplighter out of my
root. He was good company."

**Relations.** One `RelationGraph` (`lingo/js/relations.js`). Directed edges tracked:

- every NPC → `player` (starting values per NPC in `data/npcs.json`; default warmth 0, respect 0.1, trust 0.2);
- these NPC pairs, both ways, for camp conversations and the story: Aldra↔Corvin, Aldra↔Pask, Brisket↔Rennet,
  Nell↔Ebb, Dobb↔Pim, Mothwife↔Widow (the boss as a speaker), Merrit↔Ossery, Voss↔Kell, Marl↔Dunmere,
  Odile↔Hollis (rivals: respect without warmth), Lune↔Mothwife, Ada↔Unna.

Game events → relation events (`relations.json → events`):

| Player does | Relation event | Applied |
|---|---|---|
| Completes an NPC's request | `kept_word` | NPC → player |
| Fails / abandons it | `broke_word` | NPC → player |
| Rescues them | `saved_life` | NPC → player |
| Buys a lot (≥ 200 pennies in one visit) | `generosity_seen` | keeper → player |
| Sells to a rival's shop right after | `rumor_bad` | the other keeper → player |
| Fights near them and wins | `shared_victory` / `bravery_seen` | allies → player |
| Kills a surrendered cultist | `cruelty_seen` | every NPC in that hub |
| Eats at the barge | `shared_meal` | Brisket → player |
| Is gone from a hub for a whole act | `long_absence` | hub NPCs → player |

**Where relations show.** (1) Tone tags pick lines (a `grateful` Pim says different things than a `stranger`
Pim). (2) Shop prices: Hollis's haggle mood = `rel.opinion()`, 08-ITEMS-SHOPS.md maps it to ±15%. (3) The rim
montage (§10.8) and ending epilogues pick NPCs with warmth ≥ 0.3. (4) Ending B's Merrit option needs warmth ≥ 0.6.

**Save.** `JSON.stringify(graph)` and every bank's JSON go in the save under `talk` (10-TECH-DATA.md). Size
cap: 200 memories per NPC (oldest low-salience dropped), which keeps the save under 150 KB.

### 12.6 Voices

| Who | Engine | How |
|---|---|---|
| Every human NPC, human bosses, the Narrator | `formant` (ours) | `voiceFor({ role, gender, seed })` + the overrides in §6; `synthesize(line.speech, voice)` → `play(buf, { pan, volume })` |
| Rats, choir-rats, Saint Gnaw | `babble` `simlish` | pitch 0.85–0.95, speed 0.8, varied per rat by seed; Gnaw's choir = 6 voices at pitch offsets 0, +0.06, +0.12, −0.06, −0.12, +0.18 played together |
| Moths, the Mothwife's moths, Hush | `babble` `letters` | pitch 0.95, depth 0.1 |
| The Unlit | `babble` `syllables` | pitch 0.25, depth 0.9, breath 0.7, breath 0.9, fx `{ lowpass: 1800, reverb: 0.6 }` |
| Beasts (pike, eels, gear-hounds) | none | sfx only (`sfx/` ids), Narrator lines for the named ones |

- **Babble lines are glossed.** The babble voice speaks the gloss text (so its rhythm follows the words) but
  the subtitle shows the gloss in brackets/italics, never pretending it is English speech.
- **Positional audio.** `pan = clamp((speakerX − cameraX) / 240, −1, 1)`; `volume = 1 − min(1, dist / 360)`
  with a floor of 0.25 for the NPC you are talking to. Speech goes on the sfx loudness module's `ui` bus
  (`sfx/js/loudness.js`) so it is levelled with sound effects.
- **Underwater.** When the camera is underwater, every voice gets `fx.lowpass: 1500` added (Kell and Unna
  always have it).
- **Concurrency.** Max 3 voices at once; a new line with higher priority (story > boss > NPC > bark > idle)
  cuts the lowest. Barks are 1–6 words, so this rarely bites.
- **Pre-render.** Cutscene lines are synthesized during the fade-in (they are fixed text), and a room's boss
  opener is synthesized when the player enters the antechamber. Barks are synthesized live (formant ≈ 10–80
  ms a line, voice-lab README) — if a bark would take > 30 ms on the main thread, it plays without voice
  (text only). Cache by `(text, voice)` as `synthesize()` already does; clear the cache on act change.
- **Mouth flap.** Portrait and sprite mouths open when the playing buffer's RMS over a 30 ms window is > 0.05
  (2 frames: closed/open).
- **Settings** (02-CONTROLS-UI.md): voice volume, voices on/off (text only), babble-only mode (every speaker
  babbles — the cheapest mode and a charming one), subtitle size.

### 12.7 Subtitles and speech bubbles

- **Bubble**: our 5×7 pixel font (00-OVERVIEW.md §3), max 28 characters a row, max 3 rows, drawn above the
  speaker's head 4 cells up, clamped inside the 480×270 view with a 6-cell margin; a tail points to the
  speaker, or to the screen edge if they are off-screen. Background `#0b0e14` at 85%, border in the
  speaker's **light colour** (NPCs have one: Aldra amber, Voss teal, …; enemies red `#ff5a4a`, the Narrator
  none — Narrator lines are italic at the bottom).
- **On time**: `max(1.6 s, 0.06 s × characters + 0.8 s)`, or the voice's length + 0.4 s, whichever is longer.
- **Subtitle line** (bottom, Spectral font, 02-CONTROLS-UI.md) mirrors story, boss and Narrator lines only;
  barks and idle chatter stay in bubbles.
- **The log** (the Ledger's "Words" tab, 02-CONTROLS-UI.md) keeps the last 200 lines with speaker, act and
  time; Narrator italic, babble glosses in brackets.

### 12.8 Anti-repeat

1. **Session window.** Every new intent marked NR above is added to `meta.noRepeat`, so the session window
   (last 20 ids used by anyone, per symbol) bans repeats. `lingo.resetSession()` is called at the start of
   each run (campaign load, Waves, Endless, Daily).
2. **Per-room exclude.** `talk.js` keeps a `Set` of phrase ids used in the current room and passes it as
   `ctx.exclude`, so two wax-things in one room never open with the same line.
3. **Per-speaker soft history** (built into Lingo) keeps a single NPC from repeating themselves in a chat.
4. **Rate limits** (not Lingo, game side): one bark per enemy per 6 s; 2 enemy bubbles on screen max; idle
   chatter once per 12–25 s per NPC and one bubble per 200 cells; the same NPC's `greet` is skipped (they just
   nod: a 1-word `greetword`) if you talked to them in the last 60 s.
5. **Pool size rule.** Any intent heard more than once a minute must have ≥ 12 lines (the combat pools already
   do; every NR pool above has 10–16).
6. **Test.** Extend `lingo/tests/combat-variety.test.js`'s method into `lanternfall/tests/talk.test.js`: for
   every new intent and every new enemy kind tag, 100 seeded draws give ≥ 10 distinct lines with no repeat in
   the first 10; every line expands with no stray `{` for every NPC speaker (the Emberveil bindings audit
   pattern, `prototypes/emberveil/tests/bindings.test.js`).

---

## 13. Data files this page implies

(Schemas in 10-TECH-DATA.md; this is the list and what each holds.)

| File | Holds |
|---|---|
| `lingo/data/packs/lanternfall.json` | ~190 lexicon entries (§12.2) |
| `lanternfall/data/grammar-lanternfall.json` | new intents + tagged lines (§12.4), `meta` additions |
| `lanternfall/data/events-lanternfall.json` | the `sold_item` memory type |
| `lanternfall/data/npcs.json` | 28 NPCs + Hush + Narrator: `{ id, lexiconId, where: {act, location}, moves: [{afterFlag|afterAct, location}], speech: {…}, voice: { role, gender, seed, overrides, fx }, relations: { player: {warmth, respect, trust} }, portrait, lightColour, wants, quest }` |
| `lanternfall/data/story.json` | acts (title lines, beats), cutscenes (§10 steps), flags, endings (§11 conditions as data: `{ "id": "end_a", "requires": { "all": ["knows_keeper_rule"], "kindling": 5, "choice": "let_go" } }`) |
| `lanternfall/data/districts.json` | §3: ramps (lit/unlit), weather numbers, hazards list, sub-areas, locations |
| `lanternfall/data/lore.json` | 60 lore plaques (fixed text, act, location) |
| `lanternfall/data/silent-bells.json` | §4 table |

Test: `lanternfall/tests/story-data.test.js` — every location id in `npcs.json` / `story.json` exists in
`districts.json`; every flag used by an ending is set somewhere; every speaker id in a cutscene is an NPC;
kindling flags number exactly 11; every NPC trait/tic is a real Lingo trait/tic; every voice role exists in
`ROLE_VOICES`.

---

## 14. Build order and cheap fallbacks

| Step | What | Cheap fallback if it runs long |
|---|---|---|
| 1 | Pack + grammar extension load; `talk.js` with `speak()` and bubbles, no voice | — |
| 2 | Voices for NPCs (formant), babble for rats | text-only (settings already allow it) |
| 3 | Narrator + `ledger_arrival` | fixed lines only |
| 4 | Memories + relations for hub NPCs | only `opinion` from a single number per NPC |
| 5 | Cutscene player (JSON steps) | text cards over a still frame |
| 6 | Widow's stolen voices | she uses one fixed voice (Aldra's) |
| 7 | Rim montage | 5 fixed NPCs |
| 8 | Ending D | ship A/B/C first; D is a variant of A's cutscene |

Expensive items flagged: the Choir's six simultaneous babble voices (pre-render them once per fight into one
buffer); the Falling Flood (06/09 own its fallback: a scripted pour of water sprites instead of simulated
cells).

---

## 15. Proposed canon changes

None required. Additions this page makes that other pages should adopt:

1. The **Sky Lamp** hung on the Hollow floor pointing up; the Cloudroot grew from its empty socket (fits
   canon "climbed up" Act 6).
2. **Kindling** flags and four endings (A–D) keyed on them (§11).
3. Monster data carries a `family` field matching a pack creature id (§12.2) — 05-BESTIARY-BOSSES.md.
4. Each relit Lamp adds a safe coloured band to the Act 6 climb — 09-MODES-MAP.md.
5. The Ledger is both the Narrator and the damage meter tab's name — 02-CONTROLS-UI.md.
