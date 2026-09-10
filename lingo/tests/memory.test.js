// Memory + scene tests: salience decay, trait weighting, merging, forgetting, recall relevance, bindings → text, planner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Lingo, Speaker } from '../js/lingo.js';
import { MemoryBank, ageWords, memoryBindings, generateEvent, DAY, HOUR } from '../js/memory.js';
import { Scene, scenePools } from '../js/context.js';
const read = f => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url)));
const lexicon = read('lexicon.json'), grammar = read('grammar.json'), traits = read('traits.json'), EV = read('events.json').types, SC = read('scenes.json').scenes, SP = read('speakers.json').speakers;
const lingo = new Lingo({ lexicon, grammar, traits, seed: 5 });
const mk = id => { const d = SP.find(s => s.id === id); return new Speaker({ id: d.id, name: d.name, entry: lingo.lexicon.get(d.entry), lexicon: lingo.lexicon, speech: JSON.parse(JSON.stringify(d.speech)) }); };
const mara = mk('mara'), thalen = mk('thalen'), bran = mk('bran');
const combat = (time, extra = {}) => ({ type: 'combat', time, bindings: { foe: { id: 'goblin', count: 10 }, place: { id: 'the_maw' }, weapon: { id: 'axe' }, ally: { id: 'thalen' } }, details: { outcome: 'won', wounded: false }, participants: ['mara', 'thalen'], ...extra });

test('personal importance follows traits', () => {
  const blood = new MemoryBank({ ownerId: 'mara', traits: ['bloodlust'], eventTypes: EV }), meek = new MemoryBank({ ownerId: 'bran', traits: ['kind', 'scholar'], eventTypes: EV });
  assert.ok(blood.personalImportance('combat') > meek.personalImportance('combat'));
  assert.ok(new MemoryBank({ traits: ['greedy'], eventTypes: EV }).personalImportance('loot') > new MemoryBank({ traits: ['pious'], eventTypes: EV }).personalImportance('loot'));
});

test('salience decays by half-life, recall and repetition strengthen, core memories never vanish', () => {
  const bank = new MemoryBank({ ownerId: 'mara', traits: [], eventTypes: EV });
  const m = bank.remember(combat(0), 0);
  const s0 = bank.salience(m, 0), s10 = bank.salience(m, 10 * DAY), s40 = bank.salience(m, 40 * DAY);
  assert.ok(Math.abs(s10 / s0 - 0.5) < 0.02, 'half after 10 days'); assert.ok(s40 < s10);
  m.recalled = 3; assert.ok(bank.salience(m, 10 * DAY) > s10);
  const death = bank.remember({ type: 'death', time: 0, bindings: { victim: { id: 'sela' }, foe: { id: 'ghoul', count: 2 }, place: { id: 'greyharbor' } }, details: { how: 'quickly' }, participants: ['mara'] }, 0);
  assert.ok(death.core); assert.ok(bank.salience(death, 5 * 365 * DAY) >= 0.2);
  const gone = bank.tick(400 * DAY); assert.ok(gone.includes(m)); assert.ok(!gone.includes(death)); assert.ok(bank.memories.includes(death));
});

test('similar recent events merge into one memory with a count and summed foes', () => {
  const bank = new MemoryBank({ ownerId: 'mara', traits: [], eventTypes: EV });
  const a = bank.remember(combat(0), 0), b = bank.remember(combat(5 * HOUR), 5 * HOUR); assert.equal(a, b); assert.equal(a.count, 2); assert.equal(a.bindings.foe.count, 20);
  const c = bank.remember(combat(10 * DAY), 10 * DAY); assert.notEqual(c, a);
  const other = bank.remember({ ...combat(6 * HOUR), bindings: { foe: { id: 'wolf', count: 3 } } }, 6 * HOUR); assert.notEqual(other, a);
});

test('recall prefers salient + relevant memories (shared listener, matching scene threat)', () => {
  const bank = new MemoryBank({ ownerId: 'mara', traits: [], eventTypes: EV });
  bank.remember(combat(0), 0); // goblins, with thalen
  bank.remember({ type: 'combat', time: 0, bindings: { foe: { id: 'wolf', count: 3 }, place: { id: 'thalen_wood' } }, details: { outcome: 'won' }, participants: ['mara'] }, 0);
  const scene = new Scene(SC.find(s => s.id === 'goblin_cave'), lingo.lexicon);
  let gob = 0; for (let i = 0; i < 60; i++) { for (const m of bank.memories) { m.recalled = 0; m.lastRecalled = null; } const m = bank.recall(1, { scene, listenerId: 'thalen', rng: lingo.rng }); if (m.bindings.foe.id === 'goblin') gob++; }
  assert.ok(gob > 36, 'goblin memory picked ' + gob + '/60'); // expected ≈ 44 (weight 2.88 : 1)
  assert.equal(bank.recall(1, { minSalience: 5 }), null);
});

test('age words', () => {
  assert.equal(ageWords(0.2).when, 'just now'); assert.equal(ageWords(3).bucket, 'today'); assert.equal(ageWords(30).when, 'yesterday'); assert.equal(ageWords(4 * DAY).when, '4 days ago'); assert.equal(ageWords(20 * DAY).bucket, 'weeks'); assert.equal(ageWords(5 * 365 * DAY).when, 'long ago');
});

test('memory → bindings → text with correct names, plurals and time words', () => {
  const bank = new MemoryBank({ ownerId: 'mara', traits: ['bloodlust'], eventTypes: EV, lexicon: lingo.lexicon });
  const m = bank.remember(combat(0), 0);
  const b = memoryBindings(m, lingo.lexicon, 3 * DAY, { speakerId: 'thalen' });
  assert.equal(b.foe.pl, 'goblins'); assert.equal(b.foe.count, 10); assert.equal(b.place.toString(), 'the Maw'); assert.equal(b.ally.name, 'Thalen'); assert.equal(b.memory.when, '3 days ago'); assert.equal(b.memory.shared, true); assert.equal(b.memory.outcome, 'won');
  const out = lingo.speakAbout(m, bank, 3 * DAY, { speaker: mara, listener: thalen, opinion: 0 });
  assert.equal(out.intent, 'recall_combat'); assert.ok(/goblins|Maw|3 days ago|axe|Thalen/.test(out.text), out.text);
  const reply = lingo.replyToMemory(m, 3 * DAY, { speaker: thalen, listener: mara }); assert.ok(reply.text.length > 3);
});

test('every memory intent renders for every event type via generateEvent, for several speakers', () => {
  const bad = [];
  for (const [type, def] of Object.entries(EV)) for (const sp of [mara, thalen, bran]) for (let i = 0; i < 6; i++) {
    const bank = new MemoryBank({ ownerId: sp.id, traits: sp.traits, eventTypes: EV, lexicon: lingo.lexicon });
    const ev = generateEvent(type, def, { lexicon: lingo.lexicon, rng: lingo.rng, participants: [sp.id, 'bran'], time: 0 });
    const m = bank.remember(ev, 0); const now = [1, 30, 5 * DAY, 60 * DAY][i % 4];
    const out = lingo.speakAbout(m, bank, now, { speaker: sp, listener: thalen === sp ? mara : thalen, opinion: 0 });
    if (!out.text || out.error || /\{[^}]*\?\}|\.\w+\?|<no |undefined/.test(out.text)) bad.push(`${type}/${sp.name}: ${out.error || out.text}`);
  }
  assert.deepEqual(bad, []);
});

test('scene bindings, tag weights and intents', () => {
  const scene = new Scene(SC.find(s => s.id === 'goblin_cave'), lingo.lexicon);
  const b = scene.bindings(); assert.equal(b.here.toString(), 'cave'); assert.equal(b.threat.pl, 'goblins'); assert.equal(b.threat.count, 8);
  const w = scene.tagWeights(); assert.ok(w.fear > 2 && w.dark === 3 && w.damp === 3);
  const bad = [];
  for (const it of ['observe', 'fear', 'plan', 'relief']) for (const sc of SC) for (const sp of [mara, bran]) { const s2 = new Scene(sc, lingo.lexicon); const out = lingo.speak(it, { speaker: sp, listener: thalen, opinion: 0, scene: s2 }); if (out.error || /\{[^}]*\?\}|\.\w+\?|<no /.test(out.text)) bad.push(`${it}/${sc.id}/${sp.name}: ${out.error || out.text}`); }
  assert.deepEqual(bad, []);
  // dark/damp lines dominate in the cave
  let hits = 0; for (let i = 0; i < 40; i++) { const out = lingo.speak('observe', { speaker: bran, listener: thalen, scene }); if (out.tags.some(t => ['dark', 'damp', 'enclosed', 'quiet'].includes(t)) || /guano|dripping/.test(out.text)) hits++; }
  assert.ok(hits > 25, 'scene-tagged observe lines: ' + hits);
  assert.ok(scenePools(scene).pool.includes('fear'));
});

test('conversation planner brings up memories and the scene', () => {
  const banks = { mara: new MemoryBank({ ownerId: 'mara', traits: ['bloodlust'], eventTypes: EV, lexicon: lingo.lexicon }), thalen: new MemoryBank({ ownerId: 'thalen', traits: [], eventTypes: EV, lexicon: lingo.lexicon }) };
  banks.mara.remember(combat(0), 0); banks.thalen.remember(combat(0), 0);
  const scene = new Scene(SC.find(s => s.id === 'goblin_cave'), lingo.lexicon);
  let recalls = 0, sceneLines = 0;
  for (let i = 0; i < 20; i++) { const lines = new Lingo({ lexicon, grammar, traits, seed: 100 + i }).converse(mara, thalen, { turns: 8, banks, now: 2, scene }); for (const l of lines) { if (l.memory) recalls++; if (['observe', 'fear', 'plan'].includes(l.intent)) sceneLines++; } }
  assert.ok(recalls > 8, 'recalls ' + recalls); assert.ok(sceneLines > 12, 'scene lines ' + sceneLines);
});
