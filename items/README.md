# Item Vault — item catalog and loot roller

An extensive, tagged catalog of things a fantasy game can hand out, describe, or put in a lore entry: weapons (swords, daggers, axes, blunt, polearms, ranged, staves), armour and clothing, drinking vessels and cookware, regalia and jewelry, lore items (tablets, runestones, scrolls, ledgers, treaties), tools, instruments, household goods, religious items, containers, alchemy, raw materials, trophies and food. Every item carries **tags** and **race affinity weights**, and some are **exclusive** to a race (livingwood bow: elf; runeaxe: dwarf; pokey stick: goblin; saga stone: giant).

Open: `http://<LAN-IP>:8400/items/`. Engine: `js/items.js`. Data: `data/items.json` (built by `tools/build-items.py`: edit the lists there and re-run), `data/materials.json`.

## Quick use
```js
import { ItemCatalog } from '/items/js/items.js';
import { NameGen } from '/namegen/js/namegen.js';
const cat = await ItemCatalog.load('/items/data/'); const gen = await NameGen.load('/namegen/data/');
cat.query({ race: 'dwarf', category: 'vessel', tags: ['drinking'] });     // [{ item, weight }] — weighted for a race
cat.roll({ race: 'orc', rarity: 'rare', seed: 42, namegen: gen });        // concrete item
cat.toLexiconEntry(rolled);                                              // → lingo dictionary entry
```
A rolled item: `{ id, name: 'fine steel bearded axe', fullName: 'Frostbite, keen fine steel bearded axe', pl, category, sub, tags, rarity, material, quality, enchant, artifact, value, desc, lore, race, seed, base }`.

## The data model (`items.json`)
```json
{ "id": "livingwood_bow", "name": "livingwood bow", "category": "weapon", "sub": "ranged",
  "tags": ["bow", "ranged", "two-handed", "elf", "magic", "living"],
  "affinity": { "elf": 3 }, "exclusive": "elf", "rarity": "rare", "value": [500, 2000],
  "materials": ["wood", "yew", "horn", "steel", "bone", "veilsilver", "leather"],
  "desc": "Elven bow cut from a tree that agreed to it; still green.", "damage": "pierce" }
```
- **affinity** 0..3 per race: 3 = signature (dwarves and goblets, elves and bows, orcs and skull cups). A race not listed gets weight 0.2 (rare but possible). `exclusive` limits an item to one race.
- **tags** are free text: shape (`one-handed`, `curved`, `stemmed`), use (`drinking`, `kitchen`, `ritual`, `thief`), flavour (`gore`, `humble`, `elegant`, `crude`, `gadget`), power (`magic`, `runes`, `living`, `cursed`). Rolled items also gain tags from material (`metal`, `precious`), quality (`crude`, `masterwork`, `ancient`), enchant (`fire`, `holy`…) and rarity.
- **rarity**: common / uncommon / rare / epic / legendary; `roll()` draws a rarity (60/25/10/4/1) unless told, then an item of that rarity for the race.
- **materials.json**: material groups with value multipliers and race affinity; qualities (crude → masterwork, ancient); enchant prefixes with tags.

## Rolling
`roll()` picks the base item by race weight, a material the race favours (from the item's allowed list), a quality (biased up for rare+), an enchant for rare+ (chance grows with rarity), an **artifact name from Name Forge** for epic/legendary (and 30% of rares), computes value, and writes a lore blurb from quality, enchant, exclusivity and race (with a maker and place from Name Forge for masterworks).

## Catalog size
See the demo's right column (about 340 items across 14 categories, 12 races each with 15+ favoured items and at least one exclusive).

## Fits with
Lingo (items as `{item.a}`, `{item.pl}` with correct plurals via `toLexiconEntry`, artifact names as proper nouns), Name Forge (artifact names, makers, places), and a future memory system event (`loot` events can carry a rolled item id).

## Tests
`node --test items/tests/*.test.js`: catalog integrity, race coverage, query semantics, seeded rolls with named epics, affinity shows in rolls. `npm test -- items` (Playwright): UI rolls, filters, catalog.
