import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RelationGraph } from '../js/relations.js';
import { Lingo, Speaker } from '../js/lingo.js';
const read = f => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url)));
const model = read('relations.json'), lexicon = read('lexicon.json'), grammar = read('grammar.json'), traits = read('traits.json'), SP = read('speakers.json').speakers;
const lingo = new Lingo({ lexicon, grammar, traits, seed: 4 });
const mk = id => { const d = SP.find(s => s.id === id); return new Speaker({ id: d.id, name: d.name, entry: lingo.lexicon.get(d.entry), lexicon: lingo.lexicon, speech: JSON.parse(JSON.stringify(d.speech)) }); };
const mara = mk('mara'), thalen = mk('thalen'), bran = mk('bran');

test('factors move independently: respect without warmth is a rival, not a friend', () => {
  const g = new RelationGraph(model); const r = g.get('mara', 'thalen');
  g.apply('mara', 'thalen', 'bravery_seen'); g.apply('mara', 'thalen', 'bravery_seen'); g.apply('mara', 'thalen', 'insult'); g.apply('mara', 'thalen', 'insult');
  assert.ok(r.get('respect') > 0.3 && r.get('warmth') < -0.15, JSON.stringify(r.dims));
  assert.ok(r.tags().includes('rival') && r.tags().includes('respectful'));
  assert.ok(Math.abs(r.opinion()) < 0.3, 'a single opinion number hides the split: ' + r.opinion());
});
test('traits change how events land: paranoid trusts slowly and distrusts fast; coward fears more', () => {
  const g = new RelationGraph(model);
  g.apply('a', 'x', 'kept_word', { traits: ['paranoid'] }); g.apply('b', 'x', 'kept_word', { traits: [] });
  assert.ok(g.get('a', 'x').get('trust') < g.get('b', 'x').get('trust'));
  g.apply('a', 'y', 'betrayal', { traits: ['paranoid'] }); g.apply('b', 'y', 'betrayal', { traits: [] });
  assert.ok(g.get('a', 'y').get('trust') < g.get('b', 'y').get('trust'));
  g.apply('c', 'z', 'threatened', { traits: ['coward'] }); g.apply('d', 'z', 'threatened', { traits: ['brave'] });
  assert.ok(g.get('c', 'z').get('fear') > g.get('d', 'z').get('fear') * 2);
});
test('knowledge: events reveal traits the target really has; diminishing returns; decay; serialization', () => {
  const g = new RelationGraph(model);
  g.apply('bran', 'mara', 'cowardice_seen', { targetTraits: ['abrasive', 'brave', 'bloodlust'] }); assert.ok(!g.get('bran', 'mara').knows('coward'));
  g.apply('bran', 'mara', 'bravery_seen', { targetTraits: ['abrasive', 'brave', 'bloodlust'] }); assert.ok(g.get('bran', 'mara').knows('brave'));
  const r = g.get('p', 'q'); for (let i = 0; i < 20; i++) r.apply('saved_life'); assert.ok(r.get('appreciation') <= 1 && r.get('appreciation') > 0.9);
  r.updatedAt = 0; r.tick(24 * 100); assert.ok(r.get('appreciation') < 0.3, 'appreciation should fade: ' + r.get('appreciation'));
  const json = JSON.parse(JSON.stringify(g)); const g2 = RelationGraph.fromJSON(json, model); assert.ok(g2.get('bran', 'mara').knows('brave'));
});
test('memory events feed relationships for everyone present', () => {
  const g = new RelationGraph(model); const traitsOf = id => ({ mara: ['bloodlust', 'brave'], thalen: ['pompous', 'honorable'], bran: ['kind'] })[id] || [];
  g.applyMemoryEvent({ type: 'combat', bindings: { foe: { id: 'goblin', count: 5 } }, details: { outcome: 'won' }, participants: ['mara', 'thalen'] }, { traitsOf });
  assert.ok(g.get('mara', 'thalen').get('respect') > 0 && g.get('thalen', 'mara').get('respect') > 0);
  g.applyMemoryEvent({ type: 'kindness', bindings: { by: { id: 'bran' } }, details: {}, participants: ['mara'] }, { traitsOf });
  assert.ok(g.get('mara', 'bran').get('appreciation') > 0.2); assert.ok(g.get('mara', 'bran').knows('kind'));
});
test('lines follow the factors: fearful is deferential, rival is grudging, grateful thanks; knowledge lines need knowledge', () => {
  const g = new RelationGraph(model);
  const line = (rel, intent) => lingo.speak(intent, { speaker: bran, listener: mara, relation: rel });
  const fear = g.get('bran', 'mara'); fear.set('fear', 0.8); fear.set('warmth', -0.3); fear.set('familiarity', 0.5);
  let deferential = 0; for (let i = 0; i < 20; i++) { const o = line(fear, 'observe_person'); if (o.tags.includes('fearful')) deferential++; } assert.ok(deferential >= 12, 'fearful lines ' + deferential);
  const rival = g.get('thalen', 'mara'); rival.set('respect', 0.6); rival.set('warmth', -0.4); rival.set('familiarity', 0.5);
  let grudging = 0; for (let i = 0; i < 20; i++) { const o = lingo.speak('observe_person', { speaker: thalen, listener: mara, relation: rival }); if (o.tags.includes('rival') || o.tags.includes('respectful')) grudging++; } assert.ok(grudging >= 12, 'rival lines ' + grudging);
  const out = lingo.speak('reveal', { speaker: bran, listener: mara, relation: g.get('bran', 'mara') }); assert.ok(/don't know you well enough|still deciding what I saw/.test(out.text), out.text);
  g.get('bran', 'mara').learn('bloodlust'); let hit = 0; for (let i = 0; i < 10; i++) if (/blood/.test(lingo.speak('reveal', { speaker: bran, listener: mara, relation: g.get('bran', 'mara') }).text)) hit++; assert.ok(hit >= 3, 'knowledge line ' + hit);
  const conv = lingo.converse(bran, mara, { turns: 8, relations: g }); assert.equal(conv.length, 8);
});
