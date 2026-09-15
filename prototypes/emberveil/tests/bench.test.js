// Round 21 (E38): the bench — who can sit out, who can come in, gear and pets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { partyLimit, canBench, canJoin, benchHero, joinParty, takeGear, lineUpProblem, DEFAULT_PARTY_MAX } from '../js/bench.js';

const balance = JSON.parse(readFileSync(new URL('../data/balance.json', import.meta.url)));
const hero = (id, extra = {}) => ({ id, name: id, short: id, alive: true, hp: 50, maxHp: 50, equipment: {}, ...extra });
function state({ party = ['a', 'b', 'c', 'd'], bench = ['e'] } = {}) {
  return { party: party.map(id => hero(id)), bench: bench.map(id => hero(id)), companions: [], benchCompanions: [], inventory: [] };
}

test('the limit comes from balance.json partySize.max', () => {
  assert.equal(partyLimit(balance), 4);
  assert.equal(partyLimit({ partySize: { max: 5 } }), 5);
  assert.equal(partyLimit({}), DEFAULT_PARTY_MAX);
  assert.equal(partyLimit({ partySize: { max: 0 } }), DEFAULT_PARTY_MAX);
});

test('only in a settlement', () => {
  const s = state();
  assert.equal(canBench(s, 'a', { inTown: false }).ok, false);
  assert.match(canJoin(s, 'e', { inTown: false }).why, /settlement/);
  assert.equal(benchHero(s, 'a', { inTown: false }).ok, false);
  assert.equal(s.party.length, 4);
});

test('a full party needs a swap; a swap keeps the line-up position', () => {
  const s = state();
  const r = canJoin(s, 'e', { limit: 4 });
  assert.equal(r.ok, false); assert.equal(r.needsSwap, true);
  const j = joinParty(s, 'e', { limit: 4, swapWith: 'b' });
  assert.equal(j.ok, true);
  assert.deepEqual(s.party.map(h => h.id), ['a', 'e', 'c', 'd']);
  assert.deepEqual(s.bench.map(h => h.id), ['b']);
});

test('room in the party: join without a swap, and never above the limit', () => {
  const s = state({ party: ['a', 'b'], bench: ['e', 'f', 'g'] });
  assert.equal(joinParty(s, 'e', { limit: 3 }).ok, true);
  assert.equal(joinParty(s, 'f', { limit: 3 }).ok, false);
  assert.equal(s.party.length, 3);
});

test('the party never drops to nobody, and never to only the fallen', () => {
  const s = state({ party: ['a'], bench: [] });
  assert.match(benchHero(s, 'a').why, /empty/);
  const t = state({ party: ['a', 'b'], bench: ['c'] });
  t.party[0].alive = false; t.party[0].hp = 0;                 // a is down, b is the last one standing
  assert.match(benchHero(t, 'b').why, /nobody in the party on their feet/);
  t.bench[0].alive = false; t.bench[0].hp = 0;                 // swapping b for a fallen bench hero is no better
  assert.equal(joinParty(t, 'c', { limit: 2, swapWith: 'b' }).ok, false);
  assert.equal(benchHero(t, 'a').ok, true);                    // benching the fallen one is fine
  // if everyone is already down, benching one of them does not make things worse
  assert.equal(lineUpProblem([hero('x', { hp: 0 }), hero('y', { hp: 0 })], [hero('y', { hp: 0 })]), null);
});

test('talent pets follow their owner to the bench and back; bought pets stay', () => {
  const s = state();
  s.companions = [{ id: 'p1', ownerId: 'a', name: 'Familiar' }, { id: 'p2', name: 'War dog' }];
  const b = benchHero(s, 'a');
  assert.deepEqual(b.pets.map(p => p.id), ['p1']);
  assert.deepEqual(s.companions.map(c => c.id), ['p2']);
  assert.deepEqual(s.benchCompanions.map(c => c.id), ['p1']);
  const j = joinParty(s, 'a', { limit: 4 });
  assert.deepEqual(j.petsBack.map(p => p.id), ['p1']);
  assert.equal(s.benchCompanions.length, 0);
  assert.equal(s.companions.length, 2);
});

test('a returning owner whose pet has no free companion slot leaves it waiting', () => {
  const s = state({ party: ['a', 'b', 'c'], bench: ['e'] });
  s.benchCompanions = [{ id: 'pe', ownerId: 'e' }];
  s.companions = [1, 2, 3, 4].map(i => ({ id: 'c' + i }));
  const j = joinParty(s, 'e', { limit: 4 });
  assert.equal(j.ok, true); assert.equal(j.petsBack.length, 0);
  assert.equal(s.benchCompanions.length, 1);
});

test('swapping out an owner stashes their pet', () => {
  const s = state();
  s.companions = [{ id: 'pd', ownerId: 'd' }];
  const j = joinParty(s, 'e', { limit: 4, swapWith: 'd' });
  assert.deepEqual(j.pets.map(p => p.id), ['pd']);
  assert.equal(s.companions.length, 0);
});

test('take their gear: every worn piece goes into the bag', () => {
  const s = state();
  const h = s.bench[0]; h.equipment = { weapon: { id: 'w', name: 'Sword' }, chest: { id: 'c', name: 'Coat' } };
  const seen = [];
  const moved = takeGear(s, h, (x, slot) => { seen.push(slot); const it = x.equipment[slot]; delete x.equipment[slot]; return it; });
  assert.deepEqual(moved.map(i => i.id).sort(), ['c', 'w']);
  assert.deepEqual(Object.keys(h.equipment), []);
  assert.equal(s.inventory.length, 2); assert.deepEqual(seen.sort(), ['chest', 'weapon']);
});
