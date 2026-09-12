# Assets — shared art library

One place for the drawn art that more than one game in this playground needs: **scenery** (full-bleed SVG
backdrops that sit behind the 3D characters) and **map icons** (node markers for a world map). Everything
is a plain `.svg` file on disk, listed in `data/manifest.json`, loaded by `js/assets.js`.

Before this existed, each prototype kept its backdrops as one long inline SVG string inside `stage.js`, so
two games could not share a scene and nobody could look at the art without running the game. Now the art is
files, the games are code, and `assets/index.html` is a gallery that shows every scene and icon.

Gallery: `http://<LAN-IP>:8400/assets/`

## Layout

```
assets/
  index.html          gallery page (scenery grid, icon row, how-to-use)
  assets.css          gallery styles
  js/assets.js        the loader — the only file a game imports
  js/app.js           gallery page controller (window.assetsDemo for tests)
  data/manifest.json  the index: every scene and icon with its file and tags
  data/scenery/*.svg  one file per scene
  data/icons/*.svg    one file per map node type
  data/props/*.svg    reserved: standalone props to place in a scene (empty for now)
  tests/assets.test.js  node: manifest + files on disk + pure helpers
  tests/assets.spec.js  Playwright: the gallery renders, night switch, missing ids
```

## File rules

**Scenery** — a complete standalone svg:

```html
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">…</svg>
```

* `preserveAspectRatio="none"` so the scene stretches to whatever box it is dropped in (the stage is wide).
* Keep the **bottom third simple**. Characters stand there; busy art behind their feet reads as noise.
* No external references (no `<image href>`, no fonts). Gradients and filters are fine, but give every
  `id` a name unlikely to collide — two scenes can be in the page at once.
* Day scenes are drawn bright: the loader lays a dark wash over them when a game asks for night. A scene
  that is *drawn* dark (`camp`, `night`, `cosmic_rift`, …) is marked `"night": true` in the manifest so it
  does not get washed twice.

**Icons** — a small standalone svg drawn around the origin in a `-4 -4 8 8` box, so a map can scale it:

```html
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 8 8" width="16" height="16">…</svg>
```

## Manifest

```json
{
  "scenery": { "village": { "file": "scenery/village.svg", "tags": ["outdoor", "settlement", "day"] },
               "camp":    { "file": "scenery/camp.svg",    "tags": ["outdoor", "camp"], "night": true } },
  "icons":   { "combat":  { "file": "icons/combat.svg",    "tags": ["node", "fight"] } },
  "props":   {}
}
```

Tags are free-form, but the scenery ones follow a pattern: where it is (`indoor` / `outdoor` /
`underground` / `void`), the biome or kind (`forest`, `desert`, `volcanic`, `settlement`, `ruins`,
`water`, `mountain`, `camp`, `cosmic`…), and who uses it (`emberveil`, `party-quest`, act numbers
`act1`…`act6`). `listByTag()` is how a game picks a scene for a place it has no art for.

## API

```js
import { Assets, svgInner, svgRootAttrs, fallbackScene, NIGHT_OVERLAY } from '../assets/js/assets.js';

const assets = await Assets.open('../assets/');   // fetches data/manifest.json; never throws

assets.sceneryIds()                 // ['prologue', 'border_roads', …]
assets.iconTypes()                  // ['combat', 'ambush', …]
assets.sceneryInfo('cave')          // { file, tags, night? } or null
assets.isNightScene('camp')         // true — already drawn dark
assets.listByTag('forest')          // ['thornwood', 'forest', 'deepforest']
assets.listByTag('node', 'icons')   // icons carrying that tag
assets.tags()                       // every scenery tag, sorted

await assets.scenery('village', { fallback: 'road' })
// → { id, source, inner, attrs, missing }   inner = markup inside the root <svg>

await assets.sceneryElement('village', { night: true, fallback: 'road' })
// → an <svg> element, 100% × 100%, with the dark wash added if night was asked for

await assets.icon('combat')         // markup inside the icon file, '' if unknown
await assets.icons()                // { combat: '<path …>', … } — all of them at once
await assets.iconElement('boss', { size: 34 })   // an <svg> element

svgInner(text)                      // everything inside the root <svg>; works without a DOM
svgRootAttrs(text)                  // { viewBox, preserveAspectRatio, … }
fallbackScene('id')                 // the plain gradient used when art is missing
```

**Nothing throws and nothing blocks.** An id that is not in the manifest, or a file that has not been
drawn yet, falls back to the `fallback` scene you name and then to a plain sky-to-ground gradient; the
returned scene carries `missing: true` and the element gets `data-missing="1"` so a gallery can flag it.
Files are fetched once and cached per loader, so re-showing a scene costs nothing.

## Using it in a game

Both prototypes take their backdrops from here. `Stage` accepts a loader so a game shares one:

```js
import { Assets } from '../../../assets/js/assets.js';
const assets = await Assets.open('../../assets/');
const stage = new Stage(container, { assets });   // omit it and the stage opens its own
stage.setBackdrop('thornwood', game.isNight);     // async, but callers do not await it
```

`setBackdrop` returns a promise but is safe to call and forget: it tints the 3D ground immediately and
swaps the art in when it arrives, and if two calls overlap only the newest one paints.

Map icons (from `prototypes/emberveil/js/main.js`):

```js
const NODE_ICONS = await assets.icons();
const ICON_FALLBACK = '<circle r="2" fill="#cfd6e4"/>';   // if a fetch fails, still draw something
iconGroup.innerHTML = NODE_ICONS[type] || (assets.iconSpecs[type] ? ICON_FALLBACK : '');
```

## Adding a scene

1. Draw `data/scenery/<id>.svg` following the file rules above.
2. Add `"<id>": { "file": "scenery/<id>.svg", "tags": [...] }` to `data/manifest.json` (plus
   `"night": true` if it is drawn dark).
3. Reload `assets/` — it appears in the gallery. Run `node --test assets/tests/assets.test.js` to check
   the viewBox and the manifest.
4. Call it by id: `stage.setBackdrop('<id>')`.

Adding an icon is the same with `data/icons/<id>.svg` and the `icons` block.

## Who uses it

* `prototypes/emberveil/` — 13 zone backdrops and all 13 map node icons.
* `prototypes/party-quest/` — 13 location backdrops (village, forest, cave, marsh, camp…).

Built by Claude for Radley Sustaire, 2026-09-11.
