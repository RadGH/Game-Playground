import { test } from 'node:test';
import assert from 'node:assert/strict';
import { btnText } from '../js/client/buttons.js';
const C = { a: 'Sit', b: 'Barge' };
test('button mentions follow the device; the word "A" in a sentence is left alone', () => {
  const lines = {
    'Music stops? Run to a free bale and press A to sit!': ['press Space to sit', 'press SIT to sit', 'press A to sit'],
    'B barges. Press A too soon and you stumble!': ['E barges. Press Space too', 'BARGE barges. Press SIT too', 'B barges. Press A'],
    'TAP A to jab. HOLD A and let go for a big swing.': ['TAP Space to jab. HOLD Space and', 'TAP SIT to jab', 'TAP A'],
    'HOLD B to block. B with the stick: dodge.': ['HOLD E to block. E with the stick', 'HOLD BARGE to block', 'HOLD B'],
    'A: load the cannon (+3 balls)': ['Space: load', 'SIT: load', 'A: load'],
    'RUN! (A = dash)': ['(Space = dash)', '(SIT = dash)', '(A = dash)'],
    'Rope Bridge: Standing still cracks it. A hops a hole.': ['. Space hops a hole', '. SIT hops a hole', '. A hops'],
  };
  for (const [s, [keys, touch, pad]] of Object.entries(lines)) {
    assert.ok(btnText(s, C, { device: 'keys' }).includes(keys), btnText(s, C, { device: 'keys' }));
    assert.ok(btnText(s, C, { device: 'touch' }).includes(touch), btnText(s, C, { device: 'touch' }));
    assert.ok(btnText(s, C, { device: 'pad' }).includes(pad));
  }
  for (const s of ['A pad WOBBLES after you step on it', 'A block swings over your tower: press DROP to let it fall.', 'A trapdoor empties your sack.', 'A marble rolls by itself.', 'Post claims ("Route B is safe!")', 'A wrong tap locks you out', 'A ghost touch makes you a ghost.', 'A hit shoves them hard.', 'A long streak makes every pickup worth more.'])
    assert.equal(btnText(s, C, { device: 'keys' }), s, s);
  assert.equal(btnText('press A', {}, { device: 'keys', html: true }), 'press <kbd>Space</kbd>');
});
