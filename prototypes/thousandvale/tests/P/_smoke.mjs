import { realServer, joinReal, rec, run, until } from '../A/pt1-helpers.js';
import { perfectInputs } from '../../js/rules/professions-games.js';
const on = (c, t) => { const l = []; c.on(t, m => l.push(m)); return l; };
const { srv, clock, world } = await realServer({ roadEvents: false });
const P = world.province, W = P.professions;
const a = await joinReal(srv, clock, 'Digger');
const o = rec(world, a);
await run(clock, 1500);
const find = id => [...P.rooms.values()].flatMap(rm => [...rm.objects.values()].map(e => ({ e, rm }))).find(x => x.e.data && x.e.data.npc && x.e.data.npc.id === id);
const byRole = (role, rm) => [...rm.objects.values()].find(e => e.data && e.data.npc && e.data.npc.role === role);
const bram = find('prospector_torborhold');
console.log('bram', !!bram, bram && bram.rm.id, bram && bram.e.name, 'info', bram && JSON.stringify(bram.e.info()));
P.transfer(o, bram.rm, { x: bram.e.x + 1.5, z: bram.e.z }, 'test'); await run(clock, 600);
const used = on(a, 'used'), profR = on(a, 'profR'), you = on(a, 'you'), gR = on(a, 'gatherR'), gD = on(a, 'gatherDone'), cL = on(a, 'craftList'), cR = on(a, 'craftR'), cD = on(a, 'craftDone'), cQ = on(a, 'craftQuote'), qr = on(a, 'questR');
a.use(bram.e.id); await until(clock, () => used.length, 2000);
console.log('used', JSON.stringify(used[0]).slice(0, 700));
console.log('bag', o.char.bag.map(i => i.name + (i.count > 1 ? ' x' + i.count : '')), 'known', o.char.professions);
a.quest('accept', 'prof_three_good_swings', bram.e.id); await until(clock, () => qr.length, 2000); console.log('quest', JSON.stringify(qr[0]).slice(0, 200));
// nodes in the town room near the gate
const nodes = [...bram.rm.objects.values()].filter(e => e.type === 'node');
console.log('nodes in town room', nodes.length, nodes.filter(n => n.data.node.starter).map(n => n.data.node.kind + '@' + Math.round(Math.hypot(n.x - bram.e.x, n.z - bram.e.z))));
const copy = P.copies[0]; W.ensureNodes(copy);
console.log('nodes in wilds copy', [...copy.objects.values()].filter(e => e.type === 'node').length);
for (const n0 of nodes.filter(n => n.data.node.starter).slice(0, 3)) {
  P.transfer(o, P.roomAt ? o.room : o.room, { x: n0.x + 1.5, z: n0.z }, 'test'); await run(clock, 900);
  const n = [...o.room.objects.values()].find(e => e.data && e.data.key === n0.data.key);
  console.log('room now', o.room.id, 'node', !!n, 'seen by client', n && !!a.mirror.infos.get(n.id) && JSON.stringify(a.mirror.infos.get(n.id)).slice(0, 260));
  gR.length = 0; gD.length = 0;
  a.gather('start', { id: n.id }); await until(clock, () => gR.length, 2000);
  if (!gR[0].ok) { console.log('refused', gR[0]); continue; }
  const inp = perfectInputs(gR[0].game); await run(clock, inp[inp.length - 2] + 50);
  a.gather('done', { id: n.id, inputs: inp }); await until(clock, () => gD.length, 2000);
  console.log('gather', gD[0].quality, gD[0].msg, 'xp', gD[0].xp, JSON.stringify(gD[0].skill), 'reopen', gD[0].reopenMs, 'held', o.entity.held, o.entity.working);
}
console.log('bag', o.char.bag.map(i => i.name + (i.count > 1 ? ' x' + i.count : '')), 'quest', JSON.stringify(o.char.quests.active));
// the smith
const town = bram.rm; const smith = byRole('smith', town);
P.transfer(o, town, { x: smith.x + 1.5, z: smith.z }, 'test'); await run(clock, 900);
used.length = 0; a.use(smith.id); await until(clock, () => used.length, 2000); console.log('smith used.prof', JSON.stringify(used[0].prof), used[0].role);
a.prof('learn', { id: 'smithing', npc: smith.id }); await until(clock, () => profR.length, 2000); console.log('profR', JSON.stringify(profR[0]).slice(0, 200));
a.prof('learn', { id: 'tempering', npc: smith.id }); await run(clock, 300);
P.grant(o, { items: [W.P.item('copper_ore', 4), W.P.item('tin_ore', 4)], reason: 'test' }); await run(clock, 200);
a.craft('list', { npc: smith.id }); await until(clock, () => cL.length, 2000);
console.log('craftList', JSON.stringify(cL[0].station), cL[0].recipes.length, JSON.stringify(cL[0]).length, 'bytes;', cL[0].recipes.filter(r => r.can).map(r => r.id));
console.log(JSON.stringify(cL[0].recipes.find(r => r.id === 'blades_1')).slice(0, 900));
const play = async (id, extra = {}) => { cR.length = 0; cD.length = 0; a.craft('start', { id, npc: smith.id, ...extra }); await until(clock, () => cR.length, 2000); if (!cR[0].ok) { console.log('craftR refused', JSON.stringify(cR[0])); return null; }
  const inp = perfectInputs(cR[0].game); await run(clock, inp[inp.length - 2] + 50); a.craft('done', { id, inputs: inp }); await until(clock, () => cD.length, 2000); console.log('craftDone', id, cD[0].ok, cD[0].quality, cD[0].msg, 'xp', cD[0].xp, JSON.stringify(cD[0].skill), 'gold', o.char.gold); return cD[0]; };
o.char.gold = 500; await play('smelt_bronze_bar', { n: 3 });
const blade = await play('blades_1');
const it = o.char.bag.find(i => i.crafted);
console.log('crafted', it && [it.name, it.rarity, it.quality, 'lvl', it.dropLevel, it.maker, it.affixes.length].join(' | '));
await play('smelt_bronze_bar', { n: 1 });
P.grant(o, { items: [W.P.item('bronze_bar', 6), W.P.item('rough_quartz', 3)], reason: 'test' }); await run(clock, 300);
a.craft('quote', { id: 'temper_quality', uid: it.uid, npc: smith.id }); await until(clock, () => cQ.length, 2000); console.log('quote', JSON.stringify(cQ[0]));
const before = JSON.stringify([it.quality, it.dmg]);
await play('temper_quality', { uid: it.uid });
const it2 = o.char.bag.find(i => i.uid === it.uid); console.log('tempered', before, '->', JSON.stringify([it2.quality, it2.dmg]));
await play('temper_promote', { uid: it.uid });
const it3 = o.char.bag.find(i => i.uid === it.uid); console.log('promoted', it3.name, it3.rarity, it3.affixes.map(x => x.name));
console.log('bag', o.char.bag.map(i => i.name + (i.count > 1 ? ' x' + i.count : '')), 'quests', JSON.stringify(o.char.quests.active), JSON.stringify(o.char.professions));
await srv.stop();
