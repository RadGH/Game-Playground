# Research: procedural dialog / phrase-template systems (2026-09-09)

## How games do it
- **Tomodachi Life**: slot-based customization on top of hand-written line pools. 3DS: 5 typed slots per Mii (catchphrase, happy, mad, sad, worried), picked by mood. *Living the Dream* (2026): up to 12 "expressions" across 10 categories incl. **start-of-sentence, end-of-sentence, greeting, asleep, before-eating**; start/end phrases wrap normal lines. Adds **Island Lingo**: shared dictionary, each entry = phrase + pronunciation + category (people/things/activities), dropped into conversation randomly or by trigger.
- **Animal Crossing**: 8 personality archetypes with separate line pools + per-villager catchphrase; hobby subtypes add lines.
- **The Sims**: Simlish is meaningless; emotion carries via performance. Lesson: for TTS, tone may matter more than words.
- **RimWorld**: social interactions (chitchat, deep talk, slight, insult) generate log text via `RulePackDef` grammars; traits mostly change *which interaction fires* (weights), not wording. GrammarResolver syntax: `symbol(cond==x,p=2.0)->text with [sub]`, bound-object subsymbols `[PAWN_nameDef] [PAWN_pronoun] [PAWN_possessive] [THING_indefinite]`, gender switch `{0_gender ? he : she : it}`.
- **Dwarf Fortress**: templated by topic, filtered by personality facets; language raws `[NOUN:elf:elves] [ADJ:elven]` with per-culture word-class preferences.

## Engines
| Engine | Syntax | Strength | Weakness |
|---|---|---|---|
| Tracery | `#symbol.mod#`, `[key:rule]` push/pop, mods `.capitalize .a .s .ed` | tiny, author-friendly | no weights/conditions/tags, naive a/an and plural |
| Improv | groups with tags + phrases; model-driven filtering, `dryness` anti-repeat, partial/full tag bonus | personality-driven selection | unmaintained, little morphology |
| Expressionist | CFG whose nonterminals carry tags; output returns tags | game knows tone of what was said | Python authoring tool |
| RimWorld GrammarResolver | weights + conditions + object binding | proven at scale | XML, English-centric |

## Morphology helpers
pluralize (rules + irregulars + `addIrregularRule`), compromise (heavy, full NLP), indefinite (a/an incl. "hour"), ICU MessageFormat `{n, plural, one{# elf} other{# elves}}` and `{g, select, male{he} female{she} other{they}}`. Verdict: don't adopt full ICU (no random choice/recursion/tags); borrow its plural/select blocks inside a Tracery-like symbol system.

## Lexicon design
Store explicit forms (`sg`, `pl`, `adj`, `poss`, `demonym`), fall back to rules only when absent. Per-entry flags: `proper` (no article), `mass` ("some"), `count`. Pronoun set per person entry. Prior art: DF raws, Inform 7 kinds (`printed plural name`, `indefinite article`, `proper-named`), RimWorld Defs (`label`, `labelPlural`, `gender`).

## Personality layering (applied in lingo)
1. Filter/score phrase groups by tags + weights from traits and mood (Improv). 2. Parameters: verbosity → short/long variants, formality → register synonyms. 3. Wrappers: Tomodachi-style prefix/suffix/greeting/catchphrase slots. 4. Post-filters: "um" inserter, intensity by anger, slurring (Emily Short, Versu/Character Engine).

## Pronunciation
phonemize (pure JS dictionary + rules, IPA/ARPABET, `addPronunciation`) or espeak-ng WASM `--ipa`. Lexicon entries carry optional `pron: { respell: "EL-vish", ipa: "…" }`.

Sources: tomodachi.fandom.com/wiki/Phrases; game8 Living the Dream lingo guide; nookipedia Villager; rimworldwiki Social + Modding_Tutorials/GrammarResolver; dwarffortresswiki language_words; github.com/galaxykate/tracery; github.com/sequitur/improv; github.com/james-owen-ryan/expressionist; github.com/plurals/pluralize; messageformat.github.io; emshort.blog procedural text posts; github.com/hans00/phonemize; github.com/xenova/phonemizer.js.
