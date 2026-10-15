# Icon Library

A standalone browser experiment and shared spell-art library. Open `/icons/` from the Playground browser or Thousandvale's public origin. All 32 Thousandvale classes have six distinct pictures: the six original Starcaller icons, 180 new SVG compositions made and visually reviewed in six batches of five classes, and (play-test 11) the Star Blade's six as batch 7.

Every icon has a stable skill ID, name, visual description, class, categories and batch number. Search covers all metadata; class, category and batch filters combine. Click a card to compare 26/40/96 px previews, copy its ID or download a standalone, accessible SVG. The page works on phones, with keyboard navigation and native dialog focus/escape handling. Filter state lives in the URL. No build step or image service is required.

## Reuse

```js
import { iconSvg, iconInfo, icons, filterIcons } from '../icons/js/catalog.js';

face.innerHTML = iconSvg('gnawing_dark', 40);
iconInfo('gnawing_dark'); // { id, name, description, classId, className, categories, batch, body }
filterIcons({ classId: 'warlock', category: 'summon', q: 'fiend' });
iconSvg('star_dart', 128, { accessible: true }); // SVG with title and description
```

`iconSvg` returns `null` for an unknown ID. Default SVGs are decorative (`aria-hidden`) because game buttons provide their own skill text. Accessible exports contain an image label, title and description. `iconInfo` and `filterIcons` return catalog records; treat them as read-only. No DOM, async fetch, network service, fonts or third-party image dependencies are involved. All SVG bodies come from trusted authored modules; never pass user-supplied SVG markup into them.

## Data and artwork

- `data/starcaller.js` preserves the original Starcaller artwork as batch 0.
- `data/starblade.js` (batch 7, play-test 11) is the Star Blade: the same medallion and gold, with STAR STEEL (`#c9d3e6`) for every blade, shield rim and binding so it reads as the Starcaller's sword-and-shield partner.
- `data/batch-01.js` through `batch-06.js` each hold five classes, in Farhold class order, with six explicit compositions per class. Each row is `[skillId, visualDescription, svgArt, additionalCategories]`.
- `js/draw.js` has the 32×32 medallion, gold/pale/midnight palette and composable drawing primitives. Pictures describe their skill's action; no random shape selection or initials.
- `js/records.js` attaches names and class/category metadata and the shared medallion to each composition.
- `data/metadata.js` is generated from Farhold's class/skill data plus Thousandvale's own classes. Names, class IDs, spell shapes and elements stay in sync through `node icons/tools/sync-metadata.mjs`. This maintenance command rewrites only metadata; it does not create art.
- `js/catalog.js` combines the batches and exposes pure lookup/render/filter functions.

The visual descriptions describe the picture rather than copying combat numbers that can become stale. Categories combine spell, element and shape with authored tags such as healing, shield, summon, movement, control, machine and stars.

| Batch | Classes |
|---|---|
| 0 | Starcaller (original reference) |
| 1 | Warrior, Fighter, Paladin, Ranger, Rogue |
| 2 | Cleric, Bard, Mage, Necromancer, Warlock |
| 3 | Demon Hunter, Scavenger, Swashbuckler, Dragon Knight, Pyromancer |
| 4 | Stormcaller, Druid, Oracle, Tactician, Chronomancer |
| 5 | Monk, Shaman, Witch Hunter, Knight, Sorcerer |
| 6 | Runesmith, Shadow Dancer, Tinker, Priest, Enchanter |
| 7 | Star Blade (play-test 11; Thousandvale-only, the Starcaller's partner) |

## Game integration and release

`prototypes/thousandvale/js/client/ui/skill-icons.js` re-exports the renderer as `skillIconSvg`, IDs as `skillIconIds` and metadata as `skillIconInfo`. Consumers cover action-bar buttons and tooltips, the Skills & Talents list, the selected spell header and its tooltip. Unknown future IDs keep the existing text fallback.

`icons` is included in both Thousandvale's static allow-list and release archive. The public release includes the page and all catalog imports, while its normal exclusions keep tests/tools out of the public copy. The experiment is also registered in `data/experiments.json`.

## Checks

```sh
node --test icons/tests/catalog.test.js
npx playwright test icons/tests/library.spec.js
npx playwright test prototypes/thousandvale/tests/D/skill-icons.spec.js
```

Coverage checks compare every real class/skill ID and name against the catalog, require exactly five classes per new batch, and reject duplicate pictures, missing descriptions and unsafe/broken SVG output. Browser checks exercise search/filter combinations, details, downloads, keyboard closing, mobile layout, and the real game's action bar and Skills window. The catalog audit also runs inside Thousandvale's release gate via `tests/D/skill-icons.test.js`.

## Game icons (2026-10-14)

Everything in Thousandvale that is not a spell or a piece of gear now has a drawn picture too — Codex-authored SVG in the
same spirit as the spell set, reviewed on contact sheets. Browse them at `icons/game.html` (tabs per set, search).
`data/game/STYLE.md` is the art contract (viewBox, allowed SVG, palette, how to review a batch).

| File | Pictures | Used by |
|---|---|---|
| `data/game/ui.js` (32×32) | Attack, Cast a line, Hook, lock, mount, jump, target, ally, potion belt, quick wheel, chat, close, menu, auto-run, camp; the 14 window buttons; 6 emotes; 10 professions (`prof_<id>`); eye, locate; `doll` (the empty paper-doll mannequin) | `hud.js` (attack with the spell medallion), `menubar.js`, `input/touch.js`, `input/radial.js`, `ui/angling.js`, `ui/pt10.js` (emotes), `ui/prof-icons.js`, `ui/event-tracker.js`, `ui/worldmap.js`, `bag.js` |
| `data/game/items-goods.js` (64×64) | every potion (mana is BLUE), food, drink, the 12 fish meals, goods, rods, bait, the 12 gathering tools, crates, gift, trophy, quest parcel, key, letter, coins, the 12 fishing junk items, and fallbacks (`potion`, `junk`, `bundle`, `tool`, `ring`, `amulet`, `focus`) | the bag, shop, loot, trade, mail and hotbar, through `ui/inv-core.js iconSpec` → `{ kind: 'art' }` |
| `data/game/items-materials.js` (64×64) | the 55 profession materials by id, plus a fallback per material class (`mat_ore` …) | same |
| `data/game/items-fish.js` (64×64) | the 62 fish and 16 legendary fish by species id, plus `fish` | same |
| `data/game/fx-motifs.js` (64×64, white) | three spell-effect shapes for each of the 30 classes and the Star Blade (hand-drawn in the same contract, play-test 11 — its `.c` sigil is also the calling's emblem on the creation card) (`<class>.a` projectile head, `.b` impact shard, `.c` ground glyph) and `palettes` (core / glow / accent per class) | Thousandvale's class signature effects (`js/client/sig-looks.js`, `sig-fx.js`) |

```js
import { uiIconSvg, itemArtKey, itemIconSvg, itemIconUrl } from '../icons/js/game-icons.js';
uiIconSvg('attack', 40, { medallion: true });    // the spell disc behind it
itemArtKey({ kind: 'potion', id: 'mana_potion' }); // 'mana_potion'  (id → species → what it is → a family fallback; null for gear)
itemIconUrl('mana_potion');                       // data: URL for an <img>
import { CLASS_MOTIFS, classPalette, motifSvg } from '../icons/js/motifs.js';   // the effect shapes alone (no item art)
```

Gear (weapons, shields, armour, cloaks) is not here on purpose: the game draws those from the 3D models, now worn by a
plain mannequin (`createChibi2Character(avatar, { mannequin: true })` — the face keeps its carved shape in the body's one
colour, so an icon never shows a particular person). Rings keep their own coloured drawing, which takes the ring
model's metal and stone colours.

Adding a picture: add an entry to the right file (same id as the game's item/button), run
`node icons/tools/contact-sheet.mjs icons/data/game/<file>.js out.png`, look at it, then `node --test icons/tests/game-icons.test.js`
(safe-SVG audit, every real item in Thousandvale's data has a picture, mana is blue, 30 distinct class palettes).
