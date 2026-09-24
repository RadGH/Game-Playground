// Node tests for the Chibi 2 overhaul's pure data (2026-09-24): races, weighted random looks, what
// each hand holds, and that every new part id survives the shared 2D normaliser (which Farhold runs
// on every look before building it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHIBI2_RACES, CHIBI2_RACE_IDS, raceOf, roundOf, randomChibi2, weightedPick } from '../js/chibi2-races.js';
import { holdFor } from '../js/chibi2-weapon-ids.js';
import { normalizeAvatar } from '../../avatar-2d/js/render.js';
import { randomAvatar, makeRng } from '../../avatar-2d/js/random.js';
import { PARTS } from '../../avatar-2d/js/parts/index.js';

const DATA = JSON.parse(readFileSync(new URL('../../avatar-2d/data/presets.json', import.meta.url)));
const known = (slot, id) => !!PARTS[slot]?.[id];

test('every race is a full record, and the list has the races the brief named', () => {
  for (const id of ['human', 'elf', 'dwarf', 'orc', 'giant', 'goblin', 'halfling', 'undead', 'beast']) assert.ok(CHIBI2_RACES[id], id);
  for (const id of CHIBI2_RACE_IDS) {
    const r = CHIBI2_RACES[id];
    assert.match(r.label, /^Chibi 2 /, `${id} label`);
    for (const k of ['leg', 'torso', 'width', 'shoulders', 'arm', 'hand', 'head', 'neck', 'round']) assert.ok(Number.isFinite(r.body[k]), `${id}.body.${k}`);
    for (const k of ['height', 'width', 'headSize', 'round']) assert.equal(r.ranges[k].length, 2, `${id}.ranges.${k}`);
    assert.ok(r.skin.length > 0);
  }
  assert.ok(CHIBI2_RACES.giant.body.leg > CHIBI2_RACES.human.body.leg && CHIBI2_RACES.human.body.leg > CHIBI2_RACES.dwarf.body.leg);
});

test('every id a race weight table can hand out exists in the part catalogue', () => {
  const missing = [];
  for (const id of CHIBI2_RACE_IDS) for (const [slot, w] of Object.entries(CHIBI2_RACES[id].weights)) for (const part of Object.keys(w)) if (!known(slot, part)) missing.push(`${id}.${slot}.${part}`);
  assert.deepEqual(missing, []);
});

test('the race and roundness live in body, so they survive normalizeAvatar (Farhold normalises every look)', () => {
  const a = normalizeAvatar({ body: { race: 'dwarf', round: 0.8, cheeks: true } });
  assert.equal(a.body.race, 'dwarf'); assert.equal(a.body.round, 0.8); assert.equal(a.body.cheeks, true);
  assert.equal(raceOf(a).name, 'Dwarf'); assert.equal(roundOf(a), 0.8);
  assert.equal(roundOf(normalizeAvatar({ body: { race: 'dwarf' } })), CHIBI2_RACES.dwarf.body.round, 'unset roundness is the race default');
  assert.equal(raceOf({}).name, 'Human');
});

test('new clothing ids and off-hand weapons are not thrown away by the 2D normaliser', () => {
  const a = normalizeAvatar({ top: { id: 'gambeson' }, bottom: { id: 'breeches' }, shoes: { id: 'wraps' }, cape: { id: 'travel_cloak' }, decor: { id: 'bedroll_pack' }, facialHair: { id: 'braided_beard' }, offhand: { id: 'fh_greatsword' } });
  assert.deepEqual([a.top.id, a.bottom.id, a.shoes.id, a.cape.id, a.decor.id, a.facialHair.id, a.offhand.id], ['gambeson', 'breeches', 'wraps', 'travel_cloak', 'bedroll_pack', 'braided_beard', 'fh_greatsword']);
});

test('a random dwarf looks like a dwarf, and a human can still roll pointed ears', () => {
  let beards = 0, heavy = 0;
  for (let i = 0; i < 60; i++) {
    const a = randomChibi2(randomAvatar, DATA, { race: 'dwarf', seed: i + 1, makeRng, known });
    assert.equal(a.body.race, 'dwarf');
    const r = CHIBI2_RACES.dwarf.ranges;
    assert.ok(a.body.height >= r.height[0] && a.body.height <= r.height[1]);
    if (a.facialHair.id !== 'none') beards++;
    if (['heavy', 'boots'].includes(a.shoes.id)) heavy++;
  }
  assert.ok(beards >= 55, `only ${beards}/60 dwarves had a beard`);
  assert.equal(heavy, 60);
  let pointed = 0;
  for (let i = 0; i < 400; i++) if (randomChibi2(randomAvatar, DATA, { race: 'human', seed: 1000 + i, makeRng, known }).ears.id === 'pointed') pointed++;
  assert.ok(pointed > 0 && pointed < 80, `humans rolled pointed ears ${pointed}/400 times — should be rare, not never`);
});

test('weightedPick honours weights and ignores unknown ids', () => {
  const rng = makeRng(7); const n = { a: 0, b: 0 };
  for (let i = 0; i < 2000; i++) n[weightedPick(rng, { a: 9, b: 1, zz: 50 }, id => id !== 'zz')]++;
  assert.ok(n.a > n.b * 5);
});

test('holdFor: what each hand carries decides how the clips carry it', () => {
  assert.deepEqual(pick(holdFor({ held: { id: 'fh_sword' }, offhand: { id: 'fh_heater_shield' } })), { right: 'blade', left: 'shield', twoHand: false, dualTwo: false });
  assert.deepEqual(pick(holdFor({ held: { id: 'fh_greataxe' }, offhand: { id: 'none' } })), { right: 'heavy', left: 'none', twoHand: true, dualTwo: false });
  assert.deepEqual(pick(holdFor({ held: { id: 'fh_greataxe' }, offhand: { id: 'fh_greatsword' } })), { right: 'heavy', left: 'heavy', twoHand: false, dualTwo: true });
  assert.equal(holdFor({ held: { id: 'bow' } }).left, 'bow', 'a bow is held in the LEFT hand');
  assert.equal(holdFor({ held: { id: 'fh_wand' }, offhand: { id: 'book' } }).left, 'book');
  assert.equal(holdFor({ held: { id: 'fh_axe' } }).edgeR, '-z', 'an axe head faces -z');
});
const pick = h => ({ right: h.right, left: h.left, twoHand: h.twoHand, dualTwo: h.dualTwo });
