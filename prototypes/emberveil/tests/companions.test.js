// E19: a talent that says it summons a companion actually puts one in the party.
//
// "Arcane Familiar" (a Magic Missile talent) was a line of tooltip text: game.unlockedPets() could
// list it and nothing ever called that. syncCompanions() closes the loop for every class pet.
import { test } from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { syncCompanions, companionIdsFor } from '../js/effects.js';

const J = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url)));
const skills = J('skills.json').skills, companions = J('companions.json'), looks = J('enemy-looks.json');

/** The smallest thing that looks like a Game to syncCompanions(). */
function mkGame(party) {
  return {
    party, companions: [], d: { skills: { skills }, companions },
    makeCompanion(def, level = null) {
      const L = Math.max(1, Math.round(level || 3)); const P = def.power || 1; const hp = Math.round(30 * P + 8 * P * L);
      return { id: 'c_' + def.id + '_x', name: def.name, templateId: def.id, isCompanion: true, level: L, alive: true, hp, maxHp: hp, statuses: [], attrs: def.attrs || {} };
    },
    addCompanion(c) { if (this.companions.length >= 4) return false; this.companions.push(c); return true; },
  };
}
const mage = (talents = {}) => ({ id: 'h1', short: 'Corvin', class: 'mage', level: 1, skills: ['magic_missile'], talents });

test('no talent, no pet', () => {
  const g = mkGame([mage()]);
  assert.deepEqual(companionIdsFor(mage(), skills), []);
  assert.equal(syncCompanions(g).length, 0);
  assert.equal(g.companions.length, 0);
});

test('buying Arcane Familiar puts the familiar in the party', () => {
  const hero = mage({ mg_familiar: true });
  assert.deepEqual(companionIdsFor(hero, skills), ['pet_familiar']);
  const g = mkGame([hero]);
  const added = syncCompanions(g);
  assert.equal(added.length, 1);
  assert.equal(added[0].templateId, 'pet_familiar');
  assert.equal(added[0].name, 'Arcane Familiar');
  assert.equal(added[0].ownerId, 'h1');
  assert.equal(g.companions.length, 1);
  assert.ok(added[0].maxHp > 0 && added[0].alive);
});

test('calling it again does not summon a second one', () => {
  const g = mkGame([mage({ mg_familiar: true })]);
  syncCompanions(g); syncCompanions(g); syncCompanions(g);
  assert.equal(g.companions.length, 1);
});

test('the familiar has a designed look, so it can stand on the stage', () => {
  const L = looks.pets.pet_familiar;
  assert.ok(L, 'pet_familiar is in enemy-looks.json');
  assert.ok(L.avatar || L.creature, 'and it has a body');
  assert.ok(L.voice, 'and a voice');
});

test('every class pet a talent can unlock is a real companion definition with a look', () => {
  const ids = new Set();
  for (const s of Object.values(skills)) {
    for (const t of s.talents || []) if (t.effect?.unlocksCompanion) ids.add(t.effect.unlocksCompanion);
    for (const u of s.upgrades || []) if (u.bonus?.unlocksCompanion) ids.add(u.bonus.unlocksCompanion);
  }
  assert.ok(ids.size >= 8, `${ids.size} pet-granting talents`);
  for (const id of ids) {
    assert.ok(companions.classPets[id], `companions.json has ${id}`);
    assert.ok(looks.pets[id], `enemy-looks.json has ${id}`);
  }
});

test('a party of several summoners gets one pet each, up to the kennel limit', () => {
  const party = [
    mage({ mg_familiar: true }),
    { id: 'h2', short: 'Sera', class: 'druid', level: 1, skills: Object.keys(skills).filter(k => skills[k].class === 'druid'), talents: Object.fromEntries((Object.values(skills).flatMap(s => s.talents || [])).filter(t => t.effect?.unlocksCompanion).map(t => [t.id, true])) },
  ];
  const g = mkGame(party);
  const added = syncCompanions(g);
  assert.ok(added.length >= 2, `${added.length} pets summoned`);
  assert.ok(g.companions.length <= 4, 'the kennel limit still holds');
});
