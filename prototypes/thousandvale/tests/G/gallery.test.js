// Stream G (play-test 5, T26) — the gallery stays tied to the game. No browser: this reads the source and the fixtures.
// Run: node --test prototypes/thousandvale/tests/G/gallery.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SCENES, GROUPS, NO_SCREEN, PENDING_SCENES, DEVICES, sceneFits } from '../../js/client/gallery/scenes.js';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = f => readFileSync(join(GAME, f), 'utf8');
const json = f => JSON.parse(src(f));

test('every interface module under js/client/ui/ has a scene — or is on the "no screen" list with a reason', () => {
  const shown = new Set(SCENES.flatMap(s => s.modules || []));
  const missing = [];
  for (const f of readdirSync(join(GAME, 'js/client/ui')).filter(n => n.endsWith('.js'))) {
    const path = 'js/client/ui/' + f;
    if (!shown.has(path) && !NO_SCREEN[path] && !PENDING_SCENES[path]) missing.push(path);
  }
  assert.deepEqual(missing, [], 'add a scene to js/client/gallery/scenes.js (or a reason to NO_SCREEN) for each new ui module');
  // the to-do list is said out loud on every run (it is not an exemption), and may not grow quietly past a handful
  const pending = Object.keys(PENDING_SCENES); if (pending.length) console.log(`[gallery] ${pending.length} window(s) still WITHOUT a scene: ${pending.join(', ')}`);
  assert.ok(pending.length <= 6, 'too many windows without a scene: give them scenes before adding more');
  for (const p of pending) assert.ok(!shown.has(p), `${p} has a scene now: take it off PENDING_SCENES`);
  for (const [path, why] of Object.entries(NO_SCREEN)) { assert.ok(existsSync(join(GAME, path)), `${path} is on NO_SCREEN but no longer exists`); assert.ok(String(why).length > 10, `${path}: say why`); }
});

test('every file a scene says it shows exists', () => {
  for (const s of SCENES) for (const m of s.modules || []) assert.ok(existsSync(join(GAME, m)), `${s.id}: ${m} does not exist`);
});

test('scenes are well-formed data: unique ids, a group, a title, notes, and only verbs the stage knows', () => {
  const stage = src('js/client/gallery/stage.js');
  const verbs = new Set([...stage.matchAll(/^\s{2}(?:async )?([a-zA-Z]+)\([^)]*\) \{/gm)].map(m => m[1]).concat([...stage.matchAll(/VERBS\.([a-zA-Z]+) = /g)].map(m => m[1])));
  const ids = new Set();
  for (const s of SCENES) {
    assert.ok(!ids.has(s.id), `duplicate scene id ${s.id}`); ids.add(s.id);
    assert.match(s.id, /^[a-z0-9-]+$/);
    assert.ok(GROUPS.includes(s.group), `${s.id}: unknown group ${s.group}`);
    assert.ok(s.title && s.title.length > 2, `${s.id}: no title`);
    assert.ok(s.notes && Object.values(s.notes).some(t => String(t).length > 20), `${s.id}: no notes`);
    assert.ok((s.modules || []).length, `${s.id}: names no module`);
    for (const list of [s.steps, s.phone?.steps, s.pad?.steps, s.phoneCurrent]) for (const st of list || []) assert.ok(verbs.has(st[0]), `${s.id}: the stage has no verb "${st[0]}"`);
    if (s.only) for (const d of s.only) assert.ok(DEVICES.some(x => x.id === d), `${s.id}: unknown frame ${d}`);
    if (s.stage === 'title') assert.ok(['new', 'front', 'login', 'look', 'kit', 'front-loading', 'front-empty'].includes(s.step), `${s.id}: unknown title step`);
  }
  for (const d of DEVICES) assert.ok(SCENES.filter(s => sceneFits(s, d.id)).length >= 40, `${d.id}: too few scenes`);
});

test('every moment and recorded reply a scene plays is in the fixtures', () => {
  const session = json('js/client/gallery/fixtures/session.json'), moments = json('js/client/gallery/fixtures/moments.json');
  assert.ok(session.joined?.you?.name, 'session.json has no character');
  assert.ok(session.boot.length > 10, 'session.json has no boot stream');
  assert.ok(session.handshake.gw.charList.chars.length >= 1);
  const missing = [];
  for (const s of SCENES) for (const list of [s.steps, s.phone?.steps, s.pad?.steps]) for (const st of list || []) {
    if (st[0] === 'play' && !(moments.moments[st[1]] || session.moments[st[1]])) missing.push(`${s.id}: moment "${st[1]}"`);
    if (st[0] === 'reply' && !(session.replies[st[1]] || []).length) missing.push(`${s.id}: reply "${st[1]}"`);
  }
  assert.deepEqual(missing, [], 're-record (tools/record-ui-fixtures.mjs) or add the moment to fixtures/moments.json');
});

test('the stage creates every interface piece main.js creates (a window added to the game and not to the gallery fails here)', () => {
  const main = src('js/client/main.js'), stage = src('js/client/gallery/stage.js');
  // the interface modules: everything main.js imports from ./ui/, plus the DOM-only pieces at the top level
  const UI_FILES = /^\.\/(ui\/[\w-]+|hud|menubar|social|bag|world-ui|boss|chat|friends|guild|mail|callboard|account|help|input\/index)\.js$/;
  const missing = [];
  for (const m of main.matchAll(/import \{([^}]+)\} from '([^']+)'/g)) {
    if (!UI_FILES.test(m[2])) continue;
    for (const name of m[1].split(',').map(s => s.trim()).filter(n => /^(create|install)[A-Z]/.test(n))) {
      if (!new RegExp(`\\b${name}\\(`).test(stage)) missing.push(`${name} (${m[2]})`);
    }
  }
  assert.deepEqual(missing, []);
  // and wires them: every `.wire(net)` main.js calls on an interface piece
  for (const m of main.matchAll(/\b(social|chat|friends|guild|mail|callboard|account|bag|ui5|ui|worldUi|ui2)\.wire\(net\)/g)) assert.match(stage, new RegExp(`\\b${m[1]}\\.wire\\(net\\)`), `stage.js never wires ${m[1]}`);
});

test('the frame page holds none of the game’s markup or stylesheets itself: it takes them from index.html at run time', () => {
  const frame = src('ui-gallery-frame.html'), boot = src('js/client/gallery/frame-boot.js');
  assert.doesNotMatch(frame, /id="hud"|id="title"|class="unitframe"|actionbar/);
  assert.doesNotMatch(frame, /css\/client\.css|css\/pt\d\.css/);
  assert.match(boot, /fetch\(new URL\('index\.html', base\)\)/);
  assert.match(boot, /querySelectorAll\('link\[rel="stylesheet"\]'\)/);
  // relative paths only (the page is served from a sub-folder on GitHub Pages)
  for (const f of ['ui-gallery.html', 'ui-gallery-frame.html']) assert.doesNotMatch(src(f), /(href|src)="\//, `${f}: a path starts with /`);
  for (const f of ['js/client/gallery/frame-boot.js', 'js/client/gallery/gallery.js', 'js/client/gallery/stage.js', 'css/ui-gallery-frame.css']) assert.doesNotMatch(src(f), /['"(]\/(js|css|prototypes|shared)\//, `${f}: a path starts with /`);
});

test('the gallery never writes into the real game’s saved settings (its own in-memory storage) and never opens a socket', () => {
  const boot = src('js/client/gallery/frame-boot.js'), stage = src('js/client/gallery/stage.js');
  assert.match(boot, /Object\.defineProperty\(window, 'localStorage'/);
  assert.match(stage, /socketFactory: fake\.open/);
  for (const f of ['js/client/gallery/stage.js', 'js/client/gallery/fake-net.js', 'js/client/gallery/gallery.js']) assert.doesNotMatch(src(f), /new WebSocket\(/);
});

test('fixtures carry nothing private: no tokens, no e-mail addresses, no real IPs', () => {
  const text = src('js/client/gallery/fixtures/session.json') + src('js/client/gallery/fixtures/moments.json');
  assert.doesNotMatch(text, /[\w.+-]+@[\w-]+\.[a-z]{2,}/i, 'an e-mail address');
  assert.doesNotMatch(text, /\b(?!127\.0\.0\.1)(?:\d{1,3}\.){3}\d{1,3}\b(?=[:"])/, 'an IP address');
  const session = json('js/client/gallery/fixtures/session.json');
  assert.equal(session.handshake.gw.authed?.token, undefined, 'the recorded account token must not be kept');
});
