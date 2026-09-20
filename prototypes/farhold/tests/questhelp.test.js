// js/questhelp.js — "quest markers lead nowhere. There should be a quest helper that activates
// when you get near and says what to do."

import test from 'node:test';
import assert from 'node:assert/strict';
import { helperFor, helpersNear, helperKey, placeOf, distanceTo, REACH } from '../js/questhelp.js';

const clear = (over = {}) => ({
  id: 'q1', kind: 'clear', title: 'Clear the Sunken Hall', giverName: 'Rosie',
  target: 'ghoul', targetName: 'Ghoul', count: 6, progress: 0,
  place: { x: 1000, z: 1000, name: 'the Sunken Hall' },
  ...over,
});

test('nothing is said until you get there', () => {
  const q = clear();
  assert.equal(helperFor(q, { x: 0, z: 0 }), null);
  assert.equal(helperFor(q, { x: 1000 - REACH - 10, z: 1000 }), null);
  assert.ok(helperFor(q, { x: 1000 - 20, z: 1000 }));
});

test('it says what is LEFT, not what the job asked for', () => {
  const at = { x: 1000, z: 1000 };
  assert.match(helperFor(clear(), at).text, /6 more Ghoul/);
  assert.match(helperFor(clear({ progress: 5 }), at).text, /1 more Ghoul/);
  // …and when they are all down it points at the person who asked
  assert.match(helperFor(clear({ progress: 6 }), at).text, /Rosie/);
});

test('a hunt has no place, and says so rather than sending you somewhere', () => {
  const q = { id: 'q2', kind: 'hunt', targetName: 'Bog Lurker', count: 4, progress: 1, giverName: 'Alder' };
  assert.equal(placeOf(q), null);
  assert.equal(distanceTo(q, { x: 9999, z: 9999 }), Infinity);
  // it talks wherever you are, because there is nowhere to go
  const help = helperFor(q, { x: 9999, z: 9999 });
  assert.match(help.text, /3 more Bog Lurker/);
  assert.match(help.text, /no marker will find them/);
});

test('a visit job changes its line when you actually walk in', () => {
  const q = { id: 'q3', kind: 'visit', count: 1, progress: 0, giverName: 'Alder', place: { x: 0, z: 0, name: 'Hollowcrown' } };
  assert.match(helperFor(q, { x: 60, z: 0 }).text, /just there/);
  assert.match(helperFor(q, { x: 10, z: 0 }).text, /You are in Hollowcrown/);
});

test('a finished or turned-in job says nothing at all', () => {
  assert.equal(helperFor(clear({ done: true }), { x: 1000, z: 1000 }), null);
  assert.equal(helperFor(clear({ turnedIn: true }), { x: 1000, z: 1000 }), null);
  assert.equal(helperFor(null, { x: 0, z: 0 }), null);
});

test('an unknown kind still gets a usable sentence rather than nothing', () => {
  const q = { id: 'q9', kind: 'escort', title: 'Walk the cart to Mire End', count: 3, progress: 1 };
  assert.match(helperFor(q, { x: 0, z: 0 }).text, /2 to go/);
});

test('the nearest job talks first, and only the ones with something to say', () => {
  const near = clear({ id: 'near', place: { x: 100, z: 0, name: 'the near one' } });
  const far = clear({ id: 'far', place: { x: 9000, z: 0, name: 'the far one' } });
  const done = clear({ id: 'done', done: true, place: { x: 90, z: 0, name: 'finished' } });
  const rows = helpersNear([far, near, done], { x: 100, z: 0 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].quest.id, 'near');
});

test('the key changes exactly when the sentence does', () => {
  const at = { x: 1000, z: 1000 };
  const a = clear(), b = clear({ progress: 1 });
  assert.equal(helperKey(a, helperFor(a, at)), helperKey(a, helperFor(clear(), at)));
  assert.notEqual(helperKey(a, helperFor(a, at)), helperKey(b, helperFor(b, at)));
});
