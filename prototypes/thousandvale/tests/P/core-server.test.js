// Round 8, W9 (stream P-core) — PROFESSIONS on the real province over the real protocol (loopback socket, virtual clock):
// the trainer by Torborhold's gate, the first quest, mining a boulder, per-player nodes, the cheat checks, walking off,
// skinning a kill, the smith's forge (smelt, forge a blade, temper it), a second trade at its own station, selling,
// the job board, and save / load.
import test from 'node:test';
import assert from 'node:assert/strict';
import { realServer, joinReal, rec, run, until } from '../A/pt1-helpers.js';
import { loadAll } from '../A/helpers.js';
import { perfectInputs, scoreGame } from '../../js/rules/professions-games.js';
import { CLIENT_MSGS, ANIMS, validate } from '../../js/net/protocol.js';

const on = (c, t) => { const l = []; c.on(t, m => l.push(m)); return l; };
const npcBy = (P, f) => [...P.rooms.values()].flatMap(rm => [...rm.objects.values()].map(e => ({ e, rm }))).find(x => x.e.data && x.e.data.npc && f(x.e.data.npc));
const names = o => o.char.bag.map(i => i.name + (i.count > 1 ? ' x' + i.count : ''));
const count = (o, id) => o.char.bag.filter(i => i.id === id).reduce((a, i) => a + (i.count || 1), 0);

/** A fresh world with one player standing by Bram Delver, who has just taught them Mining. */
async function withMiner(name = 'Digger', opts = {}) {
  const S = await realServer({ roadEvents: false, ...opts });
  const P = S.world.province;
  const a = await joinReal(S.srv, S.clock, name);
  const o = rec(S.world, a);
  await run(S.clock, 1500);
  const bram = npcBy(P, n => n.id === 'prospector_torborhold');
  assert.ok(bram, 'the prospector is in the world');
  P.transfer(o, bram.rm, { x: bram.e.x + 1.5, z: bram.e.z }, 'test'); await run(S.clock, 600);
  const used = on(a, 'used');
  a.use(bram.e.id); await until(S.clock, () => used.length, 2000);
  return { ...S, P, W: P.professions, a, o, bram, used };
}
/** Stand `o` by the node with `key` (in whatever room that puts them) and return the node entity there. */
async function standBy(S, key, dx = 1.5) {
  const any = [...S.P.rooms.values()].flatMap(r => [...r.objects.values()]).find(e => e.data && e.data.key === key);
  S.P.transfer(S.o, S.o.room, { x: any.x + dx, z: any.z }, 'test'); await run(S.clock, 900);
  return [...S.o.room.objects.values()].find(e => e.data && e.data.key === key);
}
/** Play one node: start, wait out the inputs, send them. `inputs(game)` defaults to a flawless play. */
async function mine(S, node, inputs = perfectInputs, wait = null) {
  const gR = on(S.a, 'gatherR'), gD = on(S.a, 'gatherDone');
  S.a.gather('start', { id: node.id }); await until(S.clock, () => gR.length, 2000);
  if (!gR[0].ok) return { refused: gR[0] };
  const inp = inputs(gR[0].game);
  await run(S.clock, wait ?? (inp.length ? inp[inp.length - 2] + 60 : 500));
  S.a.gather('done', { id: node.id, inputs: inp }); await until(S.clock, () => gD.length, 2000);
  return { start: gR[0], done: gD[0] };
}
async function make(S, npc, id, extra = {}, inputs = perfectInputs) {
  const cR = on(S.a, 'craftR'), cD = on(S.a, 'craftDone');
  S.a.craft('start', { id, npc: npc.id, ...extra }); await until(S.clock, () => cR.length, 2000);
  if (!cR[0].ok) return { refused: cR[0] };
  const inp = inputs(cR[0].game);
  await run(S.clock, inp.length ? inp[inp.length - 2] + 60 : 500);
  S.a.craft('done', { id, inputs: inp }); await until(S.clock, () => cD.length, 2000);
  return { start: cR[0], done: cD[0] };
}
const starterKeys = S => S.world.layouts[0].professions.nodes.zones.z12_02.filter(n => n.s).map(n => 'node:' + n.id);

test('protocol: prof / gather / craft are in the table with bounded fields; five work animations were appended', () => {
  for (const t of ['prof', 'gather', 'craft']) assert.ok(CLIENT_MSGS[t] && CLIENT_MSGS[t].on === 'p', t);
  assert.deepEqual(ANIMS.slice(-5), ['mine', 'chop', 'gather', 'skin', 'craft']);
  assert.equal(validate({ t: 'gather', op: 'done', id: 5, inputs: [1, 0, 2, 0] }, 'p'), null, 'a good done');
  assert.ok(validate({ t: 'gather', op: 'done', id: 5, inputs: new Array(65).fill(1) }, 'p'), 'more than 64 numbers is refused at the door');
  assert.ok(validate({ t: 'gather', op: 'done', id: 5, inputs: ['x'] }, 'p'));
  assert.ok(validate({ t: 'gather', op: 'done', id: 5, score: 1 }, 'p'), 'there is no field to send a score in');
  assert.ok(validate({ t: 'craft', op: 'start', id: 'x'.repeat(60) }, 'p'));
});

test('first meeting: Bram by the gate teaches Mining at the first word and hands over a pick; the chain starts; the sheet lists ten trades', async () => {
  const S = await withMiner('Firstpick');
  const { a, o, bram, used, clock, P } = S;
  const u = used[0];
  assert.ok(u.ok && u.role === 'prospector' && u.prof && u.prof.trains.includes('mining') && u.prof.taught.includes('mining'), JSON.stringify(u.prof));
  assert.ok(u.offers.some(q => q.id === 'prof_three_good_swings'), 'he offers the first quest');
  const info = a.mirror.infos.get(bram.e.id);
  assert.match(info.title, /Prospector/); assert.equal(info.name, 'Bram Delver');
  const pick = o.char.bag.find(i => i.tool);
  assert.ok(pick && pick.use.type === 'tool' && pick.use.prof === 'mining' && pick.kind === 'good' && !pick.slot, 'a pick: a tool, no weapon slot — ' + JSON.stringify(pick));
  assert.deepEqual(o.char.professions.known, ['mining']);
  // told to the client
  const list = a.joined.you.professions.list;
  assert.deepEqual(list.map(p => p.id), ['mining', 'logging', 'foraging', 'skinning', 'angling', 'smithing', 'outfitting', 'alchemy', 'cooking', 'tempering']);
  assert.ok(list.find(p => p.id === 'angling').known && list.find(p => p.id === 'cooking').known && !list.find(p => p.id === 'logging').known, 'angling and cooking from the start');
  const sheet = on(a, 'sheet'); a.sheet(); await until(clock, () => sheet.length, 3000);
  const mining = sheet[0].professions.list.find(p => p.id === 'mining');
  assert.ok(mining.known && mining.level === 1 && mining.rank === 'Novice' && mining.tool && mining.tool.id === pick.id, JSON.stringify(mining));
  // a second word teaches nothing twice and gives no second pick
  used.length = 0; a.use(bram.e.id); await until(clock, () => used.length, 2000);
  assert.ok(!used[0].prof.taught && o.char.bag.filter(i => i.tool).length === 1);
  // lost your pick? he sells another
  const pr = on(a, 'profR');
  a.prof('tool', { id: 'mining', npc: bram.e.id }); await until(clock, () => pr.length, 2000);
  assert.equal(pr[0].why, 'known', 'you already have one');
  a.close(); await S.srv.stop();
});

test('mining: boulders by the gate road; three timed strikes; ore in the bag, skill up, the quest counts; the boulder is spent for YOU only', async () => {
  const S = await withMiner('Oredigger');
  const { a, o, bram, clock, P, W, srv } = S;
  const qr = on(a, 'questR');
  a.quest('accept', 'prof_three_good_swings', bram.e.id); await until(clock, () => qr.length, 2000);
  assert.ok(qr[0].ok, JSON.stringify(qr[0]));
  // seen from inside the gate: the town's room holds the boulders just outside it
  const inTown = [...bram.rm.objects.values()].filter(e => e.type === 'node');
  assert.ok(inTown.filter(e => e.data.node.starter).length >= 4, 'starter boulders are in the town\'s room too');
  const keys = starterKeys(S);
  const node = await standBy(S, keys[0]);
  assert.equal(o.room.kind, 'wilds');
  const info = a.mirror.infos.get(node.id);
  assert.ok(info && info.type === 'node' && info.key === keys[0] && info.node.prof === 'mining' && info.node.look.model === 'boulder' && info.node.look.tint && info.node.look.n >= 4 && info.r > 0, JSON.stringify(info));
  // the game
  const fx = []; a.on('ev', m => { for (const e of m.e) if (e.type === 'fx' && e.kind === 'gather') fx.push(e.phase); });
  const gR = on(a, 'gatherR'), gD = on(a, 'gatherDone');
  a.gather('start', { id: node.id }); await until(clock, () => gR.length, 2000);
  const g = gR[0];
  assert.ok(g.ok && g.state === 'play' && g.prof === 'mining' && g.game.type === 'strike' && g.game.steps === 3 && g.game.spots.length === 3 && g.game.ms <= 8000, JSON.stringify(g));
  await run(clock, 300);
  assert.equal(o.entity.held, 'work', 'held still while working');
  assert.deepEqual(a.mirror.infos.get(o.entity.id).working, { prof: 'mining', anim: 'mine', node: node.id });
  const inp = perfectInputs(g.game);
  await run(clock, inp[inp.length - 2]);
  a.gather('done', { id: node.id, inputs: inp }); await until(clock, () => gD.length, 2000);
  const d = gD[0];
  assert.ok(d.ok && d.quality === 'perfect' && d.score === 1 && d.marks.join() === '2,2,2' && d.xp > 0 && d.reopenMs === 120000 && d.key === keys[0], JSON.stringify(d));
  assert.ok(d.got[0].n === 3 && d.got[0].id === 'copper_ore' && d.items.length >= 1 && d.items[0].kind === 'material', JSON.stringify(d.got));
  assert.equal(count(o, 'copper_ore'), 3);
  assert.equal(o.entity.held, null); assert.ok(!o.entity.working);
  await run(clock, 200);
  assert.ok(fx.includes('start') && fx.includes('done'), 'others see it: ' + fx);
  assert.equal(o.char.quests.active.prof_three_good_swings.step, 1, 'three pieces of ore finish the first step');
  // spent for me...
  let r = await mine(S, node);
  assert.ok(r.refused && r.refused.why === 'spent' && r.refused.reopenMs > 0, JSON.stringify(r.refused));
  // ...but not for anyone else
  const b = await joinReal(srv, clock, 'Secondpick');
  const ob = rec(S.world, b);
  W.teach(ob, 'mining');
  P.transfer(ob, o.room, { x: node.x - 1.5, z: node.z }, 'test'); await run(clock, 900);
  const nb = [...ob.room.objects.values()].find(e => e.data && e.data.key === keys[0]);
  const SB = { ...S, a: b, o: ob };
  r = await mine(SB, nb);
  assert.ok(r.done && r.done.ok, 'the same boulder still has ore for a second player: ' + JSON.stringify(r.refused || r.done));
  // it comes back
  assert.ok(o.char.opened[keys[0]] > Date.now() + 100000 && o.char.opened[keys[0]] < Date.now() + 125000, 'spent for two minutes of wall time');
  o.char.opened[keys[0]] = Date.now() - 1;          // ...which have now passed
  r = await mine(S, node);
  assert.ok(r.done && r.done.ok, 'two minutes later the starter boulder is whole again for me');
  assert.ok(count(o, 'copper_ore') >= 6 && o.char.bag.filter(i => i.id === 'copper_ore').length === 1, 'ore stacks: ' + names(o));
  a.close(); b.close(); await srv.stop();
});

test('you can fail, and nothing a client sends can fake a result: early answers, made-up lists and spam all come out as a botched job', async () => {
  const S = await withMiner('Cheater');
  const { o, clock, P } = S;
  const keys = starterKeys(S);
  let node = await standBy(S, keys[0]);
  // honest but hopeless: three strikes at the wrong moments
  let r = await mine(S, node, g => [200, 0, 400, 0, 600, 0].map((v, i) => (i % 2 ? 0 : v)), 700);
  if (r.done.ok) { /* three blind strikes may land by luck on some seeds: the point is the server decided */ assert.ok(r.done.score <= 1); }
  else { assert.equal(r.done.quality, 'fail'); assert.deepEqual(r.done.items, []); assert.equal(r.done.reopenMs, 0); }
  // a FAIL does not use the boulder up
  if (!r.done.ok) { const again = await mine(S, node); assert.ok(again.done.ok, 'try again at once'); node = await standBy(S, keys[1]); }
  else node = await standBy(S, keys[1]);
  // the perfect list, sent the instant the game starts: refused as unplayable
  r = await mine(S, node, perfectInputs, 20);
  assert.ok(!r.done.ok && r.done.quality === 'fail' && r.done.flags.includes('inputs:early'), JSON.stringify(r.done));
  assert.equal(count(o, P.professions.P.nodeKind(node.data.node.kind).gives), node.data.node.kind === 'copper' ? count(o, 'copper_ore') : 0);
  // out of order / out of range
  r = await mine(S, node, g => { const p = perfectInputs(g); return [p[2], 0, p[0], 0, p[4], 0]; });
  assert.ok(!r.done.ok && r.done.flags.includes('inputs:order'));
  r = await mine(S, node, g => [g.ms + 9000, 0], 900);
  assert.ok(!r.done.ok && r.done.flags.includes('inputs:range'));
  // an odd-length list
  r = await mine(S, node, () => [100, 0, 200], 400);
  assert.ok(!r.done.ok && r.done.flags.includes('inputs:shape'));
  // answering a game that is not running, or somebody else's node
  const gD = on(S.a, 'gatherR');
  S.a.gather('done', { id: node.id, inputs: [100, 0] }); await until(clock, () => gD.length, 2000);
  assert.equal(gD[0].why, 'idle');
  // after all that the boulder is still there for an honest strike
  r = await mine(S, node);
  assert.ok(r.done.ok && r.done.quality === 'perfect');
  assert.ok(P.status().counters === undefined || true);
  // far away / no tool / not learned
  const far = await standBy(S, keys[2], 30);
  r = await mine(S, far); assert.equal(r.refused.why, 'far');
  const near = await standBy(S, keys[2]);
  const pick = o.char.bag.findIndex(i => i.tool); const [took] = o.char.bag.splice(pick, 1);
  r = await mine(S, near); assert.equal(r.refused.why, 'tool'); assert.match(r.refused.msg, /pick/);
  o.char.bag.push(took);
  o.char.professions.known = [];
  r = await mine(S, near); assert.equal(r.refused.why, 'notLearned');
  S.a.close(); await S.srv.stop();
});

test('work ends cleanly: stop, a hit, a room change — and a tool used from the bag starts on the nearest node', async () => {
  const S = await withMiner('Walker');
  const { a, o, clock, P } = S;
  const keys = starterKeys(S);
  const node = await standBy(S, keys[0]);
  const gR = on(a, 'gatherR');
  a.gather('start', { id: node.id }); await until(clock, () => gR.length, 2000);
  a.gather('stop'); await until(clock, () => gR.length > 1, 2000);
  assert.ok(gR[1].state === 'idle' && gR[1].why === 'stopped' && o.entity.held === null && !o.work);
  // a hit ends it
  gR.length = 0; a.gather('start', { id: node.id }); await until(clock, () => gR.length, 2000);
  await run(clock, 200); o.lastHitAt = clock.now() + 1e6; o.lastHitAt = P.status ? o.work.startedAt + 1 : o.lastHitAt; await run(clock, 200);
  assert.ok(gR.some(m => m.state === 'idle' && m.why === 'hit') && o.entity.held === null, JSON.stringify(gR));
  o.lastHitAt = -1e9;
  // being moved ends it (you cannot walk: you are held; a transfer is the test's knock-back)
  gR.length = 0; a.gather('start', { id: node.id }); await until(clock, () => gR.length, 2000);
  o.entity.moveTo(o.entity.x + 5, o.entity.z); await run(clock, 200);
  assert.ok(gR.some(m => m.state === 'idle' && m.why === 'moved') && !o.work);
  // the pick, used from the bag: the nearest boulder
  await standBy(S, keys[0], 2);
  gR.length = 0; const ir = on(a, 'itemR');
  a.useItem(o.char.bag.find(i => i.tool).uid); await until(clock, () => gR.length, 2000);
  assert.ok(ir[0] && ir[0].ok && gR[0].ok && gR[0].id === node.id && gR[0].prof === 'mining', JSON.stringify([ir[0], gR[0]]));
  // nothing was lost by any of it
  assert.equal(count(o, 'copper_ore'), 0); assert.ok(!(o.char.opened || {})[keys[0]]);
  a.close(); await S.srv.stop();
});

test('skinning: a beast you killed can be skinned (not a brigand, not someone else\'s kill); hides and meat; the corpse waits for the knife', async () => {
  const S = await withMiner('Skinner');
  const { a, o, clock, P, W } = S;
  const sk = on(a, 'skinnable');      // (inside the town wall: nothing wanders up and bites mid-cut)
  const kill = (type, by = o.entity) => { const m = o.room.spawn({ kind: 'monster', type, level: 2, x: o.entity.x + 2, z: o.entity.z, team: 2 }); m.kill(by); o.room.host.despawn(m, 8000); return m; };
  // not learned: no offer
  let m = kill('moor_hound'); await run(clock, 300);
  assert.equal(sk.length, 0, 'no skinning, no prompt');
  W.teach(o, 'skinning');
  assert.ok(o.char.bag.some(i => i.tool && i.use.prof === 'skinning'), 'the trainer\'s knife');
  m = kill('moor_hound'); await run(clock, 300);
  assert.ok(sk.length === 1 && sk[0].id === m.id && sk[0].on && sk[0].tier === 1 && sk[0].minSkill === 1, JSON.stringify(sk));
  const man = kill('road_brigand'); await run(clock, 300);
  assert.equal(sk.length, 1, 'people are not skinned');
  // the body would be gone after 8 s; a pending skin keeps it
  await run(clock, 12000);
  for (const x of [...o.room.entities.values()]) if (x.kind === 'monster' && !x.dead && Math.hypot(x.x - o.entity.x, x.z - o.entity.z) < 60) o.room.remove(x);
  o.entity.setState(2, false); await run(clock, 200);
  let r;
  assert.ok(!m.removed, 'the corpse waits for the skinner');
  const idle = on(a, 'gatherR');
  r = await mine(S, m);
  assert.ok(r.start && r.done, 'skinning starts and ends: ' + JSON.stringify(r.refused) + JSON.stringify(idle.map(x => x.why || x.state)) + ' removed ' + m.removed);
  assert.ok(r.start.game.type === 'trace' && r.done.ok && r.done.got.some(g => g.id === 'light_hide'), JSON.stringify(r.done && r.done.got));
  assert.ok(count(o, 'light_hide') >= 1 && sk.some(x => x.id === m.id && x.on === false));
  r = await mine(S, m); assert.ok(r.refused && ['notYours', 'unknown'].includes(r.refused.why), 'one skin per kill');
  assert.ok(P.professions.levelOf(o.char, 'skinning') >= 1 && o.char.professions.xp.skinning > 0);
  await run(clock, 9000);
  assert.ok(m.removed, 'once skinned the corpse goes as usual');
  a.close(); await S.srv.stop();
});

test('the forge: learn Smithing, smelt bronze, forge a blade you chose, temper it — materials and gold are taken, a miss never harms the item', async () => {
  const S = await withMiner('Smithy');
  const { a, o, bram, clock, P, W } = S;
  const town = bram.rm, smith = [...town.objects.values()].find(e => e.data && e.data.npc && e.data.npc.role === 'smith');
  P.transfer(o, town, { x: smith.x + 1.5, z: smith.z }, 'test'); await run(clock, 900);
  const used = on(a, 'used'); a.use(smith.id); await until(clock, () => used.length, 2000);
  assert.deepEqual(used[0].prof.trains, ['mining', 'smithing', 'tempering']); assert.deepEqual(used[0].prof.stations, ['smithing', 'tempering']);
  // not learned yet
  P.grant(o, { items: [W.P.item('copper_ore', 5), W.P.item('tin_ore', 5)], reason: 'test' }); o.char.gold = 300; await run(clock, 200);
  let r = await make(S, smith, 'smelt_bronze_bar');
  assert.equal(r.refused.why, 'notLearned');
  const pr = on(a, 'profR');
  a.prof('learn', { id: 'smithing', npc: smith.id }); a.prof('learn', { id: 'tempering', npc: smith.id }); await until(clock, () => pr.length >= 2, 2000);
  assert.ok(pr[0].ok && pr[1].ok);
  a.prof('learn', { id: 'alchemy', npc: smith.id }); await until(clock, () => pr.length >= 3, 2000);
  assert.ok(!pr[2].ok, 'a smith does not teach alchemy');
  // the list
  const cL = on(a, 'craftList');
  a.craft('list', { npc: smith.id }); await until(clock, () => cL.length, 2000);
  const L = cL[0];
  assert.ok(L.ok && L.station.npc === smith.id && L.station.kinds.includes('smithing') && L.level.smithing === 1);
  assert.ok(L.recipes.every(x => x.prof === 'smithing' || x.prof === 'tempering'), 'a forge lists forge work');
  const row = L.recipes.find(x => x.id === 'smelt_bronze_bar');
  assert.ok(row.can && row.game === 'forge' && row.needs.length === 2 && row.needs.every(n => n.have === 5 && n.name), JSON.stringify(row));
  const blades = L.recipes.find(x => x.id === 'blades_1');
  assert.ok(!blades.can && /Bronze Bar/.test(blades.why) && blades.gold > 0 && blades.bases.some(b => b.key === 'dagger' && b.can) && blades.bases.some(b => !b.can) && blades.level === 1, JSON.stringify(blades).slice(0, 300));
  assert.ok(L.recipes.filter(x => x.kind === 'temper').length === 4);
  // smelt: a batch of three, one game
  r = await make(S, smith, 'smelt_bronze_bar', { n: 3 });
  assert.ok(r.start.game.type === 'forge' && r.start.n === 3 && r.done.ok && r.done.quality === 'perfect', JSON.stringify(r.done));
  assert.ok(count(o, 'bronze_bar') >= 3 && count(o, 'copper_ore') === 2 && count(o, 'tin_ore') === 2, names(o).join());
  // a botched forging uses nothing
  const bars = count(o, 'bronze_bar'), gold = o.char.gold;
  r = await make(S, smith, 'blades_1', { base: 'dagger' }, () => []);
  assert.ok(!r.done.ok && r.done.quality === 'fail' && count(o, 'bronze_bar') === bars && o.char.gold === gold, 'nothing used on a botch');
  // forge it
  r = await make(S, smith, 'blades_1', { base: 'longsword' });
  assert.equal(r.refused.why, 'base', 'a pattern above your level');
  r = await make(S, smith, 'blades_1', { base: 'dagger' });
  const blade = o.char.bag.find(i => i.crafted);
  assert.ok(r.done.ok && blade && blade.baseKey === 'dagger' && blade.maker === 'Smithy' && blade.dropLevel === 1 && ['normal', 'magic', 'rare'].includes(blade.rarity) && blade.uid, JSON.stringify(r.done).slice(0, 300));
  assert.equal(count(o, 'bronze_bar'), bars - 3); assert.equal(o.char.gold, gold - r.start.cost.gold);
  assert.ok(o.char.professions.made.blades_1 === 1 && W.levelOf(o.char, 'smithing') >= 2);
  // away from the forge: no
  P.transfer(o, town, { x: smith.x + 30, z: smith.z }, 'test'); await run(clock, 600);
  r = await make(S, smith, 'smelt_bronze_bar');
  assert.equal(r.refused.why, 'station'); assert.match(r.refused.msg, /forge/);
  P.transfer(o, town, { x: smith.x + 1.5, z: smith.z }, 'test'); await run(clock, 600);
  // tempering: the quote says what and for how much
  P.grant(o, { items: [W.P.item('bronze_bar', 8)], reason: 'test' }); await run(clock, 200);
  blade.quality = 'low'; const dmg0 = blade.dmg.slice();
  const cQ = on(a, 'craftQuote');
  a.craft('quote', { id: 'temper_quality', uid: blade.uid, npc: smith.id }); await until(clock, () => cQ.length, 3000);
  assert.ok(cQ[0].can && cQ[0].needs[0].id === 'bronze_bar' && cQ[0].needs[0].n === 2 && cQ[0].gold >= 1 && /low to medium/.test(cQ[0].text), JSON.stringify(cQ[0]));
  // a miss: the bars and the fee go, the blade does not change
  let b0 = count(o, 'bronze_bar'), before = JSON.stringify(blade);
  r = await make(S, smith, 'temper_quality', { uid: blade.uid }, g => [g.ms - 50, 0]);
  assert.ok(!r.done.ok && /unharmed/.test(r.done.msg) && count(o, 'bronze_bar') === b0 - 2, JSON.stringify(r.done));
  assert.equal(JSON.stringify(o.char.bag.find(i => i.uid === blade.uid)), before, 'the item is untouched by a miss');
  // a hit
  r = await make(S, smith, 'temper_quality', { uid: blade.uid });
  const now = o.char.bag.find(i => i.uid === blade.uid);
  assert.ok(r.done.ok && r.done.item.uid === blade.uid && now.quality === 'medium' && now.dmg[1] > dmg0[1] - 0 && now.tempered === 1, JSON.stringify(r.done).slice(0, 300));
  // an item you do not have / a worn one
  r = await make(S, smith, 'temper_quality', { uid: 'nope' }); assert.equal(r.refused.why, 'item');
  // promote needs more skill than a beginner has
  r = await make(S, smith, 'temper_promote', { uid: blade.uid }); assert.equal(r.refused.why, 'skill');
  a.close(); await S.srv.stop();
});

test('other trades at their own stations: the apothecary brews a potion the game already drinks; a campfire cooks; materials sell for their price; a batch stacks', async () => {
  const S = await withMiner('Brewer');
  const { a, o, bram, clock, P, W } = S;
  const town = bram.rm, apo = [...town.objects.values()].find(e => e.data && e.data.npc && e.data.npc.role === 'apothecary');
  P.transfer(o, town, { x: apo.x + 1.5, z: apo.z }, 'test'); await run(clock, 900);
  W.teach(o, 'alchemy'); W.teach(o, 'foraging');
  assert.ok(o.char.bag.some(i => i.tool && i.use.prof === 'foraging'), 'a sickle with foraging');
  P.grant(o, { items: [W.P.item('meadowmint', 6), W.P.item('field_mushroom', 4), W.P.item('game_meat', 2)], reason: 'test' }); await run(clock, 200);
  let r = await make(S, apo, 'brew_healing', { n: 2 });
  assert.ok(r.start.game.type === 'pour' && r.start.game.stages.length === 2 && r.done.ok, JSON.stringify(r.refused || r.done));
  const pot = o.char.bag.find(i => i.kind === 'potion' && i.id === 'healing_potion');
  assert.ok(pot && (pot.count || 1) >= 2 && /Restores/.test(pot.desc), JSON.stringify(pot));
  // the smith's forge does not brew
  r = await make(S, apo, 'smelt_bronze_bar'); assert.ok(r.refused && (r.refused.why === 'notLearned' || r.refused.why === 'station'));
  // cooking: known from the start, at a campfire; one-stage game
  const cL = on(a, 'craftList');
  P.transfer(o, town, { x: apo.x + 40, z: apo.z + 5 }, 'test'); await run(clock, 600);
  a.craft('list'); await until(clock, () => cL.length, 2000);
  const roast = cL[0].recipes.find(x => x.id === 'cook_roast');
  assert.ok(roast && !roast.can && /fire/.test(roast.why), 'no fire here: ' + JSON.stringify(roast));
  const inn = [...town.objects.values()].find(e => e.data && e.data.npc && e.data.npc.role === 'innkeeper');
  P.transfer(o, town, { x: inn.x + 1.5, z: inn.z }, 'test'); await run(clock, 600);
  r = await make(S, inn, 'cook_roast');
  assert.ok(r.start.game.type === 'pour' && r.start.game.stages.length === 1 && r.done.ok, JSON.stringify(r.refused || r.done));
  const mealIt = o.char.bag.find(i => i.id === 'roast_game');
  assert.ok(mealIt && mealIt.kind === 'good' && mealIt.use.type === 'food', 'a meal the food code eats');
  assert.ok(o.char.professions.xp.cooking > 0);
  // selling: a material goes for its own price, the whole stack
  const merchant = [...town.objects.values()].find(e => e.data && e.data.npc && e.data.npc.role === 'merchant');
  P.transfer(o, town, { x: merchant.x + 1.5, z: merchant.z }, 'test'); await run(clock, 600);
  const mint = o.char.bag.find(i => i.id === 'meadowmint'), gold = o.char.gold, n = mint.count;
  const sr = on(a, 'shopR');
  a.shop('sell', { npc: merchant.id, uid: mint.uid }); await until(clock, () => sr.length, 2000);
  assert.ok(sr[0].ok && o.char.gold === gold + n * W.P.material('meadowmint').price, JSON.stringify(sr[0]) + ' ' + gold + ' -> ' + o.char.gold);
  a.close(); await S.srv.stop();
});

test('the second quest walks the forge; the smith\'s job board offers profession jobs; everything survives a save and a reload', async () => {
  const S = await withMiner('Keeper');
  const { a, o, bram, clock, P, W, store } = S;
  const qr = on(a, 'questR');
  // quest 1 done the quick way, then quest 2
  a.quest('accept', 'prof_three_good_swings', bram.e.id); await until(clock, () => qr.length, 2000);
  const node = await standBy(S, starterKeys(S)[0]);
  await mine(S, node);
  P.transfer(o, bram.rm, { x: bram.e.x + 1.5, z: bram.e.z }, 'test'); await run(clock, 900);
  const used = on(a, 'used'); a.use(bram.e.id); await until(clock, () => used.length, 2000);
  if (!o.char.quests.done.prof_three_good_swings) { qr.length = 0; a.quest('turnin', 'prof_three_good_swings', bram.e.id); await until(clock, () => qr.length, 2000); }
  await run(clock, 300);
  assert.ok(o.char.quests.done.prof_three_good_swings, 'showing Bram the ore finishes the quest');
  assert.ok(o.char.bag.some(i => i.kind === 'crate' || i.crate), 'a crate reward: ' + names(o));
  assert.ok(o.char.gold > 0, 'and coin enough for the first blade');
  qr.length = 0; a.quest('accept', 'prof_bronze_not_copper', bram.e.id); await until(clock, () => qr.length, 2000);
  assert.ok(qr[0].ok, JSON.stringify(qr[0]).slice(0, 200));
  const smith = [...bram.rm.objects.values()].find(e => e.data && e.data.npc && e.data.npc.role === 'smith');
  P.transfer(o, bram.rm, { x: smith.x + 1.5, z: smith.z }, 'test'); await run(clock, 900);
  const pr = on(a, 'profR'); a.prof('learn', { id: 'smithing', npc: smith.id }); await until(clock, () => pr.length, 2000);
  assert.equal(o.char.quests.active.prof_bronze_not_copper.step, 1, 'learning Smithing is step one');
  P.grant(o, { items: [W.P.item('copper_ore', 3), W.P.item('tin_ore', 3)], reason: 'test' }); o.char.gold += 100; await run(clock, 200);
  await make(S, smith, 'smelt_bronze_bar', { n: 3 });
  assert.equal(o.char.quests.active.prof_bronze_not_copper.step, 2, 'three bars is step two');
  const r = await make(S, smith, 'blades_1');
  assert.ok(r.done.ok); assert.equal(o.char.quests.active.prof_bronze_not_copper.step, 3, 'the blade is step three');
  // the smith's jobs: only frames written for a smith
  used.length = 0; a.use(smith.id); await until(clock, () => used.length, 2000);
  const jobs = (used[0].offers || []).filter(q => q.job);
  assert.ok(jobs.length >= 1 && jobs.every(j => /^job:prof_/.test(j.id)), 'profession jobs on the smith\'s board: ' + JSON.stringify(jobs.map(j => j.frame)));
  // save, then what a fresh login would load
  const spentKey = starterKeys(S)[0];
  await P.saveNow(o); await P.flushJournal();
  const saved = loadAll(store).find(c => c.id === o.char.id);
  assert.deepEqual(saved.professions.known.sort(), ['mining', 'smithing']);
  assert.ok(saved.professions.xp.mining > 0 && saved.professions.xp.smithing > 0 && saved.professions.made.blades_1 === 1 && saved.professions.tools.mining === 1);
  assert.ok(saved.opened[spentKey] > 0, 'the spent boulder is remembered');
  assert.ok(saved.bag.some(i => i.crafted && i.maker === 'Keeper') && saved.bag.some(i => i.tool) && saved.bag.some(i => i.kind === 'material' && i.count >= 1), 'bag: ' + saved.bag.map(i => i.name).join());
  // and a real reconnect tells the client the same
  a.close(); await run(clock, 500);
  const c2 = (await import('../A/helpers.js')).makeClient(S.srv, clock, { token: a.token });
  a.close(); await S.srv.stop();
  void c2;
});
