import { createRoom } from '../../../js/sim/room.js';
import { standInTerrain } from '../../../js/sim/terrain.js';
import { createRules, rulesEngine } from '../../../js/rules/index.js';
const engine = rulesEngine();
const terrain = standInTerrain(2, 2048);
const SX = terrain.spawn.x, SZ = terrain.spawn.z;
const row = engine.skillData.skills.storm_beam;
console.log(JSON.stringify({ ...row, talents: undefined }));
for (const [tier, t] of Object.entries(row.talents)) console.log(tier, (t.nodes || []).map(n => n.id + ':' + JSON.stringify(n.mod)).join(' | '), t.lib);
function run(picks) {
  const events = [];
  const room = createRoom({ id: 'y20' + Math.random(), terrain, seed: 5, camps: [], createRules, kind: 'wilds', hooks: { log: () => {}, award: () => {} } });
  const ev0 = room.host.event; let tick = 0;
  room.host.event = ev => { events.push({ ...ev, tick }); return ev0(ev); };
  const me = room.addPlayer({ id: 41, name: 'S', cls: 'stormcaller', level: 30, xp: 0, gold: 0, room: room.id, x: SX, z: SZ }, null);
  const ms = [3, 12, 25].map(d => room.spawn({ kind: 'monster', type: 'road_brigand', level: 30, x: SX, z: SZ + d, data: { noRank: true } }));
  for (const m of ms) { m.r.unit.maxHp = m.r.unit.hp = 1e7; m.r.unit.dmg = [0, 0]; m.r.unit.speed = 0; }
  for (const [tier, node] of Object.entries(picks)) console.log('pick', tier, node, room.rules.pickTalent(me, 'storm_beam', +tier, node).ok);
  const bar = room.rules.bar(me); const slot = bar.find(b => b.id === 'storm_beam');
  console.log(slot.desc);
  const r = room.rules.intent(me, { t: 'cast', slot: slot.slot, target: ms[0].id });
  for (let i = 0; i < 80; i++) { tick = i; room.step(); }
  const hits = events.filter(e => e.type === 'hit' && e.kind === 'dmg');
  console.log(r, 'hits', hits.length, 'total', hits.reduce((a, h) => a + h.n, 0), 'per target', ms.map(m => hits.filter(h => h.d === m.id).length).join('/'), 'ticks', [...new Set(hits.map(h => h.tick))].join(','));
  console.log([...new Set(events.filter(e => e.type === 'fx' || e.type === 'castbar' || e.type === 'castX').map(e => e.type + ':' + (e.kind || '') + (e.shape ? ':' + e.shape : '')))].join(' '), 'pools', events.filter(e => e.kind === 'pool').length);
}
run({});
run({ 1: 'building_storm' });
run({ 3: 'static_path', 4: 'afterstrike' });
