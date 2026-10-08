import { createRoom } from '../../../js/sim/room.js';
import { standInTerrain } from '../../../js/sim/terrain.js';
import { createRules, rulesEngine, kitsFor, starterGear, validKit } from '../../../js/rules/index.js';
const engine = rulesEngine();
const terrain = standInTerrain(2, 2048);
const SX = terrain.spawn.x, SZ = terrain.spawn.z;
const k = kitsFor('paladin');
console.log(k.weapons.map(w => w.id + ':' + w.items.map(i => i.baseKey || i.base || i.name).join('+')));
for (const wk of k.weapons) {
  const events = [];
  const room = createRoom({ id: 'y9' + wk.id, terrain, seed: 5, camps: [], createRules, kind: 'wilds', hooks: { log: () => {}, award: () => {} } });
  const ev0 = room.host.event; let tick = 0;
  room.host.event = ev => { events.push({ ...ev, tick }); return ev0(ev); };
  const gear = starterGear('paladin', validKit('paladin', { weapons: wk.id }));
  const me = room.addPlayer({ id: 41, name: 'P', cls: 'paladin', level: 4, xp: 0, gold: 0, room: room.id, x: SX, z: SZ, equipment: gear }, null);
  const m = room.spawn({ kind: 'monster', type: 'road_brigand', level: 2, x: SX, z: SZ + 2, data: { noRank: true } });
  m.r.unit.maxHp = m.r.unit.hp = 1e6; m.r.unit.dmg = [0, 0];
  const u = me.r.unit;
  console.log(wk.id, 'off:', u.equipment.offhand?.name, u.equipment.offhand?.type, 'main:', u.equipment.weapon?.name);
  for (let i = 0; i < 60; i++) { tick = i; if (i % 3 === 0) room.rules.intent(me, { t: 'cast', slot: 0, target: m.id }); room.step(); }
  console.log(events.filter(e => e.type === 'hit' && e.d === m.id).slice(0, 8).map(e => `t${e.tick}:${e.n}:${e.skill}`).join(' '));
  console.log(events.filter(e => e.type === 'cast').slice(0, 6).map(e => `t${e.tick}:${e.hand || 'main'}:${e.every}`).join(' '));
}
