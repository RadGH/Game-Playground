// Owner 2026-10-15: a docked Steam Deck lists its own built-in controls AND the 8BitDo; the game read only the first
// pad, so the one in his hands did nothing. activePad() follows whichever pad was touched last.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const pad = (index, id, mapping = 'standard') => ({ index, id, mapping, connected: true, buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] });
const deck = pad(0, 'Steam Deck (Valve)'), eight = pad(1, '8BitDo Pro 2');
let list = [deck, eight];
Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => list }, configurable: true });
globalThis.window ??= { addEventListener() {} };
globalThis.document ??= { documentElement: { dataset: {} }, querySelector: () => null, addEventListener() {} };
const { activePad } = await import('../../js/client/input/gamepad.js');

test('the pad you touch is the pad that plays, and an idle pad\'s drift never steals it', () => {
  assert.equal(activePad().index, 0, 'nothing touched yet: the first standard pad');
  eight.buttons[0].pressed = true;
  assert.equal(activePad().id, '8BitDo Pro 2', 'pressing A on the 8BitDo switches to it');
  eight.buttons[0].pressed = false;
  assert.equal(activePad().index, 1, 'it stays the active pad after letting go');
  deck.axes[0] = 0.3;
  assert.equal(activePad().index, 1, 'a little stick drift on the Deck does not take over');
  deck.axes[0] = 0.9;
  assert.equal(activePad().index, 0, 'pushing the Deck stick hard switches back');
  deck.axes[0] = 0;
  eight.axes[3] = -0.8;
  assert.equal(activePad().index, 1, 'and the 8BitDo right stick takes it again');
  eight.axes[3] = 0;
});

test('a pad that unplugs hands over to one still connected', () => {
  list = [deck, null];
  assert.equal(activePad().index, 0);
  list = [];
  assert.equal(activePad(), null);
});
