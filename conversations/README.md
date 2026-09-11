# Conversations (`conversations/`)

Why: the Party Quest camp talk was a random string of intents. A character mentioned a memory once and nobody answered it.
This experiment adds **structure**: a conversation is a small script (a *topic*) with roles, and it only runs when the
party actually has the facts it talks about.

## How it works
- `data/topics.json` holds topics: `{ id, tags, weight, requires: [...], lines: [{ role, to?, optional?, variants: [{ t, cond? }] }] }`.
- Roles: `asker` opens, `answerer` is the one who has the memory/gear the topic is about, `third` chimes in (optional lines are dropped if there is no third speaker).
- Requirements are checked against a `facts` object and, when satisfied, produce bindings for the templates:
  - `memory: 'combat'` (+ `maxAgeHours`, `details: { wounded: true }`) → `memory.*`, `foe`, `place`, `item` entities from the memory bindings.
  - `gear: { minKills, delta: 'better'|'worse', maxDaysAgo, replaced, slot }` → `weapon`, `gear.{kills,damage,delta,deltaAbs,replaced,daysAgo}` (kill counts come from the damage meter's per-item stats; deltas from the game's loot log which records the score difference against the item it replaced).
  - `bag: { minDaysAgo }` → items found but never equipped (`bagItem`, `bag.daysAgo`).
  - `stats: { damage: 'top' | number, fights, kills, healing, downs }` from the meter.
  - `party: { rations: { max: 2 }, act: { min: 2 }, vehicle, nextBoss, companion }`, `trait`, `notTrait`, `relation: { to, min, max }`.
- Casting tries every speaker as the answerer; the first that satisfies the requirements gets the role, the others become asker and third.
- Variants can carry a `cond` (`has('gruff')`, `gear.kills>=2`, `memory.wounded===true`, `party.rations===0`).
- Every line is spoken through `lingo.speak()` so the speaker's prefix/suffix/tics/formality apply and a `speech` string (respelled names) comes back for the voice engine.
- `factsFrom({ now, day, banks, heroes, meter, lootLog, party, relations })` builds the facts object from a game's own data.
- `conv.talk(speakers, facts, { tags, rng })` picks an eligible topic (weighted; topics with more requirements are preferred because they are more specific; the last 8 topics are avoided) and performs it. `conv.eligible()` lists what could run.

## Content
26 topics with 2–4 variants per line (recaps of a fight, the worst moment, weapon kill-count brag, top-damage ribbing, going down, new gear better/worse than the replaced piece, items left in the bag, loot found, level ups, the road, low rations, exhaustion, the wagon, last night's attack, opinions warm/cold, Silas doubts, what the Veil is, the boss ahead, the companion, the sky, grief, a jolly song, scholar lore, the healer's tally). Emberveil 2 uses them at every rest; Party Quest could use them at camp by supplying the same facts.

## Demo
`index.html`: toggle facts and watch the eligible topic list change, then generate conversations.

## Limits / next
- Lines are English templates; a topic is 3–5 turns. Longer arcs (a topic that continues the next night) need a "thread" field — not built.
- No memory of what was said: the engine avoids repeating a topic, but a game should also record a `conversation` memory if it wants callbacks ("you said that last night").
