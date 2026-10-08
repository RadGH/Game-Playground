// Stream D-UI, play-test 9 — X3 windows that drag, X4 the barber's button, X6 deleting a character, X1 who is online.
// Run: node --test prototypes/thousandvale/tests/D/pt9.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as C from '../../js/client/ui/pt9-core.js';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = f => readFileSync(join(GAME, f), 'utf8');

test('X4: the barber\'s button is "Save (Free)" when it costs nothing and "Save (N gold)" otherwise — never the long label', () => {
  assert.equal(C.barberSaveText(0, { free: true }), 'Save (Free)');
  assert.equal(C.barberSaveText(0, { prices: { hair: 0, beard: 0, everything: 0 } }), 'Save (Free)');
  assert.equal(C.barberSaveText(35, { prices: { hair: 0, everything: 0 } }), 'Save (Free)', 'every price 0 = free whatever was added up');
  assert.equal(C.barberSaveText(0, { prices: { hair: 12 } }), 'Save (Free)', 'nothing changed yet costs nothing');
  assert.equal(C.barberSaveText(35, { prices: { hair: 12 } }), 'Save (35 gold)');
  assert.equal(C.barberSaveText(1250, null), 'Save (1,250 gold)');
  assert.equal(C.barberFree(null), false); assert.equal(C.barberFree({ prices: {} }), false);
  for (const t of [C.barberSaveText(0, { free: true }), C.barberSaveText(99999)]) assert.ok(t.length <= 20, t);
  const ap = src('js/client/ui/appearance.js');
  assert.doesNotMatch(ap, /first visit free\)/); assert.match(ap, /barberSaveText\(c, E\.bill\)/);
  assert.match(src('css/pt9.css'), /\.appearance-panel \.tvp-body, \.appearance-panel \.ap-body \{ overflow-x: hidden; \}/);
});

test('X6: the typed name must be the character\'s (case and outer spaces aside); the limit is the server\'s; refusals read plainly', () => {
  assert.equal(C.nameMatches('  brem ', 'Brem'), true); assert.equal(C.nameMatches('Bre', 'Brem'), false); assert.equal(C.nameMatches('', 'Brem'), false); assert.equal(C.nameMatches('x', ''), false);
  assert.equal(C.charLimit({ charLimit: 20 }), 20); assert.equal(C.charLimit({ charLimit: 8 }), 8); assert.equal(C.charLimit(null), 20); assert.equal(C.charLimit({ charLimit: 0 }), 20);
  assert.equal(C.limitText(3, 20), '3 of 20 characters');
  assert.match(C.limitText(20, 20), /the most an account may hold\. Delete one/);
  assert.equal(C.deleteRefusal({ why: 'online' }), 'That character is in the world right now. Log it out first.');
  assert.equal(C.deleteRefusal({ why: 'online', msg: 'Log Brem out first.' }), 'Log Brem out first.', 'the server\'s own sentence wins');
  for (const w of ['name', 'online', 'lease', 'missing', 'slow', 'somethingNew']) assert.ok(C.deleteRefusal({ why: w }).length > 15);
  assert.match(C.deleteWarning({ name: 'Brem', level: 9 }), /^Brem, level 9, will be gone for good/);
  const acc = src('js/client/account.js');
  assert.match(acc, /n\.deleteChar\(c\.id, typed\)/); assert.match(acc, /t: 'delete', char: c\.id, name: typed/);
  assert.match(acc, /yes\.disabled = !nameMatches\(input\.value, c\.name\)/, 'the button is shut until the name is typed');
  assert.match(acc, /limitText\(list\.length, cap\)/);
  assert.match(src('css/pt9.css'), /\.char-list \{[^}]*overflow-y: auto/);
});

test('the title flow: signing in from the title form lands on YOUR CHARACTERS, not on the hidden list', () => {
  const acc = src('js/client/account.js');
  assert.match(acc, /if \(\(chars \|\| \[\]\)\.length\) front\(\); else tab\('new'\);/);
  assert.match(src('js/client/main.js'), /onTitleStep: step => titleStep\(step\)/);
});

test('X1: the online list — tidy rows, sorted by name / level / place, a summary line; admins only', () => {
  const list = [{ char: 1, name: 'Stormy', level: 6, cls: 'stormcaller', where: 'The Torbor Fields', username: 'stormy', claimed: true },
    { char: 2, name: 'Brem', level: 9, clsName: 'Knight', where: 'in a dungeon', claimed: true, account: 7 }, { char: 3, name: 'Stubbs', level: 1, cls: 'warrior', town: 'Torborhold', claimed: false }, null, { level: 3 }];
  assert.deepEqual(C.onlineRows(list).map(r => r.name), ['Brem', 'Stormy', 'Stubbs']);
  assert.deepEqual(C.onlineRows(list, 'level').map(r => r.level), [9, 6, 1]);
  assert.deepEqual(C.onlineRows(list, 'level', -1).map(r => r.level), [1, 6, 9]);
  assert.deepEqual(C.onlineRows(list, 'where').map(r => r.where), ['in a dungeon', 'The Torbor Fields', 'Torborhold']);
  const rows = C.onlineRows(list);
  assert.equal(rows[1].cls, 'Stormcaller'); assert.equal(rows[2].account, 'guest'); assert.equal(rows[0].account, '#7');
  for (const r of rows) assert.doesNotMatch(JSON.stringify(r), /undefined|NaN/);
  assert.equal(C.onlineSummary({ count: 3, accounts: 2 }), '3 players online · 2 accounts'); assert.equal(C.onlineSummary({ list: [1] }), '1 player online');
  assert.deepEqual(C.onlineRows(undefined), []);
  const w = src('js/client/ui/online-window.js');
  assert.match(w, /n\.adminOnline\(\)/); assert.match(w, /n\.adminOp\('online'\)/); assert.match(w, /n\.on\('adminOnline'/); assert.match(w, /if \(!isAdmin\(\)\)/);
  assert.match(src('css/pt9.css'), /\.chat-log p \{ white-space: normal; overflow-wrap: anywhere;/, 'the message of the day wraps');
});

test('X3: one drag rule for every window and the bag — on screen, kept for the session, double-click resets, never in the phone layout', async () => {
  const P = await import('../../js/client/ui-panel.js');
  assert.deepEqual(P.clampBox(-50, -20, 300, 200, 1366, 800), { x: 4, y: 4 });
  assert.deepEqual(P.clampBox(1300, 790, 300, 200, 1366, 800), { x: 1062, y: 596 }, 'the WHOLE window stays on screen');
  assert.deepEqual(P.clampBox(500, 300, 300, 200, 1366, 800), { x: 500, y: 300 });
  assert.deepEqual(P.clampBox(50, 50, 2000, 900, 1366, 800), { x: 4, y: 4 }, 'a window bigger than the screen sits at the corner');
  const up = src('js/client/ui-panel.js');
  assert.match(up, /sessionStorage\.setItem\(key/); assert.doesNotMatch(up, /localStorage/);
  assert.match(up, /addEventListener\('dblclick'/); assert.match(up, /if \(isPhone\(\) \|\| e\.button > 0/);
  assert.match(up, /makeDraggable\(\{ root, handle: head, id, onGrab/, 'every panel');
  assert.match(src('js/client/bag.js'), /makeDraggable\(\{ root, handle: root\.querySelector\('header'\), id: 'bag' \}\)/, 'and the bag');
});

test('the round is in the gallery and on the page', () => {
  const sc = src('js/client/gallery/scenes.js');
  assert.match(sc, /id: 'online'/); assert.match(sc, /id: 'title-delete'/);
  assert.match(src('index.html'), /css\/pt9\.css/);
});
