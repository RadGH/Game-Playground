# Name Forge — procedural names per race

Dwarf-Fortress-style name generation: every race has a **language** (sound rules + a dictionary of concepts), and names are built from patterns that either translate concepts into that language ("Kazak Tolm" = iron hammer, Dwarvish) or compound them in plain English ("Ironfist"). The same concept always translates to the same word in a language, so a world stays consistent, and every result carries its meaning (gloss), extra forms (plural, adjective, people, possessive, short name) and a pronunciation respelling that the Voice Lab can speak.

Open: `http://<LAN-IP>:8400/namegen/`. Engine: `js/namegen.js`. Data: `data/languages.json`, `data/concepts.json`, `data/patterns.json`.

## Quick use
```js
import { NameGen } from '/namegen/js/namegen.js';
const gen = await NameGen.load('/namegen/data/');
gen.generate('person.full', { race: 'orc', gender: 'f', seed: 1234 });   // reproducible
gen.batch('settlement', 10, { race: 'halfling' });
gen.translate('dwarf', 'iron');                                          // "Kazak"
gen.toLexiconEntry(result);                                              // → lingo dictionary entry
```
Result: `{ text, category, race, gender, parts: { given, family, epithet, list }, gloss: ['ash','vine'], forms: { sg, short, poss, members, member, adj, people }, respell: 'THA-len ASH-vine', tags, seed, pattern }`.

## Races (12)
human (Common), elf (Elvish), dwarf (Dwarvish), halfling (Hearthspeech), gnome (Tinkertongue), giant (Giantish), troll (Trollish), orc (Orcish), goblin (Gobble), dragon (Draconic), undead (Gravespeech), fey (Sylvan). All invented here; no third-party name lists.

## Categories
`person.given`, `person.family`, `person.epithet`, `person.full` (race-specific shapes: "Given Family", "Given the Epithet", giants and dwarves "son/daughter of", dwarves "of Clan X", dragons double epithets), `faction` (companies, clans, warbands, gangs, groves, cults, broods, courts; with member/members/adj/people forms), `region`, `settlement`, `landmark`, `object` (artifact names: Frostbite, the Hammer of Dawn, Durgan's Grudge), `motto`.

## How a language is defined (`languages.json`)
- `phonology`: weighted `onsets`, `nuclei`, `codas`, `syllables` (count weights), gendered `endings`, `ortho` fixes. `nativeWord()` builds words from these deterministically from a seed.
- `curated`: hand-written given names per gender (~30–40 each), `epithets`, `familyNative` (native-looking or compound family names).
- `lexicon`: curated translations of concept ids (`iron: Kazak`); any other concept gets a stable generated word (seeded by language + concept).
- `race`: sg/pl/adj/people forms for the lingo lexicon.

## Concepts (`concepts.json`, 268)
`{ id, en, adj?, agent?, tags, races }`. Tags: metal, stone, nature, plant, animal, weather, element, water, landform, war, body, dark, craft, quality/adjective, virtue, vice, home, tinker, role, lore, agent. `races` are affinity weights (moon → elf 3, anvil → dwarf 3, skull → orc 3); a concept without a weight for a race is picked rarely (0.25), which is what makes each race's names feel different.

## Patterns (`patterns.json`)
Tokens: `{given}` `{family}` `{epithet}` `{native:N}` `{concept:tag,tag}` (`|adj` `|agent` `|pl` `|cap` `|lower` `|possessive`) `{tr:tag}` (translated) `{list:name}` `{race.pl}` `{~a|b|c}`. Patterns can be limited to races (`races`), excluded (`not`), gendered, weighted, and carry `forms` templates (`{1}` = first slot, `{family}`, `{list}`, `*` = the name). Add a pattern = add a line.

## Tags
Results carry the race and its style tags (soft, harsh, cozy…) plus pattern tags; concepts carry semantic tags; `generate(cat, { tags: [...] })` prefers patterns with those tags. Games can filter or weight on any of them.

## Fits with
- **Lingo**: "Export as lingo lexicon" gives person/faction/place/item entries with pronouns, race, plural/adjective/people forms and `pron.respell`, so `{listener.name}`, `{faction.people}`, `{place.adj}` all work and the Voice Lab pronounces the invented names.
- **Combined demo**: random characters take their names from here.
- **Items**: artifact names (`object`) for loot.

## Tests
`node --test namegen/tests/*.test.js`: every race × category generates seeded, varied, well-formed names; translations stable; dwarves prefer stone/metal; gendered names and lingo export; faction forms; helpers.
