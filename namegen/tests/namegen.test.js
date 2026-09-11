import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NameGen, respellOf, syllabify, pluralize } from '../js/namegen.js';
const r = f => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url)));
const gen = new NameGen({ languages: r('languages.json'), concepts: r('concepts.json'), patterns: r('patterns.json') });

test('every race × category generates non-empty, seeded, distinct names', () => {
  for (const race of gen.races) for (const cat of gen.categories) {
    const a = gen.generate(cat, { race, seed: 1 }), b = gen.generate(cat, { race, seed: 1 }), c = gen.generate(cat, { race, seed: 2 });
    assert.ok(a.text.length > 1, `${race}/${cat}`); assert.equal(a.text, b.text, 'seeded'); assert.ok(!/\{|\}|undefined|NaN/.test(a.text), `${race}/${cat}: ${a.text}`);
    const batch = gen.batch(cat, 20, { race, seed: 5 }); assert.ok(new Set(batch.map(x => x.text)).size >= 15, `${race}/${cat} variety: ${batch.map(x => x.text).join(', ')}`);
    if (cat !== 'motto') assert.ok(/^[A-Z]|^the /.test(a.text), a.text);
  }
});
test('translations are stable per language and differ across languages', () => {
  assert.equal(gen.translate('dwarf', 'iron'), 'Kazak'); assert.equal(gen.translate('elf', 'moon'), 'Ithil'); assert.equal(gen.translate('human', 'moon'), 'Moon');
  const a = gen.translate('orc', 'thunder'), b = gen.translate('orc', 'thunder'), c = gen.translate('elf', 'thunder'); assert.equal(a, b); assert.notEqual(a, c);
});
test('race affinity: dwarves get stone/metal/craft compounds far more often than elves', () => {
  const count = (race, words) => { let n = 0; for (let i = 0; i < 80; i++) { const g = gen.generate('person.family', { race, seed: 100 + i }).gloss; if (g.some(w => words.includes(w))) n++; } return n; };
  const dwarf = count('dwarf', ['iron', 'stone', 'anvil', 'hammer', 'gold', 'coal', 'forge', 'steel']), elf = count('elf', ['iron', 'stone', 'anvil', 'hammer', 'gold', 'coal', 'forge', 'steel']);
  assert.ok(dwarf > elf * 1.5, `dwarf ${dwarf} vs elf ${elf}`);
});
test('gender shapes given names and pronouns; person entries export to lingo with race, pronouns, short name and respelling', () => {
  const f = gen.generate('person.full', { race: 'dwarf', gender: 'f', seed: 3 }), m = gen.generate('person.full', { race: 'dwarf', gender: 'm', seed: 3 });
  assert.equal(f.gender, 'f'); assert.equal(m.gender, 'm'); assert.notEqual(f.parts.given, m.parts.given);
  const e = gen.toLexiconEntry(f); assert.equal(e.type, 'person'); assert.equal(e.pronouns, 'she'); assert.equal(e.race, 'dwarf'); assert.ok(e.forms.short.length < e.forms.sg.length || e.forms.short === e.forms.sg); assert.match(e.pron.respell, /^[A-Z]/);
});
test('faction forms: singular member, plural members, adjective, people', () => {
  for (const race of ['human', 'orc', 'dwarf', 'elf', 'goblin', 'dragon']) { const f = gen.generate('faction', { race, seed: 9 }); for (const k of ['member', 'members', 'adj', 'people']) assert.ok(f.forms[k], `${race} faction missing ${k}: ${JSON.stringify(f.forms)}`); const e = gen.toLexiconEntry(f); assert.equal(e.type, 'faction'); assert.ok(e.forms.pl); }
});
test('place and object entries export to lingo', () => {
  const s = gen.toLexiconEntry(gen.generate('settlement', { race: 'halfling', seed: 2 })); assert.equal(s.type, 'place'); assert.ok(s.forms.people);
  const o = gen.toLexiconEntry(gen.generate('object', { race: 'orc', seed: 2 })); assert.equal(o.type, 'item'); assert.ok(o.tags.includes('artifact'));
});
test('helpers: syllabify, respell, pluralize', () => {
  assert.deepEqual(syllabify('thalen'), ['tha', 'len']); assert.deepEqual(syllabify('amberleaf'), ['am', 'ber', 'leaf']); assert.deepEqual(syllabify('kaelith'), ['kae', 'lith']);
  assert.equal(respellOf('Thalen Ashvine'), 'THA-len ASH-vine');
  assert.equal(pluralize('wolf'), 'wolves'); assert.equal(pluralize('fox'), 'foxes'); assert.equal(pluralize('company'), 'companies'); assert.equal(pluralize('tooth'), 'teeth');
});
