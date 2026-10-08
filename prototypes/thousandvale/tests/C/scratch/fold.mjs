import { createRoom } from '../../../js/sim/room.js';
import { standInTerrain } from '../../../js/sim/terrain.js';
import { createRules, rulesEngine } from '../../../js/rules/index.js';
import { makeRng } from '../../../js/rules/rng.js';
const engine = rulesEngine(); const t = standInTerrain(2, 2048);
engine.combatCfg.melee.foldSplash = false;
const ev = []; const room = createRoom({ id: 'f', terrain: t, seed: 5, camps: [], createRules, kind: 'wilds', hooks: { log() {}, award() {} } });
const e0 = room.host.event; room.host.event = e => { ev.push(e); return e0(e); };
const me = room.addPlayer({ id: 41, name: 'w', cls: 'warrior', level: 6, xp: 0, gold: 0, room: 'f', x: t.spawn.x, z: t.spawn.z }, null);
console.log(room.rules.equip(me, engine.makeItem({ base: 'longsword', rarity: 'magic', level: 6, rng: makeRng(5) }), 'weapon'));
const m = room.spawn({ kind: 'monster', type: 'road_brigand', level: 6, x: t.spawn.x, z: t.spawn.z + 2, data: { noRank: true } });
const u = m.r.unit; u.maxHp = u.hp = 1e7; u.dmg = [0, 0]; u.speed = 0; u.aggroRange = 0;
for (let i = 0; i < 100; i++) { if (i % 2 === 0) room.rules.intent(me, { t: 'cast', slot: 0, target: m.id }); room.step(); }
console.log(ev.filter(e => e.type === 'hit').slice(0, 8).map(e => e.skill + ':' + e.n).join(' '), u.x, u.z, me.x, me.z);
