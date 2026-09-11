# Lingo — text language system for game characters

A phrase-template engine with a game-defined dictionary and a personality layer, inspired by Tomodachi Life's custom phrases and RimWorld's traits. Characters "speak" by intent (`greet`, `insult`, `combat_bark`…); the engine picks a phrase weighted by the speaker's traits, sliders, mood and relationship, fills in names/items/races with correct plurals, articles and pronouns, wraps it with the character's custom prefix/suffix/catchphrase, and applies verbal tics. Output includes a speech variant with `[[phonemes]]` for the Voice Lab.

Open: `http://<LAN-IP>:8400/lingo/`. Engine: `js/lingo.js` + `js/morph.js` (no DOM; runs in Node). Data: `data/*.json`. Demo: `js/app.js`.

## Quick use from a game

```js
import { Lingo, Speaker } from '/lingo/js/lingo.js';
const [lexicon, grammar, traits] = await Promise.all(['lexicon', 'grammar', 'traits'].map(f => fetch(`/lingo/data/${f}.json`).then(r => r.json())));
const lingo = new Lingo({ lexicon, grammar, traits, seed: 1234 });      // seed optional (reproducible)

// your own words, any time
lingo.lexicon.add({ id: 'moonwyrm', type: 'creature', forms: { sg: 'moonwyrm', pl: 'moonwyrms' }, tags: ['invented'], pron: { respell: 'MOON-wurm' } });

const thalen = new Speaker({ id: 'thalen', name: 'Thalen', entry: lingo.lexicon.get('thalen'), lexicon: lingo.lexicon,
  speech: { traits: ['pompous', 'honorable'], formality: 0.85, verbosity: 0.7, custom: { greeting: 'Well met', catchphrase: 'The roots remember.' } } });
const mara = new Speaker({ ... });

const line = lingo.speak('greet', { speaker: thalen, listener: mara, opinion: -0.4 });
line.text    // "Well met, Mara. Still alive, then. Pity."
line.speech  // same with [[phonemes]] for custom words → feed to voice-lab say()
line.tags    // ['hostile','cruel']  — the game can react to tone
line.entry.id, line.bindings   // which phrase, which random words were chosen

// combat: bindings you supply are used, missing ones are picked from the lexicon
lingo.speak('combat_taunt', { speaker: mara, foe: new Entity(lingo.lexicon.get('ghoul'), { count: 3 }) });

// two characters talk
lingo.converse(thalen, mara, { turns: 8, opinionAB: -0.5, opinionBA: 0.2 });  // → [{ speaker, listener, intent, text, speech }]
```

## Template syntax

| Syntax | Meaning |
|---|---|
| `{listener.name}` | binding + property. `name` = short form; `sg`/`pl`/`adj`/`people`/`lang` other forms |
| `{speaker.race.adj}` | follow references between entries (person → race) |
| `{item.a}` `{item.the}` `{item.some}` | articles. Proper nouns take none; mass nouns get "some"; plural counts become "three axes" |
| `{item.pl}` `{item.poss}` `{item.count}` `{item.num}` `{item.ordinal}` | plural, possessive, number, number words, ordinal |
| `{speaker.they}` `.them` `.their` `.theirs` `.themself` | pronouns from the entity's set (he/she/they/it/we/you, or a custom object) |
| `{speaker.verb(is)}` `{crowd.verb(has)}` `{x.verb(walks,walk)}` | verb agreement: give the 3rd-singular form; the plural is derived or given |
| `{x.cap}` `.upper` `.lower` `.title` `.quote` | string ops. Order matters: `{item.a.cap}` → "A bow" |
| `{#symbol}` `{#symbol.cap}` | expand a grammar symbol (weighted pick) |
| `{$race}` `{$race.pl}` `{$item2.a}` | random lexicon entry of that type; the same key repeats the same pick within a line; add a digit for a second one. Never picks the speaker or listener. |
| `{~a|b|c}` | inline random alternative |
| `{n, plural, =0{none} one{# coin} other{# coins}}` | plural branch (`#` = the number; `n` may be `foe.count`) |
| `{who, select, mara{her} other{them}}` | select on an entity id or value |
| `{x.or(fallback)}` | fallback when a binding is missing |
| `{{` `}}` | literal braces |

Parser: `parseTemplate(str)` → AST; `lingo.expand(template, ctx)` → `{ text, used, tags, bindings }`.

## Data files

### `data/lexicon.json` — the dictionary
`types` declare which forms matter (documentation for authors and for Claude). `entries`:
```json
{ "id": "elf", "type": "race", "forms": { "sg": "elf", "pl": "elves", "adj": "elven", "people": "the Elves", "lang": "Elvish" }, "tags": ["fey"], "pron": { "respell": "elf" } }
{ "id": "thalen", "type": "person", "proper": true, "pronouns": "he", "race": "elf", "faction": "rootwardens", "forms": { "sg": "Thalen Ashvine", "short": "Thalen" } }
{ "id": "ale", "type": "food", "mass": true, "forms": { "sg": "ale" } }
```
Rules: explicit forms win; missing `pl` falls back to the pluralize library (with fantasy irregulars: elf/elves, dwarf/dwarves, lich/liches…); missing `adj` falls back to `sg`. Any field whose value is another entry id is navigable (`{speaker.faction.people}`). `pron.respell` is an author-friendly pronunciation ("THAY-len": capitals = stressed syllable, hyphens split syllables; `ay ee eye oh oo aw uh ah ur th dh sh zh ch ng` vowel/consonant spellings) converted by `respellToEspeak()`; `pron.espeak` or `pron.ipa` can be given directly.

### `data/grammar.json` — phrases
```json
"greet": [
  { "t": "{#greetword}, {listener.name}.", "w": 3 },
  { "t": "{#greetword}, {listener.race.sg}.", "tags": ["hostile", "rude"], "cond": "!sameRace && opinion < 0.2" },
  { "t": "Is that all, {foe.sg}?", "tags": ["confident"], "bind": { "foe": { "type": "creature" } } }
]
```
- `w` base weight; `tags` are multiplied by the speaker's tag weights (0 removes the line); `cond` is a JS expression with `mood`, `opinion`, `has('trait')`, `listenerHas('trait')`, `sameRace`, `speakerType`, `listenerType`, `chance(p)`, and any ctx binding; `bind` fills missing bindings with random lexicon entries of a type (`tags`, `count` optional).
- `meta.intents` lists the public intents; `meta.intentDoc` explains each. Symbols starting with `_` are private. Helper symbols: `greetword farewellword yesword noword thanksword intensifier curse oath endearment insultnoun insultadj praiseadj bodyharm weathertalk foodtalk worktalk timeofday`.
- Current content: 43 intents, 530 entries, dark-fantasy tone (insults, threats, gore, grief, last words) with `crude`/`gore`/`cruel` tags so a gentler game can zero them out.

### `data/traits.json` — personality traits
`{ id, name, desc, tagWeights: { tag: multiplier }, tics: [filter ids] }`. 25 traits (abrasive, kind, shy, pompous, bloodlust, pious, cynical, jolly, nervous, greedy, brave, coward, gruff, romantic, scholar, drunkard, grieving, paranoid, archaic, honorable, cruel, loyal, sarcastic, hungry, third_person).

### `data/speakers.json` — sample characters
Identity (`entry` = lexicon person id) + the `speech` section.

## The `speech` section of the shared character JSON

```json
"speech": {
  "traits": ["abrasive", "brave"],
  "formality": 0.15, "verbosity": 0.4, "cheer": 0.5, "aggression": 0.8, "confidence": 0.9,   // 0..1
  "mood": 0,                                                       // -1..1, runtime
  "custom": { "greeting": "Oi", "farewell": "Don't die stupid", "catchphrase": "Blood pays for blood.", "prefix": "", "suffix": "", "happy": "", "angry": "", "sad": "", "worried": "", "yes": "Aye", "no": "Piss off", "thanks": "", "curse": "Forge take it", "oath": "" },
  "customRate": { "catchphrase": 0.25 },                           // per-slot probability (defaults: greeting/farewell/etc 0.85, prefix/suffix/catchphrase scale with verbosity, mood lines 0.7)
  "tics": ["hesitant"],                                             // post-filters: um drawl shout whisper hesitant archaic lisp growl clipped flowery curses thirdperson pirate posh
  "tagWeights": { "religious": 2 }                                 // extra manual multipliers
}
```
How the layers combine (`Lingo.tagWeights`): trait multipliers × slider curves (formality→`formal`/`casual`/`crude`, verbosity→`long`/`short`, cheer+mood→`happy`/`gloomy`, aggression→`aggressive`/`gentle`, confidence→`confident`/`timid`) × mood (`angry`/`sad`/`joyful`) × opinion (`friendly`/`hostile`) × manual `tagWeights`. Then `speak()`: pick phrase → expand → custom slots replace `greetword`/`farewellword`/`yesword`/`noword`/`thanksword`/`curse`/`oath` → prefix/catchphrase/suffix wrappers → contractions by formality → tics → tidy (sentence case, punctuation). Recently used phrases are down-weighted per speaker (anti-repeat).

## Relationships
See **`RELATIONS.md`**: `js/relations.js` keeps directional, multi-factor feelings (warmth, respect, trust, appreciation, fear, attraction, familiarity, knowledge) with trait-scaled events, a memory hook and tone tags (`rival`, `fearful`, `grateful`, `stranger`…) that the grammar and planner use. Pass `relation` in a speak context (or `relations` to `converse`) instead of `opinion`; `opinion` still works.

## Memories and scene awareness
See **`MEMORY.md`** for the full design. In short: `js/memory.js` gives each character a `MemoryBank` (events weighted by traits, fading by half-life, merging repeats, recalled by salience × relevance) and `js/context.js` a `Scene` (place, tags, threats, danger, comfort) that biases phrase tags and the planner. Grammar intents: `observe fear plan relief` (scene), `observe_person reveal` (relationship + knowledge) and `recall_<type>` + `recall_reply` (memories). Data: `data/events.json` (16 event types), `data/scenes.json` (8 example scenes). Demo: the Scene and Memories panels.

## Conversation planner
`planConversation(a, b, opAB, opBA, turns, { banks, now, scene })`: greet → greet_reply → beats chosen from opinion and aggression, replaced by scene beats (observe/fear/plan/relief/warning/rally…) most of the time when the scene is dangerous or cosy, and by a `recall` beat (answered by `recall_reply`) with probability ≈ the speaker's strongest memory salience (hostile pool: insult/threat/complain/gossip/disagree; friendly: compliment/smalltalk/gossip/lore/brag/agree/thanks/flirt; neutral: smalltalk/gossip/complain/lore/question/brag/work) with reactions (insult → retort/apology/threat, compliment → thanks, flirt → flirt_reply/reject, question → answer) → farewell. Games should replace this with their own social simulation and just call `speak(intent, ctx)`.

## Pronunciation bridge to the Voice Lab
`lingo.toSpeech(text)` (also returned as `line.speech`) replaces every word that has a lexicon `pron` with `[[espeak phonemes]]`. The Voice Lab's espeak engine reads those inline. Babble ignores them. Piper/Web Speech get plain text (strip with `text.replace(/\[\[|\]\]/g,'')`).

## Demo features
- Speaker A / B editors: pick a sample character or build a custom one (name, race, pronouns), toggle traits, drag sliders, fill Tomodachi-style custom slots, toggle tics. Relationship sliders both ways.
- Say it / 10 variations / one of each intent, with the chosen phrase id, tags, bindings and optional speech text; optional "speak with Voice Lab".
- Conversation simulator with turns.
- Template tester with syntax cheat sheet.
- Coverage panel: reachable phrases per intent for the current personality (finds dead intents), plus the live tag weights.
- Dictionary editor: add/edit/delete entries with forms, flags, pronouns, race ref, tags, respell → espeak; export/import; persisted in localStorage.
- Speech JSON panel: copy / export / import / apply.

## Tests
- `node --test lingo/tests/*.test.js` — engine unit tests, memory/scene tests (decay, traits, merging, relevance, every event type renders, planner) (parser, morphology, scoring, filters, conversation) and data validation (every phrase expands for every speaker with no unresolved markers; every intent reachable for every personality/opinion; lexicon refs valid; traits' tags exist).
- `npm test -- lingo` — Playwright: UI loads clean, speaks, converses, traits change tone, dictionary edits reach templates.

## Extending
- New intent: add a symbol to `grammar.json` and list it in `meta.intents`.
- New language: `morph.js` is English-only; the lexicon forms model (explicit forms per entry) is language-neutral. A second language needs its own morph module and grammar file.
- Mood/relationship come from the game each call (`speech.mood`, `ctx.opinion`); nothing here simulates them.


## Vocabulary packs

`data/packs/<world>.json` holds extra lexicon entries for one game world (places, factions, people, creatures, items, deities, spells, food, titles, weather). Load one with `for (const e of pack.entries) lingo.lexicon.add(e); lingo.invalidatePronunciations();`. `packs/emberveil.json` (151 entries) is what Emberveil 2 loads; add a pack per game rather than growing the core lexicon.


## Variety

Custom slots (catchphrase/prefix/suffix) accept Lingo templates, so `{~a|b|c}` gives a character several sayings. The default speakers and the Emberveil classes each carry 5–6 variations; add more rather than repeating one line.
