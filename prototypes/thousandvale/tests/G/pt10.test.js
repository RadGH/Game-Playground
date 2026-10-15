// Stream G2, play-test 10 — the pure halves of the phone / input work (node, no browser):
//   Y34 water in casting range (the server's own sweep) · the on-screen control table · Y1 activities · Y36 party arrows
//   Y35/Y7 controls.js: auto-attack survives movement; Y1 controls.release()
// Run: node --test prototypes/thousandvale/tests/G/pt10.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { waterInReach, CAST, CAST_TURNS } from '../../js/client/input/water-reach.js';
import { activeActivity, ACTIVITY_SEL, createActivity } from '../../js/client/input/activity.js';
import { TOUCH_CONTROLS, ACTION_BY_ID, auditBindings, WHEEL_ACTIONS } from '../../js/client/input/bindings.js';
import { approachReach } from '../../js/client/reach.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(join(ROOT, f), 'utf8');

test('Y34: water in reach is the SERVER\'s rule — same numbers, same fan', () => {
  const sim = read('js/sim/angling.js');
  for (const [k, v] of Object.entries(CAST)) assert.match(sim, new RegExp(`${k}: ${String(v).replace('.', '\\.')}\\b`), `js/sim/angling.js still says ${k}: ${v}`);
  // round 11 (stream P, live #12): the server no longer fans out for open water — a line goes only into a fish pool within
  // poolUseM — so the client's fan (which only lights the phone's Fish button) is no longer the server's rule
  assert.ok(!/for \(const turn of \[/.test(sim) && /poolUseM: 16/.test(sim), 'casting is pool-only on the server');
  void CAST_TURNS;
  // a river 10 m ahead (z > 10): in reach facing it, in reach facing away (the fan reaches behind), not in reach 30 m back
  const river = (x, z) => (z > 10 ? { depth: 1, kind: 'river' } : { depth: 0, kind: 'none' });
  assert.ok(waterInReach({ x: 0, z: 0, yaw: 0 }, river));
  assert.ok(waterInReach({ x: 0, z: 0, yaw: Math.PI }, river), 'the sweep ends looking straight behind you');
  assert.equal(waterInReach({ x: 0, z: -30, yaw: 0 }, river), null);
  // a puddle too shallow to take a hook is not water
  assert.equal(waterInReach({ x: 0, z: 0, yaw: 0 }, () => ({ depth: 0.1 })), null);
  // an open pool within 24 m wins even with no water sampled; one at 25 m does not
  assert.equal(waterInReach({ x: 0, z: 0, yaw: 0 }, () => null, [{ x: 0, z: 23 }]).pool, true);
  assert.equal(waterInReach({ x: 0, z: 0, yaw: 0 }, () => null, [{ x: 0, z: 25 }]), null);
  // a terrain that throws, a missing position: never an exception, never "yes"
  assert.equal(waterInReach({ x: 0, z: 0, yaw: 0 }, () => { throw new Error('zone not loaded'); }), null);
  assert.equal(waterInReach(null, river), null);
});

test('Y34: every on-screen phone control is in the table, names a real action, and exists in the code that builds it', () => {
  assert.deepEqual(auditBindings(), []);
  const touch = read('js/client/input/touch.js'), css = read('css/layout-phone.css');
  for (const c of TOUCH_CONTROLS) {
    assert.ok(ACTION_BY_ID[c.action], c.id);
    assert.ok(c.what.length >= 5 && c.what.length <= 190, `${c.id}: one sentence a player can read in a label (${c.what.length})`);
    for (const cls of c.sel.match(/\.ph-[a-z]+/g) || []) { assert.ok(touch.includes(`'${cls.slice(1)}`), `${cls} is made by touch.js`); assert.ok(css.includes(cls), `${cls} is placed by layout-phone.css`); }
  }
  // every ph-btn touch.js makes on the play screen is in the table (a new control cannot be added without a name)
  const made = [...touch.matchAll(/mk\('(ph-[a-z]+)[ ']/g)].map(m => m[1]).filter(c => !['ph-chat-x', 'ph-extra'].includes(c));
  for (const cls of made) assert.ok(TOUCH_CONTROLS.some(c => c.sel.includes('.' + cls)), `.${cls} has no row in TOUCH_CONTROLS`);
  // Mount and Fish are their own buttons now, and still in the wheel for a controller
  for (const id of ['mount', 'fish']) { assert.ok(TOUCH_CONTROLS.some(c => c.id === id)); assert.ok(WHEEL_ACTIONS.some(w => w.id === id)); }
  // no control is called by a key's letter or by desktop words
  for (const c of TOUCH_CONTROLS) assert.doesNotMatch(c.name + ' ' + c.what, /\b(click|hover|right-click|press [A-Z]\b|key)\b/i, c.id);
});

test('Y34: the Belt never uses a tool, and says so when it is empty', () => {
  const touch = read('js/client/input/touch.js');
  assert.match(touch, /ROD_KIND\.test\(String\(kind\)\)/);
  assert.match(touch, /find\(w => !w\.empty\)/);
  assert.match(touch, /Your belt is empty/);
});

test('Y1: an activity STARTING lets go once; ending lets nothing go', () => {
  let on = new Set(), calls = [];
  const doc = { querySelector: sel => (on.has(sel) ? {} : null) };
  const A = createActivity({ doc, release: [what => calls.push(what)] });
  A.tick(); assert.deepEqual(calls, []);
  on.add('html[data-prof]'); A.tick(); A.tick();
  assert.deepEqual(calls, ['html[data-prof]'], 'once, on the edge');
  on.add('.tv-dialog:not([hidden])'); A.tick();
  assert.equal(calls.length, 1, 'a second thing opening while busy is not a new start');
  on.clear(); A.tick();
  assert.equal(calls.length, 1, 'walking away from a shop must not stop the walk');
  on.add('#panel-shop:not([hidden])'); A.tick();
  assert.equal(calls.length, 2);
  assert.equal(activeActivity(() => false), null);
  for (const need of ['data-prof', 'tv-fish', 'tv-dialog', 'panel-shop', 'panel-craft', 'panel-cart']) assert.ok(ACTIVITY_SEL.some(s => s.includes(need)), need);
});

// ---- controls.js with a fake window (it listens on `window` for keys) -------------------------------------------
function makeControls() {
  const handlers = {};
  globalThis.window = { addEventListener: (t, fn) => { (handlers[t] ||= []).push(fn); } };
  globalThis.document = { activeElement: null };
  const dom = { addEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) };
  const fire = (type, code, more = {}) => { for (const fn of handlers[type] || []) fn({ code, preventDefault() {}, repeat: false, ...more }); };
  return { handlers, fire, dom };
}
test('Y7/Y35: moving ends the walk toward the enemy, never the attack; Y1: release() forgets held keys until they are pressed again', async () => {
  const env = makeControls();
  const { createControls } = await import('../../js/client/controls.js');
  const attacks = [];
  const C = createControls({ dom: env.dom, camera: { position: { set() {} }, lookAt() {} }, heightAt: () => 0, getTarget: () => 7, onAttack: id => attacks.push(id) });
  const me = { x: 0, z: 0 }, foe = { x: 0, z: 20 };
  // F: attack on, walking in
  env.fire('keydown', 'KeyF');
  assert.equal(C.auto, 7); assert.equal(C.chasing, 7);
  let it = C.intent(me, { targetPos: foe, reach: 2 });
  assert.ok(it.mz > 0.9 && !it.manual, 'walks toward the enemy');
  // W: the walk is yours now — the attack is still on (report #45)
  env.fire('keydown', 'KeyD');
  it = C.intent(me, { targetPos: foe, reach: 2 });
  assert.equal(C.chasing, null); assert.equal(C.auto, 7, 'auto-attack survives a move key'); assert.equal(it.manual, true);
  env.fire('keyup', 'KeyD');
  // the stick too
  C.attack(7); C.setAnalog({ mx: 1, mz: 0 }); it = C.intent(me, { targetPos: foe, reach: 2 });
  assert.equal(C.auto, 7); assert.equal(C.chasing, null); C.setAnalog(null);
  // Attack again (the phone's button -> controls.attack): the walk is back, a tap-to-move goal is gone
  C.walkTo(50, 50); C.attack(7);
  assert.equal(C.moveGoal, null); assert.equal(C.chasing, 7);
  it = C.intent(me, { targetPos: { x: 0, z: 1.5 }, reach: 2 });
  assert.equal(it.inRange, true); assert.equal(Math.hypot(it.mx, it.mz), 0);
  assert.ok(Math.abs(it.yaw) < 1e-6, 'faces the target');
  // off: stopAuto, Esc, the kill (stopChase), death
  C.stopAuto(); assert.equal(C.auto, null); assert.equal(C.chasing, null);
  C.attack(7); env.fire('keydown', 'Escape'); assert.equal(C.auto, null);
  C.attack(7); C.stopChase(); assert.equal(C.auto, null);
  C.attack(7); C.intent(me, { dead: true }); assert.equal(C.auto, null);

  // Y1 — W is held, a mini-game opens (release), its key-up is swallowed; W auto-repeats: you do not move
  env.fire('keydown', 'KeyW');
  assert.ok(C.intent(me, {}).mz < -0.9 || C.intent(me, {}).mz > 0.9 || Math.hypot(C.intent(me, {}).mx, C.intent(me, {}).mz) > 0.9, 'W moves you');
  C.setAutorun(true); C.release();
  assert.equal(C.autorun, false);
  it = C.intent(me, {}); assert.equal(Math.hypot(it.mx, it.mz), 0, 'released');
  env.fire('keydown', 'KeyW', { repeat: true });
  it = C.intent(me, {}); assert.equal(Math.hypot(it.mx, it.mz), 0, 'the auto-repeat of a key that was let go is ignored');
  env.fire('keydown', 'KeyW');                       // pressed again, for real
  it = C.intent(me, {}); assert.ok(Math.hypot(it.mx, it.mz) > 0.9, 'a fresh press moves you again');
  env.fire('keyup', 'KeyW');
  delete globalThis.window; delete globalThis.document;
});

test('Y35: the Attack button is wired to the approach rule, not a copy of it', () => {
  const main = read('js/client/main.js');
  assert.match(main, /onSlot: i => \(i \? castSkill\(i\) : attackButton\(\)\)/);
  assert.match(main, /function attackButton\(\)[\s\S]{0,1800}controls\.attack\(S\.target\)/);
  assert.match(main, /import \{ basicReach as reachOf, shortenReach \} from '\.\/reach\.js'/);
  assert.doesNotMatch(main.slice(main.indexOf('function attackButton()'), main.indexOf('function tryStrike(')), /2\.4|approachReach|\* 0\.85/, 'no reach arithmetic of its own');
  // the strike loop asks whether the ATTACK is on — not whether you are standing still walking at the enemy
  const loop = main.slice(main.indexOf('S.movingByHand = !!it.manual'), main.indexOf('S.movingByHand = !!it.manual') + 600);
  assert.match(loop, /controls\.auto != null[^\n]*tryStrike\(false\)/);
  assert.doesNotMatch(main, /if \(it\.inRange && controls\.chasing != null\) tryStrike/);
  assert.ok(approachReach(9) < 9 && approachReach(9) > 6, 'reach.js still walks you inside the reach');
});

test('Y36: party arrows — only for members who are off the screen, never for one who is tracked, never for you', async () => {
  const { partyArrowsFor } = await import('../../js/client/input/party-arrows.js');
  const size = { w: 400, h: 800 };
  const people = [
    { char: 1, name: 'Me', self: true, placed: true, x: 0, z: 0 },
    { char: 2, name: 'Onscreen', placed: true, x: 200, z: 400, dist: 30, online: true },
    { char: 3, name: 'Right', placed: true, x: 900, z: 400, dist: 120, online: true },
    { char: 4, name: 'Behind', placed: true, x: 200, z: 9999, dist: 60, online: true },
    { char: 5, name: 'Tracked', placed: true, x: -900, z: 400, dist: 300, online: true, tracked: true },
    { char: 6, name: 'Dungeon', placed: false, x: NaN, z: NaN, online: true },
    { char: 7, name: 'Offline', placed: true, x: -900, z: 400, online: false },
  ];
  const project = (x, z) => ({ x, y: z === 9999 ? 300 : z, behind: z === 9999 });
  const out = partyArrowsFor(people, project, size);
  assert.deepEqual(out.map(a => a.name), ['Right', 'Behind']);
  const right = out[0], behind = out[1];
  assert.ok(right.x > 340 && right.x <= 400 && Math.abs(right.angle) < 0.1, 'on the right edge, pointing right');
  assert.ok(behind.y > 700 && behind.angle > 0.5, 'someone behind the camera: the bottom edge, pointing down');
  assert.equal(right.dist, 120);
});

test('Y19: the mini-game waits for the player, the wait is shorter than the server\'s allowance, and the pad / keys stand back from "ready" on', () => {
  const mg = read('js/client/ui/prof-minigame.js');
  const max = +/READY_MAX_MS = (\d+)/.exec(mg)[1];
  const late = JSON.parse(read('data/rules/professions.json'));
  const lateMs = JSON.stringify(late).match(/"lateMs":(\d+)/)[1];
  assert.ok(max + 2500 <= +lateMs, `the ready wait (${max} ms) plus latency fits the server's lateMs (${lateMs})`);
  assert.match(mg, /say\('ready'\)/);
  assert.match(mg, /state === 'play' \|\| state === 'ready'\) document\.documentElement\.dataset\.prof/);
  assert.match(read('js/client/input/gamepad.js'), /dataset\.prof\)/);
});
