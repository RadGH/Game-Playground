// Play-test 1, P17 (stream A): "accepted 'Brigands at the cart' 0/3 right after killing the 3 brigands at the cart —
// confusing; the quest tracker lacks the info to understand the goal".
//  * a fight already won counts: kills / event wins / clears / uses from the last RECENT_Q_MS are replayed into a
//    quest when it is accepted (questR carries `credited: true` and the updated view);
//  * every step in the quest log carries its marker (`at: {x, z, r, name?}`) and E's `where` line, the quest carries
//    its `turnIn` place, `giverName` and `zoneName` — what the tracker, journal and map need to explain the goal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createVirtualClock } from '../../js/net/clock.js';
import { createMemoryStore } from '../../js/sim/store-memory.js';
import { createLoopbackServer } from '../../js/sim/loopback.js';
import { createWorld } from '../../js/sim/world.js';
import { loadProvinceContent } from '../../js/sim/content.js';
import { parseTerrain, parseNav } from '../../js/rules/terrain-read.js';
import { createProvinceTerrain } from '../../js/sim/province-terrain.js';
import { buildLayout } from '../../js/sim/realm.js';
import { vignetteContent } from '../../js/sim/vignettes.js';
import { createQuestBook } from '../../js/sim/quests.js';
import { makeClient, run, until, waitP } from './helpers.js';

const root = new URL('../../', import.meta.url);
const readJson = async f => JSON.parse(readFileSync(new URL(f, root), 'utf8'));
const readBytes = async f => readFileSync(new URL(f, root));
const C = await loadProvinceContent(readJson, readBytes, 'torbor_downs', { parseTerrain, parseNav, createProvinceTerrain });
const L = buildLayout({ key: 'torbor_downs', name: C.name, terrain: C.terrain, zones: C.zones, encounterInfo: C.encounterInfo, vignetteContent, starter: C.starter, rares: C.rares, jobs: C.jobs });

// E's placements follow B's bakes; mid-rebake they are skipped ("made for another bake") and half the NPCs are missing
const placed = L.zones.filter(z => z.vignettes).length >= L.zones.length - 1;
test('P17: the quest log explains the goal — a marker per step, the turn-in place, names', { skip: !placed && 'E\'s placements are not loaded for this bake (mid-rebake)' }, () => {
  const book = createQuestBook({ layout: L, zones: L.zones, rares: C.rares, jobs: C.jobs, rng: () => 0.3 });
  let steps = 0, marked = 0, quests = 0, turnIn = 0;
  const missing = [];
  for (const d of book.defs.values()) {
    quests++;
    const v = book.view({ quests: { active: { [d.id]: { step: 0, n: 0 } }, done: {}, jobs: {} } }).active[0];
    if (v.turnIn) turnIn++;
    assert.ok(v.zoneName && typeof v.zoneName === 'string');
    for (const st of v.steps) {
      steps++;
      if (st.at) { marked++; assert.ok(Number.isFinite(st.at.x) && Number.isFinite(st.at.z) && st.at.r > 0); } else missing.push(d.id + ':' + st.kind);
    }
  }
  console.log(`# ${marked}/${steps} steps have a marker, ${turnIn}/${quests} quests a turn-in place; unmarked: ${missing.slice(0, 12).join(', ')}`);
  assert.ok(marked / steps >= 0.9, `markers on ${marked}/${steps} steps`);
  assert.ok(turnIn / quests >= 0.9, `turn-in places on ${turnIn}/${quests} quests`);
});

test('P17: kill the pack first, then accept the quest — it counts the kills you already made', async () => {
  const clock = createVirtualClock();
  const store = createMemoryStore({ now: clock.now });
  const w = createWorld({ layouts: [L], store, now: clock.now, lingerMs: 0, log: () => {}, events: C.events, encounterInfo: C.encounterInfo, zoneEventFirstMs: 1e9 });
  const srv = createLoopbackServer({ clock, world: w });
  await srv.ready;
  const a = makeClient(srv, clock);
  await waitP(clock, a.ready);
  const ch = await waitP(clock, a.createChar({ name: 'Earlybird', cls: 'warrior' }));
  await waitP(clock, a.play(ch.id));
  const P = w.province, pv = P.P.get('torbor_downs');
  const me = () => P.online.get(a.joined.you.char);
  const qr = [], logs = [];
  a.on('questR', m => qr.push(m)); a.on('quests', m => logs.push(m));
  const rooms = [...pv.towns, ...pv.copies];
  let maud = null;
  for (const r of rooms) for (const o of r.objects.values()) if (!maud && o.data && o.data.npc && o.data.npc.id === 'elder_maud') maud = { r, o };
  assert.ok(maud, 'Elder Maud stands somewhere');
  const def = pv.book.defs.get('wolves_at_the_fold');
  const need = def.steps[0].count;
  // the fight, BEFORE the quest: the hounds die by my hand out in the wilds
  const wild = P.copies[0];
  P.transfer(me(), wild, { x: maud.o.x + 400, z: maud.o.z }, 'test');
  await run(clock, 200);
  for (let i = 0; i < need; i++) {
    const m = wild.spawn({ kind: 'monster', type: def.steps[0].type, level: 1, x: me().entity.x + 3, z: me().entity.z });
    m.kill(me().entity);
    await run(clock, 60);
  }
  // now the quest
  P.transfer(me(), maud.r, { x: maud.o.x + 1, z: maud.o.z }, 'test');
  await run(clock, 200);
  a.quest('accept', 'wolves_at_the_fold', maud.o.id);
  await until(clock, () => qr.length, 2000);
  assert.equal(qr[0].ok, true, JSON.stringify(qr[0]));
  assert.equal(qr[0].credited, true, 'the answer says the earlier kills counted');
  await run(clock, 100);
  const q = logs.at(-1).active.find(x => x.id === 'wolves_at_the_fold');
  assert.ok(q.step >= 1 || q.steps[0].n === need, `${q.steps[0].n}/${need} — it used to read 0/${need}`);
  assert.ok(q.turnIn && Number.isFinite(q.turnIn.x), 'where to take it back');
  assert.ok(q.steps.every(st => st.at || st.done), 'markers on the open steps');
  a.close(); await srv.stop();
});
