// Menu-layer pure helpers: wick codes (03 §16.3, §19.2) and settings/rebind rules (02 §5.2, §19).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadJson } from './helpers.js';
import { wickCode, wickHash, parseWickCode } from '../../js/ui/wickcode.js';
import { defaultSettings, loadSettings, effectiveBindings, rebind, refuseCode, findConflict, SCHEMA } from '../../js/ui/settings.js';

const idx = f => { const j = loadJson(`data/${f}.json`); j.byId = Object.fromEntries(j.list.map(e => [e.id, e])); return j; };
const data = { flames: idx('flames'), shapes: idx('shapes'), charms: idx('charms') };
data.charms.exclusive = loadJson('data/charms.json').exclusive;
const bindings = loadJson('data/bindings.json');

test('wick hash follows 03 §19.2 (charms sorted, - for empty parts)', () => {
  assert.equal(wickHash({ flame: 'ember', shape: 'bolt', charms: ['split', 'seek'], knot: { trigger: 'on_hit', flame: 'spark', shape: 'ring' } }), 'ember:bolt:seek+split:on_hit:spark:ring:-');
  assert.equal(wickCode({ flame: 'rime', shape: 'lob', charms: [] }), 'LF1:rime:lob:-:-:-:-:-');
});
test('codes round-trip and are refused with the builder\'s reasons', () => {
  const w = { flame: 'ember', shape: 'bolt', charms: ['split', 'seek'] };
  assert.deepEqual(parseWickCode(wickCode(w), data).wick.charms, ['seek', 'split']);
  assert.match(parseWickCode('hello', data).error, /not a wick code/);
  assert.match(parseWickCode('LF1:ember:bolt', data).error, /damaged/);
  assert.match(parseWickCode('LF1:ember:bolt:heavy+swift:-:-:-:-', data).error, /cannot share/);
  const unlocks = { flames: ['ember'], shapes: ['bolt'], charms: [], knots: [] };
  assert.match(parseWickCode('LF1:ember:bolt:linger:-:-:-:-', data, unlocks).error, /not found the Linger/);
  assert.match(parseWickCode('LF1:ember:bolt:-:on_hit:spark:ring:-', data, unlocks).error, /Hitknot/);
  assert.match(parseWickCode('LF1:ember:bolt:-:on_hit:spark:ring:echo', data).error, /child cannot hold Echo/);
});
test('settings: every schema row has a default; stored values merge over defaults', () => {
  const d = defaultSettings(); for (const [c, k] of SCHEMA) assert.ok(k in d[c], `${c}.${k}`);
  const s = loadSettings({ video: { bloom: 'high' } }); assert.equal(s.video.bloom, 'high'); assert.equal(s.video.rain_density, 'heavy');
});
test('rebind: a clash in the same context moves the key; swap trades them; diff drops defaults', () => {
  let diff = rebind({}, bindings, 'play', 'dodge', 0, 'KeyE');
  let eff = effectiveBindings(bindings, { bindings: diff }).keys.play;
  assert.deepEqual(eff.dodge, ['KeyE']); assert.ok(!eff.interact.includes('KeyE'));
  diff = rebind({}, bindings, 'play', 'dodge', 0, 'KeyE', { swap: true });
  eff = effectiveBindings(bindings, { bindings: diff }).keys.play; assert.deepEqual(eff.interact, ['KeyQ']);
  diff = rebind(diff, bindings, 'play', 'dodge', 0, 'KeyQ', { swap: true }); assert.deepEqual(diff, {});
  assert.equal(findConflict(effectiveBindings(bindings, {}), 'play', 'jump', 'KeyZ').action, 'belt_1');
});
test('rebind refuses browser keys, lone Ctrl/Alt and the fixed keys', () => {
  assert.match(refuseCode('F5', bindings), /browser/); assert.match(refuseCode('ControlLeft', bindings), /Ctrl and Alt/);
  assert.match(refuseCode('KeyW', bindings, { ctrlKey: true }), /Ctrl\+KeyW belongs/); assert.match(refuseCode('Escape', bindings), /fixed/);
  assert.equal(refuseCode('KeyK', bindings), null);
});
