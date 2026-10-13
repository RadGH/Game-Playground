// Wrap-up (2026-10-13), professions interface: reports #57 (skinning waits for the mouse), #56 (the angling teacher opens
// the trainer window), #62 (no "teaches X" in a trainer's title; the trade button is always in the dialog).
// Run: node --test prototypes/thousandvale/tests/P/wrapup.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hoverBegins, READY_HOVER_PX, GAME_TYPES, makeGame, perfectPlay } from '../../js/client/ui/prof-games.js';
import { checkInputs } from '../../js/rules/professions-games.js';

const read = f => readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const DATA = JSON.parse(read('data/rules/professions.json'));

// ---------------------------------------------------------------------------------------------------------------- #57
test('#57: only the skinning trace begins on a mouse MOVE, and only once the mouse is on the knife', () => {
  assert.equal(hoverBegins('trace', 'mouse', 0), true);
  assert.equal(hoverBegins('trace', 'mouse', READY_HOVER_PX), true);
  assert.equal(hoverBegins('trace', 'mouse', READY_HOVER_PX + 1), false, 'anywhere else on the hide starts nothing');
  assert.equal(hoverBegins('trace', 'touch', 0), false, 'a finger begins by touching, not by a move');
  assert.equal(hoverBegins('trace', 'mouse', NaN), false);
  for (const t of GAME_TYPES) if (t !== 'trace') assert.equal(hoverBegins(t, 'mouse', 0), false, t + ' is begun by a press');
});
test('#57: no game starts by itself — the wait ends by putting the game away — and the server allows the whole wait', () => {
  const mg = read('js/client/ui/prof-minigame.js');
  assert.ok(!/setTimeout\(begin\b/.test(mg), 'nothing arms begin() on a timer');
  assert.match(mg, /S\.readyT = setTimeout\(\(\) => \{ if \(waiting\(\)\) cancel\(\); \}, wait\)/);
  assert.match(mg, /hoverBegins\(S\.run\.type, e\.pointerType,/);
  assert.ok(!/Begins by itself/.test(mg));
  const max = +/READY_MAX_MS = (\d+)/.exec(mg)[1], late = DATA.gather.lateMs;
  assert.ok(max >= 15000, 'long enough to find the knife');
  assert.ok(max + 2500 <= late, `the wait (${max}) plus latency fits lateMs (${late})`);
  // the server's own check, asked: a flawless game begun at the very end of the wait is still taken
  for (const t of GAME_TYPES) {
    const g = makeGame(t, { seed: 7, ease: 0, base: DATA.games?.[t] });
    const inputs = []; for (const [at, k, v] of perfectPlay(g)) if (k === 'p') inputs.push(Math.round(at), v ?? 0);
    const ok = checkInputs(g, t === 'trace' ? [] : inputs, { elapsedMs: g.ms + max + 2000, graceMs: DATA.gather.graceMs, lateMs: late, minGapMs: DATA.gather.minGapMs });
    assert.notEqual(ok.why, 'late', t);
    assert.equal(checkInputs(g, [], { elapsedMs: g.ms + late + 1, lateMs: late }).why, 'late', 'the knob is read');
  }
});

// ---------------------------------------------------------------------------------------------------------- #56, #62
import { realServer, joinReal, rec, run, until } from '../A/pt1-helpers.js';

test('#56 / #62: the angler lists Angling like any other teacher, before and after it is learned; no trainer wears "teaches …" in a title', async t => {
  const S = await realServer({ roadEvents: false, travellers: false });
  const a = await joinReal(S.srv, S.clock, 'Wrapangler');
  t.after(async () => { a.close(); await S.srv.stop(); });
  const P = S.world.province, o = rec(S.world, a), clock = S.clock;
  const used = []; a.on('used', m => used.push(m));
  const anglers = JSON.parse(read('data/provinces/angling-pools.json')).anglers;
  assert.ok(anglers.length >= 3);
  const rooms = [...P.rooms.values()];
  for (const room of rooms) P.professions.ensureNodes(room);
  const find = id => { for (const room of rooms) for (const e of room.objects.values()) if (e.data && e.data.key === 'npc:' + id) return { room, e }; return null; };
  let talked = 0;
  for (const an of anglers) {
    const at = find(an.id);
    if (!at) continue;
    assert.equal(at.e.data.npc.role, 'angler');
    o.char.angling = null; o.char.bag = [];
    P.transfer(o, at.room, { x: at.e.x + 1, z: at.e.z }, 'test'); await run(clock, 600);
    used.length = 0; a.use(at.e.id); await until(clock, () => used.length, 2000);
    let u = used[0];
    assert.ok(u.ok && u.prof, `${an.town}: the angler answers with a trades block`);
    assert.deepEqual(u.prof.trains, ['angling'], `${an.town}: Angling is in the list the trade button is built from`);
    assert.deepEqual(u.prof.taught, ['angling'], `${an.town}: a newcomer is told what was just taught`);
    assert.deepEqual(u.prof.known, ['angling']);
    assert.ok(o.char.bag.some(P.angling.isRod), 'with the rod');
    used.length = 0; a.use(at.e.id); await until(clock, () => used.length, 2000);
    u = used[0];
    assert.deepEqual(u.prof.trains, ['angling'], `${an.town}: still listed once it is known`);
    assert.equal(u.prof.taught, undefined); assert.deepEqual(u.prof.known, ['angling']);
    talked++;
  }
  assert.ok(talked >= 1, 'at least one angler stands in a room this server built');
  // #62: every NPC in every room — nobody's title says what they teach
  let titled = 0;
  for (const room of rooms) for (const e of room.objects.values()) { const ti = e.data && e.data.title; if (ti) { titled++; assert.ok(!/teach/i.test(ti), `${e.name}: "${ti}"`); } }
  const src = read('js/sim/professions.js');
  assert.ok(!/—\s*teaches\s*\$\{/.test(src), 'the trainer this system places is given its plain title');
  assert.match(src, /title: tr\.title \|\| null/);
  const bram = find('prospector_torborhold');
  assert.ok(bram, 'the prospector by Torborhold\'s gate is there');
  if (bram.e.data.title) assert.equal(bram.e.data.title, 'Prospector');
  // … and his trade is offered whether or not it is known, beside whatever quests he has
  P.transfer(o, bram.room, { x: bram.e.x + 1, z: bram.e.z }, 'test'); await run(clock, 600);
  for (const round of ['first', 'again']) {
    used.length = 0; a.use(bram.e.id); await until(clock, () => used.length, 2000);
    assert.deepEqual(used[0].prof.trains, ['mining'], round); assert.ok(used[0].prof.known.includes('mining'), round);
  }
  void titled;
});

// ------------------------------------------------------------------------------------------------- audit: Y13, Angling
import { createProfessions } from '../../js/sim/professions.js';
const tickP = () => new Promise(r => setTimeout(r, 5));
const mkW = (extra = {}) => {
  let t = 0;
  const W = createProfessions({ layouts: [{ professions: { numbers: DATA, content: JSON.parse(read('data/provinces/professions.json')), nodes: null } }], online: new Map(), provOf: () => null, grant: () => [], journal: () => {}, now: () => t, ...extra });
  return { W, adv: ms => { t += ms; } };
};
const ROOM = { id: 'r', kind: 'town', rules: { makeItem() {} }, objects: new Map() };

test('Y13: a failed load of the forge\'s rules is tried again, and the refusal says what is actually wrong', async () => {
  let calls = 0, fail = true;
  const { W, adv } = mkW({ loadEngine: async () => { calls++; if (fail) throw new Error('boom'); return { ok: 1 }; } });
  assert.match(W.forgeWhy(ROOM), /warming up/, 'while the first load is under way');
  await tickP();
  assert.equal(calls, 1);
  assert.match(W.forgeWhy(ROOM), /out of order/, 'a failed load is not called "warming up"');
  assert.equal(calls, 1, 'not hammered: one try every few seconds');
  adv(3100); W.forgeWhy(ROOM); await tickP();
  assert.equal(calls, 2, 'asked again after a failure (it used to be asked once, for ever)');
  fail = false; adv(3100); W.forgeWhy(ROOM); await tickP();
  assert.equal(calls, 3);
  assert.equal(W.forgeWhy(ROOM), null, 'and the forge works once the load succeeds');
  assert.match(mkW().W.forgeWhy({ id: 'x', kind: 'town', rules: {} }), /cannot be done in this place/, 'a room with no item rules says so');
});
test('Y13: the rules are asked for when the system first sees a room, not on the first order', async () => {
  let calls = 0;
  const { W } = mkW({ loadEngine: async () => { calls++; return { ok: 1 }; } });
  W.ensureNodes(ROOM); await tickP();
  assert.equal(calls, 1);
  assert.equal(W.forgeWhy(ROOM), null, 'ready before anybody asks');
});
test('audit: the Professions list says Angling is known only once it is learned', () => {
  for (const learned of [false, true]) {
    const { W } = mkW({ anglingView: () => ({ level: 1, xp: 0, next: 10, learned }) });
    assert.equal(W.view({ bag: [], professions: {} }).list.find(p => p.id === 'angling').known, learned);
  }
  assert.equal(mkW().W.view({ bag: [], professions: {} }).list.find(p => p.id === 'angling').known, true, 'a server with no angling system keeps the old answer');
});
