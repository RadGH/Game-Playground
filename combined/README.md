# Combined demo — character sheet

Proves that one character JSON drives all three experiments at once:

- `avatar` → 2D portrait (`avatar-2d/js/render.js`) and 3D body (`avatar-3d/js/mii.js`, two characters in one scene facing each other)
- `voice` → `voice-lab/js/voice.js` `say()`; espeak receives lingo's `[[phoneme]]` speech text so invented names are pronounced
- `speech` → `lingo/js/lingo.js` `Speaker` (traits, sliders, custom slots, tics, mood); the conversation planner picks intents from opinion + traits

Open: `http://<LAN-IP>:8400/combined/`. Data: `data/characters.json` (5 full characters: Thalen, Mara, Bran, Kaelith, Pip). `shared/character.example.json` is copied from the first one.

## What you can do
- Pick A and B from the roster or roll a random character (random avatar within race rules, random espeak voice preset, random traits/sliders/tic).
- Set each one's mood and opinion of the other.
- "A says it to B" for any intent, or run a whole conversation: each line is generated, shown as a subtitle over the 3D stage, spoken with the character's voice while their body plays the `talk` animation, and logged with the phrase id and tags.
- Choose the voice engine for everyone (each character's own JSON, or formant / espeak / babble / piper / Web Speech), mute, or force babble.
- Each card shows how that character feels about the other (warmth, respect, trust, fear knobs, tags such as rival or grateful) with relationship events to apply; memory rolls update feelings automatically (`lingo/RELATIONS.md`).
- Test voice / wave / walk / die buttons per character. Full JSON copy/export/import/apply for A.

## Integration pattern for a game

```js
const line = lingo.speak(intent, { speaker: spA, listener: spB, opinion });   // text + speech + tags
body.setAnim('talk');
const { result, done } = await say(line.speech, character.voice);             // synthesize (cached) + play
await done; body.setAnim('idle');
```
Keep the three sections independent: a game that only wants portraits can drop `voice` and `speech`; one that only wants barks can keep `voice` and a trimmed grammar.

## Tests
`npm test -- combined` (Playwright): loads, speaks a line (voice synthesized headlessly), runs a conversation, screenshot in `test-results/combined.png`.
