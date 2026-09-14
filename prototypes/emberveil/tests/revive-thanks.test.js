// A hero who was picked up off the ground says thank you — to the person who actually picked them up.
//
// The game writes `hero.revivedBy` and files a `revive` memory with a `by` binding (js/game.js).
// Three camp topics in conversations/data/topics.json read that memory:
//   revive_thanks          the next camp or two, plainly
//   revive_thanks_awkward  the same, for a hero too proud to say it straight
//   revive_callback        days later, unprompted — the callback
// Casting is the interesting part: the thanks has to go to the right person, so the topics use
// `bindingIs: { by: 'answerer' }` and the engine tries orderings until the memory's `by` IS the
// answerer. `minAgeHours` / `maxAgeHours` keep the fresh one and the callback apart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Lingo, Speaker } from '../../../lingo/js/lingo.js';
import { Scene } from '../../../lingo/js/context.js';
import { Conversations } from '../../../conversations/js/conversations.js';

const lingoData = f => JSON.parse(readFileSync(new URL('../../../lingo/data/' + f, import.meta.url)));
const topicsData = JSON.parse(readFileSync(new URL('../../../conversations/data/topics.json', import.meta.url)));
const REVIVE_TOPICS = ['revive_thanks', 'revive_thanks_awkward', 'revive_callback'];

function setup(seed = 5) {
  const lingo = new Lingo({ lexicon: lingoData('lexicon.json'), grammar: lingoData('grammar.json'), traits: lingoData('traits.json'), seed });
  for (const e of lingoData('packs/emberveil.json').entries) lingo.lexicon.add(e);
  lingo.invalidatePronunciations();
  const sp = (id, name, traits = []) => new Speaker({ id, name, entry: { id, type: 'person', proper: true, forms: { sg: name } }, lexicon: lingo.lexicon, speech: { traits } });
  const people = [sp('h1', 'Ardin', ['proud']), sp('h2', 'Bryn', ['kind']), sp('h3', 'Cass', ['jolly'])];
  const scene = new Scene({ id: 'z', name: 'The Border Roads', place: { id: 'z', type: 'place', proper: true, forms: { sg: 'The Border Roads' } }, tags: ['wild'], danger: 0.3 }, lingo.lexicon);
  return { lingo, conv: new Conversations({ lingo, topics: topicsData }), people, scene };
}
/** The memory js/game.js files when `by` revives `who`. */
const reviveMemory = (who, by, time = 0) => ({
  id: 'rev_' + who, type: 'revive', time,
  bindings: { by: { id: by }, place: { id: 'z' } },
  details: { how: 'a prayer and a hard slap', source: 'cleric' },
  participants: [who, by], count: 1, recalled: 1, valence: 0.9, tags: [],
});
const factsWith = (memories, now) => ({
  now, partyIds: ['h1', 'h2', 'h3'], party: { day: Math.round(now / 24) + 1 },
  memoriesOf: id => memories[id] || [], gearOf: () => [], bagOf: () => [], statsOf: () => ({}),
});

test('the three revive topics exist and are camp topics keyed off the revive memory', () => {
  for (const id of REVIVE_TOPICS) {
    const t = topicsData.topics.find(x => x.id === id);
    assert.ok(t, 'missing topic ' + id);
    assert.ok((t.tags || []).includes('camp'), id + ' should come up at camp');
    const req = (t.requires || []).find(r => r.memory === 'revive');
    assert.ok(req, id + ' does not require a revive memory');
    assert.deepEqual(req.bindingIs, { by: 'answerer' }, id + ' must cast the healer as the answerer');
    assert.equal(req.who, 'asker', id + ' must cast the revived hero as the asker');
    // enough variants that two camps in a row do not read the same
    const counts = (t.lines || []).map(l => (l.variants || [l]).length);
    assert.ok(Math.max(...counts) >= 4 || counts.reduce((a, b) => a + b, 0) >= 8, id + ' needs more variants');
  }
  const fresh = topicsData.topics.find(t => t.id === 'revive_thanks');
  const late = topicsData.topics.find(t => t.id === 'revive_callback');
  assert.ok(fresh.requires[0].maxAgeHours > 0, 'the thanks must be recent');
  assert.ok(late.requires[0].minAgeHours >= 72, 'the callback must wait a few days');
  assert.ok((late.tags || []).includes('callback'));
});

test('the thanks goes to the hero who actually did the reviving', () => {
  const { conv, people, scene } = setup(7);
  // Bryn picked Ardin up. Cass did nothing.
  const facts = factsWith({ h1: [reviveMemory('h1', 'h2')] }, 12);
  const opts = conv.eligible(people, facts, { tags: ['camp'] }).filter(o => REVIVE_TOPICS.includes(o.topic.id));
  assert.ok(opts.length >= 1, 'no revive topic came up the day after a revive');
  for (const o of opts) {
    assert.equal(o.asker.id, 'h1', o.topic.id + ': the wrong hero is giving thanks');
    assert.equal(o.answerer.id, 'h2', o.topic.id + ': the thanks went to the wrong person');
    const lines = conv.perform(o, { scene });
    assert.ok(lines.length >= 2, o.topic.id + ' produced ' + lines.length + ' lines');
    for (const l of lines) assert.ok(!/[{}]/.test(l.text), o.topic.id + ' leaked a binding: ' + l.text);
    assert.ok(lines.some(l => l.speaker.id === 'h1'), o.topic.id + ': the revived hero never spoke');
    assert.ok(lines.some(l => l.speaker.id === 'h2'), o.topic.id + ': the healer never answered');
  }
});

test('nobody thanks anybody without a revive, and the callback waits days for its moment', () => {
  const { conv, people } = setup(11);
  const none = conv.eligible(people, factsWith({}, 12), { tags: ['camp'] }).map(o => o.topic.id);
  assert.deepEqual(none.filter(id => REVIVE_TOPICS.includes(id)), [], 'a revive topic came up with no revive');

  const fresh = conv.eligible(people, factsWith({ h1: [reviveMemory('h1', 'h2')] }, 12), { tags: ['camp'] }).map(o => o.topic.id);
  assert.ok(fresh.includes('revive_thanks'), 'the fresh thanks did not come up');
  assert.ok(!fresh.includes('revive_callback'), 'the callback came up the very next day');

  const later = conv.eligible(people, factsWith({ h1: [reviveMemory('h1', 'h2')] }, 24 * 8), { tags: ['camp'] }).map(o => o.topic.id);
  assert.ok(later.includes('revive_callback'), 'the callback never came up, eight days on');
  assert.ok(!later.includes('revive_thanks'), 'the fresh thanks was still coming up a week later');
});

test('the proud version only turns up for a proud hero', () => {
  const { conv, people } = setup(13);                       // Ardin is proud, Bryn is kind
  const mine = conv.eligible(people, factsWith({ h1: [reviveMemory('h1', 'h2')] }, 12), { tags: ['camp'] }).map(o => o.topic.id);
  assert.ok(mine.includes('revive_thanks_awkward'), 'a proud hero should get the awkward version too');
  // Bryn (not proud) being the one revived: only the plain thanks
  const theirs = conv.eligible(people, factsWith({ h2: [reviveMemory('h2', 'h1')] }, 12), { tags: ['camp'] }).map(o => o.topic.id);
  assert.ok(theirs.includes('revive_thanks'));
  assert.ok(!theirs.includes('revive_thanks_awkward'), 'a hero with no pride got the proud version');
});

test('a long run of camps keeps the thanks varied', () => {
  const { conv, people, scene } = setup(19);
  const facts = factsWith({ h1: [reviveMemory('h1', 'h2')] }, 12);
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    const o = conv.eligible(people, facts, { tags: ['camp'] }).find(x => x.topic.id === 'revive_thanks');
    for (const l of conv.perform(o, { scene })) seen.add(l.text);
  }
  assert.ok(seen.size >= 8, 'only ' + seen.size + ' distinct lines over 40 camps');
});
