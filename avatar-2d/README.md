# Avatar 2D — SVG paper-doll character builder

Chibi-proportioned characters built from stacked SVG layers: head shape, hair (back + front), eyes, brows, nose, mouth, ears, facial hair, marks, top, bottom, shoes, accessory, hat. Body height/width and head size are sliders; face parts have Mii-style position/size/tilt sliders. Presets, seeded random (optionally within race rules), save in browser, export JSON/SVG/PNG. All parts are hand-authored SVG (no third-party art), recoloured through CSS variables.

Open: `http://<LAN-IP>:8400/avatar-2d/`. Renderer: `js/render.js`. Parts: `js/parts/*.js`. Random: `js/random.js`. Data: `data/presets.json`. UI: `js/app.js`.

## Quick use from a game

```js
import { renderSVG, renderInto, normalizeAvatar } from '/avatar-2d/js/render.js';
import { randomAvatar } from '/avatar-2d/js/random.js';
const DATA = await (await fetch('/avatar-2d/data/presets.json')).json();

const goblin = randomAvatar(DATA, { race: 'goblin', seed: 1234 });      // reproducible
const svgMarkup = renderSVG(goblin, { width: 150, height: 200 });       // string, no DOM needed (works in Node)
renderInto(document.querySelector('#portrait'), goblin);                // browser
```

`renderSVG` returns a self-contained `<svg viewBox="0 0 300 400">`; colours are CSS variables on the root element, so a game can also animate a recolour by changing `--skin`, `--hair`, `--top`… on the element. Options: `width`, `height`, `background`, `showAnchors`.

## The `avatar` section of the shared character JSON

```json
"avatar": {
  "body": { "height": 0.5, "width": 0.5, "headSize": 0.5, "skin": "#f1c27d" },   // 0..1, 0.5 = neutral
  "headShape": "round",
  "hair": { "id": "short", "color": "#3b2a1a" },
  "eyes": { "id": "round", "color": "#4a6b8a", "x": 0, "y": 0, "scale": 1, "rot": 0 },   // x = spacing -1..1, y -1..1, scale 0.5..1.6, rot degrees
  "brows": { "id": "straight", "y": 0, "rot": 0, "x": 0 },
  "nose": { "id": "small", "y": 0, "scale": 1 },
  "mouth": { "id": "smile", "y": 0, "scale": 1, "color": "#b5484d" },
  "ears": { "id": "normal" }, "facialHair": { "id": "none" },
  "top": { "id": "tshirt", "color": "#2e7d32", "color2": "#ffffff" },
  "bottom": { "id": "pants", "color": "#2f4f7f" }, "shoes": { "id": "sneakers", "color": "#e8e8e8" },
  "accessory": { "id": "none", "color": "#333333" }, "hat": { "id": "none", "color": "#5a3d8a" }, "extras": { "id": "none", "color": "#8a2e2e" },
  "cape": { "id": "none", "color": "#3a4a8a" }, "held": { "id": "none", "color": "#9a9aa8" }, "offhand": { "id": "none", "color": "#8a7a5a" },
  "decor": { "id": "none", "color": "#6a4a2a" }
}
```
`normalizeAvatar()` fills missing fields from `DEFAULT_AVATAR` and replaces unknown part ids with defaults, so old or partial JSON never crashes. The same JSON is read by **Avatar 3D** (it maps ids to its own meshes/face drawing).

### Part ids (catalog)
| Slot | Ids |
|---|---|
| headShape | round, oval, square, heart, long, wide, chiseled |
| hair | bald, buzz, short, side_part, bangs, bob, long, wavy, ponytail, bun, buns, mohawk, spiky, curly, afro, braids, pixie, slicked, hood_hair (shaggy), tonsure, horns_hair |
| eyes | round, almond, narrow, wide, sleepy, angry, dot, anime, happy, wink, hollow, slit, tired |
| brows | straight, arched, angry, worried, thick, thin, none, raised |
| nose | small, dot, button, long, wide, hook, upturned, none, snout |
| mouth | smile, neutral, frown, open, grin, smirk, o, tongue, fangs, sad_open, stitched, tusks |
| ears | normal, pointed, big, none, fins |
| facialHair | none, stubble, goatee, mustache, full, long, chinstrap, soul_patch |
| top | tshirt, tunic, hoodie, vest, tank, plate, leather, robe, dress, coat, rags, chainmail, apron |
| bottom | pants, shorts, skirt, kilt, ragged, greaves, loincloth, baggy |
| shoes | sneakers, boots, heavy, sandals, barefoot, slippers, pointed, hooves |
| accessory | none, glasses, round_glasses, monocle, eyepatch, mask, scarf_mask, goggles, earrings, nose_ring, blindfold, sunglasses |
| hat | none, wizard, hood, helmet, crown, cap, bandana, headband, straw, horned_helm, circlet, top_hat, flower |
| extras | none, freckles, blush, scar, scar_cheek, warpaint, tattoo, dirt, undead_skin, third_eye, wrinkles (+ Emberveil marks in `gear.js`) |
| cape, held, offhand | see `js/parts/gear.js` (capes, right-hand weapons and foci, left-hand shields and items) |
| decor | none, pauldrons, tabard, knife_rig, scroll_case, belt_lantern, bone_charms, rune_bracers, chained_tome, herb_satchel, rune_halo, prayer_ribbons, ember_censer, storm_rods, gear_pack, bead_necklace |

`catalogSummary()` in `js/parts/index.js` returns this list programmatically.

## How the drawing works (for adding parts)

- Canvas `viewBox 0 0 300 400`. **Anchors**: feet y=380, hip y=290, neck y=215, head center (150,135) radius 72 (top y=63, sides x=78/222). Left leg x=132, right x=168, leg width 30. Arms from (104,228) to hands at (88,290)/(212,290).
- **Layer order** (back → front, `LAYERS` in `parts/index.js`): decorBack, hairBack, hatBack, capeBack, arms, legs, shoes, bottom, body, top, skirtOver, sleeves, capeFront, decor, headShape, ears, extras, eyes, brows, nose, mouth, facialHair, hairFront, accessory, hat, hatFront, offhand, held.
- **Decorations** (`js/parts/decor.js`, slot `decor`, colour `--decor` / `--decor-dark`): one extra piece of class gear that changes the silhouette. Pieces draw in the torso group by default; `knife_rig` and the tabard skirt use the legs group, `rune_halo` the head group on `decorBack`, and back-worn items (`scroll_case`, `storm_rods`, `gear_pack`) put their body on `capeBack` with straps on `decor`. Every id has a matching Chibi 2 model in `avatar-3d/js/chibi2-gear.js` (`buildDecor`), and each Emberveil class wears one (`prototypes/emberveil/data/class-looks.json`).
- **Body groups**: `legs` (scaled about the feet by height and width), `torso` (translated to the hip, scaled by width and a little by height), `head` (translated to the neck, scaled by headSize only). A part piece can choose its group: long garments (robe, dress, coat) have an upper piece in the torso group and a `skirtOver` piece in the legs group so both stretch correctly.
- **Part format**: `{ name, tags?, pieces: [{ layer, svg, group? }] }`. Face parts (eyes, brows, nose, mouth) are `{ name, svg }` drawn around (0,0); the renderer places and mirrors them (draw the LEFT eye/brow; `right` can override the mirrored copy, used by `wink`). Colours: `var(--skin) --skin-dark --hair --hair-dark --eye --mouth --top --top2 --top-dark --bottom --bottom-dark --shoes --shoes-dark --acc --hat --extra`.
- To add a part: append to the matching catalog in `js/parts/*.js`. Run `node --test avatar-2d/tests/*.test.js`, which renders every part and checks layers. Use the demo's **Part gallery** to eyeball a whole slot at once.

## Random generation
`randomAvatar(DATA, { race, seed, base, only })` picks parts allowed by `DATA.raceRules[race]` (skin tones, ears, hair, mouths, body ranges…) and colours from `DATA.palettes`. `only` = `'face' | 'outfit' | 'body'` re-rolls just that group starting from `base`. Race rules included: human, elf, dwarf, orc, goblin, undead, beast. Games add their own races by extending `raceRules`.

## Demo features
Slot rows with prev/next + dropdown + colour swatch; palettes for skin/hair/eyes/cloth; body and face sliders; presets (15, rendered as thumbnails); random with race filter and seed; part gallery; PNG/SVG export; character JSON copy/export/import/apply; save to browser; catalog table. State persists in localStorage (`playground:avatar-2d:v1`).

## Tests
`node --test avatar-2d/tests/*.test.js` (all parts render, presets valid, fallbacks, body metrics, seeded random/race rules). `npm test -- avatar-2d` (Playwright: load, randomize, preset, JSON round-trip, slot cycling, gallery count) and saves `test-results/avatar-2d-wizard.png`.

## Known limits / ideas
- Front view only. A side/back view would need a second set of pieces per part (same JSON).
- No animation; the SVG groups (`data-layer`, `data-slot`) are stable hooks for CSS/JS animation (e.g. bob the `head` group for talking).
- Some hats do not hide long hair perfectly; hats draw above hairFront, hair back stays visible, which is usually what you want.
