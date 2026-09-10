// Unit tests for the lingo engine. Run: node --test lingo/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Lingo, Lexicon, Grammar, Speaker, Entity, parseTemplate, makeRng, respellToEspeak } from '../js/lingo.js';
import * as M from '../js/morph.js';

const lexicon = {
  entries: [
    { id: 'elf', type: 'race', forms: { sg: 'elf', pl: 'elves', adj: 'elven', lang: 'Elvish' }, tags: ['fey'] },
    { id: 'orc', type: 'race', forms: { sg: 'orc', pl: 'orcs', adj: 'orcish' } },
    { id: 'thalen', type: 'person', proper: true, pronouns: 'he', race: 'elf', forms: { sg: 'Thalen' }, pron: { respell: 'THAY-len' } },
    { id: 'mara', type: 'person', proper: true, pronouns: 'she', race: 'orc', forms: { sg: 'Mara Ironjaw', short: 'Mara' } },
    { id: 'fireball', type: 'spell', forms: { sg: 'fireball' } },
    { id: 'ale', type: 'food', mass: true, forms: { sg: 'ale' } },
    { id: 'axe', type: 'item', forms: { sg: 'axe' } },
    { id: 'honor', type: 'concept', forms: { sg: 'honor' } },
  ],
};
const grammar = {
  symbols: {
    greetword: ['Hello', { t: 'Well met', tags: ['formal'] }, { t: 'Yo', tags: ['casual'] }],
    greet: [{ t: '{#greetword}, {listener.name}.', tags: [] }],
    onlyformal: [{ t: 'Good day.', tags: ['formal'] }, { t: 'Sup.', tags: ['casual'] }],
    _never: [{ t: 'never', cond: 'false' }],
    condy: [{ t: 'angry line', cond: 'mood < -0.5' }, { t: 'calm line', cond: 'mood >= -0.5' }],
    bindy: [{ t: 'I hate {foe.pl}.', bind: { foe: { type: 'race' } } }],
  },
};
const traits = { pompous: { tagWeights: { formal: 3, casual: 0 } } };

function mk(seed = 1) { return new Lingo({ lexicon, grammar, traits, seed }); }
const L = mk(); const lex = L.lexicon;
const thalen = new Speaker({ entry: lex.get('thalen'), lexicon: lex, speech: { traits: ['pompous'], formality: 0.9 } });
const mara = new Speaker({ entry: lex.get('mara'), lexicon: lex, speech: { formality: 0.1 } });

test('parser handles nesting, escapes and alternatives', () => {
  const ast = parseTemplate('Hi {{literal}} {x.cap} {~a|b {y}|c} {n, plural, one{# thing} other{# things}}');
  assert.equal(ast[0].text, 'Hi {literal} ');
  assert.equal(ast[1].type, 'ref'); assert.deepEqual(ast[1].path.map(p => p.name), ['x', 'cap']);
  assert.equal(ast[3].type, 'alt'); assert.equal(ast[3].options.length, 3);
  assert.equal(ast[5].type, 'plural'); assert.ok(ast[5].cases.one && ast[5].cases.other);
  assert.throws(() => parseTemplate('{unclosed'));
});

test('forms, articles, plurals, possessives from lexicon and fallbacks', () => {
  const ctx = { speaker: thalen, listener: mara, item: new Entity(lex.get('axe'), { lexicon: lex, count: 3 }), ale: new Entity(lex.get('ale'), { lexicon: lex }) };
  const t = (s) => L.expand(s, ctx).text;
  assert.equal(t('{elf.pl} speak {elf.lang}; an {elf.adj} blade'), 'elves speak Elvish; an elven blade');
  assert.equal(t('{elf.a} and {orc.a}'), 'an elf and an orc');
  assert.equal(t('{item.a}'), 'three axes');
  assert.equal(t('{ale.a}'), 'some ale');
  assert.equal(t('{listener.name}, {listener.sg}'), 'Mara, Mara Ironjaw');
  assert.equal(t('{listener.the}'), 'Mara Ironjaw'); // proper nouns take no article
  assert.equal(t('{speaker.poss} axe'), "Thalen's axe");
  assert.equal(t('{elf.pl.poss} forest'), "elves' forest");
  assert.equal(t('{elf.cap} {orc.pl.upper}'), 'Elf ORCS');
});

test('pronouns and verb agreement follow the entity', () => {
  const ctx = { speaker: thalen, listener: mara, crowd: new Entity(lex.get('orc'), { lexicon: lex, count: 5 }) };
  const t = (s) => L.expand(s, ctx).text;
  assert.equal(t('{speaker.they} {speaker.verb(is)} here; {listener.they} {listener.verb(has)} {listener.their} axe'), 'he is here; she has her axe');
  assert.equal(t('{crowd.they} {crowd.verb(is)} coming'), 'they are coming');
  assert.equal(t('{speaker.race.adj} pride; {listener.race.pl}'), 'elven pride; orcs');
});

test('plural and select branches', () => {
  const ctx = { n: 1, m: 4, who: new Entity(lex.get('mara'), { lexicon: lex }), foe: new Entity(lex.get('orc'), { lexicon: lex, count: 2 }) };
  const t = (s) => L.expand(s, ctx).text;
  assert.equal(t('{n, plural, one{# coin} other{# coins}}'), '1 coin');
  assert.equal(t('{m, plural, =0{none} one{# coin} other{# coins}}'), '4 coins');
  assert.equal(t('{foe.count, plural, one{a lone {foe.sg}} other{# {foe.pl}}}'), '2 orcs');
  assert.equal(t('{who, select, mara{the orc lady} other{someone}}'), 'the orc lady');
});

test('symbols are tag-scored by traits, sliders and conditions', () => {
  const counts = { formal: 0, casual: 0 };
  for (let i = 0; i < 40; i++) { const out = mk(i).speak('onlyformal', { speaker: thalen }); if (out.text.startsWith('Good')) counts.formal++; else counts.casual++; }
  assert.equal(counts.casual, 0, 'pompous trait sets casual weight to 0');
  const c2 = { formal: 0, casual: 0 };
  for (let i = 0; i < 40; i++) { const out = mk(i).speak('onlyformal', { speaker: mara }); if (out.text.startsWith('Good')) c2.formal++; else c2.casual++; }
  assert.ok(c2.casual > c2.formal, 'low formality prefers casual');
  const angry = new Speaker({ name: 'X', speech: { mood: -0.9 } }), calm = new Speaker({ name: 'Y', speech: { mood: 0.5 } });
  assert.equal(L.speak('condy', { speaker: angry }).text, 'Angry line.');
  assert.equal(L.speak('condy', { speaker: calm }).text, 'Calm line.');
  assert.equal(L.speak('_never', { speaker: calm }).error, 'no phrase for intent "_never"');
});

test('custom slots override symbols and wrappers attach', () => {
  const sp = new Speaker({ name: 'Bran', speech: { custom: { greeting: 'Oi', prefix: 'Lost the game.', suffix: 'as I always say' }, customRate: { greeting: 1, prefix: 1, suffix: 1 } } });
  const out = L.speak('greet', { speaker: sp, listener: mara });
  assert.equal(out.text, 'Lost the game. Oi, Mara. As I always say.');
  assert.equal(out.parts.prefix, 'Lost the game.');
});

test('bind picks a random lexicon entry of a type; $type refs are stable within one utterance', () => {
  const out = L.speak('bindy', { speaker: mara });
  assert.match(out.text, /^I hate (elves|orcs)\.$/);
  const t = L.expand('{$race} {$race} {$race2}', {}).text.split(' ');
  assert.equal(t[0], t[1]);
});

test('anti-repeat lowers the odds of the same line twice in a row', () => {
  const g = { symbols: { x: ['a', 'b', 'c', 'd', 'e', 'f'] } }; let repeats = 0, prev = null;
  const l = new Lingo({ lexicon, grammar: g, seed: 7 }); const sp = new Speaker({ name: 'Z' });
  for (let i = 0; i < 200; i++) { const t = l.speak('x', { speaker: sp }).text; if (t === prev) repeats++; prev = t; }
  assert.ok(repeats < 12, 'repeats: ' + repeats);
});

test('filters: contractions by formality, tics from traits and speech', () => {
  const l = new Lingo({ lexicon, grammar: { symbols: { s: ["I do not think you are right. It is late."] } }, traits: { salty: { tics: ['pirate'] } } });
  assert.equal(l.speak('s', { speaker: new Speaker({ name: 'A', speech: { formality: 0.1 } }) }).text, "I don't think you're right. It's late.");
  assert.equal(l.speak('s', { speaker: new Speaker({ name: 'B', speech: { formality: 0.9 } }) }).text, 'I do not think you are right. It is late.');
  assert.equal(l.speak('s', { speaker: new Speaker({ name: 'C', speech: { formality: 0.9, tics: ['shout'] } }) }).text, 'I DO NOT THINK YOU ARE RIGHT! IT IS LATE!');
  assert.match(l.speak('s', { speaker: new Speaker({ name: 'D', speech: { formality: 0.9, traits: ['salty'] } }) }).text, /ye/);
});

test('speech text carries [[phonemes]] from respellings', () => {
  const out = L.speak('greet', { speaker: mara, listener: thalen });
  assert.match(out.text, /Thalen/);
  assert.match(out.speech, /\[\['TeIlen\]\]/);
  assert.equal(respellToEspeak('kay-LITH'), "keI'lIT");
  assert.equal(respellToEspeak('VOR-un'), "'vO:rVn");
});

test('conversation alternates speakers and ends with a farewell', () => {
  const g = { symbols: { greet: ['Hi {listener.name}.'], greet_reply: ['Hi.'], smalltalk: ['Weather.'], gossip: ['Gossip.'], complain: ['Ugh.'], lore: ['Long ago.'], question: ['Why?'], brag: ['I am great.'], work: ['Work.'], farewell: ['Bye {listener.name}.'], answer: ['Because.'], disagree: ['No.'] } };
  const l = new Lingo({ lexicon, grammar: g, seed: 3 });
  const lines = l.converse(thalen, mara, { turns: 6 });
  assert.equal(lines.length, 6); assert.equal(lines[0].speaker, thalen); assert.equal(lines[1].speaker, mara); assert.equal(lines[5].intent, 'farewell');
});

test('morph helpers', () => {
  assert.equal(M.article('hour'), 'an'); assert.equal(M.article('unicorn'), 'a'); assert.equal(M.article('orc'), 'an'); assert.equal(M.article('FBI'), 'an');
  assert.equal(M.plural('dwarf'), 'dwarves'); assert.equal(M.plural('lich'), 'liches'); assert.equal(M.singular('elves'), 'elf');
  assert.equal(M.verbPlural('is'), 'are'); assert.equal(M.verbPlural('carries'), 'carry'); assert.equal(M.verbPlural('watches'), 'watch'); assert.equal(M.verb3sg('carry'), 'carries');
  assert.equal(M.numberWords(342), 'three hundred and forty-two'); assert.equal(M.ordinal(22), '22nd');
  assert.equal(M.joinList(['a', 'b', 'c']), 'a, b, and c');
  assert.equal(M.tidy('hello .  world!  how are you ?nice'), 'Hello. World! How are you? Nice.');
});
