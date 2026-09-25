# Farhold — the map screen, redesigned

Design document. Written 2026-09-20 against `js/map.js` at 1429 lines. **Nothing in this document is
implemented.** It is the plan for round 14 item 10 (map redesign), item 9 (locate-on-map + saved
locations) and item 13 (the scanner, clay, mining outposts) on
`~/claude/agent/farhold-round14-checklist.md`.

Line numbers are as of this reading. `js/markers.js` is being edited by another agent this round
(the R14 `fall` meteor marker), so its numbers may have moved by a few lines; the field names quoted
here are the current ones.

---

## 0. The four asks, verbatim

1. *"On the journal screen > work in hand, and for Work Going On Here, and anything else on this
   screen with a primary location, add a target icon to 'locate on map' which opens the map, centered
   on that location. Add the ability to store locations and view them in a list, with a checkbox to
   toggle whether the location is highlighted on the map with a star."*
2. *"Speaking of the terrain map, launch a redesign agent to plan out a new layout for the new
   features and to better present the current features. The legend also does not seem to line up with
   the actual icons used on the map very well, and some new icons like for waypoints are missing from
   the legend. The town portal icons could also be improved as the current one is too dark. The
   primary action for the map is to view active quests (with 'locate' button), view saved map markers,
   and find other objects on the map. It would also be great if the map had hover tooltips to show
   what icons mean and some other meta info about the region and what the icon is for."*
3. *"I previously asked for a scan tool to locate resources. Where is that? Where do you find clay?
   We need a way for the player to locate materials, through combination of scanning in the world or
   filters on the map. … Eventually I'd like to have several mining outposts with purpose-built roads
   connecting to the base to increase delivery speeds/throughput. The scanner tool should let you
   select a material and scan for it, displaying it with a marker in the world for some time and
   displaying it on the world map as well. In the future we may add scan speed, delay, radius, but for
   now just do a large proximity."*
4. "Nearby Activities" — a quest-log panel under the minimap — is another agent's job. The map has to
   be the place the saved/found locations actually live, so the two must share one book. §7 below.

### The one-line diagnosis

The map is not missing features. It has a key that claims it cannot drift from the map
(`js/map.js:44-47`) and **five separate drawing paths that never go through it**: the waypoint pads,
the markers, the meteors, the enemies and the player. Everything the user calls a mismatch is one of
those five. Separately, three finished pieces of work have no way in at all — the portal's
`mapMarkers()` (`js/portal.js:211`) is imported by nobody, the scanner lives inside build mode where
nobody looking for a map found it, and the scan radius the build tool asks for is smaller than the
one the ore world can answer.

---

## 1. Audit — every icon the map draws, against every row the key prints

### 1.1 What `buildKey()` prints (`js/map.js:411-435`)

Sixteen rows, one per `MARK_ORDER` entry (`js/map.js:79-84`), each a 22 px canvas with the real
`drawMark()` in it, grouped under four headings, plus one sentence of explanation.

| # | key row | group | shape | fill | drawn on the map by | verdict |
|---|---|---|---|---|---|---|
| 1 | world boss | Beware | `burst` | `#ff3a3a` | `drawPlaces` via `markFor` → `family==='worldboss'` (`js/map.js:95`), from `sites.js:566-581` | **OK** |
| 2 | capital | Settlements | `star` | `#ffe08a` | world node `kind:'capital'` (`nodes.js:19`) | **OK, but see 1.3(f)** — a world can have 0 capitals |
| 3 | city | Settlements | `square` r4.4 | `#f6f0e2` | world node `kind:'city'` | OK |
| 4 | town | Settlements | `square` r3.4 | `#e8ddc4` | world node `kind:'town'` | OK |
| 5 | village | Settlements | `square` r2.6 | `#c9bfa4` | world node `kind:'village'` | OK |
| 6 | hamlet | Settlements | `square` r1.9 | `#a79e8a` | world node `kind:'hamlet'` | OK |
| 7 | port | Settlements | `anchor` | `#8fd3ff` | world node `type:'port'` (`nodes.js:187`) | OK |
| 8 | dungeon | Underground | `gate` | `#c090ff` | world node `type:'dungeon'`, `kind:'dungeon'` (`nodes.js:250-256`) | OK |
| 9 | cave | Underground | `mouth` | `#c2a98a` | **only** via the fall-through `node.kind === 'cave'` (`js/map.js:108`), which catches the landmark node `kind:'cave'` (`nodes.js:30`) | works by accident — see 1.3(a) |
| 10 | beast lair | Underground | `fang` | `#ff6a3a` | world node `type:'dungeon'`, `kind:'lair'`; **and** stronghold glyph `lair` (`js/map.js:101`) | OK |
| 11 | already cleared | Underground | `gate` | `#5c6a7a` | `gates.nodes` with `cleared` (`js/map.js:1096`), or `site.cleared` (`js/map.js:1119`) | OK |
| 12 | camp or stockade | Held ground | `tent` | `#ffa860` | stronghold glyphs `camp`, **and everything unmatched** (`js/map.js:102`) | see 1.3(b) |
| 13 | fort or tower | Held ground | `keep` r4.2 | `#ff6a3a` | stronghold glyphs `fort`, `tower`, `siege` | OK |
| 14 | castle | Held ground | `keep` r5.0 | `#ff4a4a` | stronghold glyph `castle` | OK |
| 15 | landmark | Held ground | `pip` | `#8fd0ff` | farhold sites `family:'landmark'` only (`sites.js:632-645`) | see 1.3(a) and 1.3(c) |
| 16 | mountain pass | Held ground | `cross` | `#d8d2c4` | world node `type:'pass'` (`nodes.js:285`) | OK |

### 1.2 What the map draws that the key never mentions

| thing on the canvas | drawn at | in the key? |
|---|---|---|
| **Waypoint pads** — dark disc, cyan or grey ring, three sigil spokes, a dashed gold ring when picked | `drawWaypoints`, `js/map.js:1133-1175`, called `js/map.js:666` | **NO.** The user's "some new icons like for waypoints are missing from the legend." |
| **Markers** (quest / story / pin / deposit / home / impact) — a plain filled circle with a dark outline, plus a dashed ring when tracked, plus the name in `#ffe6a8` | `js/map.js:797-821` | **NO.** And see 1.3(d): the circle throws away the glyph the marker carries. |
| **Meteors still falling** — dashed orange circle, `☄`, and a seconds countdown | `js/map.js:781-793` | **NO** |
| **Enemies** — 4 px solid `#ff5a3c` squares | `js/map.js:823-830` | **NO** |
| **You** — a white arrow, and dashed crosshairs at zoom ≤ 1.2 | `js/map.js:832-862` | **NO** |
| **The level band wash** and the `14–17 / Hostile` text | `js/map.js:692-775` | the *colours* are in the strip under the canvas (`js/map.js:866-873`); the *text* is not explained |
| **Grey `unknown`** where a region name is held back | `js/map.js:672-689` | explained in a side-panel sentence (`js/map.js:466-470`), not in the key |
| **Roads, rivers, coastlines, region borders, place labels** — all World Forge's | `renderWorld`, `js/map.js:658-663` | **NO** |
| **The town portal** | **not drawn at all** — `portals.mapMarkers()` (`js/portal.js:211-219`) is called by nothing (`grep mapMarkers js/` returns one hit, its own definition) | n/a |

### 1.3 The named mismatches

**(a) Ten of World Forge's eleven landmark kinds are invisible.**
`nodes.js:227` files them as `{ type: 'landmark', kind: 'ruin' | 'shrine' | 'cave' | 'tower' |
'monolith' | 'volcano' | 'waterfall' | 'ancientwood' | 'battlefield' | 'crater' | 'vent' }`.
`markFor()` tests `node.family === 'landmark'` (`js/map.js:96`) — **`family`, not `type`** — and World
Forge nodes have no `family` at all. So every one of those falls through to `return null`
(`js/map.js:109`) and is never drawn. `cave` survives only because of the unrelated line
`if (node.kind === 'cave') return 'cave'` at `js/map.js:108`. A volcano, a waterfall, an ancient wood
and a battlefield are on the planet, are named, are in `world.nodes`, and are not on the map.
*Fix:* add `if (node.type === 'landmark') return CAVE_LIKE.has(node.kind) ? 'cave' : 'landmark';`
before the `kind === 'cave'` line, and give the distinct kinds their own marks (§6.4).

**(b) Two stronghold kinds collapse into "camp".**
`data/strongholds.json` carries eight kinds with icons `camp, stockade, tower, fort, castle, cult,
lair, siege`. `markFor` (`js/map.js:97-103`) maps `castle`, `fort|tower|siege`, `lair`, and everything
else to `camp`. So a **Raider Stockade** and a **Cult Circle** wear the bandit-camp tent. The key says
"camp or stockade", which half-admits it and says nothing about the cult.

**(c) Fourteen farhold landmark kinds are one blue pip.**
`data/landmarks.json` carries `shrine, stones, tower, gibbet, farm, mine, ferry, bridge, blind,
cairns, beacon, wreck, forge, washout` and each puts its icon name into `site.pin.glyph`
(`sites.js:642`). The **minimap reads that glyph** (`main.js:6061-6067`) and the **world map does
not** — `markFor` returns the flat `'landmark'` for every one (`js/map.js:96`). So the small map is
more informative than the big one, which is backwards.

**(d) The marker glyph table exists and the world map ignores it.**
`MARKER_LOOKS` (`js/markers.js:31-53`) gives every marker kind an icon and a colour: `quest '!'
#ffd24a`, `campaign '◆' #ff9f4a`, `pin '◈' #7fd4ff`, `seam '◆' #c08a3e`, `home '⌂' #9ae06a`,
`fall '☄' #ff8a40`. `hud.js`'s minimap draws the glyph (hud.js:1029-1075). `js/map.js:809-813` draws
`ctx.arc(...)` in `look.color` and **throws `look.icon` away**. Result: six marker kinds are six
coloured dots, three of which (`#ffd24a`, `#ff9f4a`, `#c08a3e`, `#ff8a40`) are near-identical
yellow-oranges at 8 px. The side panel *does* print the glyph (`js/map.js:493`), so the list and the
map disagree with each other on the same screen.

**(e) The waypoint pad is a dark hole.** `js/map.js:1146-1147`: a lit pad fills
`rgba(20, 44, 58, .95)` — near-black with a blue cast — inside a 2 px `#6ad0ff` ring. On grassland
(`#6f9f52`) or beach (`#d3c592`) the fill is the darkest thing on the screen and reads as a crater,
not a portal. The user: *"The town portal icons could also be improved as the current one is too
dark."* §6.2 has the replacement.

**(f) The size-thinning code is dead, and it is dead because `scale` is in buffer pixels.**
`drawPlaces` drops small places at `scale < 3` / `< 1.6` / `< 2.2` (`js/map.js:1105-1106`,
`js/map.js:1119`). `scale = fit * zoom`, and `fit = min(canvas.width / world.width, …)` where
`canvas.width` is the **backing buffer** (`js/map.js:614-624`, dpr up to 2) and `world.width` is 256
(`data/balance.json` world block). On a 1600 CSS-px-wide canvas at dpr 2 that is `3200 / 256 = 12.5`
at zoom 1 — four times the highest threshold. So **every hamlet, cave, pass, port and stronghold on
the planet is drawn at the whole-world zoom**, which is several hundred marks, and the thresholds also
move with the display's pixel ratio. The fix is to thin on `state.zoom` (a number the code controls)
rather than on `scale`.

**(g) The strip under the canvas is empty unless the level overlay is on.**
`js/map.js:865-880`: `rows` is only filled `if (state.levels && zones)`. Turn the level bands off, or
switch to Elevation, and `legendBox` is blank — the colour ramp for the layer you are looking at is
in a collapsed `<details>` in the side panel (`js/map.js:886-892`).

**(h) …and that fold is titled wrongly for every layer but one.**
`js/map.js:888` always writes `What ${planet.name} is made of`, while the rows come from
`legendRows(world, state.layer)`. On the Temperature layer the heading says what the planet is made
of and then lists temperature bands.

**(i) Nothing at all explains the danger *numbers*.** The strip gives five colour swatches with
"far below you / easy / a fair fight / dangerous / do not go here yet" (`js/map.js:30-33`), but the
map writes `14–17` and `Hostile` in those colours (`js/map.js:759-771`) and no row says that the top
line is a level range and the bottom one is the region's own character out of `DANGER_WORDS`
(`js/zones.js:23`).

**(j) `state.layers.nodes` silently hides the whole key.** The layers panel's `nodes` chip gates
`drawPlaces` (`js/map.js:1095`) — every one of the sixteen key rows vanishes — but the key stays fully
drawn and gives no hint that it has been switched off. Waypoints and markers, which are *not* gated,
stay. So "nodes off" looks like a rendering fault.

**(k) The key is built once and never rebuilt.** `buildKey()` returns early on
`keyBox.dataset.built` (`js/map.js:412-413`). Anything whose presence depends on run state (a
waypoint row that should only appear once you have lit one; a scan-filter row) cannot use it as it
stands.

### 1.4 Summary count

Sixteen key rows. **Six** things on the canvas have no row at all (waypoints, markers, meteors,
enemies, you, roads/rivers). **Three** rows are drawn for more kinds than they name (camp, landmark,
cave). **Twenty-four** distinct world-authored place kinds (10 World Forge landmarks + 14 farhold
landmarks) are drawn as one pip or not drawn at all. One finished module (the portal) draws nothing.

---

## 2. The new screen

### 2.1 Layout

```
┌─ #map-screen ────────────────────────────────────────────────────────────────────────────┐
│ Hes-Subud IV          seed 8812 · 163 km across · zoom 2.6×    [Copy location]        [×] │  .map-head
├──────────────────────────────────────────────────────┬───────────────────────────────────┤
│                                                      │ ┌ Quests │ Markers │ Find ┐       │  .map-rail-tabs
│                                                      │ ├───────────────────────────────┤ │
│                                                      │ │ ◎ ★  ! Clear the Sunken Vault │ │  .rail-row
│                                                      │ │      the ruin · 3.4 km NE     │ │
│                  the canvas                          │ │      [Locate]                 │ │
│              (.map-canvas, unchanged                 │ │ ◎ ★  ! Carry word to Haile…   │ │
│               projection and zoom ladder)            │ │      Haileadhearth · 11.2 km  │ │
│                                                      │ │      [Locate]                 │ │
│                                                      │ ├─ Story ──────────────────────┤ │
│                                                      │ │ ◎ ★  ◆ Reach the beacon       │ │
│                                                      │ └───────────────────────────────┘ │
│                                                      │                                   │
│                                                      │ ┌ Layers ──────────────────[▾]─┐ │  <details>, shut
│                                                      │ │ biomes elevation … levels     │ │
│                                                      │ │ labels nodes rivers roads     │ │
│                                                      │ └───────────────────────────────┘ │
│                                                      │ ┌ Resources ───────────────[▾]─┐ │  <details>, shut
│                                                      │ │ [Iron Ore ▾]  [Scan] 800 m    │ │
│                                                      │ │ ☑ show deposits on the map    │ │
│                                                      │ └───────────────────────────────┘ │
│                                                      │ ┌ What the marks mean ─────[▾]─┐ │  <details>, shut
│  ▸ 118,44 · Grassland · 210 m · 14°C · The Reach ·   │ │ (the key, §6)                 │ │
│    level 14–17 (Hostile) · usually clear             │ └───────────────────────────────┘ │  .map-readout
├──────────────────────────────────────────────────────┴───────────────────────────────────┤
│ ■ far below you  ■ easy  ■ a fair fight  ■ dangerous  ■ do not go here yet │ ⌂ base ◉ pad │  .map-footkey
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

Changes from today: the side rail leads with **three tabs** instead of with the layers panel; Layers,
Resources and the key are collapsed folds underneath; the strip under the canvas always carries
something. `.map-side` stays 300 px (`style.css:439-443`); the canvas keeps its own box
(`js/map.js:614-624` is correct and must not be touched).

**Selection panels are not a fourth tab.** Clicking a cell, a pad or a base opens a panel *below the
rail's tab body*, exactly where it is today (`js/map.js:564-600`), so the tab you were reading stays
where it was.

### 2.2 Tab: Quests

Source: `questLog.active` handed in as a new `quests` option (§8.2). Every row is a job with a
`place` (`js/quests.js:80, 101`; `js/jobgen.js:200-238`). Jobs without one (`hunt`, `gather` —
`js/questhelp.js:25-30` is explicit that these have no place) are listed under a **"No fixed place"**
sub-heading with no Locate button and the helper line instead, because sending a player to a random
field is worse than saying so.

Row: `[◎] [★] <glyph> <title>` / second line `<place name> · <distance> <compass>` / `[Locate]`.

* `◎` — **track**: what the minimap follows and puts a rim arrow on. This is today's
  `book.toggle(m)` (`js/map.js:489`) with a new glyph, because the star now means something else.
* `★` — **highlight on the map** (§4). Filled gold when on.
* glyph — `MARKER_LOOKS[kind].icon`, the same one the canvas will now draw (§6.3).
* distance — `book.bearing(m, player, terrain).distance` through `distanceText` (`js/map.js:484`,
  `js/markers.js:244-247`), plus an 8-point compass word using the same `COMPASS` table the scanner
  has (`js/main.js:1739-1744`) — that table moves into `js/markers.js` so there is one of it.
* `[Locate]` — `map.locate(...)` (§3). Does **not** close the map; it moves the view.

A quest whose marker is `done` draws its glyph in `#9ae06a` and the row reads `ready to hand in`.

### 2.3 Tab: Markers

Four sections, in this order:

1. **Starred** — everything with `starred: true`, whatever its kind. The list the user asked for.
2. **Saved places** (`kind: 'saved'`, §4) — things the player chose to keep.
3. **Pins and deposits** (`kind: 'pin' | 'seam' | 'fall'`) — what today's Tracking panel holds.
4. **Your bases** — `bases.list()`, unchanged from `js/map.js:532-555`, moved under this tab.
5. **Other worlds** — `book.elsewhere()`, unchanged from `js/map.js:509-522`, at the bottom.

Row: `[◎] [★] <glyph> <name>` / `<distance>` / `[Locate]` / `[×]`.
`[×]` only on `pin`, `seam`, `saved` and `fall` — a quest marker is not the player's to delete
(today's rule, `js/map.js:497-503`). A base row keeps its `Travel` / `Fold home` button.

Header line of the tab: `Shift-click the map to drop a pin. ⌖ on any row saves it here.`

### 2.4 Tab: Find

A search box and a filtered list. This is the "find other objects on the map" half of the ask, and it
is also where a player answers *where do I find clay* (§5.3).

```
┌ Find ────────────────────────────────────────┐
│ [ clay                                    ⌫ ] │
│ [all] [places] [waypoints] [resources] [me]  │   chips, multi-select
├──────────────────────────────────────────────┤
│ MATERIALS                                    │
│  ◆ Clay                                      │
│    Cut from a Clay Bank. Found in marsh,     │
│    grassland, forest, beach and savanna.     │
│    Nearest known: 640 m SW  [Locate]         │
│    [Scan for it]      [Show on the map]      │
├──────────────────────────────────────────────┤
│ PLACES                                       │
│  ⌂ Claybank Ford — village · The Reach       │
│    4.1 km NE   [Locate] [⌖ save]             │
└──────────────────────────────────────────────┘
```

What it searches, in this order, with the source in brackets:

| section | source | rule |
|---|---|---|
| Markers | `book.here()` | always |
| Materials | `data/resources.json` `materials` + the index in §5.3 | matches name or id |
| Places | `world.nodes` via `markFor` | **only where `knows(node.region)`** — B8 (`js/map.js:284`) must hold, or Find becomes the gazetteer the rumour system was rewritten to protect |
| Strongholds, landmarks, world bosses | `sites.sites` | same B8 rule on `site.zone?.id` |
| Waypoints | `waypoints.list()` | lit pads by name; unlit ones listed as `not yet lit` |
| Your bases | `bases.list()` | always — they are yours |
| Regions | `zones.list()` | `knows(zone.id)` only |

Row buttons: `[Locate]` always; `[⌖ save]` on anything that is not already a marker; `[Travel]` on a
lit pad; `[Scan for it]` and `[Show on the map]` on a material row (§5).

Empty state: `Nothing by that name yet. You only find places you have walked into or heard about.`

---

## 3. Locate-on-map

### 3.1 The function

Added to the object `createMapScreen` returns (`js/map.js:1394-1428`):

```js
/**
 * Open the map over a world position and say "this is the one you asked for".
 *
 * @param {object} place                 where to go. Either world metres or map cells.
 * @param {number} [place.x]             world metres east
 * @param {number} [place.z]             world metres south
 * @param {{x:number,y:number}} [place.cell]  map cells; used when x/z are absent
 * @param {string} [place.name]          what to write beside the ring
 * @param {string} [place.kind]          'quest'|'saved'|'seam'|'place'|'pad'|'base' — picks the ring colour
 * @param {string} [place.markerId]      if this IS a marker, its id, so the row highlights too
 * @param {object} [opts]
 * @param {number} [opts.zoom=4.2]       a ZOOMS step; clamped to the ladder
 * @param {boolean} [opts.open=true]     open the map if it is shut
 * @param {number} [opts.hold=6000]      how long the ring pulses, ms
 * @param {boolean} [opts.select=true]   also fill the cell panel under the rail
 * @returns {{ok:boolean, why?:string, cell:{x:number,y:number}, zoom:number}}
 */
locate(place, opts = {})
```

Behaviour, in order:

1. Resolve the cell: `place.cell` if given, else `{ x: place.x / M_PER_CELL, y: place.z / M_PER_CELL }`.
   Refuse with `{ ok: false, why: 'That is not on this world.' }` when the cell is off the grid or
   when `place.world` is given and `worldKey(place.world) !== book.key` — a journal row for a job on
   another planet must not silently centre on the wrong ground.
2. `if (opts.open !== false && !state.open) toggle(true)`.
3. `state.zoom = nearestZoom(opts.zoom ?? 4.2)`; `state.centre = { ...cell }`; `state.dragged = true`
   (so `recentre()` still means "back to me").
4. `state.focus = { x, y, name, kind, until: now + hold }`.
5. `if (opts.select !== false) state.selected = { ...cellInfo(world, x, y), x, y }`.
6. `buildSide(); draw(); startFocusPulse();`
7. Returns `{ ok: true, cell, zoom: state.zoom }`.

### 3.2 How the map says "this is it"

`drawFocus(ctx, scale, ox, oy)`, called from `draw()` immediately **after** `drawPlaces` and
**before** the markers loop (so a marker still sits on top of its own ring):

* Three concentric dashed rings at radius `r`, `r * 1.7`, `r * 2.6` where
  `r = Math.max(10, scale * 1.4)`, each stroked 2 px in the focus colour at alpha
  `0.9 / 0.55 / 0.3`.
* The whole group breathes: `const t = ((now - start) % 1400) / 1400; const grow = 1 + t * 0.35;
  const fade = 1 - t;` — rings expand and fade over 1.4 s and restart, for `hold` ms.
* A short leader line and the name in the focus colour with a 3 px black stroke, placed with the same
  `strokeText`/`fillText` pair the marker names use (`js/map.js:815-819`).
* Colours by `kind`: quest `#ffd24a`, saved `#8fe0a0`, seam `#c08a3e`, pad `#6ad0ff`, base `#9ae06a`,
  place `#ffffff`.

### 3.3 Keeping it moving

`map.tick()` runs every 12 frames (`js/main.js:6111`) — about 5 Hz, which makes a pulse look like a
stutter. `locate()` starts a `requestAnimationFrame` loop (`focusRaf`) that calls `draw()` while
`state.focus.until > performance.now()`, then clears `state.focus`, draws once more and stops. Same
shape as the existing `airTimer` (`js/map.js:1355-1366`), and `dispose()` must cancel it the same way
`airTimer` is cancelled at `js/map.js:1386-1387`.

### 3.4 The callers

One handle on the game object, so the journal, the notice board and the Nearby Activities panel all
use the same door:

```js
// js/main.js, in window.farhold
locate: (place, opts) => map.locate(place, opts),
```

and one hook on the HUD, because `hud.js` must not import `map.js`:

```js
// js/main.js, beside the other hud.* assignments
hud.onLocate = (place, opts) => map.locate(place, opts);
```

`hud.js` then adds the button to a row with three lines and no knowledge of the map:

```js
function locateBtn(place) {
  if (!place || place.x == null) return null;
  const b = el('button', 'row-locate');
  b.textContent = '⌖';
  b.dataset.tip = `Show ${place.name || 'this'} on the map.`;
  b.onclick = ev => { ev.stopPropagation(); this.onLocate?.(place); };
  return b;
}
```

Rows that get it (all in `renderJournal`, `js/hud.js:2580-2760`):

| panel | line | where the place comes from |
|---|---|---|
| Work in hand | `js/hud.js:2601-2604` | the quest's own `place` — today `j.quests` rows carry only `title` and `progress`, so §8.2 widens that shape |
| Work going on here | `js/hud.js:2712-2731` | `job.place` (`js/jobgen.js:219`), already used for `this.distanceTo?.(job.place)` at `js/hud.js:2717` — the position is right there and is currently only turned into a distance |
| The survey / objectives | `js/hud.js:2593-2599` | campaign objectives that carry a place |
| Named foes | `js/hud.js:2607-2615` | only when a nemesis has a last-seen position; otherwise no button |
| Who holds this ground | `js/hud.js:2626-2700` | one button per faction row → `territory` sites in the zone; optional, second pass |
| The zone table | `js/hud.js:2749-2776` | `zones.byId(z.id).center` — a region centre is a real place |
| Word going round | `js/hud.js:2735-2745` | **no button.** A rumour is deliberately pinless (`js/rumours.js:10-13`); it carries `zoneId` and no coordinates. Adding one would undo that design. |

**Rule for the implementer:** the button is `⌖` (U+2316, "position indicator") in every one of these
places, and its tooltip always begins "Show". One glyph, one verb.

---

## 4. Saved locations

### 4.1 They are markers

There is already a book that files by world, survives the save, feeds the map, the minimap and space
mode, and is node-testable (`js/markers.js`). A second store would be a second thing to keep in step
and a second thing to forget in `snapshot()` — which is exactly how `world`, `quests` and `campaign`
were lost for a whole round (`js/save.js:142-157`). So a saved location is a marker with a new kind.

### 4.2 Shape

```js
{
  id: 'm12',                    // MarkerBook's own
  kind: 'saved',                // new; MARKER_LOOKS gets a row for it
  name: 'Clay bank by the ford',
  systemSeed: 8812, planetId: 3,   // MarkerBook.add already stamps these
  planetName: 'Hes-Subud IV', starName: 'Aur Veshal',
  cell: { x: 118, y: 44 },
  tracked: false,               // existing: does the minimap follow it
  starred: true,                // NEW: is it highlighted on the world map
  note: 'furnace clay',         // NEW: optional, one line, player-typed or auto
  from: {                       // NEW: where it came from, for the tooltip
    type: 'quest'|'scan'|'pin'|'place'|'journal',
    id: 'q_4f3k1',              // NOT `questId` — see below
    label: 'Clear the Sunken Vault'
  },
  madeAt: 1758300000000
}
```

**`from.id` must not be called `questId`.** `syncQuests` deletes any marker with a `questId` that is
no longer in the live log (`js/markers.js:148-151`), so a location saved off a quest would be silently
swept away the moment the quest was handed in — which is precisely when the player most wants to
remember where it was.

`starred` is added to **every** marker kind, not just `saved`. Starring a quest marker is a legal
thing to want.

### 4.3 Where it is saved

Nowhere new. `MarkerBook.toJSON()` serialises whole marker objects (`js/markers.js:222-224`), and
`main.js` already passes `markers: markers.toJSON()` into `snapshot()` (`js/main.js:4700`), which
already keeps it (`js/save.js:131`). New fields ride along with no change to `save.js`. `load()`
(`js/markers.js:226-232`) copies the array as-is, so an old save simply has no `starred` and
`!!m.starred` is `false`. **No migration needed, and none should be written.**

Per-world filing is already correct: `worldKey({systemSeed, planetId})` (`js/markers.js:47-49`) is the
same `systemSeed + planetId` pair `js/homes.js` uses (`homes.js:59-64`), and for the same reason —
planet ids restart at 0 in every system.

### 4.4 The API on `MarkerBook`

```js
/** Keep a place. Returns the marker, or the existing one if this cell is already kept. */
save({ cellX, cellY, name, note = '', from = null, starred = true }) { … }

/** The checkbox. Highlight this one on the world map, or stop. */
star(marker, on = !marker.starred) { marker.starred = !!on; return marker.starred; }

/** Everything starred on this world, for the map's own draw pass. */
starred() { return this.here().filter(m => m.starred); }
```

`save()` de-duplicates on `cell.x`/`cell.y` within 1 cell **and** kind — saving the same ford twice
from two different screens should give one row, renamed, not two.

### 4.5 How a player makes one

Four doors, all landing in `book.save()`:

1. **Shift-click the map** — today drops a `pin` (`js/map.js:1293-1296`). Keep. A pin is the quick
   one; a saved place is the deliberate one. Add **Ctrl-shift-click** → `save()` with the biome and
   region as the default name (`Grassland, The Reach`), immediately editable in the row.
2. **`[⌖ save]` on any Find row** — the place's real name, `from: { type: 'place' }`.
3. **`[⌖ save]` on a quest row** — copies the quest's `place`, `from: { type:'quest', id, label }`.
   Survives the hand-in, per §4.2.
4. **`Keep` on a scan hit** — §5.5. `from: { type:'scan' }`, note = the material name and richness
   band.

### 4.6 How a starred place is drawn

In the markers loop (`js/map.js:797-821`), before the glyph: a gold star, `drawMark`'s own `star`
path at `r = Math.max(7, scale * 1.2)` filled `#ffd24a` with a `#2a1f08` outline, sitting up and left
of the marker glyph so it never hides it. On the minimap, `hud.js:1029-1075` gets one extra line —
a starred marker draws at 14 px instead of 12 and in `#ffd24a` — and nothing else changes there.

### 4.7 The checkbox wording

The row's star button tooltip: on → `Starred. Highlighted on the map. Click to stop.` off →
`Not starred. Click to highlight it on the map.` The track button beside it: `Tracked — the minimap
points at it.` / `Not tracked.` Two buttons that used to be one ★ means the CSS at `style.css:464-466`
splits into `.row-track` and `.row-star`.

---

## 5. Resource scanning, and where clay is

### 5.1 The honest answer to "where do you find clay?"

**Clay comes from one node kind: a Clay Bank.** `data/resources.json:122-123`:

```json
"clay_bank": { "name": "Clay Bank", "resources": { "clay": 10 }, "baseYield": 0.6,
  "swingSeconds": 1.4, "amountBand": [80, 220], "hardness": 0, "radius": 3,
  "biomes": ["marsh", "grassland", "rainforest", "temperateForest", "beach", "savanna"],
  "nearWater": true, "desc": "Cut out of a riverbank with your hands if you have to." }
```

So: **marsh, grassland, rainforest, temperate forest, beach and savanna. Hardness 0 — bare hands
work.** It is not rare; it is invisible. Three reasons the player could not find it:

* **`nearWater: true` is read by nobody.** `kindsForBiome` (`js/resources.js:331-337`) filters on
  `fromPlanet`, `placedOnly`, `indoors` and `biomes`, and never looks at `nearWater`. So clay banks
  are scattered evenly across six biomes rather than on riverbanks — the description tells the player
  to look at the water's edge, and the generator does not put them there. This is the same class of
  bug as `deep_vein`'s `indoors` (RPG.md:1170-1195), one flag later, and it should be fixed in the
  same way: honour `nearWater` by rejecting a candidate spot whose distance to water exceeds ~2 cells,
  with the existing `tries = want * 8` retry budget absorbing the misses.
* **The scanner is inside build mode.** `build-ui.js:45` lists it as a *tool*, reachable only by
  pressing `B`, picking Scan, aiming at the ground and clicking. Nobody looking for a map found it.
* **Its default radius is 144 m.** `js/build.js:611`: `onScan(aimAt.x, aimAt.z, Math.max(120, radius * 18))`
  with `radius` defaulting to 8 (`js/build.js:333`). One hundred and forty-four metres on a planet
  where seams are "about fourteen to a 512 m tile".

And the reason it matters: **the furnace costs 6 clay and the kiln 8** (`data/structures.json`, and
`data/refining.json` machines `furnace {stone:20, clay:10}`, `kiln {stone:16, clay:16}`). Clay is the
gate on the first two machines in the game, and `fire_brick` (`kiln`, `clay:3 → brick:2`) is the only
recipe that consumes it. A player who cannot find clay cannot start refining at all.

### 5.2 What else the audit of the node data turned up

Worth fixing while the file is open, all one-liners:

* **`water_source` is nearly unreachable.** Its biomes are `lake, coast, marsh`
  (`data/resources.json`), and `createNodeWorld` marks any node on water as `gone`
  (`js/resources.js:534-535`). `lake` and `coast` are water biomes (`worldgen/js/biomes.js:13-14`), so
  the one node that never runs out survives only in marsh and on the odd dry shoreline metre.
* **`gas_vent` lists a biome that does not exist.** `toxic` is not a World Forge biome key
  (`worldgen/js/biomes.js:11-40`). It is inert, not harmful, but it makes the list read as longer
  than it is.
* **`ice_field` lists `seaIce`**, also a water biome, also marked `gone`.

### 5.3 The material → where-it-occurs index

Generated from `data/resources.json`. This is the table the Find tab and the tooltip read; it belongs
in code as a derived map built once at load (`materialIndex(data)` in `js/resources.js`), never
hand-written.

| material | node kind | hardness | where it occurs | caveat |
|---|---|---|---|---|
| `clay` Clay | Clay Bank (`clay_bank`) | 0 | marsh, grassland, rainforest, temperateForest, beach, savanna | `nearWater` read by nobody |
| `cloth` Cloth | Cleared Camp (`camp_scrap`) | 0 | anywhere on land | only where a camp was cleared |
| `coal` Coal | Ore Outcrop | 1 | hills, mountains, badlands, shrubland, savanna, grassland, tundra, volcanic, ashPlain, snowyPeaks | |
| `coal` Coal | Deep Vein | 2 | anywhere on land | dungeon floors only |
| `copper_ore` Copper Ore | Ore Outcrop | 1 | as coal above | |
| `copper_ore` Copper Ore | Deep Vein | 2 | anywhere on land | dungeon floors only |
| `crystal_raw` Rough Crystal | Crystal Spire | 2 | glimmerwaste, veiledHills, mountains, snowyPeaks, ice | needs a tier-2 tool |
| `fibre` Plant Fibre | Fibre Patch | 0 | grassland, marsh, savanna, shrubland, rainforest, temperateForest, hallowed | |
| `flint` Flint | Boulder | 1 | anywhere on land | |
| `gold_ore` Gold Ore | Ore Outcrop / Deep Vein | 1 / 2 | as coal above / dungeons | rare roll |
| `ice` Ice | Ice Field | 1 | ice, snowyPeaks, tundra, ~~seaIce~~ | seaIce is water → `gone` |
| `iron_ore` Iron Ore | Ore Outcrop | 1 | as coal above | **the surface source** |
| `iron_ore` Iron Ore | Deep Vein | 2 | anywhere on land | dungeon floors only |
| `iron_ore` Iron Ore | Meteor Fall | 2 | anywhere on land | placed by a meteor only |
| `leather` Leather | Cleared Camp | 0 | anywhere on land | cleared camps |
| `log` Log | Tree | 1 | temperateForest, rainforest, borealForest, blighted, hallowed, grassland, hills, marsh | also felled by hand, `js/props.js` |
| `meteoric_iron` Meteoric Iron | Meteor Fall | 2 | anywhere on land | placed by a meteor only |
| `obsidian` Volcanic Glass | Obsidian Flow | 2 | volcanic, ashPlain, badlands | |
| `reed` Reed | Fibre Patch | 0 | as fibre above | |
| `resin` Resin | Tree | 1 | as log above | |
| `rubble` Rubble | Quarry Face | 1 | hills, mountains, badlands, snowyPeaks, volcanic | |
| `salt` Rock Salt | Sand Bar | 0 | beach, desert, badlands | |
| `saltpetre` Saltpetre | Deep Vein | 2 | anywhere on land | dungeon floors only |
| `salvage_metal` Salvaged Metal | Wreck / Cleared Camp | 1 / 0 | anywhere on land | never respawns |
| `sand` Sand | Sand Bar | 0 | beach, desert, badlands | |
| `scrap_plate` Scrap Plate | Wreck | 1 | anywhere on land | never respawns |
| `silver_ore` Silver Ore | Ore Outcrop / Deep Vein | 1 / 2 | as coal above / dungeons | rare roll |
| `stone` Stone | Boulder / Quarry Face | 1 | anywhere / hills, mountains, badlands, snowyPeaks, volcanic | |
| `sulphur` Sulphur | Obsidian Flow | 2 | volcanic, ashPlain, badlands | |
| `tin_ore` Tin Ore | Ore Outcrop / Deep Vein | 1 / 2 | as coal above / dungeons | |
| `vent_gas` Vent Gas | Gas Vent | 3 | volcanic, ashPlain, marsh, badlands, ~~toxic~~ | needs a collector; `toxic` is not a biome |
| `water` Water | Water | 0 | ~~lake~~, ~~coast~~, marsh | never runs out; water biomes → `gone` |
| *(planet rares)* | Rare Seam | 3 | one per rare element the planet holds | `planet.rare`, `js/resources.js:376-388` |

**The other 49 materials in `data/resources.json` are not dug at all** — they are refined
(`data/refining.json`, 63 recipes over 8 machines), butchered, or farmed. A Find row for one of those
must say so and name the recipe: `Brick — fired from 3 Clay at a Kiln.` Built from
`refining.json` by inverting `recipes[].outputs`, same pattern as the material index. A player asking
"where is brick" is asking the same question as "where is clay", one step further out, and the answer
should walk them back one step at a time.

### 5.4 The scanner, moved and widened

Three changes, no new subsystem. The sweep itself (`sweepForDeposits`, `js/main.js:1747-1780`) is
good work; it is in the wrong room with the wrong number.

**(a) A material picker.** `sweepForDeposits(x, z, radius)` gains a fourth argument:

```js
function sweepForDeposits(x, z, radius, want = null)   // want: a material id, or null for everything
```

`want` filters `seams` before the `byResource` fold. When `want` is set the result keeps **every**
hit, not the best of each — the player asked for that material, so show them all of it, nearest
first, capped at 12 rows.

**(b) A real radius.** Default `800`. The hard ceiling is **512 m**: `ore.near(x, z, reach)` walks
`around(x, z)`, which is the 3×3 block of 512 m tiles around the point (`js/resources.js:544-550`,
`TILE = 512` at `js/resources.js:473`), so a point sitting on a tile edge has only 512 m of guaranteed
coverage on that side. Asking for 800 m today returns a lopsided answer and says nothing about it.
Two options; take the first:

* **Widen the walk.** Give `createNodeWorld` a `reach`-aware `around`: `aroundFor(x, z, reach)` that
  walks `ceil(reach / TILE) + 1` tiles each way instead of a hard-coded 1. Three lines, and tile
  generation is already cached and seeded, so a wider sweep costs a handful of tile builds once.
* *(rejected)* Clamp the radius to 512 and tell the player. Honest but smaller than the "large
  proximity" the user asked for.

**(c) Somewhere to press it.** The scan lives in **three** places, all calling the same function:

| where | control | centre | radius |
|---|---|---|---|
| Build mode (today) | the Scan tool | the build cursor (`aimSpot()`, ≤ 40 m out — `js/main.js:1873`) | `max(120, brush * 18)` |
| **The map, Resources fold** | a material dropdown + `[Scan]` | **the player** | 800 m |
| **The world, `V`** | a key, no menu | the player | 800 m, last material re-used |

The build-mode comment claims the cursor answers "what is over that ridge" (`js/build.js:605-608`) —
it cannot, because `aimSpot()` marches at most 40 m (`js/main.js:1873`). Say so in the comment and
leave the tool alone; the map and the key are the real answers.

### 5.5 What a sweep produces

**In the world**, for `SCAN_SHOW_SECONDS = 120`:

* A beacon over each hit: `js/ore-view.js` grows a second InstancedMesh — a thin vertical
  `CylinderGeometry(0.25, 0.25, 14, 6)` in `MeshBasicMaterial({ transparent: true, opacity: 0.45 })`,
  coloured by the material (`materials[id].colour`, which every material already carries — clay is
  `#a8705a`). `scanBeacons(hits, { heightAt })`, keyed like `drawRoutes` so it rebuilds only when the
  set changes (`js/ore-view.js:129-133`). Opacity falls to 0 over the last 15 s.
* One HUD line, the existing one (`js/main.js:1775-1778`), reworded when `want` is set:
  `Sweep: 6 clay within 800 m — nearest 210 m SW.`

**On the map**, for as long as the Resources fold's checkbox is ticked:

* `state.scanHits` on the map screen, a plain array `[{ id, resource, resourceName, cell, band,
  deliveredPerMinute, distance, compass, colour }]`, set by `map.setScanHits(rows)`.
* Drawn in a new `drawScanHits()` after `drawPlaces` and before `drawFocus`: a 5 px diamond in the
  material's colour with a `#150f0a` outline, and at `state.zoom >= 2.6` the material name beside it.
* Not markers. A sweep can turn up a dozen seams and the marker book must not fill with them —
  that is what the `Keep` button is for, and it is the same `book.save()` §4.5 door 4.

**Kept**: each map row and each panel row carries `[Keep]`, which calls `book.save()` with
`kind: 'saved'`, `from: { type: 'scan' }` and the note `Clay · rich`. Today's `pinDeposit`
(`js/main.js:1782-1795`) becomes this, keeping its `kind: 'seam'` so existing saves still read.

### 5.6 The resource filter layer on the map

The Resources fold, always present in the rail:

```
┌ Resources ──────────────────────────────[▾]─┐
│ Material  [ Iron Ore              ▾ ]        │   every material with a node source (§5.3)
│           [ Scan from here ]  within 800 m   │
│ ☑ show what the last sweep found             │
│ ☐ shade where it can occur                   │
│ Clay is cut from a Clay Bank. Marsh,         │   the index line for the picked material
│ grassland, forest, beach and savanna.        │
│ Bare hands are enough.                       │
└──────────────────────────────────────────────┘
```

**"Shade where it can occur"** is the cheap half of the ask — *"filters on the map"* — and it needs no
new data at all. The picked material's biome list (§5.3) is turned into a `Set` of World Forge biome
ids, and the same clipped `getImageData` pass the level overlay already uses (`js/map.js:707-734`)
tints matching cells toward the material's colour at 0.30 and pushes everything else 35 % toward grey.
The player sees, on one screen, every part of the planet where a clay bank can exist. It is a
possibility map, not a discovery map, and the caption must say so: `Where it can occur. Sweep or walk
to find a seam.`

Performance note, because this is the code path that once took 3.28 s a frame (`RPG.md:1010-1012`):
reuse the level overlay's clipping exactly — read back only the canvas rectangle, never
`world.width * scale`. The two washes must not both run; picking a material turns the level wash off
and says so on the chip.

### 5.7 Mining outposts and purpose-built roads

*"Eventually I'd like to have several mining outposts with purpose-built roads connecting to the base
to increase delivery speeds/throughput."* Most of this exists and is not joined up. What the map owes
it:

| piece | state today | what is missing |
|---|---|---|
| A drill on a seam | `mining.bindDrill` (`js/mining.js:71-80`) | nothing |
| A route that decides the rate | `haulThroughput(metres)` via `mining.rateOf` (`js/mining.js:153-187`) | nothing |
| The walked distance, not the straight line | `js/haulpath.js`, A* on an 8 m grid | nothing |
| A road that makes the walk faster | **missing.** `js/haulpath.js` has no notion of a built road; `stores.haulThroughput(metres, hauler)` takes only a hauler. | `haulThroughput(metres, hauler, { pavedShare })` and a `roadShare` term from `buildplan`'s road runs |
| Several outposts, each with its own stores | `stores.poolAt` already pools by reach | a **named claim** per outpost, so the map can list them |
| Any of it visible above 100 m | **missing** | the map draws nothing about industry at all |

The map's part, and only the map's part:

1. **A `Works` section in the Markers tab**, one row per storage pool that has a drill routed to it:
   `⛏ North Bank — 3 drills · 41 clay/min · limited by hauling`, straight off `mining.overview()`
   (`js/mining.js:190-226`), whose `limit` field already says the one word that matters.
   `[Locate]` on each.
2. **Routes drawn on the world map.** `mining.overview()[].route.points` is already a polyline in
   world metres (`js/mining.js:208-209`) and `js/ore-view.js` already draws it on the ground
   (`ore-view.js:129-156`). On the map it is a 1.5 px `#7fd4ff` line at 45 % alpha, dashed where the
   route's `detour > 1.4` — a route that walks twice as far as the crow flies **explains itself** the
   moment you see the bend in it, which is exactly the argument `ore-view.js:99-106` makes.
3. **A roads layer that shows your own roads**, not just World Forge's. The build plan's road runs
   (`js/buildplan.js`) are polylines in metres; drawn in `#c8b48a` over the terrain, they are the
   visual proof that a purpose-built road shortened a route.

Nothing above changes a rate. The throughput change (a paved share reducing the effective metres) is
`js/stores.js` + `js/haulpath.js` work and belongs to whoever takes checklist item 15, not to the map.
It is listed here so it is not lost: **the map can already show a mining outpost network as soon as
one exists; the thing that does not exist yet is the road bonus.**

---

## 6. The icon set

Rule for every change below: keep the existing visual language — flat fills, a dark outline of
`r * 0.3`, a ring for emphasis, colours from the palette already in `MAP_MARKS`. No gradients, no
images, no emoji on the canvas except the two that are already there (`☄`, and the marker glyphs).

### 6.1 The waypoint pad — a lit disc, not a dark hole

Current (`js/map.js:1144-1160`): fill `rgba(20,44,58,.95)` lit / `rgba(22,26,34,.9)` unlit; ring
`#6ad0ff` / `rgba(120,132,148,.65)`; three spokes.

Replacement, drawn by `drawMark` so it lands in the key like everything else:

```js
waypoint:     { label: 'waypoint (lit)',  group: 'Travel', shape: 'sigil', r: 4.4, fill: '#6ad0ff', line: '#06212e', ring: true },
waypointDark: { label: 'waypoint (dark)', group: 'Travel', shape: 'sigil', r: 4.0, fill: '#5a6676', line: '#14181f' },
```

`case 'sigil'`:

1. A **pale disc**, `fill` at full strength — `#6ad0ff` for a lit pad, `#5a6676` for a dark one. The
   pad must be the brightest thing in its neighbourhood, because it is the thing you are looking for.
2. A **dark inner ring** at `r * 0.55` in `line`, 1.4 px — this is what gives it the "concrete with
   sigils cut into it" read at 8 px instead of a solid blob.
3. **Three spokes** from `r * 0.32` to `r * 0.80` in `line` for lit, at 45 % alpha for dark —
   the existing geometry (`js/map.js:1158-1167`), kept, because it is the one shape that is the same
   on every world and that is the whole design (`js/waypoints.js:10-18`).
4. `ring: true` on the lit one only, which reuses `drawMark`'s existing halo (`js/map.js:204-210`) —
   a lit pad glows, a dark one does not, and no new code is needed for it.
5. The picked pad keeps today's dashed `#ffd98a` ring outside the disc (`js/map.js:1163-1172`).

The hit list (`waypointHits`, `js/map.js:1073`) is unchanged; only the drawing moves.

### 6.2 The town portal — currently not drawn at all

`js/portal.js:211-219` has been ready since the building expansion and nothing calls it. Two new
marks and one new marker kind:

```js
// MAP_MARKS
portalOut:  { label: 'portal — the way back', group: 'Travel', shape: 'arch', r: 4.6, fill: '#c9a2ff', line: '#241040', ring: true },
portalHome: { label: 'portal — where you left', group: 'Travel', shape: 'arch', r: 4.2, fill: '#8f7ad8', line: '#1a0c30' },
```

`case 'arch'`: a **standing ring** — an ellipse `r * 0.62` wide by `r` tall, filled, with a 1.6 px
`line` stroke, standing on a 2 px foot bar the full `r * 1.3` across. It reads as a doorway you can
see through, which is what a portal is and what neither a disc nor a pip says. Violet was chosen
because nothing else on the map uses it (dungeons are `#c090ff` but are a `gate`, a completely
different silhouette; the two never appear at the same size).

Wiring: `createMapScreen({ portals })` where `portals` is `{ marks: () => portals.mapMarkers() }`,
following the `meteors`/`gates`/`sites` getter pattern (`js/main.js:3627-3631`), and drawn in
`drawPlaces` with the pair joined by a dashed `#8f7ad8` line at 30 % alpha so it is obvious the two
ends are the same portal. `js/portal.js` itself needs **no edit**.

### 6.3 Markers draw their glyph

Replace `js/map.js:809-813`. Behind the glyph, a soft rounded-rect plate in `rgba(10,14,20,.72)` sized
to the glyph, so `!` on pale beach sand is still readable; then the glyph in `look.color` at
`Math.max(11, scale * 1.4)` px, centred, with the same 3 px black `strokeText` the names use. The
dashed tracked ring (`js/map.js:801-808`) stays. The starred gold star (§4.6) goes up-left.

`MARKER_LOOKS` gains `saved: { icon: '⌖', color: '#8fe0a0', label: 'Saved place' }` and
`portal: { icon: '◍', color: '#c9a2ff', label: 'Portal' }`.

### 6.4 Landmarks stop being one pip

New marks, all in a **Landmarks** group, and `markFor` grows a `LANDMARK_MARK` lookup keyed on
`node.kind` (World Forge) and `site.pin.glyph` (farhold):

| mark | shape | fill | covers |
|---|---|---|---|
| `shrine` | `pip` with a 1.5 px cross above it | `#8fd0ff` | shrine, stones, cairns, monolith |
| `ruin` | two broken uprights (`keep` with the middle removed) | `#9fb0c8` | ruin, farm, washout, battlefield |
| `mine` | `mouth` at `r * 0.8` with a cross-bar | `#c2a98a` | mine, cave, crater |
| `tower` | a narrow `keep`, `r * 0.45` wide | `#d8d2c4` | tower, beacon, blind |
| `water` | a 3-arc wave glyph | `#8fd3ff` | ferry, bridge, waterfall, wreck |
| `wild` | a small triangle-tree | `#6f9f52` | ancientwood |
| `hazard` | a hollow triangle with a dot | `#ff8a40` | volcano, vent, gibbet, forge |

Seven new shapes, all drawn with the same three primitives already in `drawMark`. Zoom-gated so they
only appear from `state.zoom >= 2.6` (§1.3(f) makes that a real gate for the first time).

### 6.5 The key itself

* **Rebuildable.** Drop the `dataset.built` early return (`js/map.js:412-413`); call it from
  `buildSide()` so a waypoint row can appear the first time a pad is lit.
* **Five groups**: Settlements · Underground · Held ground · Landmarks · Travel, plus a
  **"Also on the map"** block for the six things `drawMark` does not draw — you, enemies, a falling
  meteor, a road, a river, a region border — each with a hand-drawn 22 px swatch beside it.
* **Every row hoverable**, `data-tip` on the row: what it is, and where they come from.
  `capital` → `The seat of a region. There is at most one on a continent.`
* **Grey out what is switched off.** When `state.layers.nodes` is false, the whole key gets
  `.is-off` and a line: `Places are hidden — turn "nodes" back on under Layers.` That closes 1.3(j).
* The key moves into a `<details>` (`What the marks mean`), shut by default, because the three tabs
  are now the primary content of the rail. The footer strip under the canvas keeps the danger scale
  permanently and gains `⌂ base` and `◉ pad`, which are the two the player looks for most.

### 6.6 The footer strip, always populated

`js/map.js:865-880` becomes: danger scale when the level overlay is on, **plus** the current layer's
ramp from `legendRows(world, state.layer)` when the layer is not `biomes`, **plus** a two-item
mini-key. The `<details>` fold's summary becomes layer-aware:
`biomes → What ${planet} is made of`, anything else → `${LayerName} across ${planet}`. Closes 1.3(g)
and 1.3(h).

---

## 7. Hover tooltips on a canvas

### 7.1 What is hovered

Three tiers, tested in this order at every `mousemove`, nearest-first within a tier:

| tier | test | radius |
|---|---|---|
| 1. an icon | squared distance to every entry in a per-draw hit list | the mark's own `r * 1.6`, floor 7 px |
| 2. a region | `zones.byId(world.region[cell])` | n/a — always answers on land |
| 3. a cell | `cellInfo(world, x, y)` | n/a |

### 7.2 The hit list

`drawPlaces`, `drawWaypoints`, `drawScanHits`, the markers loop and the meteors loop each push into
one array that is cleared at the top of `draw()`:

```js
/** Everything clickable or hoverable this frame, in screen pixels. Cleared by draw(). */
const hits = [];
// { px, py, r, tier: 'icon', kind, ref }   ref is the node / site / pad / marker / scan row
```

`waypointHits` (`js/map.js:1073`) folds into this and keeps its own filtered view for the click
handler, so `map.padHits` (`js/map.js:1420`) — which a test uses — does not change shape.

Hit-testing cost: a few hundred entries, one `mousemove`, one squared-distance each. This is nothing
next to the draw it follows. No spatial index.

### 7.3 The mechanism — the shared engine, not a second one

`shared/tooltip.js` is already installed by `hud.js:292` and its CSS is already linked
(`index.html:9`). It keys off DOM elements, and the map is one element, so:

1. `map.js` imports `{ registerTip, refreshTip, tipOpen, hideTip }` and once, at construction:
   `registerTip('mapHover', () => hoverCard(state.hover))`.
2. The canvas carries `data-tip-render="mapHover"` and `data-tip-class="tip-map"`.
3. On `mousemove`, the map hit-tests and sets `state.hover = { tier, kind, ref, key }` where `key` is
   a stable identity string (`'icon:site:camp_17'`, `'region:14'`, `'cell:118,44'`).
4. **When `key` changes and a tip is open, call `refreshTip()`** (`shared/tooltip.js:26-35`) — it
   re-runs the renderer in place, keeping the position, which is exactly the hook this needs and is
   already used for the item cards.
5. The engine's own `onOver` fires once when the pointer enters the canvas and arms the 150 ms delay
   (`shared/tooltip.js:91-101`); `onMove` keeps the box following the pointer
   (`shared/tooltip.js:103-108`). Nothing else is needed.
6. **The one gap:** `installTooltips` hides the tip on `pointerdown` (`shared/tooltip.js:122`), and
   since `pointerover` will not fire again inside the same element, a tip does not come back after a
   click until the pointer leaves the canvas. Fix in `map.js`, one line in the `pointerup` handler:
   `canvas.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, clientX: ev.clientX, clientY: ev.clientY }))`.
   Do **not** change `shared/tooltip.js` — it is shared with Emberveil.

The readout line under the canvas (`js/map.js:1212-1226`) **stays**. It is the always-visible fact
line and the tooltip is the hover detail; the house rule at `js/map.js:464-465` and
`BUILD-MODE.md:421` is that a refusal or a key fact must not hide in a tooltip, and nothing here
moves a fact into one.

### 7.4 What each tooltip says

**An icon — a place** (World Forge node or farhold site):
```
Hollowcrown                    ← name, or "somewhere you have not been" when !knows(region)
town · 1,400 people            ← MAP_MARKS[key].label · node.population where there is one
The Reach · level 14–17 (Hostile)
4.1 km north-east
A waypoint here. The sigils are lit.     ← only if a pad stands in it
Held by the Warden's Reach · Trusted     ← territory.of(zone).holder + your band, when known
```

**An icon — a stronghold, lair or world boss:** name, `site.spec.name` as the kind, the tier word,
`site.blurb` (one line, already written in `data/strongholds.json`), the level, and `Cleared.` when
`site.cleared`.

**An icon — a waypoint pad:**
```
Hollowcrown — waypoint
A settlement pad. The sigils are lit.
11.2 km south · about 1.9 hours on the road     ← waypoints.hoursFor(...) — the cost is already computed
Click to pick it, then Travel.
```
For a built pad with `powered === false`: `The sigils are dark. Its grid is down.` — the exact
sentence `canTravel` already returns (`js/waypoints.js:272`), so the map and the log say one thing.

**An icon — a marker:** the glyph's label from `MARKER_LOOKS`, the name, the distance, `Tracked` /
`Starred` state, and for a `saved` marker its `note` and `from.label`.

**An icon — a scan hit:** `Clay — rich · 640 m SW · 18.2/min delivered from here`, plus
`Cut from a Clay Bank. Bare hands are enough.` from the index (§5.3), plus `[Keep]`'s keyboard hint.

**A region (tier 2):**
```
The Reach                      ← or "Somewhere you have not been"
level 14–17 · Hostile          ← zone.minLevel/maxLevel/danger
A fair fight for you right now ← TONE_LABELS[zoneTone(midLevel, myLevel)] — the word from the key
Held by the Warden's Reach     ← territory.of(zone).holder, only for zones you have visited
6 places · 2 you have cleared  ← counted from world.nodes/sites in the zone
```

**A cell (tier 3):** the readout line, one fact per row instead of `·`-separated —
biome, elevation or "water", temperature, usual weather (`weatherOdds`, already computed at
`js/map.js:1216`), and, when the Resources fold has a material picked,
`Clay banks can occur here.` / `No clay here — wrong ground.`

### 7.5 Accessibility and the keyboard

The canvas is not focusable and the tooltip engine's keyboard path (`shared/tooltip.js:119-120`) will
never fire for it. That is acceptable: every icon on the canvas is also a row in a tab, every row is a
real `<button>`, and the rows carry `data-tip` with the same text the canvas tooltip shows. The
keyboard route to the information is the rail, not the picture.

---

## 8. Where "Nearby Activities" meets the map

The panel is another agent's. The contract between them is three things, and it is worth writing down
so neither agent invents its own:

1. **One book.** Anything the panel lists that has a position is a `MarkerBook` entry or comes from
   the same sources the Find tab reads. The panel must not keep a second list of saved places.
2. **One locate.** The panel's ⌖ calls `hud.onLocate(place)` → `map.locate(place)` (§3.4). The panel
   never imports `map.js`.
3. **One save.** The panel's "keep this" calls `book.save(...)` (§4.4), so a thing kept from the panel
   is in the map's Markers tab and a thing starred on the map is starred in the panel.

The panel also wants the compass/distance helper (`COMPASS` + `distanceText`) — which is why §2.2
moves `COMPASS` out of `js/main.js:1739-1744` and into `js/markers.js` beside `distanceText`.

---

## 9. Work plan

Ordered so each step leaves the game running. `js/main.js` (6,308 lines) and `js/hud.js` (3,026
lines) are **flagged** wherever they are touched; every one of those edits is a handful of lines in a
named function, never a restructure.

### Phase A — the audit fixes, no new UI (safe, testable on their own)

| # | file | edit |
|---|---|---|
| A1 | `js/map.js:93-110` | `markFor`: add `if (node.type === 'landmark') return LANDMARK_MARK[node.kind] ?? 'landmark';` before the `kind === 'cave'` line. Closes 1.3(a). |
| A2 | `js/map.js:53-84` | `MAP_MARKS` + `MARK_ORDER`: add the seven landmark marks (§6.4), `waypoint`/`waypointDark` (§6.1), `portalOut`/`portalHome` (§6.2). |
| A3 | `js/map.js:113-211` | `drawMark`: add `sigil`, `arch` and the seven landmark shapes. Pure additions to the `switch`. |
| A4 | `js/map.js:97-103` | stronghold glyphs: `stockade` → its own mark, `cult` → `hazard`. |
| A5 | `js/map.js:1133-1175` | `drawWaypoints` draws `drawMark(ctx, pad.lit ? 'waypoint' : 'waypointDark', …)` and keeps only the picked-ring and hit-list code. |
| A6 | `js/map.js:1105-1119` | thin on `state.zoom`, not `scale`. Closes 1.3(f). Suggested gates: settlements ≥ 3 at zoom 1, everything at zoom ≥ 2.6, landmarks from 2.6. |
| A7 | `js/map.js:797-821` | markers draw their glyph on a plate (§6.3). |
| A8 | `js/map.js:411-435` | `buildKey` rebuildable, five groups, the "Also on the map" block, per-row `data-tip`, `.is-off` when nodes are hidden. Closes 1.3(j), (k). |
| A9 | `js/map.js:865-892` | the footer strip always carries something; the fold's summary is layer-aware. Closes 1.3(g), (h), (i). |
| A10 | `style.css` (append, ~40 lines) | `.map-key.is-off`, `.map-footkey`, `.map-key-row[data-tip]` cursor. |
| A11 | `js/resources.js:331-337` + `:353-372` | honour `nearWater` when placing a node (§5.1). Fix `gas_vent`'s `toxic`, `ice_field`'s `seaIce`, `water_source`'s `lake`/`coast` in `data/resources.json`. |

### Phase B — locate

| # | file | edit |
|---|---|---|
| B1 | `js/map.js` (new fn, ~55 lines) | `locate(place, opts)` (§3.1), `drawFocus()` (§3.2), `startFocusPulse()` (§3.3), `state.focus`, and cancel the rAF in `dispose()` (`js/map.js:1382-1389`). |
| B2 | `js/map.js:1394-1428` | export `locate` on the returned object. |
| B3 | **`js/main.js`** ⚠ | one line in `window.farhold` (`js/main.js:6205`): `locate: (p, o) => map.locate(p, o),` and one beside `hud.zones = zones;` (`js/main.js:3742`, which runs on every landing): `hud.onLocate = (p, o) => map.locate(p, o);`. **Two lines. Nothing else in main.js changes in this phase.** |
| B4 | **`js/hud.js`** ⚠ | `locateBtn(place)` helper (~10 lines) + one call in each of five places inside `renderJournal` (`js/hud.js:2593`, `:2601`, `:2607`, `:2712`, `:2749`). All additive — the existing `row()` helper returns a node and the button is appended to it. |
| B5 | **`js/main.js`** ⚠ | widen the journal payload so a quest row carries its `place`: `js/main.js:1181` — `quests: questLog.active.map(q => ({ title, progress, done }))` gains `place: q.place ?? null, id: q.id`. Two properties on one line. |
| B6 | `style.css` | `.row-locate` — 16 px, `#7fd8ff`, no border, right-aligned. |

### Phase C — the rail and the three tabs

| # | file | edit |
|---|---|---|
| C1 | `js/map.js:437-601` | `buildSide()` splits into `buildRail()` (tabs + body) and `buildFolds()` (Layers, Resources, key). `state.tab = 'quests'\|'markers'\|'find'`, remembered across opens. |
| C2 | `js/map.js` (new, ~90 lines) | `tabQuests()`, `tabMarkers()`, `tabFind()` (§2.2-2.4) and a shared `markerRow(m, { locate, del })`. |
| C3 | `js/markers.js` | `starred` field, `save()`, `star()`, `starred()` (§4.4); move `COMPASS`/`compassTo` in from `js/main.js:1739-1744`. |
| C4 | `js/map.js:1289-1336` | Ctrl-shift-click saves a place (§4.5 door 1). |
| C5 | **`js/main.js`** ⚠ | pass `quests: { active: () => questLog.active, log: questLog }` into `createMapScreen` (`js/main.js:3616-3660`) — one property in an options object that already has fourteen. |
| C6 | `js/map.js:797-821` | draw the gold star on starred markers (§4.6). |
| C7 | **`js/hud.js`** ⚠ | `drawMinimap` (`js/hud.js:1029-1075`): starred markers 14 px and `#ffd24a`. Two lines inside the existing marker loop. |
| C8 | `style.css` (append, ~90 lines) | `.map-rail-tabs`, `.map-rail-body`, `.rail-row`, `.rail-sub`, `.row-track`, `.row-star`, `.find-box`, `.find-chips`. Split `.pin-track` (`style.css:464-466`) into the two. |

### Phase D — the scanner

| # | file | edit |
|---|---|---|
| D1 | `js/resources.js` | `materialIndex(data)` → `{ [materialId]: { name, colour, sources: [{ kindId, kindName, hardness, biomes, indoors, placedOnly }] } }`, and `recipeIndex(refining)` for the 49 refined ones (§5.3). Pure, node-testable. |
| D2 | `js/resources.js:544-550` | `aroundFor(x, z, reach)` walking `ceil(reach / TILE) + 1` tiles; `near()` uses it (§5.4b). |
| D3 | **`js/main.js`** ⚠ | `sweepForDeposits(x, z, radius, want)` gains the `want` filter and a `SCAN_DEFAULT_RADIUS = 800` (`js/main.js:1747-1780`); `pinDeposit` (`:1782-1795`) becomes `keepDeposit` calling `book.save()`; the `scan` handle (`:2389`, `:6178`) gains `sweep(want)` and `hits()`. ~25 lines in one region of the file. |
| D4 | **`js/main.js`** ⚠ | a `V` case in the key handler beside `KeyM` (`js/main.js:4920-4937`): sweep for the last-picked material. ~6 lines. Must be added to the rebindable table the round-10 review added. |
| D5 | `js/ore-view.js` | `scanBeacons(hits, { heightAt })` — one InstancedMesh, keyed rebuild, 120 s fade (§5.5). |
| D6 | `js/map.js` | the Resources fold (§5.6): material `<select>`, Scan button, two checkboxes, the index caption; `setScanHits(rows)`; `drawScanHits()`; the "where it can occur" wash reusing the clipped `getImageData` from `js/map.js:707-734`. |
| D7 | `js/map.js` | the Find tab's material rows read `materialIndex` / `recipeIndex` (§2.4). |
| D8 | `js/build-ui.js:45` and `js/build.js:605-611` | correct the comment (the cursor cannot see over a ridge at 40 m), and add a material dropdown to the build-mode panel so the tool there matches the map. |

### Phase E — hover tooltips

| # | file | edit |
|---|---|---|
| E1 | `js/map.js` | the `hits` array (§7.2); every draw pass pushes into it; `waypointHits` becomes a filtered view. |
| E2 | `js/map.js:1212-1226` | `mousemove` hit-tests, sets `state.hover`, calls `refreshTip()` when the key changes. |
| E3 | `js/map.js` | `hoverCard(hover)` — one function, one `switch` on tier and kind, returning a DOM node (§7.4). |
| E4 | `js/map.js` | `registerTip('mapHover', …)`, `data-tip-render` on the canvas, the `pointerup` re-arm (§7.3 step 6). |
| E5 | **`js/main.js`** ⚠ (the `createMapScreen` options, `js/main.js:3616-3660`) | pass `territory: { of: id => holdings.of(id) }` and `factionName` so the region tooltip can say who holds the ground. Two properties. |
| E6 | `style.css` | `.tipbox.tip-map` — 260 px max width, the map's own heading colour. |

### Phase F — the portal, and the outpost view

| # | file | edit |
|---|---|---|
| F1 | **`js/main.js`** ⚠ | `portals: { marks: () => portals.mapMarkers() }` into `createMapScreen`. One property; `js/portal.js` unchanged. |
| F2 | `js/map.js:1094-1140` | draw the two portal ends and the dashed line between them (§6.2). |
| F3 | `js/map.js` | the Works section in the Markers tab, off `mining.overview()` (§5.7.1). |
| F4 | `js/map.js` | haul routes and player-built roads drawn on the map (§5.7.2-3). |
| F5 | **`js/main.js`** ⚠ | `mining: { overview: () => mining.overview() }` and `roads: () => build.roadRuns?.()` into `createMapScreen`. Two properties. |

### Tests

| file | what |
|---|---|
| `tests/map-icons.test.js` (new, node) | for every `world.nodes` type/kind pair World Forge can produce and every `strongholds.json`/`landmarks.json` icon, `markFor()` returns a key that exists in `MAP_MARKS` — **and a key that appears in `MARK_ORDER`**. This is the test that would have caught 1.3(a) on the day it was written. |
| `tests/markers.test.js` (extend) | `save()` de-duplicates; `star()` toggles; a saved place survives `toJSON`/`load`; **a saved place made from a quest is not deleted when that quest leaves the log** (the `from.id` vs `questId` trap, §4.2). |
| `tests/resources.test.js` / `industry.test.js` (extend) | every material with a `sources` entry is reachable: its node kind is not `indoors` unless a dungeon can spawn it and not `placedOnly` unless an event places it — and **clay specifically** is surface, hardness 0, and appears in at least one biome that a starting world can hold. |
| `tests/round14.spec.js` (new, Playwright) | open the map; the Quests tab lists an active job with a place; Locate moves the view and draws the focus ring; star a marker and see it in the Starred section; Find "clay" returns the material row with the biome sentence; scan and see hits on the map. |
| `tests/map-travel.spec.js` (existing) | must still pass unchanged — `map.padHits` keeps its shape (§7.2). |

### Documentation, when it is built

`RPG.md` — a "Round 14: the map" section. `README.md` — the map row (`README.md:44`) and the controls
table gain `V`. `BUILD-MODE.md` §12 — the rail replaces the description of the old side panel.
`~/claude/docs/playground.md` — one line. The CLAUDE.md prototype table row for
`prototypes/farhold/` gains the map redesign.

---

## 10. Decisions worth arguing about before it is built

1. **Hover tooltips reverse a stated house rule twice over** (`js/map.js:464-465`,
   `BUILD-MODE.md:421`: "its refusal written beside it rather than a disabled button with a tooltip").
   §7.3 keeps the rule by never moving a *fact* or a *refusal* into a tooltip — the readout line and
   the panel sentences all stay — and using the tooltip only for detail that has nowhere else to go.
   If the user meant "replace the side panel with tooltips", this design is wrong and should be
   revisited.
2. **Find respects B8.** A search that returns places you have never heard of undoes the round-10
   review's fix (`RPG.md:879-882`) and makes the rumour system pointless again. §2.4 filters on
   `knows(region)`. That is a real constraint on how useful Find can be on day one, and it is on
   purpose.
3. **Scan hits are not markers.** A twelve-seam sweep would otherwise flood the marker book, the
   minimap and the rim arrows. `[Keep]` is the one that commits. If the user wants every hit pinned,
   it is a one-line change in `sweepForDeposits`.
4. **The "where it can occur" wash is a possibility map.** It cannot show where a seam *is* without
   generating every tile on the planet (a 256×128-cell world is 1,024 ore tiles; `createNodeField`
   runs `want * 8` placement attempts each). The caption has to be honest about that or it will read
   as a broken discovery map.
5. **The road throughput bonus is not in this plan.** §5.7 shows the outpost network and the routes;
   making a built road actually deliver faster is `js/stores.js` + `js/haulpath.js` work under
   checklist item 15. Flagged here so it is not mistaken for done.
