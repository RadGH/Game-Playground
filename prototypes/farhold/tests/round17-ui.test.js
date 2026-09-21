// Farhold R17 — the shared-file half of the round: the binding table, the rail, and number display.
//
// These are the parts of round 17 that can be checked without a browser. The rest of the round's
// interface work (the title screen's centring, the held-mode readout, the Log and Holding tabs) is
// in tests/round17-ui.spec.js, because it only exists once a page has laid itself out.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { BINDINGS, keyLabel } from '../js/settings.js';
import { mat, fmt } from '../../../shared/format.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = p => readFileSync(join(here, '..', p), 'utf8');

// ---------------------------------------------------------------- the binding table

test('no two actions claim the same default key', () => {
  const seen = new Map();
  for (const b of BINDINGS) {
    if (!b.code) continue;                       // an action with no default is allowed, and `log` is one
    assert.equal(seen.has(b.code), false,
      `${b.action} and ${seen.get(b.code)} both default to ${b.code}`);
    seen.set(b.code, b.action);
  }
});

test('the Holding is a real binding row, not a key hard-coded in main.js', () => {
  // R17's root cause: `log` was on KeyK in this table while main.js had the Holding hard-coded on
  // KeyK and never told the table, so one press ran both and rebinding could not separate them.
  const holding = BINDINGS.find(b => b.action === 'holding');
  assert.ok(holding, 'there is a `holding` action');
  assert.equal(holding.code, 'KeyK');
});

test('the log has no default key — it is a tab of the character sheet', () => {
  const log = BINDINGS.find(b => b.action === 'log');
  assert.ok(log, 'the action still exists, so it is still on the rebinding panel');
  assert.equal(log.code, null);
  assert.equal(keyLabel(log.code), 'none');
});

test('L is still the light, on foot and in the ship', () => {
  assert.equal(BINDINGS.find(b => b.action === 'torch')?.code, 'KeyL');
});

test('main.js does not listen for a raw key that the table does not own', () => {
  const main = read('js/main.js');
  // every `e.code === 'KeyX'` in the keydown handler must correspond to an action in the table,
  // or we are back to two owners of one key
  // chorded keys (Ctrl+Z is build-mode undo) are not bindings and are deliberately skipped
  const codes = main.split('\n')
    .filter(l => !/(ctrl|meta|alt|shift)Key/.test(l))
    .flatMap(l => [...l.matchAll(/e\.code === '(Key[A-Z])'/g)].map(m => m[1]));
  const owned = new Set(BINDINGS.map(b => b.code).filter(Boolean));
  for (const code of new Set(codes)) {
    assert.ok(owned.has(code), `${code} is listened for in main.js but is not in BINDINGS`);
  }
});

// ---------------------------------------------------------------- the rail

test('every screen on the rail has a title and a tab body in the page', () => {
  const hud = read('js/hud.js');
  const html = read('index.html');
  const screens = hud.match(/const SCREENS = \[([\s\S]*?)\];/)[1]
    .match(/'([a-z]+)'/g).map(s => s.replace(/'/g, ''));
  assert.ok(screens.includes('log') && screens.includes('holding'), 'R17 added the Log and the Holding');
  for (const key of screens) {
    assert.match(hud, new RegExp(`\\b${key}: '`), `SHEET_TITLES has a title for ${key}`);
    assert.ok(html.includes(`data-tab="${key}" role="tabpanel"`), `index.html has a body for ${key}`);
    assert.match(html, new RegExp(`<button data-tab="${key}"[^>]*role="tab"`), `index.html has a rail button for ${key}`);
  }
});

test('the rail keycaps are stamped by code, not written into the markup', () => {
  // Round 17 added four tabs. Hand-numbered keycaps are how a rail ends up saying "7" twice.
  const html = read('index.html');
  const caps = [...html.matchAll(/<span class="rail-key">([^<]*)<\/span>/g)].map(m => m[1]);
  assert.ok(caps.length >= 11, 'all the rail buttons are there');
  assert.ok(caps.some(c => c === ''), 'the tabs added this round have no hard-coded digit');
  assert.match(read('js/hud.js'), /numberRail\(\)/);
});

test('the old floating log panel is gone from the page', () => {
  const html = read('index.html');
  assert.equal(html.includes('id="log-history"'), false,
    'the overlay that opened behind the Holding and stayed up after it closed');
  assert.ok(html.includes('id="log-history-lines"'), 'its lines live on the Log tab');
});

// ---------------------------------------------------------------- numbers

test('a material amount prints with one decimal at most', () => {
  assert.equal(mat(6.000000000003), '6');
  assert.equal(mat(6.25), '6.3');
  assert.equal(mat(0), '0');
  assert.equal(mat(1240.44), '1,240.4');
  // and it never renders the float the game is actually storing
  assert.equal(/\d\.\d\d/.test(mat(6.000000000003)), false);
});

test('fmt is unchanged — mat is its own rule, not a change to everyone else', () => {
  assert.equal(fmt(6.25), '6.25');
});

test('the character sheet prints material amounts through mat()', () => {
  const hud = read('js/hud.js');
  assert.match(hud, /mat\(m\.n\)/, 'the material chips');
  assert.match(hud, /mat\(have\)\} \/ \$\{mat\(want\)/, 'the cost table');
});

// ---------------------------------------------------------------- the two reported HUD faults

test('the held-mode ring is built by appending, not by passing elements as text', () => {
  const hud = read('js/hud.js');
  // `el(tag, cls, text)` sets textContent — handing it an element is what printed
  // "[object HTMLElement]" above the weapon name, and dropped every pip after the first.
  const code = hud.split('\n').filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
  assert.equal(/el\('div', 'hm-ring', \.\.\./.test(code), false);
  assert.match(code, /for \(const m of modes\) ring\.append/);
});

test('the held-mode readout stands down while a screen owns the window', () => {
  const hud = read('js/hud.js');
  assert.match(hud, /if \(screenOpen\(this\)\) \{ box\.classList\.remove\('on'\); return; \}/);
  assert.match(hud, /this\.refreshHeld\(\);/);
});

test('the title screen tagline is centred as a box, not only as text', () => {
  const css = read('style.css');
  assert.match(css, /#boot \.tagline \{ color: #9fb0c8; margin: 0 auto 22px/);
});

test('the mount slot and the Ride row read the same number', () => {
  const hud = read('js/hud.js');
  assert.match(hud, /slot === 'mount' \? this\.mountNote\(worn\)/);
  assert.match(hud, /mountNote\(worn\) \{/);
});

test('an empty vehicle dropdown says (None) rather than being blank', () => {
  assert.match(read('js/hud.js'), /none\.textContent = '\(None\)'/);
});

// ---------------------------------------------------------------- the minimap reveal

test('shops and jobs are gated by MINIMAP_NEAR, destinations are not', async () => {
  const { MINIMAP_NEAR } = await import('../js/hud.js').catch(() => ({ MINIMAP_NEAR: null }))
    .then(m => m, () => ({ MINIMAP_NEAR: null }));
  // js/hud.js needs a DOM to import, so fall back to reading the constant out of the source
  const n = MINIMAP_NEAR ?? Number(read('js/hud.js').match(/export const MINIMAP_NEAR = (\d+)/)[1]);
  assert.ok(n >= 30 && n <= 80, '100–200 feet, in metres');
  const main = read('js/main.js');
  assert.match(main, /folk\.marks\(\)\.map\(m => \(\{ \.\.\.m, near: MINIMAP_NEAR \}\)\)/);
  assert.equal(/sites\.visible[\s\S]{0,400}near: MINIMAP_NEAR/.test(main), false,
    'a stronghold is a destination and stays visible');
});
