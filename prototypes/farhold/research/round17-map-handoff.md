# Round 17 — the map cluster, and the four lines somebody else has to write

Written by the map/markers/waypoints agent. Everything in items 8, 9, 10, 11, 19 and 20 is
implemented and reachable **except** the three joins below, which live in files this agent was told
not to touch (`js/main.js`, `js/hud.js`, `style.css`, `index.html`).

Files this round owns and changed: `js/map.js`, `js/markers.js`, `js/waypoints.js`,
`js/outposts.js`, new `js/map-hits.js`, new `map17.css`, new `tests/round17-map.test.js`.
One existing spec was updated because this round changed the number it asserts:
`tests/round11-ui.spec.js` (`out.rows` 37 → 38 — the key gained an "outpost" row).

**`style.css` and `index.html` need nothing.** `map17.css` is injected by `js/map.js` the way
`js/civics-ui.js` injects `civics.css`, so the reserved-height rules land without either file being
opened.

---

## 1. `js/main.js` — the minimap feed (item 19)

**What is wrong without it:** a waypoint or a place you favourited with a star still does not appear
on the minimap. The minimap is fed `markers.tracked()`, and starring something does not track it —
two different checkboxes, only one of which ever reached the small map. That is item 19's report,
verbatim.

At **`js/main.js:8114`**, in the `else hud.drawMinimap(control, field.enemies, [ … ], …)` call, the
LAST argument is currently:

```js
      ].map(…), (scanner.on
        ? markers.here().filter(m => m.kind === 'seam')
        : markers.tracked()
      ).map(m => {
        const b = markers.bearing(m, control, terrain);
        return { ...m, x: b.x, z: b.z, distance: b.distance, label: scanner.on ? m.name : undefined };
      }));
```

Replace the marker list with:

```js
      ].map(…), (scanner.on
        // while the scanner is up the minimap is a prospecting minimap — R16's rule, unchanged
        ? markers.here().filter(m => m.kind === 'seam').map(m => {
          const b = markers.bearing(m, control, terrain);
          return { ...m, x: b.x, z: b.z, distance: b.distance, label: m.name };
        })
        /**
         * R17 item 19 — tracked OR favourited, minus anything switched off, plus the waypoint pads
         * you starred. `map.minimapMarkers()` is the one call: it knows that a favourite is a
         * different checkbox to a track and that a pad is not a marker, so hud.js does not have to.
         */
        : map.minimapMarkers(control)
      ));
```

`map.minimapMarkers(player)` returns rows in exactly the shape `hud.drawMinimap` already reads
(`{ kind, x, z, distance, name, starred, done?, label? }`), and every `kind` it can return has a row
in `MARKER_LOOKS`, including `waypoint`.

## 2. `js/hud.js` — draw the star on a favourite (item 19)

`drawMinimap`'s marker loop draws `look.icon` and nothing else, so a favourite arrives on the
minimap looking identical to anything else. In **`js/hud.js`**, inside `drawMinimap`'s
`for (const m of [...markers].sort(…))` loop, in the `if (inside)` branch, **before** the
`ctx.strokeText(look.icon, mx, my)` pair, add:

```js
        /**
         * R17 item 19 — "Waypoints favorited on the map with a star do not show a star on the
         * minimap." A gold ring around the glyph, which is the same way the big map draws a
         * favourite (js/map.js `drawMarkerDot`) — on the icon, never beside it.
         */
        if (m.starred) {
          ctx.beginPath();
          ctx.arc(mx, my, 8, 0, Math.PI * 2);
          ctx.lineWidth = 1.6;
          ctx.strokeStyle = '#ffd24a';
          ctx.stroke();
        }
```

No other change to hud.js. The marker rows already carry `starred` once §1 is applied.

## 3. `js/main.js` — hand the map the real waypoint book, and a save hook

Two small things, both optional in the sense that the map already works around them, and both worth
doing because the work-around is a `window.farhold` lookup.

In **`makeMap()` (`js/main.js:5022`)**:

```js
      // R17: the whole network, not a two-method view of it. The map stars pads, hides them and
      // feeds the starred ones to the minimap (js/waypoints.js `star`/`show`/`minimapPads`), and
      // with only { list, travel } it has to find the real book on window.farhold to do it.
      waypoints,
```

…replacing the current `waypoints: { list: …, travel: … }` object — **but keep the `travel`
behaviour**, which is real logic (the fighting/underground/fromId checks and the arrival). The
cleanest form is to spread:

```js
      waypoints: Object.assign(Object.create(waypoints), {
        travel: id => { /* the existing body, unchanged */ },
      }),
```

and, beside it:

```js
      /**
       * R17 — the map changes things the save carries (favourites, tracked deposits, the two
       * visibility switches, an outpost's name). Without this they are written at the next
       * autosave, which is fine but slower than it needs to be.
       */
      onChanged: () => autoSave(),
```

## 4. `js/main.js` — beacons in the world for `showInWorld` (item 19, the world half)

Item 19 asks for two switches, "show on the map" and "show in the game world". The map half is done
(`js/map.js` honours `showOnMap`, and so does the minimap once §1 lands). The world half needs a
consumer: whatever puts a marker beacon on the ground should read

```js
map.worldMarkers()      // markers with showInWorld !== false, plus the starred waypoint pads
```

rather than `markers.here()`. If nothing draws marker beacons in the world yet, the switch is
harmless and inert — it is saved, it is in the list, and it costs nothing until there is something
to switch off. Worth saying out loud rather than leaving as a surprise: **this is the one part of
this round's six items that has no visible effect until §4 is wired**, because the renderer it
belongs to does not exist yet.

---

## What was fixed without needing anybody else

| Item | Root cause |
|---|---|
| 8 | `readout.className = 'readout ' + tone` **replaced** the class list, dropping `.map-readout`'s `min-height: 18px` and its 12px monospace font on the first pointer move. The strip shares a column flex with the canvas, the canvas is `flex: 1`, and the map's SCALE is fitted to the canvas — so the strip growing took height out of the map and the whole planet redrew smaller, its left and right edges moving inward. That is the "sides shrink in" and the "shifts when you hover", both. Fixed in the JS, and `map17.css` turns the wrap into a grid with fixed legend and readout rows so nothing written into them can resize the map again. |
| 9 | The hit list was built in paint order (`marks` sorted smallest-last) and the hover took the **first** circle containing the pointer, so whatever was painted underneath won every overlap. Places and pads were two lists consulted in a fixed order. The marker branch destructured `{ scale, ox, oy }` from `viewBox()`, which returns `offsetX`/`offsetY` — every marker position was `NaN`, so a marker could never be hovered at all. And the hit radius was written in backing-buffer pixels, so a target was half-size on a retina screen. Now one list, nearest-centre wins, in `js/map-hits.js` (pure, node-tested). |
| 10 | `drawDetail()` drew the world underneath (rivers and roads included) and then painted the opaque region-detail raster over the lot. The ways were never removed, they were buried. They are re-drawn on top now, from the world's own roads/rivers **and** from each region detail's `streams`/`paths`, which are the same drainage model run six times finer and had never been drawn at all. |
| 11 | Two faults. The Find tab worked a row's favourite state out by rounding metres and looking the string up in a set built from marker cells multiplied back into metres — agreeing only by coincidence — and it was one-way, with no un-star anywhere. And `MarkerBook.save()` de-duplicated only against `kind === 'saved'`, so a deposit could carry a `seam` marker from the scanner and a `saved` marker from Keep, one cell apart: the "star icon to the top-left and a green circle to the bottom-right" is two markers, drawn with the star painted a marker and a half up and to the left of its own dot. |
| 19 | Covered above; the book half is done, §1–§2 and §4 are the consumers. |
| 20 | `js/outposts.js` knew what an outpost was and `js/markers.js` knew how to put something on a map, and nothing joined them — this project's signature fault, again. `syncOutpostMarkers()` makes the join, `locked` is enforced in `MarkerBook.remove()` rather than by hiding a button, and `renamed` stops the next sync writing the generated name back over the one you typed. |

## The new API surface, for whoever needs it next

```js
// js/markers.js — MarkerBook
book.show(marker, 'showOnMap' | 'showInWorld', on?)   // the two switches
book.onMap() / book.inWorld() / book.minimap()        // who draws what
book.canRemove(marker)                                // is there a × on this row?
book.remove(marker, { force })                        // force is for the code that owns the lock
book.rename(marker, name)
book.trackResource({ id, name, cellX, cellY, colour, note })
book.untrackResource(ref) / book.trackedResource(ref) / book.resourceTracks()

// js/waypoints.js
net.star(id, on?) / net.isStarred(id)
net.show(id, 'showOnMap' | 'showInWorld', on?) / net.shown(id, where)
net.minimapPads() / net.worldPads()

// js/outposts.js
syncOutpostMarkers(book, posts, { metresPerCell })
renameOutpostMarker(book, marker, name)

// js/map-hits.js
markHitRadius(mark, k, dpr) / pickHit(hits, x, y, want?)

// js/map.js — module exports
drawMarkerDot(ctx, marker, x, y, r)   // the combined icon, favourite rim and all
markSwatch(markKey, box) / markerSwatch(marker, box)
VIEW_CHIPS                            // the glyph + both titles for each switch

// js/map.js — the screen
map.minimapMarkers(player) / map.worldMarkers()
map.hits / map.hitAt(x, y, want?)     // what is drawn where, for a browser spec
```

## Persistence

Nothing needs `js/save.js`. Everything new rides a `toJSON()` that is already in `snapshot()`:

* markers, the two switches, `locked`, `renamed` and the tracked deposits → `markers.toJSON()`
  (`js/main.js:6269`);
* a pad's star and its two switches → `waypoints.toJSON()`, under a new `marks` key, storing only
  the pads the player actually touched.

Both loaders read an absent switch as **on**, so a save written before this round comes back with
every marker visible rather than every marker hidden.
