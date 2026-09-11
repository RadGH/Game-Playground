# Party Quest (prototype 1)

A throwaway game built from the experiments: four party members, a village with problems, a small map, turn-based auto-battles
with talking characters, a night camp where the party chats about the day, and a town that remembers what you did.

Open `http://<lan-ip>:8400/prototypes/party-quest/`. Voice is on by default (the Formant engine); tick **mute** in the top bar to silence it,
or pick another engine from the dropdown.

## What is in it

| Feature | Where | Built from |
|---|---|---|
| Party assembly: library blueprints, the default party ("The Roadsworn"), random four, or a custom member (name/race/gender/class/traits) | `js/main.js` `setupParty` | `library/js/library.js` (`stamp`), `library/js/make.js` (`makeCharacter`) |
| Classes with kits (warrior, ranger, rogue, mage, cleric, bard), flat damage numbers, no stats | `data/rules.json` | Item Vault ids for kit items |
| Weapons, armour, implements (an implement carries a spell), potions, sellable treasures | `js/combat.js` `itemStats` | `items/js/items.js` |
| Turn-based auto-battle: party acts then enemies; spells with cooldowns; bosses; regenerating trolls | `js/combat.js` `Combat` | pure logic, unit-tested |
| Reactive dialog: taunts at the start, a line when bloodied, when an ally goes down, on kills, on spells, after a win | `js/talk.js` `combatReaction` | Lingo intents `combat_taunt combat_hurt ally_down combat_kill relief brag` |
| Cinematic 3D stage: party on the left, NPCs/enemies on the right, thrust attack, "dead" pose, speech bubbles projected from the 3D heads, SVG backdrop per location, day/night lighting | `js/stage.js` | `avatar-3d/js/mii.js`, `avatar-3d/js/scene.js` |
| Town: 5–6 generated NPCs with roles and dispositions, quests, market (buy from a rolled stock, sell anything), inn, healer | `js/town.js`, `main.js` `talkTo/shop/inn` | Name Forge + Item Vault + relationship graph |
| Deeds: clearing a dungeon adds a deed; townsfolk get a `deed` memory and greet you with it; reputation nudges their respect | `js/town.js` `spreadDeeds` | `lingo/js/memory.js` + `recall_deed` lines |
| Travel: pick a direction, 1–3 events per leg (combat, wanderer to talk to, find an item, timing-bar minigame, vista, rest) | `js/travel.js`, `main.js` `travel` | `data/world.json` `travelEvents` |
| Time of day: six slots, sun/moon dot in the top bar, travel and rest advance it; night forces a camp choice on the road | `js/state.js` `advance/newDay` | |
| Camp: campfire scene, two or three fireside conversations built from memories of the day, feelings, and what they have learned about each other; heals half; new day | `main.js` `camp` | `lingo.converse` with `banks`, `relations`, `scene` |
| Area descriptions and lore on first arrival, spoken by the most scholarly member | `main.js` `arrive` | `observe`/`fear` intents + `lore` text |
| Memories and feelings for every party member and NPC, saved with the game | `js/state.js` `remember` | `MemoryBank`, `RelationGraph` |
| Save/load in localStorage; Save any party member, townsperson or wanderer to the library | `js/state.js` `save/load`; `library.putCharacter` | |

## Files

- `index.html`, `style.css`: the page (three screens: title, party, world).
- `js/main.js`: the controller. Loads everything, owns the screens, runs travel/combat/camp flows.
- `js/state.js`: `Game` (party, bag, gold, reputation, quests, deeds, time, memory banks, relation graph, save/load).
- `js/combat.js`: `Combat` and `itemStats`. No DOM.
- `js/talk.js`: `Talk` (lingo Speakers for anyone, scene from a location, voice playback, combat reaction picker).
- `js/stage.js`: `Stage` (3D layout, animations, backdrops, campfire).
- `js/town.js`, `js/travel.js`, `js/rng.js`.
- `data/rules.json`: classes, spells, damage tables, enemies, levels, time, prices.
- `data/world.json`: 12 locations, encounter pools, 5 quests, NPC roles, travel events and minigames.
- `tests/combat.test.js` (node), `tests/party-quest.spec.js` (Playwright smoke run through a fight, a camp and save/load).

## Debug handle

`window.partyQuest` exposes `game`, `stage`, `talk`, `library`, `lingo`, `items`, `rules`, `world`, and the flows `fight(enemyIds, {place, boss})`, `camp()`, `travel(dir, to)`, `arrive(locId)`.

## Known limits

- Beasts (wolves, spiders) are drawn as Mii bodies with the "beast" avatar preset; there are no animal models.
- Combat is fully automatic. There are no player choices inside a fight (by design for this prototype).
- Losing a fight costs half your gold and a day; nobody dies permanently.
