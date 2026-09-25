# Assets — shared art library

One place for the drawn art that more than one game in this playground needs: **scenery** (full-bleed SVG
backdrops that sit behind the 3D characters), **map icons** (node markers for a world map) and **fx sprites**
(64×64 particles a 3D effects layer draws as billboards). Everything is a plain `.svg` file on disk, listed
in `data/manifest.json`, loaded by `js/assets.js`.

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
  data/fx/*.svg       one file per particle sprite (spell effects, status glyphs)
  data/props/*.svg    reserved: standalone props to place in a scene (empty for now)
  data/ui/*.svg       interface art: frames, ornaments, HUD/tab/slot/stat icons, rarity gems
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

## Interface art (`data/ui/`)

The themed-interface set, indexed under `ui` in the manifest and used by `prototypes/emberveil`:

- **Ornaments** — `emblem` (128×128 sigil), `frame_corner` (64×64 gold flourish drawn for the top-left;
  rotate 90/180/270 for the others), `divider` (400×24, `preserveAspectRatio="none"` so it stretches to
  any heading width), `button_end` (32×64 bracket for the ends of a button), `title_banner` (800×300
  ember skyline, meant to be sliced/covered), `panel_tile` (64×64 seamless dark leather, tiled),
  `ember_particle`.
- **Icons** — HUD/status (`gold fame day night ration torch tent boot wagon hp mp xp`) in full colour;
  tabs (`tab_party tab_bag tab_skills tab_quests tab_meter tab_journal tab_map tab_settings`),
  equipment slots (`slot_weapon slot_offhand slot_head slot_chest slot_hands slot_legs slot_feet
  slot_ring slot_necklace`) and attributes (`stat_str stat_dex stat_int stat_con`) drawn in
  `currentColor`; rarity gems (`rarity_common uncommon rare epic legendary unique set`).
- **How to use them** — full-colour art as a background: `background-image: url(../../assets/data/ui/gold.svg)`.
  `currentColor` art as a mask so it takes the surrounding text colour:
  `background-color: currentColor; mask-image: url(…/tab_party.svg); mask-size: contain;`.
  A game maps its own rarity ladder onto the gems by colour, not by name (Emberveil's magic → the blue
  `rarity_rare` gem, its rare → the gold `rarity_unique` one).

## Manifest

```json
{
  "scenery": { "village": { "file": "scenery/village.svg", "tags": ["outdoor", "settlement", "day"] },
               "camp":    { "file": "scenery/camp.svg",    "tags": ["outdoor", "camp"], "night": true } },
  "icons":   { "combat":  { "file": "icons/combat.svg",    "tags": ["node", "fight"] } },
  "fx":      { "flame":   { "file": "fx/flame.svg",       "tags": ["fire", "burn", "particle", "projectile"] } },
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

## Particle sprites (`data/fx/`)

35 small sprites for combat effects, drawn on a transparent `0 0 64 64` canvas so they can be rasterized
to a texture and drawn with additive blending. They are the art half of
[`avatar-3d/js/spellfx.js`](../avatar-3d/README.md#spell-effects--jsspellfxjs-demo-spellfxhtml) — the
projectile trails, impact bursts and looping status auras in Emberveil and Party Quest.

| Group | Sprites |
|---|---|
| fire | `flame`, `ember`, `smoke` |
| ice | `ice_shard`, `snowflake`, `frost_ring` |
| shadow / arcane | `skull`, `wisp`, `shadow_claw`, `arcane_rune`, `arcane_shard` |
| holy / nature | `holy_rune`, `holy_mote`, `feather`, `leaf`, `thorn`, `root_vine` |
| physical / lightning | `slash`, `spark`, `bolt`, `crack`, `chain` |
| fluids | `bubble`, `drop` |
| status glyphs | `star_daze`, `zzz`, `question`, `eye_closed`, `arrow_down`, `arrow_up`, `target`, `mute`, `shield_ring` |
| neutral | `ring`, `glow` |

Rules for a new one: transparent background (no backing rect), `viewBox="0 0 64 64"`, the shape roughly
centred and filling most of the box, its own colour baked in (the effects layer tints with white by
default), and no text. Dark sprites (`smoke`, `shadow_claw`, `skull`) are drawn with normal blending by the
effects layer, since additive would make them invisible.

Reading them:

```js
const tex    = await assets.fxTexture('flame', THREE);        // cached THREE.CanvasTexture, 128×128
const all    = await assets.fxTextures(THREE);                // { flame: CanvasTexture, … } for the whole set
const canvas = await assets.fxCanvas('flame', { size: 256 }); // the raw canvas, no Three.js needed
assets.fxIds(); assets.fxInfo('flame'); assets.listByTag('status', 'fx');
```

Three.js is passed in as an argument so `js/assets.js` stays free of a 3D dependency. Nothing throws: an
unknown id or an unreadable file gives a soft white diamond (`fallbackSprite`) instead of a blank texture.

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

## Space models (`js/space-models.js`)

The one part of this library that is **code, not files**: procedural Three.js objects for everything
that happens off a planet's surface. Nothing to download, no licences to track — it is all primitives
and canvas textures built at runtime. Gallery at **`assets/models.html`**.

Every builder returns the same shape as the creature models in `avatar-3d/`:

```js
{ group, update(dt, t), dispose(), ...extras }
```

| Id (manifest) | Builder | What it makes |
|---|---|---|
| `planet` | `createPlanet(planet, opts)` | Textured sphere, atmosphere rim (a fresnel shell), a cloud deck turning faster than the ground, rings as a textured annulus, moons on tilted orbits, and night lights that only show on the dark side. |
| `star` | `createStar(star, opts)` | Emissive core, soft shell, corona sprite and a `PointLight`, coloured by class. Binary pairs get a companion on an orbit, neutron stars a pulse and jets, black holes a black core with an accretion disc. |
| `asteroid_belt` | `createAsteroidBelt(opts)` | A few hundred instanced rocks in a flat annulus (`inner`, `outer`, `count`, `seed`). |
| `satellite` | `createSatellite()` | Box bus, gold foil, two solar wings, a dish and a blinking light. |
| `probe` | `createProbe()` | Octahedral core, dish on a mast, three legs with pods, a thruster plume. |
| `rocket` | `createRocket()` | Stages, bands, fins, an engine bell and a flame that flickers. |
| `ship_lander` | `createShip('lander')` | Squat hull, glass cockpit, four legs, a landing thruster. |
| `ship_hauler` | `createShip('hauler')` | A spine with containers clamped to it and twin engines. |
| `ship_explorer` | `createShip('explorer')` | Capsule fuselage, swept wings, canopy, two engine glows. |
| `station` | `createStation()` | A spinning habitat ring with lit windows, a hub, docking clamps and solar wings. |
| `space_backdrop` | `createSpaceBackdrop(opts)` | A sphere of coloured star points plus soft nebula sprites. |

Plus `createSpaceScene(container, opts)` — the same interface as `avatar-3d/js/scene.js` but set up
for space (black background, one star-coloured key light, no ground) — and `glowSprite()` and
`proceduralPlanetTexture()` if you want to build your own.

```js
import { createSpaceScene, createPlanet, createStar } from '../assets/js/space-models.js';

const view = createSpaceScene(container);
const star = createStar(starRecord, { radius: 1.2 });
view.scene.add(star.group); view.addTicker(star.update);

// with a real surface map (needs the universe library)
import { generatePlanetMap } from '../universe/js/planetmap.js';
import { planetTexture } from '../universe/js/texture.js';
const world = generatePlanetMap(planet);
const globe = createPlanet(planet, { texture: planetTexture(planet, world, { size: 1024 }), radius: 1 });
view.scene.add(globe.group); view.addTicker(globe.update);
globe.setSunDirection(26, 6, 14);     // which half is night
```

Hand `createPlanet` no texture and it builds a blotchy one from the archetype's colours, so the
library still works on its own. The `models` block in `data/manifest.json` lists every builder with
its tags; `assets.modelIds()` and `assets.modelInfo(id)` read it, and `listByTag(tag, 'models')`
searches it like any other section.

## Who uses it

* `prototypes/emberveil/` — 13 zone backdrops and all 13 map node icons.
* `prototypes/party-quest/` — 13 location backdrops (village, forest, cave, marsh, camp…).
* `universe/` — every space model: planets, stars, belts and the backdrop.

Built by Claude for Radley Sustaire, 2026-09-11 (space models 2026-09-13).
