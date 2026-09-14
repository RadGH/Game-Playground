// What a hero says about their weapon has to match the weapon in their hand.
//
// The bug this pins down: the ammunition bark used to pick a random word out of the lexicon, so a
// hero with a bow shouted "I'm out of bows!" and a hero with a sword shouted about arrows. Now
// talk.js binds `weapon`, `weaponType` and `ammo` from the equipped item, and every phrase that
// mentions ammunition carries cond: "ammo" — so a sword, a staff or an empty hand is never offered
// one. This runs the whole weapon table out of data/items.json past those pools.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Lingo } from '../../../lingo/js/lingo.js';
import { Talk, weaponKind, ammoFor, WEAPON_AMMO, RANGED_KINDS } from '../js/talk.js';

const lingoData = f => JSON.parse(readFileSync(new URL('../../../lingo/data/' + f, import.meta.url)));
const lexicon = lingoData('lexicon.json'), grammar = lingoData('grammar.json'), traits = lingoData('traits.json');
const pack = lingoData('packs/emberveil.json');
const items = JSON.parse(readFileSync(new URL('../data/items.json', import.meta.url)));
const WEAPONS = Object.entries(items.weaponBases).map(([key, w]) => ({ ...w, baseKey: key }));

function stubGame() {
  return {
    zoneId: 'border_roads', day: 3, namedSlain: [], party: [],
    zone: () => ({ name: 'The Border Roads', act: 1 }),
    classDef: () => ({ role: '' }),
  };
}
function mk(seed = 5) {
  const lingo = new Lingo({ lexicon, grammar, traits, seed });
  for (const e of pack.entries) lingo.lexicon.add(e);
  lingo.invalidatePronunciations();
  return { lingo, talk: new Talk({ lingo, game: stubGame() }) };
}
const heroWith = (w, cls = 'ranger') => ({
  id: 'h_' + (w ? w.baseKey : 'bare'), name: 'Test', short: 'Test', class: cls,
  speech: { traits: [] },
  equipment: w ? { weapon: { id: 'it_' + w.baseKey, baseKey: w.baseKey, name: w.name, subtype: w.subtype, type: 'weapon' } } : {},
});

// Words that only belong in the mouth of someone who shoots or throws something.
// Case matters: "Shadow Bolt" is a spell an enemy casts, "bolt" is something a crossbow runs out of.
const AMMO_WORDS = /\b(arrows?|bolts?|quivers?|bowstrings?|fletch\w*|javelins?|throwing kni(fe|ves)|slingstones?)\b|\bNock and loose\b|\bCranking\b/;
const AMMO_FOR_KIND = {
  bow: /\barrows?\b|Nock|bowstring|fletch/,
  crossbow: /\bbolts?\b|Cranking|reload/,
  thrown: /\bjavelins?\b|throwing knives|throw/,
  sling: /\bslingstones?\b/,
};

test('every weapon in data/items.json lands in a family, and only the ranged ones have ammunition', () => {
  assert.ok(WEAPONS.length >= 50, 'expected the full weapon table, saw ' + WEAPONS.length);
  const seen = new Set();
  for (const w of WEAPONS) {
    const kind = weaponKind(w);
    assert.ok(kind, w.baseKey + ' has no weapon family');
    seen.add(kind);
    const ammo = ammoFor(w);
    if (RANGED_KINDS.includes(kind)) {
      assert.ok(ammo && ammo.sg && ammo.pl, `${w.baseKey} (${kind}) should have ammunition`);
    } else {
      assert.equal(ammo, null, `${w.baseKey} (${kind}) should have no ammunition, got ${JSON.stringify(ammo)}`);
    }
  }
  // the families the data actually uses
  for (const k of ['bow', 'crossbow', 'thrown', 'caster', 'blade', 'blunt', 'polearm']) {
    assert.ok(seen.has(k), 'no weapon in the data is a ' + k);
  }
  assert.deepEqual(ammoFor({ subtype: 'bow' }), { sg: 'arrow', pl: 'arrows' });
  assert.deepEqual(ammoFor({ subtype: 'crossbow' }), { sg: 'bolt', pl: 'bolts' });
  assert.deepEqual(ammoFor({ subtype: 'javelin' }), { sg: 'javelin', pl: 'javelins' });   // it is its own ammunition
  assert.equal(ammoFor({ subtype: 'staff' }), null);
  assert.equal(ammoFor(null), null);
  assert.ok(Object.keys(WEAPON_AMMO).every(k => RANGED_KINDS.includes(k)));
});

test('nobody talks about ammunition they do not carry — every weapon type in the data', () => {
  for (const w of WEAPONS) {
    const kind = weaponKind(w);
    const ammo = ammoFor(w);
    const { talk } = mk(11);
    const h = heroWith(w);
    for (let i = 0; i < 60; i++) {
      for (const intent of ['combat_bark', 'brag', 'combat_taunt', 'warning', 'rally']) {
        const out = talk.line(h, intent);
        if (!out?.text) continue;
        const text = out.text;
        if (!ammo) {
          assert.ok(!AMMO_WORDS.test(text), `${w.name} (${kind}) said an ammunition line: "${text}"`);
        } else {
          // it may mention ammunition, but only its own
          const wrong = Object.entries(AMMO_FOR_KIND).filter(([k]) => k !== kind);
          for (const [other, re] of wrong) {
            if (!AMMO_WORDS.test(text)) continue;
            assert.ok(!re.test(text) || AMMO_FOR_KIND[kind].test(text),
              `${w.name} (${kind}) borrowed a ${other} line: "${text}"`);
          }
        }
        assert.ok(!/[{}]/.test(text), `${w.name}: unfilled binding in "${text}"`);
      }
    }
  }
});

test('a bow really does say arrows and a crossbow really does say bolts', () => {
  for (const [sub, want] of [['bow', /arrow/i], ['crossbow', /bolt/i], ['javelin', /javelin|throw/i]]) {
    const w = WEAPONS.find(x => x.subtype === sub);
    assert.ok(w, 'no ' + sub + ' in the data');
    const { talk } = mk(4);
    const h = heroWith(w);
    let hit = 0;
    for (let i = 0; i < 300; i++) {
      const out = talk.line(h, 'combat_bark');
      if (out?.text && want.test(out.text)) hit++;
    }
    assert.ok(hit > 0, `a ${sub} user never once mentioned its ammunition in 300 barks`);
  }
});

test('an empty hand is offered no weapon line at all', () => {
  const { talk } = mk(9);
  const h = heroWith(null);
  for (let i = 0; i < 200; i++) {
    for (const intent of ['combat_bark', 'brag']) {
      const out = talk.line(h, intent);
      if (!out?.text) continue;
      assert.ok(!AMMO_WORDS.test(out.text), `a bare-handed hero said: "${out.text}"`);
      assert.ok(!/[{}]/.test(out.text), `unfilled binding in "${out.text}"`);
    }
  }
});

test('the weapon binding names the weapon actually held', () => {
  const { talk } = mk(3);
  const sword = WEAPONS.find(x => x.subtype === 'sword');
  const b = talk.gearBindings(heroWith(sword));
  assert.equal(b.weaponType, 'blade');
  assert.equal(b.ammo, undefined);
  assert.ok(String(b.weapon).length > 0);
  const bow = talk.gearBindings(heroWith(WEAPONS.find(x => x.subtype === 'bow')));
  assert.equal(bow.weaponType, 'bow');
  assert.equal(String(bow.ammo.pl ?? bow.ammo.get('pl')), 'arrows');
  assert.deepEqual(talk.gearBindings({ equipment: {} }), {});
});
