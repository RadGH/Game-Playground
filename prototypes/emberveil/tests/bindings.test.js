// Nothing the player reads may ever contain an unfilled binding.
//
// The bug this pins down: "{weapon?}" turned up in a spoken line. Lingo writes `{name?}` when a
// template asks for a binding the caller never supplied, and `.thing?` when it asks for a field an
// object does not have. Both are debug markers — useful in the lab, embarrassing in the game.
//
// So this renders a large sample of everything the game can say — every grammar symbol, every
// memory type the game actually records, every conversation topic and every thread line — with the
// binding sets the game really passes, and asserts none of it comes back with a brace in it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Lingo, Speaker, Entity } from '../../../lingo/js/lingo.js';
import { MemoryBank } from '../../../lingo/js/memory.js';
import { Scene } from '../../../lingo/js/context.js';
import { Conversations, expandVariants } from '../../../conversations/js/conversations.js';
import { Talk } from '../js/talk.js';

const lingoData = f => JSON.parse(readFileSync(new URL('../../../lingo/data/' + f, import.meta.url)));
const lexicon = lingoData('lexicon.json'), grammar = lingoData('grammar.json');
const traits = lingoData('traits.json'), events = lingoData('events.json'), pack = lingoData('packs/emberveil.json');
const topicsData = JSON.parse(readFileSync(new URL('../../../conversations/data/topics.json', import.meta.url)));
const threadsData = JSON.parse(readFileSync(new URL('../../../conversations/data/threads.json', import.meta.url)));

/** The markers Lingo leaves behind: {binding?}, {#symbol?}, and a `.field?` on an object. */
const LEAK = /\{|\}|\.[A-Za-z_]\w*\?/;
const why = t => (t.match(/\{[^}]*\}?|\.[A-Za-z_]\w*\?/g) || []).join(' ');

function mk(seed = 5) {
  const lingo = new Lingo({ lexicon, grammar, traits, seed });
  for (const e of pack.entries) lingo.lexicon.add(e);
  lingo.invalidatePronunciations();
  return lingo;
}
const speaker = (lingo, id, name, sp = {}) => new Speaker({
  id, name, entry: { id, type: 'person', proper: true, forms: { sg: name } },
  lexicon: lingo.lexicon, speech: { traits: [], ...sp },
});
const sceneFor = lingo => new Scene({
  id: 'border_roads', name: 'The Border Roads',
  place: { id: 'border_roads', type: 'place', proper: true, forms: { sg: 'The Border Roads' } },
  tags: ['wild', 'quiet'], danger: 0.4, comfort: 0.4, timeOfDay: 'day',
}, lingo.lexicon);

// ---------------------------------------------------------------- 1. every grammar symbol
// The bindings the game hands a plain spoken line: a speaker, usually a listener, the scene, and —
// since talk.js added them — what is in the speaker's hand.
test('every grammar pool renders clean with the bindings a spoken line really gets', () => {
  const lingo = mk(17);
  const game = { zoneId: 'border_roads', day: 6, namedSlain: [], party: [], zone: () => ({ name: 'The Border Roads', act: 1 }), classDef: () => ({ role: '' }) };
  const talk = new Talk({ lingo, game });
  const hero = { id: 'h1', name: 'Ardin', short: 'Ardin', class: 'ranger', speech: { traits: [] }, equipment: { weapon: { id: 'w1', baseKey: 'shortbow', name: 'Shortbow', subtype: 'bow' } } };
  const other = { id: 'h2', name: 'Bryn', short: 'Bryn', class: 'cleric', speech: { traits: [] } };
  const foe = { id: 'e1', name: 'goblin', templateId: 'goblin' };

  // the intents the game only ever speaks about a memory are covered in the next test
  const memoryIntents = new Set(Object.values(events.types).map(t => t.intent).filter(Boolean));
  const skip = new Set([...memoryIntents, 'recall_when', 'recall_generic', 'recall_reply']);
  const symbols = Object.keys(grammar.symbols).filter(s => !s.startsWith('_') && !skip.has(s));
  assert.ok(symbols.length > 60, 'expected most of the pool list, saw ' + symbols.length);

  const bad = [];
  for (const intent of symbols) {
    for (let i = 0; i < 40; i++) {
      const out = talk.line(hero, intent, {
        to: other,
        bindings: { foe: talk.foeEntity(foe, { count: 3 }), fallen: talk.speaker(other).entity },
      });
      const text = out?.text || '';
      if (text && LEAK.test(text)) bad.push(`${intent}: ${why(text)} in "${text}"`);
    }
    // and the same pool spoken by a mouth with nothing in its hands and nobody to talk to
    for (let i = 0; i < 20; i++) {
      const out = talk.line({ id: 'bare', name: 'Bare', short: 'Bare', speech: { traits: [] } }, intent, {
        bindings: { foe: talk.foeEntity(foe), fallen: talk.speaker(other).entity },
      });
      const text = out?.text || '';
      if (text && LEAK.test(text)) bad.push(`${intent} (bare hands): ${why(text)} in "${text}"`);
    }
  }
  assert.deepEqual(bad.slice(0, 10), [], `${bad.length} lines came out with an unfilled binding`);
});

// ---------------------------------------------------------------- 2. every memory the game records
// Each row is a memory exactly as js/game.js and js/effects.js write it, so this fails the moment a
// recall phrase asks for something the game does not actually put in the memory.
const GAME_MEMORIES = [
  ['combat', { foe: { id: 'goblin', count: 4 }, place: { id: 'border_roads' }, ally: { id: 'h2' } }, { outcome: 'won', hard: true }],
  ['kill', { foe: { id: 'goblin', count: 3 }, place: { id: 'border_roads' } }, { how: 'a long ugly grind' }],
  ['wounded', { foe: { id: 'goblin', count: 1 }, place: { id: 'border_roads' } }, { down: true }],
  ['wounded', { foe: { id: 'goblin', count: 1 }, place: { id: 'border_roads' } }, { down: false }],
  ['death', { foe: { id: 'goblin', count: 1 }, place: { id: 'border_roads' }, victim: { id: 'h2' } }, { outcome: 'lost' }],
  ['loot', { item: { id: 'shortbow' }, place: { id: 'border_roads' } }, { worth: 'a good haul' }],
  ['travel', { place: { id: 'thornwood' } }, {}],
  ['travel', { place: { id: 'border_roads' } }, { crossing: 'ford', outcome: 'crossed', note: 'the ford' }],
  ['meal', { food: { id: 'trail_ration' }, place: { id: 'border_roads' } }, { quality: 'good' }],
  ['join', { newcomer: { id: 'h3' }, place: { id: 'border_roads' } }, { role: 'companion' }],
  ['leave', { leaver: { id: 'h3' }, place: { id: 'border_roads' } }, { why: 'walked away' }],
  ['levelup', {}, { level: 7 }],
  ['skill', { skill: { id: 'fireball' }, teacher: { id: 'h2' } }, { name: 'Fireball' }],
  ['deed', { hero: { id: 'h1' }, place: { id: 'border_roads' } }, { what: 'cut down eleven of them' }],
  ['deed', { item: { id: 'shortbow' }, place: { id: 'border_roads' } }, { deed: 'named the bow' }],
  ['nemesis', { foe: { id: 'goblin' }, place: { id: 'border_roads' } }, { name: 'Vekkash the Ember-Tongued', outcome: 'beat_us' }],
  ['nemesis', { foe: { id: 'goblin' }, place: { id: 'border_roads' } }, { name: 'Vekkash the Ember-Tongued', outcome: 'slain' }],
  ['conversation', { with: { id: 'h2' }, place: { id: 'border_roads' } }, { topic: 'fight_recap', said: 'we won' }],
  ['revive', { by: { id: 'h2' }, place: { id: 'border_roads' } }, { how: 'a prayer and a hard slap', source: 'cleric' }],
  ['kindness', { by: { id: 'h2' } }, { what: 'carried me out' }],
  ['insulted', { by: { id: 'h2' } }, { what: 'called me useless' }],
  ['omen', { place: { id: 'border_roads' } }, { sign: 'two shadows' }],
  ['lore', { place: { id: 'border_roads' } }, { about: 'the old road' }],
  ['lineage', {}, { name: 'a grandmother nobody met' }],
];

test('every memory the game actually records can be spoken without a hole in it', () => {
  const lingo = mk(23);
  const a = speaker(lingo, 'h1', 'Ardin'), b = speaker(lingo, 'h2', 'Bryn');
  for (const id of ['h1', 'h2', 'h3']) lingo.lexicon.add({ id, type: 'person', proper: true, forms: { sg: id === 'h1' ? 'Ardin' : id === 'h2' ? 'Bryn' : 'Cass' } });
  lingo.invalidatePronunciations();
  const bank = new MemoryBank({ owner: 'h1', eventTypes: events.types, lexicon: lingo.lexicon });
  const scene = sceneFor(lingo);
  const bad = [];
  const types = new Set();
  for (const [type, bindings, details] of GAME_MEMORIES) {
    assert.ok(events.types[type], 'lingo/data/events.json has no memory type ' + type);
    types.add(type);
    const m = { id: 'm_' + type, type, time: 0, bindings, details, participants: ['h1', 'h2'], count: 1, recalled: 1, valence: 0.2, tags: [] };
    for (let i = 0; i < 60; i++) {
      for (const out of [lingo.speakAbout(m, bank, 120, { speaker: a, listener: b, scene }),
        lingo.replyToMemory(m, 120, { speaker: b, listener: a, scene })]) {
        const text = out?.text || '';
        if (text && LEAK.test(text)) bad.push(`${type}: ${why(text)} in "${text}"`);
      }
    }
  }
  // every memory type the game can write has a row above
  for (const type of Object.keys(events.types)) assert.ok(types.has(type), 'no sample memory for type ' + type);
  assert.deepEqual(bad.slice(0, 10), [], `${bad.length} memory lines came out with an unfilled binding`);
});

// ---------------------------------------------------------------- 3. every conversation topic
/** Everything conversations.js bindingsFor() can ever produce, so a template may use any of it. */
function fullBindings(lingo, roles) {
  const ent = (id, type, forms, extra = {}) => new Entity({ id, type, forms, ...extra }, { lexicon: lingo.lexicon });
  return {
    ...roles, self: roles.asker, other: roles.answerer,
    memory: {
      when: 'yesterday', count: 2, outcome: 'won', how: 'badly', hard: true, wounded: false, down: false,
      name: 'Vekkash the Ember-Tongued', note: 'the ford', crossing: 'ford', itemName: 'Oakroot Bow',
      worth: 'a good haul', level: 7, quality: 'good', what: 'carried me out', why: 'walked away',
      role: 'companion', topic: 'fight_recap', said: 'we won', source: 'cleric', sign: 'two shadows', about: 'the old road', deed: 'named the bow',
    },
    weapon: ent('shortbow', 'item', { sg: 'shortbow', pl: 'shortbows' }),
    gear: { name: 'Shortbow', kills: 9, damage: 640, delta: 14, deltaAbs: 14, replaced: 'the old one', daysAgo: 2, rarity: 'rare', slot: 'weapon' },
    bagItem: ent('ring', 'item', { sg: 'ring', pl: 'rings' }),
    bag: { name: 'Ring of Ash', daysAgo: 5, rarity: 'magic' },
    stats: { kills: 12, damage: 900, fights: 5, downs: 1, healing: 210 },
    party: {
      day: 9, rations: 3, exhaustion: 0, act: 2, gold: 140, torches: 2, bandages: 1,
      vehicle: 'hand_cart', vehicleName: 'hand cart', nextBoss: 'The Ashen Gate', companion: 'wolf pup',
      companionKills: 3, companionHurt: false, namedSeen: 2, lastNamed: 'Vekkash', activeQuest: 'The Brood Mother',
      questGold: 120, lastQuestDone: 'The Ford', shrineToday: false, nodesTravelled: 12, companions: 1,
    },
    foe: ent('goblin', 'creature', { sg: 'goblin', pl: 'goblins' }, { count: 3 }),
    place: ent('border_roads', 'place', { sg: 'the Border Roads' }, { proper: true }),
    item: ent('ring', 'item', { sg: 'ring', pl: 'rings' }),
    itemName: 'Oakroot Bow',
    newcomer: roles.third, leaver: roles.third, by: roles.answerer, victim: roles.third,
    ally: roles.third, hero: roles.asker, with: roles.answerer,
    skill: ent('fireball', 'skill', { sg: 'fireball', pl: 'fireballs' }),
    teacher: roles.answerer, food: ent('trail_ration', 'thing', { sg: 'trail ration', pl: 'trail rations' }),
  };
}

test('every conversation topic and thread line renders clean', () => {
  const lingo = mk(31);
  expandVariants(topicsData, { perLine: 2, seed: 11 });           // the game does this at load
  const conv = new Conversations({ lingo, topics: topicsData });
  const scene = sceneFor(lingo);
  const roles = { asker: speaker(lingo, 'h1', 'Ardin'), answerer: speaker(lingo, 'h2', 'Bryn'), third: speaker(lingo, 'h3', 'Cass') };
  const b = fullBindings(lingo, roles);
  const bad = [];
  let rendered = 0;

  const check = (label, list) => {
    for (const t of list) {
      for (const line of t.lines || []) {
        for (const v of line.variants || [line]) {
          if (!v.t) continue;
          for (let i = 0; i < 6; i++) {
            rendered++;
            const ctx = { speaker: roles[line.role] || roles.asker, listener: roles.answerer, scene, ...b };
            const out = conv.speakLine(t, v, ctx);
            const text = out?.text || '';
            if (text && LEAK.test(text)) { bad.push(`${label} ${t.id}: ${why(text)} in "${text}"`); break; }
          }
        }
      }
    }
  };
  check('topic', topicsData.topics);
  // thread stages are shaped like topics; give each stage the same treatment
  for (const th of threadsData.threads || []) check('thread ' + th.id, (th.stages || []).map(s => ({ id: s.id, lines: s.lines, tags: th.tags })));

  assert.ok(rendered > 4000, 'expected a big sample, rendered ' + rendered);
  assert.deepEqual(bad.slice(0, 10), [], `${bad.length} conversation lines came out with an unfilled binding`);
});

test('a live camp conversation, run many times over real facts, never leaks a binding', () => {
  const lingo = mk(43);
  const conv = new Conversations({ lingo, topics: topicsData });
  const scene = sceneFor(lingo);
  const people = [speaker(lingo, 'h1', 'Ardin', { traits: ['gruff'] }), speaker(lingo, 'h2', 'Bryn', { traits: ['kind'] }),
    speaker(lingo, 'h3', 'Cass', { traits: ['jolly', 'scholar'] }), speaker(lingo, 'h4', 'Dain', { traits: ['cynical'] })];
  const bank = {};
  for (const p of people) {
    bank[p.id] = { memories: GAME_MEMORIES.map(([type, bindings, details], i) => ({ id: `${p.id}_${i}`, type, time: -i, bindings, details, participants: people.map(x => x.id), count: 1, recalled: 1, valence: 0.2, tags: [] })) };
  }
  const item = { id: 'w1', baseKey: 'shortbow', name: 'Shortbow', rarity: 'rare', slot: 'weapon' };
  const facts = {
    now: 6, partyIds: people.map(p => p.id), party: { day: 9, rations: 3, exhaustion: 0, act: 2, gold: 140, vehicleName: 'hand cart', nextBoss: 'The Ashen Gate', companion: 'wolf pup', companionKills: 3, namedSeen: 2, lastNamed: 'Vekkash', activeQuest: 'The Brood Mother', questGold: 120, lastQuestDone: 'The Ford' },
    memoriesOf: id => bank[id].memories,
    gearOf: () => [{ item, slot: 'weapon', kills: 9, damage: 640, delta: 14, replaced: 'a club', daysAgo: 2, lexId: 'shortbow' }],
    bagOf: () => [{ item: { baseKey: 'ring', name: 'Ring of Ash', rarity: 'magic' }, daysAgo: 6 }],
    statsOf: () => ({ kills: 12, damage: 900, fights: 5, downs: 1, healing: 210 }),
  };
  const bad = [];
  let lines = 0;
  for (let i = 0; i < 400; i++) {
    for (const l of conv.talk(people, facts, { scene, tags: ['camp', 'rare'] })) {
      lines++;
      if (LEAK.test(l.text)) bad.push(`${l.topic}: ${why(l.text)} in "${l.text}"`);
    }
  }
  assert.ok(lines > 500, 'only ' + lines + ' lines came out of 400 camps');
  assert.deepEqual(bad.slice(0, 10), [], `${bad.length} live conversation lines leaked a binding`);
});
