// Round 9, X5 (dev report #15, stream P-core) — Tempering -> Promote takes a RARE to LEGENDARY with a Sovereign Core:
// the rules (cost, the power fits the slot, the item keeps everything, never better than a dropped legendary), the server
// (a miss keeps the core and the item; a hit makes it legendary), and the drop (world bosses and top events only).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createProfessions } from '../../js/rules/professions.js';
import { temperCheck, temperApply, temperCost, legendaryPool } from '../../js/rules/professions-temper.js';
import { perfectInputs, seeded } from '../../js/rules/professions-games.js';
import { rulesEngine } from '../../js/rules/index.js';
import { realServer, joinReal, rec, run, until } from '../A/pt1-helpers.js';

const J = f => JSON.parse(readFileSync(new URL('../../' + f, import.meta.url), 'utf8'));
const numbers = J('data/rules/professions.json'), content = J('data/provinces/professions.json');
const P = createProfessions(numbers, content), engine = rulesEngine();
const LG = numbers.temper.legendary;

test('X5 rules: a rare + a Sovereign Core -> legendary; it keeps base, quality, level and every property and gains ONE power that fits its slot', () => {
  const rng = seeded(4);
  const core = P.material('sovereign_core');
  assert.ok(core && core.rarity === 'legendary' && core.icon === 'core' && !/ember|veil|muster/i.test(core.name + core.desc));
  assert.ok(!Object.values(content.nodeKinds).some(k => k.gives === 'sovereign_core' || k.bonus === 'sovereign_core') && !content.recipes.some(r => r.makes && r.makes.id === 'sovereign_core'), 'nothing gathers or crafts a core');
  for (const base of ['longsword', 'bow', 'wand', 'medium_chest', 'cloth_helm', 'ring', 'shield', 'heavy_boots']) {
    const it = engine.makeItem({ base, rarity: 'rare', level: 9, rng });
    const before = JSON.parse(JSON.stringify(it));
    const chk = temperCheck(P, engine, 'temper_promote', it, { skill: 60 });
    assert.ok(chk.ok && chk.to === 'legendary' && /keeps every property/.test(chk.text), base + ': ' + JSON.stringify(chk));
    const cost = temperCost(P, engine, 'temper_promote', it, 20000);
    assert.deepEqual(cost.needs[0], { id: 'sovereign_core', n: 1, kept: true });
    assert.ok(cost.needs.length === 3 && cost.needs[1].n === LG.mat && cost.needs[2].n === LG.gem && cost.gold === 5000 && cost.skill === 60, JSON.stringify(cost));
    const pool = legendaryPool(engine, it);
    assert.ok(pool.length >= 3, `${base}: ${pool.length} powers fit`);
    const r = temperApply(P, engine, 'temper_promote', it, { rng, skill: 60 });
    assert.ok(r.ok && r.to === 'legendary' && it.rarity === 'legendary' && it.promoted);
    const power = it.affixes[it.affixes.length - 1];
    assert.ok(power.id === 'legendary_effect' && pool.some(p => p.id === power.legendaryId) && it.legendaryEffectId === power.legendaryId && power.descriptor, JSON.stringify(power));
    assert.deepEqual(it.affixes.slice(0, -1), before.affixes, 'every property kept');
    for (const k of ['baseKey', 'name', 'quality', 'dmg', 'armor', 'dropLevel', 'ilvl', 'slot']) assert.deepEqual(it[k], before[k], k);
    // never strictly better than a dropped legendary of its level: that one rolls 5-6 properties, this has the rare's 3
    const drop = engine.makeItem({ base, rarity: 'legendary', level: 9, rng });
    const rolled = x => x.affixes.filter(a => !a.baseIntrinsic && !a.intrinsic && a.id !== 'legendary_effect' && a.stat !== 'castElement').length;
    assert.ok(rolled(it) < rolled(drop), `${base}: ${rolled(it)} rolled properties vs a drop's ${rolled(drop)}`);
    assert.equal(temperCheck(P, engine, 'temper_promote', it, { skill: 100 }).why, 'max', 'legendary is the end');
  }
  // a weapon's power comes from weapons of its own kind
  const sword = engine.makeItem({ base: 'longsword', rarity: 'rare', level: 9, rng }), bowPool = new Set(legendaryPool(engine, engine.makeItem({ base: 'bow', rarity: 'rare', level: 9, rng })).map(p => p.id));
  assert.ok(legendaryPool(engine, sword).some(p => !bowPool.has(p.id)), 'a sword does not draw from the bows\' powers');
  // what cannot take one
  assert.equal(temperCheck(P, engine, 'temper_promote', engine.makeItem({ base: 'sling_satchel', rarity: 'rare', level: 9, rng })).why, 'item');
  assert.equal(temperCheck(P, engine, 'temper_promote', engine.makeItem({ base: 'travel_cloak', rarity: 'rare', level: 9, rng })).why, 'item', 'no power fits a cloak');
  // magic -> rare is unchanged (no core)
  assert.ok(!temperCost(P, engine, 'temper_promote', engine.makeItem({ base: 'longsword', rarity: 'magic', level: 9, rng }), 1000).needs.some(n => n.id === 'sovereign_core'));
});

test('X5 server: the quote names the core; a missed gauge keeps the core and the item; a hit makes it legendary; skill 60 is needed', async () => {
  const S = await realServer({ roadEvents: false });
  const { srv, clock, world } = S, PV = world.province, W = PV.professions;
  const a = await joinReal(srv, clock, 'Kingmaker'), o = rec(world, a);
  await run(clock, 1500);
  const town = o.room, smith = [...town.objects.values()].find(e => e.data && e.data.npc && e.data.npc.role === 'smith');
  PV.transfer(o, town, { x: smith.x + 1.5, z: smith.z }, 'test'); await run(clock, 900);
  W.teach(o, 'tempering');
  const on = t => { const l = []; a.on(t, m => l.push(m)); return l; };
  const cL = on('craftList'), cQ = on('craftQuote'), cR = on('craftR'), cD = on('craftDone');
  a.craft('list', { npc: smith.id }); await until(clock, () => cL.length, 3000);       // (this also warms the engine up)
  const row = cL[0].recipes.find(r => r.id === 'temper_promote');
  assert.ok(row.legendary && row.legendary.material.id === 'sovereign_core' && row.legendary.skill === 60 && /legendary/.test(row.desc), JSON.stringify(row));
  await run(clock, 300);
  const blade = town.rules.makeItem(o.entity, { base: 'sword', rarity: 'rare', level: 3 });
  PV.grant(o, { items: [blade, W.P.item('sovereign_core', 1), W.P.item('bronze_bar', 14), W.P.item('rough_quartz', 5)], reason: 'test' }); o.char.gold = 100000; await run(clock, 300);
  const mine = () => o.char.bag.find(i => i.baseKey === 'sword' && i.type === 'weapon');
  const cnt = id => o.char.bag.filter(i => i.id === id).reduce((s, i) => s + (i.count || 1), 0);
  // skill 1: the quote says no, and why
  a.craft('quote', { id: 'temper_promote', uid: mine().uid, npc: smith.id }); await until(clock, () => cQ.length, 3000);
  assert.ok(!cQ[0].can && cQ[0].code === 'skill' && cQ[0].to === 'legendary' && cQ[0].needs[0].id === 'sovereign_core' && cQ[0].needs[0].kept && cQ[0].needs[0].have === 1 && cQ[0].skill === 60, JSON.stringify(cQ[0]));
  o.char.professions.xp.tempering = W.P.xpAt(60);
  cQ.length = 0; a.craft('quote', { id: 'temper_promote', uid: mine().uid, npc: smith.id }); await until(clock, () => cQ.length, 3000);
  assert.ok(cQ[0].can && /Sovereign Core is kept/.test(cQ[0].text) && cQ[0].gold > 0, JSON.stringify(cQ[0]));
  const play = async inputs => { cR.length = 0; cD.length = 0; a.craft('start', { id: 'temper_promote', uid: mine().uid, npc: smith.id }); await until(clock, () => cR.length, 3000); assert.ok(cR[0].ok, JSON.stringify(cR[0])); const inp = inputs(cR[0].game); await run(clock, inp[0] + 60); a.craft('done', { id: 'temper_promote', inputs: inp }); await until(clock, () => cD.length, 3000); return cD[0]; };
  // a miss
  const before = JSON.stringify(mine()), gold = o.char.gold;
  let d = await play(g => [g.ms - 40, 0]);
  assert.ok(!d.ok && d.kept.join() === 'sovereign_core' && /Sovereign Core and the item are unharmed/.test(d.msg), JSON.stringify(d));
  assert.equal(cnt('sovereign_core'), 1, 'the core is kept'); assert.equal(cnt('bronze_bar'), 14 - LG.mat); assert.equal(cnt('rough_quartz'), 5 - LG.gem);
  assert.ok(o.char.gold < gold && JSON.stringify(mine()) === before, 'the gold is spent, the item untouched');
  // a hit
  d = await play(perfectInputs);
  const it = mine();
  assert.ok(d.ok && d.to === 'legendary' && d.item.uid === it.uid && d.now.id === 'legendary_effect' && it.rarity === 'legendary' && it.legendaryEffectId && it.affixes.length === JSON.parse(before).affixes.length + 1, JSON.stringify(d).slice(0, 400));
  assert.equal(cnt('sovereign_core'), 0); assert.equal(cnt('bronze_bar'), 14 - 2 * LG.mat);
  // and no further
  cQ.length = 0; a.craft('quote', { id: 'temper_promote', uid: it.uid, npc: smith.id }); await until(clock, () => cQ.length, 3000);
  assert.ok(!cQ[0].can && cQ[0].code === 'max');
  // the drop: world bosses (25%) and events of the top levels (5%), nothing else
  const roll = (spec, n = 4000) => { const rng = seeded(9); let k = 0; for (let i = 0; i < n; i++) if (W.eventDrop(o, { ...spec, rng })) k++; return k / n; };
  const wb = roll({ worldBoss: true, level: 10 }), top = roll({ level: 8 }), low = roll({ level: 7 });
  assert.ok(Math.abs(wb - 0.25) < 0.03 && Math.abs(top - 0.05) < 0.015 && low === 0, `world boss ${wb}, top event ${top}, lesser event ${low}`);
  const core = W.eventDrop(o, { worldBoss: true, rng: () => 0 });
  assert.ok(core.kind === 'material' && core.id === 'sovereign_core' && core.count === 1);
  assert.match(readFileSync(new URL('../../js/sim/province.js', import.meta.url), 'utf8'), /professions\.eventDrop\(o, \{ worldBoss: run\.ev\.kind === 'worldboss'/, 'the event payout asks for it');
  a.close(); await srv.stop();
});
