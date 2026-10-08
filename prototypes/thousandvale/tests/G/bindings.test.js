// Stream G (play-test 5, T27) — the ONE binding table: sane, complete, and really the table the game's keys come from.
// Run: node --test prototypes/thousandvale/tests/G/bindings.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ACTIONS, ACTION_BY_ID, auditBindings, createBindings, glyphSetFor, padLayers, referenceRows, shortcutsTable, panelKeys, keyLabel, padLabel, GLYPH_SETS, WHEEL, WHEEL_ACTIONS, PAD_MOD, PAD_RADIAL } from '../../js/client/input/bindings.js';
import { SHORTCUTS, PANEL_KEYS } from '../../js/client/social-core.js';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = f => readFileSync(join(GAME, f), 'utf8');

test('the table passes its own audit (no duplicate chords, every action reachable on a pad and on touch)', () => {
  assert.deepEqual(auditBindings(), []);
});

test('social-core.js SHORTCUTS and PANEL_KEYS are built from the table, not kept beside it', () => {
  assert.deepEqual(SHORTCUTS, shortcutsTable());
  assert.deepEqual(PANEL_KEYS, panelKeys());
  assert.match(src('js/client/social-core.js'), /export const SHORTCUTS = shortcutsTable\(\)/);
  assert.match(src('js/client/social-core.js'), /export const PANEL_KEYS = panelKeys\(\)/);
  for (const [code, panel] of Object.entries(PANEL_KEYS)) assert.equal(ACTIONS.find(a => a.key === code && a.panel)?.panel, panel);
});

test('every key the game listens for is an action in the table (a key hard-coded in a handler and missing here would have no pad button, no touch control and no hint)', () => {
  const known = new Set(ACTIONS.flatMap(a => [a.key, ...(a.keys || [])]).filter(Boolean));
  known.add('ShiftRight');                                           // the other Shift: same action as ShiftLeft
  const files = ['js/client/controls.js', 'js/client/main.js', 'js/client/ui/hotbar.js', 'js/client/ui/angling.js'];
  const missing = [];
  for (const f of files) {
    const text = src(f).split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
    for (const m of text.matchAll(/'(Key[A-Z]|Digit\d|Space|Tab|Escape|Enter|F1|Arrow(?:Up|Down|Left|Right)|Shift(?:Left|Right))'/g)) if (!known.has(m[1])) missing.push(`${f}: ${m[1]}`);
    // controls.js' skill keys are a pattern
    if (/\^Digit\[1-6\]\$/.test(text)) for (let i = 1; i <= 6; i++) assert.ok(known.has('Digit' + i));
  }
  assert.deepEqual([...new Set(missing)], []);
});

test('main.js installs the input layer and ticks it; controls.js takes a stick; settings and help draw from the table', () => {
  const main = src('js/client/main.js');
  assert.match(main, /import \{ installInput \} from '\.\/input\/index\.js'/);
  assert.match(main, /installInput\(\{/); assert.match(main, /input\.tick\(dt\)/);
  assert.match(src('js/client/controls.js'), /setAnalog\(a\)/);
  assert.match(src('js/client/ui/settings.js'), /bindingsTab\(\{ redraw: draw \}\)/);
  assert.match(src('js/client/help.js'), /referenceTable\(/);
});

test('re-binding: a free key moves; a key in use swaps; pairs that share a key stay together; fixed keys refuse', () => {
  const B = createBindings();
  assert.equal(B.keyOf('strike'), 'KeyF'); assert.equal(B.translate('KeyF'), undefined);
  assert.deepEqual(B.set('strike', 'KeyY'), { ok: true, swapped: null });
  assert.equal(B.keyOf('strike'), 'KeyY');
  assert.equal(B.translate('KeyY'), 'KeyF', 'the new key is heard as the default one');
  assert.equal(B.translate('KeyF'), null, 'the old key goes quiet');
  assert.equal(B.translate('KeyM'), undefined, 'untouched keys pass through untouched');
  // a key in use: the two swap
  const r = B.set('map', 'KeyJ');
  assert.equal(r.ok, true); assert.equal(r.swapped, 'journal');
  assert.equal(B.keyOf('map'), 'KeyJ'); assert.equal(B.keyOf('journal'), 'KeyM');
  assert.equal(B.translate('KeyJ'), 'KeyM'); assert.equal(B.translate('KeyM'), 'KeyJ');
  // E is "use" AND "turn the camera right": they move together
  B.set('interact', 'KeyU');
  assert.equal(B.keyOf('interact'), 'KeyU'); assert.equal(B.keyOf('camR'), 'KeyU');
  // fixed and reserved
  assert.equal(B.set('chat', 'KeyY').ok, false);
  assert.equal(B.set('jump', 'Escape').why, 'reserved');
  // overrides survive a round trip and reset
  const B2 = createBindings(B.overrides);
  assert.equal(B2.keyOf('strike'), 'KeyY'); assert.equal(B2.label('strike'), 'Y');
  B2.reset('strike'); assert.equal(B2.keyOf('strike'), 'KeyF');
  B2.reset(); assert.deepEqual(B2.overrides, {});
  // garbage in storage is dropped
  assert.deepEqual(createBindings({ nope: 'KeyQ', chat: 'KeyQ', strike: 'KeyF' }).overrides, {});
});

test('no two actions end up on one key after any single re-bind', () => {
  for (const a of ACTIONS.filter(x => !x.fixed)) for (const code of ['KeyY', 'KeyW', 'Digit1', 'Space', 'KeyE', 'KeyM']) {
    const B = createBindings(); if (!B.set(a.id, code).ok) continue;
    const byKey = new Map();
    for (const x of ACTIONS) { const k = B.keyOf(x.id); if (!k) continue; const o = byKey.get(k); if (o) assert.ok(x.shares === o || ACTION_BY_ID[o].shares === x.id || (ACTION_BY_ID[o].shares && ACTION_BY_ID[o].shares === x.shares), `${a.id} -> ${code}: ${o} and ${x.id} both on ${k}`); else byKey.set(k, x.id); }
  }
});

test('glyph sets: chosen from the pad id; every button has a name in every set', () => {
  assert.equal(glyphSetFor('Xbox 360 Controller (XInput STANDARD GAMEPAD)'), 'xbox');
  assert.equal(glyphSetFor('045e-0b13-Xbox Wireless Controller'), 'xbox');
  assert.equal(glyphSetFor('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)'), 'playstation');
  assert.equal(glyphSetFor('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)'), 'playstation');
  assert.equal(glyphSetFor('8BitDo Pro 2 (Vendor: 2dc8)'), 'generic');
  assert.equal(glyphSetFor(''), 'xbox');
  for (const set of GLYPH_SETS) for (const a of ACTIONS) if (a.pad) assert.ok(padLabel(a.id, set).length > 0, `${a.id} on ${set}`);
  assert.equal(padLabel('skill5', 'playstation'), 'L2 + △'); assert.equal(padLabel('strike', 'xbox'), 'X'); assert.equal(padLabel('bag', 'xbox'), 'LB wheel');
});

test('the pad layers: plain and modifier chords are distinct, the modifier and the wheel button carry nothing else', () => {
  const L = padLayers();
  assert.equal(L.plain.X, 'strike'); assert.equal(L.plain.Y, 'skill1'); assert.equal(L.mod.Y, 'skill5'); assert.equal(L.mod.UP, 'item1');
  assert.equal(L.plain[PAD_MOD], undefined); assert.equal(L.plain[PAD_RADIAL], 'radial');
  assert.equal(L.ctx.dead.A, 'rise'); assert.equal(L.ctx.fishing.A, 'hook'); assert.equal(L.ctx.prompt.A, 'interact'); assert.equal(L.plain.A, 'jump');
  for (let i = 1; i <= 6; i++) assert.ok(ACTION_BY_ID['skill' + i].pad, 'skill ' + i + ' has a button');
  for (let i = 1; i <= 4; i++) assert.ok(ACTION_BY_ID['item' + i].pad.mod, 'potion ' + i + ' is on the modifier');
});

test('the reference tables: every action appears on every device, and the wheel only holds actions', () => {
  for (const dev of ['keyboard', 'pad', 'touch']) {
    const rows = referenceRows(dev, { set: 'xbox' });
    const ids = new Set(rows.flatMap(g => g.rows.flatMap(r => r.ids)));
    for (const a of ACTIONS) assert.ok(ids.has(a.id), `${a.id} missing from the ${dev} table`);
    for (const g of rows) for (const r of g.rows) { assert.ok(r.label, 'a row without a label'); assert.ok(r.keys.length, `${r.label}: no key text`); for (const k of r.keys) assert.doesNotMatch(String(k), /undefined|\[object/); }
  }
  for (const w of [...WHEEL, ...WHEEL_ACTIONS]) assert.ok(ACTION_BY_ID[w.id]);
  assert.equal(keyLabel('KeyW'), 'W'); assert.equal(keyLabel('Digit7'), '7'); assert.equal(keyLabel('ShiftLeft'), 'Shift'); assert.equal(keyLabel(null), '—');
});

test('the phone layout: ONE switch (on since the owner approved it), chosen automatically, forceable — and the stylesheet only ever applies under html[data-layout="phone"]', async () => {
  assert.match(src('js/client/input/layout.js'), /export const PHONE_LAYOUT_ENABLED = true;/);
  const { decideLayout } = await import('../../js/client/input/layout.js');
  assert.equal(decideLayout({ phone: true }), 'phone'); assert.equal(decideLayout({ phone: false }), 'desktop');
  assert.equal(decideLayout({ phone: true, choice: 'desktop' }), 'desktop'); assert.equal(decideLayout({ phone: false, choice: 'phone' }), 'phone');
  assert.equal(decideLayout({ phone: true, enabled: false }), 'desktop'); assert.equal(decideLayout({ phone: false, asked: 'phone', enabled: false }), 'phone');
  assert.doesNotMatch(src('index.html'), /data-layout/);
  const setters = ['js/client/main.js', 'js/client/hud.js', 'js/client/controls.js'].filter(f => /dataset\.layout\s*=|data-layout/.test(src(f)));
  assert.deepEqual(setters, [], 'only input/layout.js may set data-layout');
  // every rule's selectors start with the switch
  const css = src('css/layout-phone.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const bad = [];
  for (const m of css.matchAll(/(^|[{}])\s*([^{}@]+?)\s*\{/g)) {
    const sel = m[2].trim(); if (!sel || /^(from|to|\d+%)/.test(sel)) continue;
    for (const s of sel.split(/,\s*(?![^()]*\))/)) if (!s.trim().startsWith('html[data-layout="phone"]')) bad.push(s.trim().slice(0, 80));
  }
  assert.deepEqual(bad, []);
});
