// Wrap-up (2026-10-13), interface odds and ends found by the round 10 audit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SETTINGS_DEFAULTS, cleanSettings } from '../../js/client/ui/pt2-core.js';

test('Y36: "Let friends see where I am" is a saved setting, on by default, and the window sends it to the server', () => {
  assert.equal(SETTINGS_DEFAULTS.shareLocation, true);
  assert.equal(cleanSettings({ shareLocation: false }).shareLocation, false);
  assert.equal(cleanSettings({ shareLocation: 'no' }).shareLocation, true, 'junk keeps the default');
  // the server reads the key `shareLocation` (js/sim/gateway.js SETTING_KEYS); the window must send exactly that
  const gw = readFileSync(new URL('../../js/sim/gateway.js', import.meta.url), 'utf8'), win = readFileSync(new URL('../../js/client/ui/settings.js', import.meta.url), 'utf8');
  assert.match(gw, /SETTING_KEYS = \{[^}]*shareLocation: 'bool'/);
  assert.match(win, /send2\.settings\(net\(\), 'set', \{ shareLocation:/);
  assert.match(win, /check\('shareLocation'/);
});
