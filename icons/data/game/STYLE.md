# Game icon art — the contract

Everything in this folder is hand-authored SVG (written by Codex, reviewed by Claude), in the same spirit as the
spell icons in `../batch-*.js`: each picture is an explicit composition that shows the thing it names. No random
shape picking, no letters or initials standing in for a picture, no external images or fonts.

## Files

| File | What | viewBox | Background |
|---|---|---|---|
| `ui.js` | buttons and menus: attack, cast a line, menu bar, touch buttons, emotes, professions | `0 0 32 32` | transparent (the caller may put the spell medallion behind it) |
| `items-goods.js` | potions, food, drink, goods, tools, rods, bait, crates, gifts, trophies, junk, fallbacks | `0 0 64 64` | transparent |
| `items-materials.js` | the 55 profession materials | `0 0 64 64` | transparent |
| `items-fish.js` | 62 fish + 16 legendary fish | `0 0 64 64` | transparent |
| `fx-motifs.js` | spell-effect particle shapes, three per class, plus a palette per class | `0 0 64 64` | transparent, WHITE only |

Each file's default export is a plain object: `id -> { name, description, art }`.
`art` is the INSIDE of an `<svg>` (no `<svg>` wrapper) using only `path`, `circle`, `ellipse`, `rect`, `polygon`,
`polyline`, `line`, `g` (transform / opacity), and `defs` with `linearGradient` / `radialGradient`. Gradient ids must
start with `gi-<icon id>-` so two icons on one page never collide. No `<text>`, `<image>`, `<use href>` to outside,
`<script>`, `<style>`, `filter`, event attributes, or `url(` that is not a gradient id. A file may build its strings
with functions (a fish file with body templates is fine) as long as the export is the finished object. A file may
import `../../js/draw.js` and nothing else.

## Look

- UI icons (32): read at 22-40 px. Bold silhouettes, 1.4-2.2 stroke widths, the spell palette — gold `#e6c14a`, pale
  `#fff2b8`, midnight `#1c1f4a`, deep `#10122e` — plus ONE accent colour where it helps (fish blue `#6ab8e0`, a red
  heart). Each must read on a dark leather button AND on the midnight medallion.
- Item icons (64): read at 40-56 px in a bag slot whose border shows rarity. Full colour, warm painted-vector look: a
  dark outline (`#1a1410`, 2-2.5 px) round the silhouette, a mid tone, a shadow tone, one or two highlights. Fill most of
  the square (about 6 px margin). Slight three-quarter view where it helps (a bottle, a crate, a log). Each picture
  must be recognisable on its own: a mana potion is BLUE, a healing potion red, an antidote green.
- Motifs (64): pure white (`#fff`) shapes; inner detail by opacity (0.35-0.8) only — the game tints them per class and
  draws them glowing. A strong outline shape; no thin hairlines (they vanish at 20 px).

## Original names only

No third-party game names, logos or trademarked symbols. The game's own item and class names are fine.

## Review

`node icons/tools/contact-sheet.mjs icons/data/game/<file>.js out.png` renders every picture of a file at 3 sizes onto
one PNG. Look at it before calling a batch done.
