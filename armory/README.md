# Armory

**The one place to review every wearable and holdable Chibi 2 model** — swords, daggers, wands, staves, shields,
foci, helms, chest pieces, gloves, capes, belts and the rest. Open `armory/` (dev: `http://<LAN-IP>:8401/armory/`).

Built 2026-10-06 (owner play-test 5, T24 / T22 / T23): *"It should be easier for me to go review all swords,
daggers, wands, etc and see their file name, model details, 3d preview, icon preview."*

## What you see

| Part | What it shows |
|---|---|
| **Grid** | One card per model: a picture, the name, the part id, type and triangle count. Filters on the left: kind, slot, weapon type, archetype, which game uses it, hands, **New this round**, **Flagged**, plus a search box that reads ids, names, file names and item bases. Each filter group counts what the *other* filters leave, so a chip never promises rows it cannot show. |
| **Detail** | Click a card. A Chibi 2 body wearing the piece in a viewer you can orbit (drag / scroll / right-drag). |
| **Hand** | Main hand / Off hand / Both hands for any weapon — including two two-handers. This is where a grip that is wrong in one hand gets seen. |
| **Animation** | Every clip the motion module has (`CHIBI2_EVERY_ANIMS` and any list it exports later), grouped; Replay, Next attack, repeat, and speed down to slowest / paused. |
| **Body** | Race (all nine), height, build, hair; weapon quality 0–3 (the gems and ferrules a rarity adds). |
| **View** | Whole body, This piece, Right hand, Left hand, Side, Back; **Piece alone** (the body hidden), **Wireframe**, Turntable. |
| **How it is held** | Per hand: the bone that carries it, its long axis in that bone's space, its length, where the palm sits along it, how far the palm is from the handle, and the **live angle to the forearm** while a clip plays. Red cells and a plain-language note when the long axis is across the fist or the handle misses the palm; with both hands on, it says whether the two hands hold it the same way. |
| **Model details** | Part id and the avatar field it goes in, **source file and builder**, kind / slot / type / archetype / hands, **triangles** (split cloth / metal), vertices, **draw calls added** (normally none), materials and colours, **size in metres**, the bones it is skinned to, the whole body's triangle count with and without it, and the **grip offset**. |
| **Games and items** | Which games draw the model and the in-game item bases mapped to it, with names from the shared item file (`prototypes/emberveil/data/items.json`, read-only). |
| **Icon** | The bag icon **as Thousandvale draws it**: the page imports `prototypes/thousandvale/js/client/ui/item-icons.js` unchanged and asks it for the mapped item's icon, at 96 px and 48 px. It also names the model the icon used and warns when that is not the model the character wears. A model with no mapped item (or a page where that module cannot load) gets the Armory's own picture in the same framing, and the text says so. |
| **Flag** | A note per model ("blade too thick", "sideways in the off hand"). Kept in this browser (`shared/store.js`, namespace `armory`). **Export flags** downloads `armory-flags.json`; **Copy flags** puts the same JSON on the clipboard to paste to Claude. |

Keys: left / right arrow step through the filtered list, Esc closes the detail.

## Deep links

Everything is in the address, so a link reopens exactly what you were looking at:

```
armory/#id=fh_daggers&hand=both&anim=flurry&race=dwarf&speed=0.25     one model, both hands, slow flurry
armory/#kind=weapon&type=dagger                                       every dagger
armory/#new=1                                                          this round's models
armory/#flagged=1                                                      what you flagged
```

`id` is the part id (or the page key `slot:id` when the same id exists under two slots, e.g. `offhand:fh_sword`).
View keys: `hand` (main|off|both), `anim`, `race`, `height` (short|medium|tall), `build` (slim|medium|broad),
`hair` (none|short|long), `quality` (0–3), `speed` (1|0.5|0.25|0.15|0), `alone=1`, `wire=1`. Filter keys: `q`,
`kind`, `slot`, `type`, `archetype`, `game`, `hands`, `new=1`, `flagged=1`, `sort` (slot|name|file|new).

## Where the rows come from

`js/source.js` reads **the gear catalog** — `avatar-3d/data/gear-catalog.json` through
`avatar-3d/js/gear-catalog.js` (`loadGearCatalog()`, `lookFor(row, opts)`). One row per model:
`{ id, kind, slot, field, gameSlot, type, archetype, hands, file, builder, name, element, form, tags, color,
color2, new, round, games, items }`. **Adding a model to the catalog adds it to this page; nothing here lists
models by hand.**

A row that rides a *field* of a slot (gloves on `top.gloves`, a ring on `accessory.ring`) is merged into that
slot rather than replacing it (`dress()` in `js/model.js`).

## How the numbers are measured (and why they cannot go stale)

Chibi 2 gear is not a separate object: every builder adds skinned pieces into the body's two merged meshes
(cloth, metal), which is why gear never costs a draw call — and why there is no object to ask "how many
triangles is this sword". So the Armory **builds the same body with and without the piece and keeps what is
new** (`extractAdded` in `avatar-3d/js/preview-kit.js`). That measures what a game really draws, and it reads
the real builders every time, so a changed model changes its numbers with no file to regenerate.

* A piece that replaces clothing (a chest piece replaces the shirt) is compared with *different* plain clothes,
  so its own cloth is what is counted; **headwear is measured on a bald head**, because a hat changes how the
  hair under it is cut and that hair is not part of the hat (`baselineFor`).
* Size is the bounding box in the rest pose (arms hanging, hand space = world axes), in the same units the
  games use as metres. A body is about 1.2 m tall.
* **Grip** is measured in the carrying bone's own space (`holdOf`): the palm is the origin of a grip bone and a
  handle should run along `y`. "Palm to handle" averages the model's vertices within 6 cm of the palm along its
  length — not the middle of the bounding box, which an axe head or a crossguard pulls sideways.
* A card that says **draws nothing** means building a body with that id added no geometry: the id is
  registered but has no model, or it only draws on some bodies. That is a finding, not a page error.

## Files

| File | What it is |
|---|---|
| `index.html`, `armory.css` | The page. Desktop: filters, grid, detail side by side. Under 1100 px the detail is a full-screen sheet; under 760 px the filters fold behind a button. |
| `js/model.js` | **Pure** (no three.js, no DOM): `prepareRows`, `facets`, `filterRows`, `SORTS`, `parseHash` / `formatHash`, `mannequin`, `baselineFor`, `handModes`, `dress`, `itemRows`, `iconItem`, `exportFlags`. |
| `js/source.js` | Loads the gear catalog and hands back `{ rows, lookFor, origin, note }`. |
| `js/app.js` | The page: filters, the thumbnail grid, the detail viewer, hold readout, icon, flags. `window.armory` (`state`, `thumbs`, `live`, `actor`, `select(key)`, `exportFlags()`) is there for tests. |
| `../avatar-3d/js/preview-kit.js` | **Shared viewer helper** (new, opt-in; any page may use it): `createScene` (re-exported from `scene.js`), `createThumbnailer`, `vertexKeys`, `extractAdded`, `holdOf`, `staticModel`, `frameBox`, `poseForPicture`, `characterStats`. |
| `tests/armory.test.js` | Node: rows, filters, links, looks, baselines, item rows, flag export. |
| `tests/armory.spec.js` | Playwright: opens, filters, thumbnails are real pictures, a deep link opens both hands + an attack clip and the preview is not blank, flags persist and export, phone width. |

## 2026-10-21 owner review

* **Auto adjust camera** (checkbox under View, on by default, remembered per browser in `localStorage['armory.autoCam']`):
  opening an item or switching hands frames it with `setCamera('auto')` — a held item from the side of the hand that holds
  it at an angle, the box of the item and the body together, 1.2x further out for a two-hander; headwear close on the
  head; capes from behind; shoes low. Untick it to keep the camera where you left it.
* **Builds Chibi 2.5** (`{ v25: true }`), like Thousandvale, so the faces and hair match the game.
* **Two-handers are main-hand only**: `handModes(row)` returns `['main']` for a held row with `hands: 2` (bows,
  crossbows, staves, greatswords…), so Off hand / Both hands are disabled for them (a test walks every such row).

## Thumbnails without freezing the page

`createThumbnailer({ size })` owns **one** WebGL context for every picture on the page. A card asks for its
picture only when it scrolls into view (and cancels when it scrolls away before its turn); jobs run one at a
time with the frame handed back between them; a finished picture is kept as an image URL under its key, so
scrolling back, changing a filter or opening the detail never renders it twice. Weapons and off-hand items are
drawn alone, turned so the thin side faces the camera and the business end points up-right; armour is drawn
on the body, framed on the piece.

```js
import { createThumbnailer, frameBox } from '../avatar-3d/js/preview-kit.js';
const thumbs = createThumbnailer({ size: 192 });
img.src = await thumbs.request('some-key', async stage => {
  stage.scene.add(thing); frameBox(stage.camera, box);
  return () => stage.scene.remove(thing);      // cleanup after the picture is taken
});
```

## Reusing the measurement in a tool or a test

```js
import { createChibi2Character } from '../avatar-3d/js/chibi2.js';
import { vertexKeys, extractAdded, holdOf } from '../avatar-3d/js/preview-kit.js';
const bare = await createChibi2Character(body), keys = vertexKeys(bare);
const armed = await createChibi2Character({ ...body, held: { id: 'fh_sword', color: '#b9c2cc' } });
const piece = extractAdded(armed, keys);        // { triangles, vertices, byBucket, size, bones, colours, parts }
const grip = holdOf(piece, armed, 'gripR');     // { axis, length, palmAlong, offAxis, palmOnItem, head, butt }
```

## Known limits

* The triangle count of a chest / legs / feet piece is "what differs from plain clothes", so a piece shaped
  exactly like the plain shirt in the same colour would read low. None is today.
* The icon block shows the icon for a *plain* (normal rarity) item of the first mapped base; rarity tints are
  the game's business.
* Flags live in one browser. Export them before clearing site data.
* Emberveil's bestiary looks and Bannerline's units are characters, not gear, and are not listed here.
