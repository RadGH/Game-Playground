import { createRoom } from '../../js/sim/room.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { createRules, rulesEngine } from '../../js/rules/index.js';
const engine = rulesEngine();
const terrain = standInTerrain(2, 2048);
const SX = terrain.spawn.x, SZ = terrain.spawn.z;
const events = [];
const room = createRoom({ id: 'p', terrain, seed: 21, camps: [], createRules, kind: 'wilds', hooks: { log: () => {} } });
const ev0 = room.host.event; let tick = 0;
room.host.event = ev => { events.push({ tick, ...ev }); return ev0(ev); };
const me = room.addPlayer({ id: 41, name: 'p', cls: process.argv[2] || 'pyromancer', level: 4, xp: 0, gold: 0, room: 'p', x: SX, z: SZ }, null);
me.r.unit.maxHp = me.r.unit.hp = 1e6;
const types = (process.argv[3] || 'moor_hound').split(',');
const mons = types.map((t, i) => room.spawn({ kind: 'monster', type: t, level: 3, x: SX + i * 3, z: SZ + 18, data: { noRank: true } }));
console.log('bar', room.rules.bar(me).map(b => `${b.slot}:${b.id}:${b.shape}`).join(' '));
console.log('mon', mons.map(m => `${m.r.unit.type} ranged=${JSON.stringify(m.r.unit.ranged)} reach=${m.r.unit.reach}`));
console.log('tickrate', room.dt ?? room.tickMs);
if (!process.argv[4]) { const r = room.intent ? null : null; }
for (tick = 0; tick < 300; tick++) {
  if (tick === 5 && !process.argv[4]) console.log('cast', JSON.stringify(room.rules.intent?.(me, { t: 'cast', slot: 1, target: mons[0].id }) ?? 'no intent'));
  room.step();
}
for (const e of events) if (['fx', 'hit', 'cast', 'swing', 'tele'].includes(e.type) && !(e.type === 'fx' && ['build'].includes(e.kind))) console.log(JSON.stringify(e).slice(0, 260));
