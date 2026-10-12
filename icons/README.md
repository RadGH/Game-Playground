# Icon Library

A standalone browser experiment and shared spell-art library. Open `/icons/` from the Playground browser or Thousandvale's public origin. All 31 Thousandvale classes have six distinct pictures: the six original Starcaller icons and 180 new SVG compositions, made and visually reviewed in six batches of five classes.

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
