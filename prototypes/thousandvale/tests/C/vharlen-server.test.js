// node --test prototypes/thousandvale/tests/C/vharlen-server.test.js
// Expansion 1, stream C: the REAL realm (Torbor Downs + Vharlen, every file as the server loads it — server/load.mjs
// loadLayouts) and a real character: begins on Torbor, sails to Vharlen (the move stream V's voyage makes), and there
// finds island camps, island folk with island names, a quest to take, a shop that sells, the Harbourmaster on the pier.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorld } from '../../js/sim/world.js';
import { createLoopbackServer } from '../../js/sim/loopback.js';
import { createMemoryStore } from '../../js/sim/store-memory.js';
import { createVirtualClock } from '../../js/net/clock.js';
import { memoryTokenStore } from '../../js/net/client.js';
import { loadLayouts } from '../../server/load.mjs';
import { prepareRules } from '../../js/rules/index.js';
import { makeClient, run, until, waitP } from '../A/helpers.js';

const J = p => JSON.parse(readFileSync(new URL('../../' + p, import.meta.url), 'utf8'));
const TV = new Set(J('data/rules/monsters-tv.json').monsters.map(m => m.id));
const MAP = J('data/world/province-map.json').provinces.vharlen.map;
const SHEET = J('data/provinces/vharlen.json');

test('a character who sails to Vharlen finds island camps, island folk, a quest to take, a shop and the Harbourmaster', { timeout: 300000 }, async () => {
  const quiet = console.log; console.log = () => {};
  const { layouts, events, encounterInfo } = await loadLayouts(['torbor_downs', 'vharlen']);
  console.log = quiet;
  assert.deepEqual(layouts.map(l => l.key), ['torbor_downs', 'vharlen'], 'both provinces load');
  await prepareRules();
  const clock = createVirtualClock(), store = createMemoryStore({ now: clock.now });
  const world = createWorld({ store, layouts, events, encounterInfo, now: clock.now, lingerMs: 0, log: () => {}, roadEvents: false, travellers: false });
  const srv = createLoopbackServer({ clock, world }); await srv.ready;
  const c = makeClient(srv, clock, { tokenStore: memoryTokenStore() }); await waitP(clock, c.ready);
  const ch = await waitP(clock, c.createChar({ name: 'Seafarer', cls: 'warrior' })); await waitP(clock, c.play(ch.id)); await until(clock, () => !!c.joined, 5000);
  const rec = () => world.online.get(c.joined.you.char);
  assert.ok(rec().room.id.startsWith('torbor_downs/'), 'a new character begins on Torbor Downs');
  // level 10: the island's floor (a real level-up through the room, as the test hook does)
  const { xpForLevel } = await import('../../js/rules/farhold.js');
  rec().room.award(rec().entity, { xp: xpForLevel(10) + 1, reason: 'test' }); await run(clock, 200);
  assert.ok((rec().char.level || 1) >= 10, 'level ' + rec().char.level);

  // ---- the voyage's move: ashore at Port Vharl's dock ----
  const pv = J('data/provinces/ships.json').harbours.find(h => h.id === 'port_vharl');
  world.moveTo(rec(), 'vharlen', pv.dock, 'ship'); await run(clock, 500);
  assert.ok(rec().room.id.startsWith('vharlen/'), 'on Vharlen: ' + rec().room.id);
  assert.equal(c.joined.room.province, 'vharlen');
  const V = world.P.get('vharlen'), L = V.L;

  // ---- camps: every zone has its own, all island monsters ----
  const per = {};
  for (const k of L.camps) if (k.type) { const z = L.zoneOf(k.x, k.z); (per[z] ||= []).push(k); }
  for (const wid of Object.values(MAP)) {
    assert.ok((per[wid] || []).length >= 20, `${wid}: ${(per[wid] || []).length} camps`);
    const off = (per[wid] || []).filter(k => !TV.has(k.type) && !k.encounter);
    assert.deepEqual([...new Set(off.map(k => k.type))], [], `${wid}: a camp of a monster that is not Vharlen's`);
  }
  // the named ones stand: two rares, an elite and a zone event per zone; Ossathra waits in the Caldera
  const named = new Set(L.camps.filter(k => k.encounter).map(k => k.encounter));
  for (const z of Object.values(SHEET.zones)) for (const id of [...z.rares, z.elite]) assert.ok(named.has(id), `${id} is not in the world`);
  assert.ok(events.some(e => e.id === 'world_ossathra' && e.province === 'vharlen'), 'Ossathra is a realm event');

  // ---- Port Vharl: island folk with island names, the quest givers, the shops, the Harbourmaster ----
  const town = V.towns.find(t => t.name === 'Port Vharl');
  assert.ok(town, 'Port Vharl is a town room');
  const npcs = [...town.objects.values()].filter(o => o.data && o.data.npc);
  const roles = new Set(npcs.map(o => o.data.npc.role));
  for (const r of ['elder', 'merchant', 'trader', 'smith', 'armourer', 'innkeeper', 'healer', 'stablehand', 'carter']) assert.ok(roles.has(r), `Port Vharl has a ${r}`);
  const harbour = [...V.towns, ...world.rooms.values()].flatMap(r => [...(r.objects ? r.objects.values() : [])]).find(o => o.data && o.data.npc && o.data.npc.role === 'harbourmaster' && o.data.npc.harbour === 'port_vharl');
  assert.ok(harbour, 'the Harbourmaster stands on Port Vharl\'s pier');
  const torborFamilies = new Set(J('data/names/torbor.json').family);
  const named2 = npcs.filter(o => / /.test(o.name) && !/Guard|Sergeant/.test(o.name));
  assert.ok(named2.length >= 10);
  for (const o of named2) assert.ok(!torborFamilies.has(o.name.split(' ').at(-1)), `${o.name}: a Torbor family name in Port Vharl`);

  const got = [];
  for (const t of ['shopView', 'quests', 'questR']) c.on(t, m => got.push({ t, m }));
  const merchant = npcs.find(o => o.data.npc.role === 'merchant');
  world.transfer(rec(), town, { x: merchant.x + 1, z: merchant.z }, 'test'); await run(clock, 300);
  c.shop('open', { npc: merchant.id }); await run(clock, 300);
  const sv = got.filter(g => g.t === 'shopView').at(-1);
  assert.ok(sv && sv.m.stock.length >= 5, 'the general store has stock');

  const elder = npcs.find(o => (o.data.npc.quests || []).includes('bs_fresh_off_the_saltwren'));
  assert.ok(elder, 'the Hearth-elder gives the first island quest');
  world.transfer(rec(), town, { x: elder.x + 1, z: elder.z }, 'test'); await run(clock, 300);
  c.quest('accept', 'bs_fresh_off_the_saltwren', elder.id); await run(clock, 500);
  const q = got.filter(g => g.t === 'quests').at(-1);
  assert.ok(q && q.m.active.some(a => a.id === 'bs_fresh_off_the_saltwren'), 'the quest is taken: ' + JSON.stringify(got.filter(g => g.t === 'questR').map(g => g.m)));
  c.close(); await srv.stop();
});
