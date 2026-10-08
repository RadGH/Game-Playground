import { createRoom } from '../../../js/sim/room.js';
import { standInTerrain } from '../../../js/sim/terrain.js';
import { createRules, rulesEngine } from '../../../js/rules/index.js';
import { makeRng } from '../../../js/rules/rng.js';
const engine = rulesEngine(); const t = standInTerrain(2, 2048);
for (const fold of [true, false]) {
  engine.combatCfg.melee.foldSplash = fold;
  const ev = []; const room = createRoom({ id: 'c' + fold, terrain: t, seed: 5, camps: [], createRules, kind: 'wilds', hooks: { log() {}, award() {} } });
  const e0 = room.host.event; room.host.event = e => { ev.push(e); return e0(e); };
  const me = room.addPlayer({ id: 41, name: 'w', cls: 'warrior', level: 20, xp: 0, gold: 0, room: room.id, x: t.spawn.x, z: t.spawn.z }, null);
  const u = me.r.unit;
  room.rules.room.run(() => { u.equipment.weapon = engine.makeItem({ base: 'sword', rarity: 'rare', level: 20, rng: makeRng(2) }); engine.rpg.refresh(u, { full: true }); });
  for (let k = 0; k < 1500; k++) {
    if (k % 300 === 0) for (let j = 0; j < 3; j++) room.spawn({ kind: 'monster', type: 'road_brigand', level: 20, x: t.spawn.x + j * 2 - 2, z: t.spawn.z + 4, data: { noRank: true } });
    u.hp = Math.max(u.hp, u.maxHp * 0.3);
    const m = room.rules.field.monsters.find(m => m.dying == null);
    if (m) room.rules.intent(me, { t: 'cast', slot: 0, target: m.id });
    room.step();
  }
  const hits = ev.filter(e => e.type === 'hit' && e.s === me.id);
  { const c = {}; for (const e of ev) c[e.type + ':' + (e.kind || e.why || '') + ':' + (e.s === 41 ? 'me' : '')] = (c[e.type + ':' + (e.kind || e.why || '') + ':' + (e.s === 41 ? 'me' : '')] || 0) + 1; console.log(JSON.stringify(c)); }
  console.log(fold, 'crit%', u.derived.critChance, 'hits', hits.length, 'crits', hits.filter(h => h.crit).length, 'swings', ev.filter(e => e.type === 'cast').length);
}
{
  engine.combatCfg.melee.foldSplash = true;
  const ev = []; const room = createRoom({ id: 'cz', terrain: t, seed: 5, camps: [], createRules, kind: 'wilds', hooks: { log() {}, award() {} } });
  const e0 = room.host.event; room.host.event = e => { ev.push(e); return e0(e); };
  const me = room.addPlayer({ id: 41, name: 'w', cls: 'warrior', level: 20, xp: 0, gold: 0, room: room.id, x: t.spawn.x, z: t.spawn.z }, null);
  const m = room.spawn({ kind: 'monster', type: 'road_brigand', level: 20, x: t.spawn.x, z: t.spawn.z + 4, data: { noRank: true } });
  for (let k = 0; k < 200; k++) { const r = room.rules.intent(me, { t: 'cast', slot: 0, target: m.id }); if (k % 40 === 0) console.log(k, JSON.stringify(r), m.r.unit.x - me.x, m.r.unit.z - me.z, m.r.unit.state, me.r.unit.yaw, room.rules.field.wild(me.x, me.z)); room.step(); }
  const c = {}; for (const e of ev) c[e.type + ':' + (e.kind || e.why || '')] = (c[e.type + ':' + (e.kind || e.why || '')] || 0) + 1; console.log(c);
}
