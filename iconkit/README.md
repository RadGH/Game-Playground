# Icon Kit

**Status:** prototype, round 2 (2026-11-27). Painted: gold frames, stone plates, 8 glyphs and 2 glows from round 1. Round 2 adds the frame choice (gold, thin, hairline, none, eight class-themed frames), states (passive, active, channeling, no mana, out of range, dispel rings), modes (cooldown + seconds, cast bar, stacks, duration), and the Compare and Status tabs. The round-2 Codex frames and glyphs are imported when they arrive (see Art pipeline). No game uses the kit yet. Oathwild is the first candidate. **Play:** `iconkit/` on the playground (8401 dev / 8400 stable). **Next:** paint the glyphs the Glyph matrix lists (most-used first), then wire Oathwild's `spellIcon` to `iconFor` once the owner approves the look. **Parked:** a second frame style (iron / silver), animated cooldown in the canvas renderer.

Layered spell and ability icons, in the style of early-2000s RTS spell buttons, that any game can use. The owner asked for this on 2026-11-27: "spell icons like warcraft 3 style, but with customizable icon backgrounds … a subtle color and background change based on the class … a consistent border overlay, square or circular options, with glow, glyph, background layers", plus a tool to review every icon in the games.

## The layer model

Every layer is a square picture on the **same canvas with the same centre**, so stacking needs no offsets. From bottom to top:

| # | Layer | Art | Coloured by |
|---|---|---|---|
| 2 | **Plate** (background) | grey cracked slate, circle or square | the **class** (`themes.json` `classes[].tint`), with the `color` blend at `strength` |
| 4 | **Glow** (optional) | white soft light | the spell's **element** (`elements[].glow`) |
| 3 | **Glyph** | painted symbol; *tintable* glyphs are light grey | painted: none. Tintable: the element (`glyphTint`, `multiply` blend) |
| 1 | **Frame** | antique gold ring with 8 studs, or a square | none: the same on every icon |

The glow and glyph sit in one box **cut to the plate's shape**, so a big painted glyph never runs under the frame. Painted glyphs also carry a measured per-shape `fit` (a scale) that keeps their art inside about 78% of a circle's opening and 80% of a square's. Drawn stand-in glyphs shown in a painted frame shrink by `inner / placeholderInner`. A warrior's Fireball and a mage's Fireball share the glyph but differ in the stone's colour. A mage's Fireball and Frost Shard share the stone but differ in glow.

## Frames (round 2)

`spec.frame` is one of: `'gold'` (studded, painted), `'thin'`, `'hairline'`, `'none'`, `'class'` (the class's themed frame, from `themes.json` `classes[].frame`, using `spec.cls`), or a themed frame id (`warrior`, `mage`, `rogue`, `cleric`, `ranger`, `druid`, `warlock`, `paladin`).

- Thin and hairline have a painted gold version once imported. The drawn line version takes any colour: `frameColor: '#hex'` or `'class'` (the class glow colour). With no colour set, the painted one is used.
- Each frame has a measured opening (`inner`). The plate is scaled to tuck just under it, so with a hairline frame or none the stone fills almost the whole button. The glyph grows with the opening: painted glyphs by `fit × inner / glyphRef`, drawn ones by `inner / 0.395`.
- Every themed frame falls back to the drawn gold frame until its painting is imported.
- The import script measures each painted thin / hairline ring (thin 2–5% of the width, hairline 0.6–2%) and skips one that is not what its name says. Round 2's paintings: the thin circle is a real thin (2.8%). Thin square (6.5%), hairline circle (9.1%, ornamental, four points) and hairline square (6.1%) were not. The two "hairline" paintings became the **Gold filigree** frame; thin square and both hairlines use the drawn line until repainted.

## States and modes (round 2)

| Spec | Look | HTML | Canvas |
|---|---|---|---|
| `state: 'passive'` + `passiveStyle: 'dim'` (recommended) / `'socket'` | no glow; dim = greyed metal and muted stone; socket = sunk into a dark ring | yes | yes |
| `state: 'active'` | steady warm inner glow + gold edge, frame brighter | yes | yes |
| `state: 'channeling'` | the active glow pulsing + a light running round the frame metal (CSS `@property` angle; no motion with reduced motion) | animated | drawn as active |
| `state: 'nomana'` / `'norange'` | blue / red wash over the face | yes | yes |
| `state: 'disabled'` / `'selected'` | grey and dark / bright frame + halo | yes | yes |
| `dispel: 'magic'…'enrage'` | coloured inner ring (`themes.json` `dispel`) | yes | yes |
| `mode.cooldown` 0..1 + `mode.seconds` | dark clockwise sweep + big centred number (`timeText`: tenths under 3 s, minutes from 60) | yes | yes |
| `mode.cast` 0..1, `castStyle: 'bottom'` / `'face'` | a bar filling left to right along the bottom of the opening / a warm light sweeping across the face | yes | yes |
| `mode.stacks` + `mode.maxStacks` | number in a badge bottom right; gold and glowing when full | yes | yes |
| `mode.duration` (seconds or text) | time left under the icon (leave ~1.2em of room below) | yes | left out |

Animate by changing the spec and re-rendering (the Status tab redraws 16 icons ten times a second). Channeling animates by itself in CSS. For an action bar, compose the base picture once with `iconDataUrl` and draw the moving parts (cooldown, cast) as HTML over it, so the cache does not fill with every frame.

## How a game uses it

```js
import { loadKit } from '../../iconkit/js/iconkit.js';   // + <link rel="stylesheet" href="…/iconkit/css/iconkit.css">
const kit = await loadKit();

const { spec, match, fallback } = kit.iconFor(spellRow, 'mage');   // a Farhold / Thousandvale / Oathwild spell row
el.innerHTML = kit.iconHtml({ ...spec, size: 44, state: 'cooldown', cd: 0.4 }, { label: spellRow.name });
img.src = await kit.iconDataUrl({ ...spec, size: 44 }, { scale: devicePixelRatio });  // one picture per action-bar button
kit.themeFor('warrior');   // { tint, glow, glyph, strength, … }; aliases: ice→frost, fighter→warrior…
kit.specKey(spec);         // stable cache key
```

- **spec**: `{ shape: 'circle'|'square', glyph, plate, tint, strength, glow (id|null), glowColor, glyphTint, frame, size, state: 'ready'|'cooldown'|'disabled'|'selected', cd, art: 'best'|'placeholder' }`. `normalize()` repairs anything missing or unknown.
- **iconFor** scores every glyph against the spell's name words (`tags`), its element and its kind (`mechanicOf`: strike, bolt, nova, area, beam, leap, dash, buff, heal, ward, summon, dot, form). `match` says how sure the pick is: `named` (a tag word in the name), `exact` (element + kind), `mechanic` (a tintable generic glyph in the element colour), `element` (only the element), or `class` (the class emblem). The last three set `fallback: true`. A name word that only says the element ("Fire Storm") counts as `element`.
- **iconHtml** stacks the layers as `<span>`/`<img>` with CSS variables. Tinting is pure CSS: a colour layer masked by the picture, blended with `mix-blend-mode` (`color` on the plate, `multiply` on a tintable glyph). It works in Chrome, Firefox and iOS Safari 15.4+. The box is `flex: none` with a fixed width and height, so a row never squeezes it (lessons rule 85).
- **iconCanvas / iconDataUrl** compose the same layers on a canvas (same blends: `color`, `multiply`, `saturation` for disabled), cached by `specKey`. They look the same as the HTML version (checked side by side on the Builder tab).
- Everything except the three renderers is pure and runs under Node.

## Files

- `js/iconkit.js`: the kit. `css/iconkit.css`: the stacked icon (games import it). `js/review.js` + `css/review.css` + `index.html`: the review page.
- `data/themes.json`: class and element colours, fallback glyphs, the class's themed frame, dispel ring colours, element name words, aliases.
- `data/glyphs.json`: glyph rows `{ id, name, file, small, placeholder, element, mechanic, tintable, tags, fit }` plus the element and mechanic lists.
- `data/layers.json`: frames (with the measured opening `inner`), plates, glows, element → glow, defaults.
- `layers/codex/*.webp`: painted layers, 256 px + 64 px (the 64 is used for icons up to 48 device px). `layers/placeholder/*.svg`: the drawn fallback set (`tools/make-placeholders.mjs`).

## Art pipeline

1. Write the prompt in `tools/prompts/NN-name.txt` (the first batch is `01-first-test-layers.txt`). Contract: 1024², transparent PNG (or a #FF00FF background), subject centred, frames and plates on the same canvas, plates and glows in neutral grey or white.
2. Codex paints them into a folder (art only: Codex is not used for code).
3. `python3 -I iconkit/tools/import-layers.py <folder>` (frames are `frame-<shape>.png` for gold and `frame-<id>-<shape>.png` for every other frame in `layers.json`; glyphs are `glyph-<id>.png` for any row in `glyphs.json`): keys out magenta if needed, moves each picture's visible art to the exact centre (the first batch was 2–25 px off), scales frames to 96% and measures their opening, sizes plates to sit just under it, measures each glyph's `fit`, writes the WebPs and updates `glyphs.json` / `layers.json`.
4. Open the Builder and Class sheet, and check the centring hairlines at 24/40/64/128.
5. The **Glyph matrix** tab lists the element × kind pairs Oathwild uses that have no painted glyph, most-used first. That list is the next batch.

A painted generic glyph has a fixed colour (`artElement`, e.g. the nova is frost-blue). A spell of another element gets the drawn, tintable version instead (`glyphArt: 'drawn'`), so a fire nova never shows blue.

The swirl glow (painted) reads as a white smoke squiggle, so it is optional and off by default (owner's lead, 2026-11-27).

## Review page tabs

- **Builder**: class, element, shape, frame (with line colour), glyph, plate, custom colours, tint strength, glow, state, passive look, dispel ring, and sliders for cooldown, seconds, cast, stacks and duration. An Animate switch plays a cooldown / cast / stacks / duration loop. It shows the 4 layers and the final icon, every size as HTML and as a canvas picture with centring hairlines, every state, both passive looks, every dispel ring, every mode, and the spec.
- **Compare**: for each class (or one), the class's four most-used glyphs in Oathwild × seven frame rows (gold studded, thin gold, thin in class colour, hairline gold, hairline in class colour, none, class themed), at 40 or 64 px, circle or square. Tap an icon to open it in the Builder.
- **Status**: a mock 8-slot action bar (ready, cooldown with seconds, casting with a cast bar, channeling, toggled on, no mana, out of range with stacks, passive) and a buff/debuff bar (dispel rings, stacks, time left), ticking live, sized to fit a 360 px phone.
- **Class sheet**: every glyph in each of the 27 Oathwild classes' colours.
- **In game: Oathwild**: every spell on every class tree, its current icon (`spellIcon` from Oathwild's own `icons.js`) beside the kit icon, with match counts, a class filter, search, and "only fallbacks". Read-only: it imports Oathwild's `rules/data.js`, `rules/spells.js` and `client/ui/icons.js`. Those files plus `data/spells.json` and `data/classes.json` are in Thousandvale's `ALLOW` list for the public copy.
- **Old library**: the 192-icon SVG spell catalogue (`icons/`), Oathwild's class motifs, the Codex button icons and the item pictures, searchable.
- **Glyph matrix**: elements × kinds, showing painted / tinted-only / missing, how many Oathwild spells need each pair, and the painting to-do list.

The "Painted / Drawn" switch in the top bar flips every tab between the Codex art and the SVG stand-ins.

## Checks

```sh
node --test iconkit/tests/*.test.js                                   # also in npm run test:unit
flock /tmp/oathwild-browser.lock node iconkit/tools/shots.mjs         # every tab, desktop + 360x740 phone → iconkit/shots/
```

The unit tests cover theme lookups and aliases, `mechanicOf`, the `iconFor` choices and fallbacks, stable spec keys (the key format is frozen), `normalize`, that every file named in the data exists, small/large/placeholder source picking, the matrix, and the HTML layer order. `shots.mjs` fails on a console error or a page wider than the phone.
