// The Narrator reads scene text, and every skill check in the game is written the same way.
//
// Two small rules with one big consequence each:
//  * a paragraph describing what the party is looking at is never spoken by a hero or an NPC
//    (the event data labels those `speaker: "hero"`, which is how "A massive wolf is caught in a
//    rusted trap" ended up coming out of a party member's mouth);
//  * a roll always reads "CON 18 + d20 (rolled 2) = 20 vs 20: pass", wherever it happened.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Lingo } from '../../../lingo/js/lingo.js';
import { Talk, isSceneText, NARRATOR_ID } from '../js/talk.js';
import { checkText } from '../js/ui.js';
import { ROLE_VOICES } from '../../../shared/voices.js';

const lingoData = f => JSON.parse(readFileSync(new URL('../../../lingo/data/' + f, import.meta.url)));
const randomEvents = JSON.parse(readFileSync(new URL('../data/random-events.json', import.meta.url))).RANDOM_EVENTS;

function mkTalk() {
  const lingo = new Lingo({ lexicon: lingoData('lexicon.json'), grammar: lingoData('grammar.json'), traits: lingoData('traits.json'), seed: 3 });
  for (const e of lingoData('packs/emberveil.json').entries) lingo.lexicon.add(e);
  lingo.invalidatePronunciations();
  return new Talk({ lingo, game: { zoneId: 'border_roads', day: 2, party: [], namedSlain: [], zone: () => ({ name: 'The Border Roads', act: 1 }), classDef: () => ({ role: '' }) } });
}

test('scene text is told apart from somebody talking', () => {
  const scene = [
    'A massive wolf is caught in a rusted trap, too exhausted to snarl. Its eyes track you with guarded intelligence.',
    'The rope bridge sways over a chasm. Half the planks are missing. The other half are rotten.',
    'Your companions: silence, and the sound of the fire going out.',
    'A fox trots across your path. It casts two shadows in different directions.',
    'The sky turns the colour of bruised flesh.',
    'A companion challenges you to a sparring match. "Come on, we\'re getting soft sitting around camp."',
  ];
  const said = [
    "I'm out of arrows!",
    'Get behind me. I mean it.',
    'My leg still aches from that.',
    'We should not be here.',
    '"Kneel, and the knife is kind."',
    "Let's move before it wakes up.",
  ];
  for (const t of scene) assert.equal(isSceneText(t), true, 'should be narration: ' + t);
  for (const t of said) assert.equal(isSceneText(t), false, 'should be speech: ' + t);
  assert.equal(isSceneText(''), false);
  assert.equal(isSceneText(null), false);
});

test('the event data really is mostly scene text, and the classifier catches it', () => {
  const heroLines = randomEvents.flatMap(e => (e.lines || []).filter(l => l.speaker === 'hero').map(l => l.text));
  assert.ok(heroLines.length > 50, 'expected a lot of hero-labelled lines, saw ' + heroLines.length);
  const narration = heroLines.filter(isSceneText).length;
  assert.ok(narration / heroLines.length > 0.9,
    `only ${narration} of ${heroLines.length} hero-labelled lines were recognised as scene text`);
});

test('the Narrator is its own speaker with its own voice, and always the same one', () => {
  assert.ok(ROLE_VOICES.narrator, 'shared/voices.js has no narrator role');
  const talk = mkTalk();
  const n = talk.narrator();
  assert.equal(n.id, NARRATOR_ID);
  assert.equal(n.isNarrator, true);
  assert.equal(n.short, 'Narrator');
  assert.equal(n.voice.role, 'narrator');
  assert.equal(n.voice.engine, 'formant');
  assert.ok(n.voice.speed < 0.45, 'the Narrator should not gabble');
  assert.equal(talk.narrator(), n, 'the Narrator must be the same object, or the voice drifts');

  const line = talk.narrate('The cliff above groans. Pebbles skitter down.');
  assert.equal(line.who.id, NARRATOR_ID);
  assert.equal(line.line.narration, true);
  assert.equal(line.line.text, 'The cliff above groans. Pebbles skitter down.');
  assert.equal(line.line.speech, line.line.text);
  assert.equal(talk.narrate('  '), null);
  assert.equal(talk.narrate(null), null);
  // a generated line goes through the same door
  assert.equal(talk.narrateLine({ text: 'Something moves in the dark.' }).who.id, NARRATOR_ID);
  // and the Narrator is not one of the party: it never gets a lingo Speaker, so it has no tics
  assert.equal(talk.speakers.has(NARRATOR_ID), false);
});

test('a skill check reads the same wherever it came from', () => {
  assert.equal(checkText({ stat: 'CON', best: 18, roll: 2, dc: 20, ok: true }),
    'CON 18 + d20 (rolled 2) = 20 vs 20: pass');
  assert.equal(checkText({ stat: 'DEX', best: 11, roll: 3, dc: 16, ok: false }),
    'DEX 11 + d20 (rolled 3) = 14 vs 16: fail');
  // an extra from traits or the right words is named
  assert.equal(checkText({ stat: 'INT', best: 14, bonus: 4, bonusLabel: 'the right words', roll: 9, dc: 20, ok: true }),
    'INT 14 +4 (the right words) + d20 (rolled 9) = 27 vs 20: pass');
  // when the rules convert the attribute into a smaller bonus, both numbers are shown
  assert.equal(checkText({ stat: 'STR', best: 18, statBonus: 6, roll: 3, dc: 12, ok: false }),
    'STR 18 (+6) + d20 (rolled 3) = 9 vs 12: fail');
  assert.ok(!/[{}]/.test(checkText({})));
});
