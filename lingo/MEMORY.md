# Memories and scene awareness — design for future games

This describes the memory system (`js/memory.js`) and the scene/context system (`js/context.js`) that sit on top of Lingo. The idea comes from Dwarf Fortress (dwarves remember events weighted by their personality) and RimWorld (thoughts that fade). Characters remember what happened to them, weighted by who they are; memories fade unless they were important, repeated, or retold; and when two characters talk, they bring up what is salient *and relevant* to where they are and who they are talking to.

## 1. The model

**Event** (what the game reports): `{ type, time, bindings, details, participants }`
- `type`: one of `data/events.json` (`combat kill death wounded levelup skill join leave loot travel meal insulted kindness omen lore lineage` — games add their own).
- `time`: game time in hours. The system never looks at the wall clock.
- `bindings`: the nouns, as lexicon ids with optional counts: `{ foe: { id: 'goblin', count: 10 }, place: { id: 'the_maw' }, weapon: { id: 'axe' }, ally: { id: 'thalen' } }`. Any lexicon entry works (races, spells, items, people, places, deities, body parts…). Unknown ids still render (as their id) so a game can pass raw strings.
- `details`: free values the grammar can read: `outcome: 'won'|'fled'|'lost'`, `how: 'a clean stroke'`, `level: 7`, `impression`, `why`, `worth`, `quality`, `what`, `sign`, `relation`…
- `participants`: character ids who were there. Drives *shared* memories ("Remember? You were there.") and relevance.

**Memory** (what a character stores): the event plus
- `importance` 0..1 = event type base importance × the owner's trait multipliers (`traitWeights` in events.json: a `bloodlust` orc stores combat at 1.6×, a `kind` healer stores kindness at 1.5× and cruelty at 0.6×; `greedy` doubles loot).
- `halfLife` (hours) from the type: meals fade in 2 days, fights in 10, deaths in 120, lore never.
- `valence` −1..1 (emotional sign) for tone selection.
- `count` (merged repeats), `recalled` (times retold), `lastRecalled`, `core` (never forgotten: deaths, anything ≥ 0.9 importance).

**Salience** (how present it is right now):
```
salience = importance × 0.5^(age / halfLife) × (1 + 0.15·ln(1 + recalled)) × (1 + 0.25·ln(count))
core memories never drop below 0.2
```
`tick(now)` forgets memories under `forgetBelow` (0.04) and trims to `maxMemories` (300), lowest first.

**Merging**: a new event of the same type whose `mergeKeys` bindings match an existing memory within 36 hours merges into it: `count += 1`, foe counts add up, importance +0.05. "We fought goblins three times today" becomes one memory that says so.

**Relevance** when choosing what to talk about (multiplies salience):
- listener was a participant ×1.6 (shared memory) · scene place matches ×1.6 · scene threat matches the memory's foe ×1.8 · overlapping tags ×1.2 each · already retold ×0.6

**Recall**: `bank.recall(now, { scene, listenerId, rng })` weighted-picks one memory above `minSalience` (0.08), marks it recalled, and returns it. `lingo.speakAbout(memory, bank, now, ctx)` turns it into a line through the intent named by its type (`recall_combat`, `recall_death`, …) with bindings `memory.when` ("3 days ago"), `memory.ago`, `memory.bucket` (`now today yesterday recent weeks old ancient`), `memory.count`, `memory.times`, `memory.shared`, `memory.outcome`… plus the nouns (`foe`, `place`, `ally`, `weapon`, `victim`, `newcomer`, `by`, `item`, `skill`, `figure`…) as full entities (plurals, articles, pronouns all work).

**World knowledge** is the same mechanism with `halfLifeDays: 100000`: `lore` (historical figures, tagged `historical` in the lexicon) and `lineage` memories. Seed them per character at creation; a `scholar` weights them 2.5× so they surface in conversation, a `drunkard` 0.5×.

## 2. Scene awareness

`new Scene(def, lexicon)` with `def = { place, tags, threats: [{ id, count }], weather, timeOfDay, danger, comfort, smell, sound }` (examples in `data/scenes.json`).
- `scene.bindings()` → `here`, `threat`, `threat2`, `weather`, `scene.{smell,sound,tags,danger,comfort,timeOfDay}` are injected into every `speak()` call that passes `scene` in its context.
- `scene.tagWeights()` multiplies phrase tags: danger raises `fear`/`worried`/`alert`/`short`, comfort raises `relaxed`/`joke`/`drink`/`romantic`; tags like `dark damp cold enclosed holy crowded ruined wild wet hot night` are boosted ×3 so `observe` lines match the place.
- Conditions can use `sceneHas('damp')`, `danger`, `comfort`, `timeOfDay`, `threat`, `weather`.
- Intents: `observe` (the surroundings), `fear` (a threat), `plan` (what to do), `relief` (safe and warm).
- Planner (`planConversation` / `converse`): `scenePools(scene)` replaces the usual small-talk pool with scene beats 75% of the time in danger ≥ 0.6, 50% at ≥ 0.35, 45% when comfort ≥ 0.7; memories are brought up with probability ≈ 0.9 × strongest salience (max 0.6), and the listener answers with `recall_reply` ("I was there." / "You've told me twice.").

## 3. API summary

```js
import { MemoryBank, generateEvent, memoryBindings, DAY } from '/lingo/js/memory.js';
import { Scene } from '/lingo/js/context.js';
const EV = (await (await fetch('/lingo/data/events.json')).json()).types;

const bank = new MemoryBank({ ownerId: 'mara', traits: mara.traits, eventTypes: EV, lexicon: lingo.lexicon });
bank.remember({ type: 'combat', time: now, bindings: { foe: { id: 'orc_raider', count: 10 }, place: { id: 'frostspine_pass' }, weapon: { id: 'axe' }, ally: { id: 'thalen' } }, details: { outcome: 'won' }, participants: ['mara', 'thalen'] }, now);
bank.tick(now);                                   // call when time passes (forgetting)
bank.list(now);                                   // [{ memory, salience }] strongest first (for UI)
const line = lingo.speakMemory(bank, now, { speaker: mara, listener: thalen, scene });   // or null
const reply = lingo.replyToMemory(line.memory, now, { speaker: thalen, listener: mara });
lingo.converse(mara, thalen, { turns: 8, banks: { mara: bank, thalen: bank2 }, now, scene });
JSON.stringify(bank); MemoryBank.fromJSON(json, { eventTypes: EV, lexicon });            // save games
```

## 4. Extending in a game
- Add event types to `events.json` (importance, halfLifeDays, traitWeights, mergeKeys, intent) and a `recall_<type>` symbol to the grammar. Keep `bindings` names consistent (`foe`, `place`, `ally`, `victim`, `by`, `item`…) so the shared helper phrases (`{#recall_when}`) work.
- Feed real events from the simulation: combat resolution, deaths, level-ups, recruiting, loot, travel, meals, social slights, kindnesses, omens. Set `participants` from who was present; that is what makes "remember when we…" work.
- Mood: a game can nudge `speech.mood` from recent memory valence (sum of salience × valence) so grief and pride show in every line, not only in reminiscing.
- Multiple listeners: pass the whole group's ids and pick the relevance winner per listener.
- Not modelled yet: false memories/rumours (a memory with `participants` empty and `details.source = 'heard from X'` would do it), opinion changes caused by memories (game-side: kindness raises opinion of `by`, insult lowers it), and memory sharing (telling a memory could `remember` it into the listener as a `lore`-like second-hand memory).

## 5. Demo
Lingo page → "Scene" and "Memories" panels: pick a scene, roll random events into A's and B's banks, pass hours/days, watch salience bars fade and memories vanish, click "Reminisce" or run a conversation. Combined page has the same panels driving the talking 3D characters.
