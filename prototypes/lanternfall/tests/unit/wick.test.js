import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadJson } from './helpers.js';
import { compileWick, validateWick, burnLevel, wickName } from '../../js/spells/wick.js';
const idx = f => { const j = loadJson(`data/${f}.json`); j.byId = Object.fromEntries(j.list.map(e => [e.id, e])); return j; };
const data = { flames: idx('flames'), shapes: idx('shapes'), charms: idx('charms') };

test('worked example (Ember Bolt + Split + Seek, L8, Wick 12, burn-in flame L2 + shape L1 = x1.03)', () => {
  const p = compileWick({ flame: 'ember', shape: 'bolt', charms: ['split', 'seek'] }, data, { level: 8, spellPower: 0.24 }, { burn: { flame: { ember: 400 }, shape: {} } });
  assert.equal(Math.round(p.damage * 100) / 100, 9.71);
  assert.equal(p.oil, 12);
  assert.equal(p.count, 3);
  assert.equal(p.cooldown, 0.35);
});
test('every flame x shape compiles', () => {
  for (const f of data.flames.list) for (const s of data.shapes.list) { const p = compileWick({ flame: f.id, shape: s.id }, data); assert.ok(p.damage > 0 && p.oil >= 2, `${f.id} ${s.id}`); }
});
test('illegal wicks give a reason', () => {
  assert.match(validateWick({ flame: 'ember', shape: 'bolt', charms: ['heavy', 'swift'] }, data), /cannot share/);
  assert.match(validateWick({ flame: 'ember', shape: 'arc', charms: ['bounce'] }, data), /does nothing/);
  assert.match(validateWick({ flame: 'ember', shape: 'bolt', charms: ['split', 'split'] }, data), /twice/);
  assert.equal(validateWick({ flame: 'ember', shape: 'bolt', charms: ['split'] }, data), null);
});
test('overcharge: +80% at 2x oil, burn-in +6%/level', () => {
  const a = compileWick({ flame: 'ember', shape: 'bolt' }, data), b = compileWick({ flame: 'ember', shape: 'bolt' }, data, {}, { overcharge: 2 });
  assert.ok(Math.abs(b.damage / a.damage - 1.8) < 1e-9); assert.equal(b.oil, a.oil * 2);
  assert.equal(burnLevel(7000), 5); assert.ok(Math.abs(compileWick({ flame: 'ember', shape: 'bolt' }, data, {}, { burn: { flame: { ember: 7000 }, shape: { bolt: 7000 } } }).damage / a.damage - 1.12 * 1.12) < 1e-9);
  assert.equal(wickName({ flame: 'ember', shape: 'bolt', charms: ['split', 'seek'] }, data), 'Ember Bolt of the Choir');
});
