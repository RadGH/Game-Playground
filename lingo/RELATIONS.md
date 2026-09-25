# Relationships — several factors instead of one opinion

`js/relations.js` + `data/relations.json`. Each pair of characters has **two directional relationships** (how A feels about B, how B feels about A), and each one is a small vector, not a number:

| factor | meaning | typical movers |
|---|---|---|
| `warmth` | like ↔ dislike, affection | kindness, insults, shared meals, mockery |
| `respect` | regard for competence, courage, standing | bravery seen, cowardice seen, skill seen, shared victory |
| `trust` | belief they will keep faith | kept word, broken word, betrayal, saved life |
| `appreciation` | gratitude for what they did for me; negative = resentment for what they did to me | gifts, kindness, debts, insults |
| `fear` | dread of what they could do to me | threats, attacks, cruelty seen |
| `attraction` | romantic or aesthetic pull | flirting |
| `familiarity` (0..1) | how well they know each other | every shared event, first meeting, long absence |
| `knowledge` | the target's traits the viewer has observed | events reveal traits the target really has; familiarity leaks more |

**Is this any different from one opinion number?** Yes, in three ways that show up in dialogue:
1. **Tone splits.** Respect without warmth is a *rival* ("You fight well. I still don't like you."); fear with dislike is *deferential* ("Whatever you want. Just… whatever you want."); appreciation without trust is *indebted but wary*. One scalar averages these into "neutral" and picks bland lines. `Relationship.tags()` turns the mix into phrase tags (`fond cold respectful contemptuous trusting suspicious grateful resentful fearful attracted rival protective stranger intimate`) that the grammar keys on, and the conversation planner picks beats per tag (rivals brag and needle; the fearful agree and apologise; the grateful thank).
2. **Traits change how events land.** A paranoid character gains trust at 0.4× and loses it at 1.6×; a coward's fear grows 1.6×; the pompous lose warmth fast; the loyal lose trust slowly. Same event, different people, different feelings.
3. **Knowledge gates lines.** `reveal` lines ("Everyone says you're a coward. I've seen it.") need `knows('coward')`; a stranger can only say "I don't know you well enough". Characters learn each other over time, which is the RimWorld feel you asked for.

For code that only wants a number, `rel.opinion()` returns a weighted mix (−1..1) and everything that used `opinion` still works.

## Events (`relations.json → events`)
kindness, gift, saved_life, shared_victory, shared_defeat, shared_meal, shared_grief, compliment, insult, mockery, argument, threatened, attacked, betrayal, kept_word, broke_word, bravery_seen, cowardice_seen, skill_seen, cruelty_seen, generosity_seen, flirt_accepted, flirt_rejected, drank_together, debt_paid, debt_owed, long_absence, rumor_bad, rumor_good, first_meeting. Each has `effects` (factor deltas), `familiarity` gain and `reveals` (traits it can teach the viewer, only if the target has them). Effects have diminishing returns near ±1.

## Memory hook
`graph.applyMemoryEvent(event, { traitsOf })` maps memory-system events to relationship events for everyone present (`memoryEvents` table): a won fight → shared_victory both ways; a kindness by B → A appreciates B; an insult by B → A resents B; a death → shared grief; a meal → warmth. Rolling events in the Lingo or Combined demo updates feelings automatically.

## API
```js
import { RelationGraph } from '/lingo/js/relations.js';
const graph = new RelationGraph(await (await fetch('/lingo/data/relations.json')).json());
graph.apply('mara', 'thalen', 'saved_life', { traits: mara.traits, targetTraits: thalen.traits, now });   // Thalen saved Mara
const rel = graph.get('mara', 'thalen');
rel.get('respect'); rel.opinion(); rel.tags(); rel.knows('brave'); rel.summary();
lingo.speak('observe_person', { speaker: mara, listener: thalen, relation: rel });     // relation → tag weights + cond helpers
lingo.converse(mara, thalen, { turns: 8, relations: graph, banks, scene });
graph.tick(now);                                   // slow fade toward neutral (per-factor decayPerDay)
JSON.stringify(graph); RelationGraph.fromJSON(json, model);
```
Condition helpers inside grammar: `warmth respect trust appreciation fear attraction familiarity opinion knows('trait') knownTraits`.

## Extending in a game
- Add factors by adding to `dimensions` + `opinionWeights` + `tags`; add events by adding to `events`; traits by `traitModifiers`.
- Group feelings: keep per-pair relationships and derive faction opinion as the mean over members, or add a `faction` pseudo-target.
- Rumours: `rumor_good/bad` exist; a gossip line can apply one to the listener's feelings about the third person.
- Not modelled: mutual awareness ("I know that you dislike me"), which a game can add by reading the reverse relationship.
