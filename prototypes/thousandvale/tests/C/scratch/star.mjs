import { createRoom } from '../../../js/sim/room.js';
import { standInTerrain } from '../../../js/sim/terrain.js';
import { createRules, rulesEngine, kitsFor } from '../../../js/rules/index.js';
const engine = rulesEngine();
console.log(engine.classReport, engine.classes.length, engine.talentReport && Object.keys(engine.talentReport));
const terrain = standInTerrain(2, 2048); const SX = terrain.spawn.x, SZ = terrain.spawn.z;
const events = [];
const room = createRoom({ id: 'st', terrain, seed: 5, camps: [], createRules, kind: 'wilds', hooks: { log() {}, award() {} } });
const e0 = room.host.event; let tick = 0; room.host.event = e => { events.push({ ...e, tick }); return e0(e); };
const me = room.addPlayer({ id: 41, name: 'S', cls: 'starcaller', level: 30, xp: 0, gold: 0, room: 'st', x: SX, z: SZ }, null);
const ms = [[0, 10], [2, 11], [-2, 12], [1, 14]].map(([dx, dz]) => room.spawn({ kind: 'monster', type: 'road_brigand', level: 30, x: SX + dx, z: SZ + dz, data: { noRank: true } }));
for (const m of ms) { const u = m.r.unit; u.maxHp = u.hp = 1e7; u.dmg = [0, 0]; u.speed = 0; u.aggroRange = 0; }
for (const b of room.rules.bar(me)) console.log(b.slot, b.name, '|', b.desc);
const u = me.r.unit;
console.log(kitsFor('starcaller').weapons.map(w => w.id).join(','), u.equipment.weapon?.name, u.equipment.offhand?.name);
for (const slot of [1, 1, 2, 3, 4, 5, 6]) {
  events.length = 0; u.mp = u.maxMp;
  const r = room.rules.intent(me, { t: 'cast', slot, target: ms[0].id, aim: { x: SX, z: SZ + 11 } });
  for (let i = 0; i < 120; i++) { tick = i; room.step(); }
  const hits = events.filter(e => e.type === 'hit' && e.kind === 'dmg' && e.s === me.id);
  console.log(slot, JSON.stringify(r), 'hits', hits.length, 'dmg', hits.reduce((a, h) => a + h.n, 0), 'starlight', JSON.stringify(u.mech?.res), [...new Set(events.filter(e => e.type === 'fx').map(e => e.kind + (e.proj ? ':' + e.proj : '')))].join(' '));
}
