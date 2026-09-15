// Round 21 (E39): arriving in a settlement hurt — who speaks, what they say, and no raw braces.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Lingo } from '../../../lingo/js/lingo.js';
import { Talk, woundedReport, woundedLine, woundedFallback, nameList, registerTownTalk, WOUNDED_AT } from '../js/talk.js';

const lingoData = f => JSON.parse(readFileSync(new URL('../../../lingo/data/' + f, import.meta.url)));
const townTalk = JSON.parse(readFileSync(new URL('../data/town-talk.json', import.meta.url)));
const lexicon = lingoData('lexicon.json'), grammar = lingoData('grammar.json'), traits = lingoData('traits.json'), pack = lingoData('packs/emberveil.json');

const ROLES = { warrior: 'Frontline Tank', cleric: 'Primary Healer', ranger: 'Precision Ranged', mage: 'Arcane Caster', rogue: 'Burst Assassin' };
const game = { zoneId: 'thornwood', day: 3, party: [], zone: () => ({ name: 'Thornwood', act: 1 }), classDef: id => ({ role: ROLES[id] || '' }) };
function mk(seed) {
  const lingo = new Lingo({ lexicon, grammar, traits, seed });
  for (const e of pack.entries) lingo.lexicon.add(e);
  lingo.invalidatePronunciations();
  registerTownTalk(lingo, townTalk);
  return new Talk({ lingo, game });
}
const H = (id, cls, hp, extra = {}) => ({ id, name: id, short: id, class: cls, level: 3, maxHp: 100, hp, alive: hp > 0, speech: { traits: extra.traits || [] }, ...extra });
const isHealer = h => h.class === 'cleric' && h.alive && h.hp > 0;

test('nobody below the threshold → no reminder', () => {
  assert.equal(woundedReport([H('Corvin', 'warrior', 60), H('Mirelle', 'cleric', 100)], { isHealer }), null);
  assert.equal(WOUNDED_AT, 0.6);
});

test('the wounded and the fallen are both counted; the speaker is never named', () => {
  const r = woundedReport([H('Corvin', 'warrior', 30), H('Mirelle', 'cleric', 0), H('Tam', 'ranger', 90)], { isHealer });
  assert.deepEqual(r.hurt.map(h => h.id), ['Corvin']);
  assert.deepEqual(r.down.map(h => h.id), ['Mirelle']);
  assert.equal(r.speaker.id, 'Tam'); assert.equal(r.allHurt, false);
});

test('a healthy healer speaks first; a fallen healer does not', () => {
  const party = [H('Corvin', 'warrior', 20), H('Tam', 'ranger', 100), H('Mirelle', 'cleric', 80)];
  assert.equal(woundedReport(party, { isHealer }).speaker.id, 'Mirelle');
  party[2].hp = 0; party[2].alive = false;
  assert.equal(woundedReport(party, { isHealer }).speaker.id, 'Tam');
});

test('when nobody is healthy the least-hurt member speaks and allHurt is set; nobody standing → no speaker', () => {
  const r = woundedReport([H('Corvin', 'warrior', 20), H('Tam', 'ranger', 50)], { isHealer });
  assert.equal(r.speaker.id, 'Tam'); assert.equal(r.allHurt, true);
  assert.deepEqual(r.hurt.map(h => h.id), ['Corvin']);
  assert.equal(woundedReport([H('A', 'warrior', 0), H('B', 'ranger', 0)], { isHealer }).speaker, null);
});

test('name lists read naturally', () => {
  assert.equal(nameList(['Corvin']), 'Corvin');
  assert.equal(nameList(['Corvin', 'Mirelle']), 'Corvin and Mirelle');
  assert.equal(nameList(['A', 'B', 'C']), 'A, B and C');
  assert.equal(nameList([]), '');
});

// Every situation the phrases cover: [party, what the line must mention]
const CASES = {
  oneHurt: [[H('Corvin', 'warrior', 30), H('Tam', 'ranger', 100)], ['Corvin']],
  twoHurt: [[H('Corvin', 'warrior', 30), H('Bryn', 'rogue', 40), H('Tam', 'ranger', 100)], ['Corvin and Bryn']],
  threeHurt: [[H('Corvin', 'warrior', 30), H('Bryn', 'rogue', 40), H('Ash', 'mage', 10), H('Tam', 'ranger', 100)], ['Corvin, Bryn and Ash']],
  oneDown: [[H('Mirelle', 'cleric', 0), H('Tam', 'ranger', 100)], ['Mirelle']],
  twoDown: [[H('Mirelle', 'cleric', 0), H('Bryn', 'rogue', 0), H('Tam', 'ranger', 100)], ['Mirelle and Bryn']],
  downAndHurt: [[H('Mirelle', 'cleric', 0), H('Corvin', 'warrior', 30), H('Tam', 'ranger', 100)], ['Mirelle', 'Corvin']],
  downAndTwoHurt: [[H('Mirelle', 'cleric', 0), H('Corvin', 'warrior', 30), H('Bryn', 'rogue', 20), H('Tam', 'ranger', 100)], ['Mirelle']],
  twoDownOneHurt: [[H('Mirelle', 'cleric', 0), H('Ash', 'mage', 0), H('Corvin', 'warrior', 30), H('Tam', 'ranger', 100)], ['Corvin']],
  twoDownTwoHurt: [[H('Mirelle', 'cleric', 0), H('Ash', 'mage', 0), H('Corvin', 'warrior', 30), H('Bryn', 'rogue', 20), H('Tam', 'ranger', 100)], ['Mirelle and Ash']],
  allHurt: [[H('Corvin', 'warrior', 30), H('Tam', 'ranger', 50)], []],
  allHurtDown: [[H('Mirelle', 'cleric', 0), H('Tam', 'ranger', 50)], ['Mirelle']],
  healerSpeaks: [[H('Corvin', 'warrior', 30), H('Mirelle', 'cleric', 100, { traits: ['kind'] })], ['Corvin']],
};

test('every situation produces a line through Lingo, names the right people, and never leaks a brace', () => {
  const seen = {};
  for (const [name, [party, mustMention]] of Object.entries(CASES)) {
    const texts = new Set();
    for (let seed = 1; seed <= 25; seed++) {
      const talk = mk(seed);
      const report = woundedReport(party, { isHealer });
      const out = woundedLine(talk, report, { town: 'Emberglen' });
      assert.ok(out && out.text, `${name} seed ${seed}: no line`);
      assert.doesNotMatch(out.text, /[{}]/, `${name}: ${out.text}`);
      assert.doesNotMatch(String(out.speech || ''), /[{}]/, `${name} speech: ${out.speech}`);
      assert.doesNotMatch(out.text, /undefined|null|NaN/, `${name}: ${out.text}`);
      for (const who of mustMention) assert.ok(out.text.includes(who), `${name}: "${out.text}" should name ${who}`);
      assert.ok(!report.hurt.includes(report.speaker) && !report.down.includes(report.speaker), `${name}: the speaker is listed as hurt`);
      texts.add(out.text);
    }
    seen[name] = texts.size;
  }
  // several variants, not one canned sentence
  assert.ok(seen.oneHurt >= 3, `oneHurt variants ${seen.oneHurt}`);
  assert.ok(seen.twoHurt >= 3, `twoHurt variants ${seen.twoHurt}`);
  assert.ok(seen.oneDown >= 2, `oneDown variants ${seen.oneDown}`);
});

test('plural wording when more than one is hurt, singular for one, and the cleric for the fallen', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const one = woundedLine(mk(seed), woundedReport(CASES.oneHurt[0], { isHealer }), { town: 'Emberglen' }).text;
    assert.doesNotMatch(one, /Corvin are\b/, one);
    const two = woundedLine(mk(seed), woundedReport(CASES.twoHurt[0], { isHealer }), { town: 'Emberglen' }).text;
    assert.doesNotMatch(two, /Bryn is\b/, two);
    const down = woundedLine(mk(seed), woundedReport(CASES.oneDown[0], { isHealer }), { town: 'Emberglen' }).text;
    assert.match(down, /cleric/i, down);
    const twoDown = woundedLine(mk(seed), woundedReport(CASES.twoDown[0], { isHealer }), { town: 'Emberglen' }).text;
    assert.match(twoDown, /cleric/i, twoDown); assert.doesNotMatch(twoDown, /Bryn is\b/, twoDown);
  }
});

test('healer-only lines go to healers only', () => {
  const healerIds = new Set(townTalk.symbols.wounded_rest.filter(e => (e.tags || []).includes('healer')).map(e => e.t));
  assert.ok(healerIds.size >= 3);
  for (let seed = 1; seed <= 30; seed++) {
    const out = woundedLine(mk(seed), woundedReport(CASES.oneHurt[0], { isHealer }), { town: 'Emberglen' });   // speaker is a ranger
    assert.ok(![...healerIds].some(t => t.startsWith(out.text.slice(0, 12)) && t.includes('proper look')), out.text);
  }
});

test('the fallback wording is plain and brace-free too', () => {
  for (const [party] of Object.values(CASES)) {
    const t = woundedFallback(woundedReport(party, { isHealer }));
    assert.ok(t.length > 10); assert.doesNotMatch(t, /[{}]/);
  }
});
