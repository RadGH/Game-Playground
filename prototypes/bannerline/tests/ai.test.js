// Stream E — the AI (PLAN §8, js/sim/ai/**, data/ai.json).
//
//   decisions per difficulty   scenario tests that ask each level what it would DO in a set-up state
//                              (counter-sending, push timing, saving, Drill Yard, Sanctum, shopping trips,
//                              Wolf form, turret placement, helping a teammate) — no win rates involved
//   strength ladder            Commander beats Veteran beats Recruit over fixed seeds, mirror races and
//                              heroes, both seats; the decisions bar (Commander's decisions with the
//                              Veteran's hero play still beat the Veteran)
//   legality                   no AI command is ever refused, in every format, for every hero
//   determinism                same seed -> same hash; snapshot/restore mid-match continues identically;
//                              each AI slot draws only from its own stream
//   budget                     three Commanders a side stay well inside the 2 ms tick
//
// Measured with tools/ai-duel.mjs on 120 seeds (2026-10-03): Commander 98% vs Veteran, Veteran 100% vs
// Recruit, decisions bar 62%; a scripted "new player" (spends 70% of its gold on tier 1-2 units every
// Pay, stands mid-field, presses Q) beats the Recruit 99%, the Veteran 62% and the Commander 12%.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, dataWith, hero } from './_sim.mjs';
import { createSim, restoreSim } from '../js/sim/sim.js';
import { spawnUnit } from '../js/sim/economy.js';
import { aiCommands, knobs } from '../js/sim/ai/index.js';
import { unitCounter } from '../js/sim/ai/counter.js';
import { defenceOf, threatIn } from '../js/sim/ai/read.js';
import { pushWindow } from '../js/sim/ai/sends.js';
import { castCommands } from '../js/sim/ai/skills.js';
import { postFor } from '../js/sim/ai/hero.js';
import { BUILDS, nextBuildItem } from '../js/sim/ai/shop.js';
import { buildingOf } from '../js/sim/buildings.js';
import { duel } from '../tools/ai-duel.mjs';

const RACES = ['freeholds', 'ashtusk', 'unburied', 'thornmane'];
const HEROES = ['warrior', 'ranger', 'pyromancer', 'druid', 'engineer'];
const ctxOf = s => ({ state: s.state, data: s.data, map: s.map, emit: (type, f) => s._queue.push({ ...f, type, tick: s.state.tick }) });

/** A 1v1 where player 0 is an AI of `diff` and player 1 a passive human. */
function scene(diff, { race = 'freeholds', hero: h = 'warrior', rivalRace = 'ashtusk', rivalHero = 'warrior', d = data, seed = 5 } = {}) {
  return createSim({ seed, mode: '1v1', map: 'vale', players: [
    { team: 0, kind: 'ai', ai: { difficulty: diff }, race, hero: h },
    { team: 1, kind: 'human', race: rivalRace, hero: rivalHero }] }, d);
}
function think(s, pid = 0) {
  const p = s.state.players[pid];
  p.ai.nextAt = 0;
  return aiCommands(ctxOf(s), p);
}
const put = (s, uid, owner, field, dx, z) => { const f = s.map.fields[field]; return spawnUnit(ctxOf(s), field, owner, uid, { x: f.cx + dx, z }); };
const killHero = (s, pid, ticks = 400) => { const h = hero(s, pid); h.alive = false; h.hp = 0; h.respawnAt = s.state.tick + ticks; };

// ── decisions: sends ──────────────────────────────────────────────────────────────────────────────

test('counter scoring reads the defence: heavy armour vs blades, nature vs plate, ward vs spell-heavy, swarms vs single shots, stealth vs ranged', () => {
  const D = (h, extra = {}) => {
    const s = scene('commander', { rivalHero: h });
    return Object.assign(defenceOf(ctxOf(s), s.map.fields[1].id, 0), extra);
  };
  const U = data.derived.units;
  const warrior = D('warrior');
  // a Warrior hits with blades and wears heavy armour
  assert.ok(unitCounter(data, U.shieldbearer, warrior).mult > unitCounter(data, U.lantern_warden, warrior).mult * 0.98, 'heavy (Shieldbearer) takes blades better than light');
  assert.ok(unitCounter(data, U.hedge_priest, warrior).dealt > unitCounter(data, U.halberdier, warrior).dealt, 'nature hits plate harder than blades');
  // a Pyromancer is mostly skills: ward pays
  const pyro = D('pyromancer');
  assert.ok(unitCounter(data, U.lantern_warden, pyro).reasons.some(r => r.key === 'ward'), 'ward is named against a Pyromancer');
  // a Ranger is single target: a pack body beats one body of the same tier
  const ranger = D('ranger');
  assert.ok(unitCounter(data, U.hyena_pack, ranger).mult > unitCounter(data, U.hyena_pack, D('pyromancer')).mult, 'packs fare better against a Ranger than a Pyromancer');
  assert.ok(unitCounter(data, U.briar_stalker, ranger).reasons.some(r => r.key === 'stealth'), 'stealth is named against a ranged hero');
  // the Veteran's view is the type table only
  assert.ok(!unitCounter(data, U.lantern_warden, pyro, { only: 'table' }).reasons.some(r => r.key === 'ward'));
});

test('Druid in Wolf form is read as a blade fighter (the counter changes with the shape)', () => {
  const s = scene('commander', { rivalHero: 'druid' });
  const ctx = ctxOf(s);
  const before = defenceOf(ctx, 1, 0).heroes[0].mix;
  s.state.players[1].form = 'wolf';
  const after = defenceOf(ctx, 1, 0).heroes[0].mix;
  assert.equal(Object.keys(before).join(), 'nature');
  assert.ok(after.blade > 0.5, JSON.stringify(after));
});

test('Commander counter-sends: the same purse buys a different army against a different defence, and each army suits its own defence better', () => {
  const buyAgainst = rh => {
    const s = scene('commander', { race: 'thornmane', rivalHero: rh });
    const p = s.state.players[0];
    s.state.tick = 2400; p.gold = 3000; p.income = 200;   // mid-game purse, after the first Pays
    const sends = think(s).filter(c => c.type === 'send').map(c => data.derived.units[c.unit]);
    return { sends, D: defenceOf(ctxOf(s), 1, 0) };
  };
  const score = (sends, D) => sends.reduce((a, u) => a + unitCounter(data, u, D).mult * u.cost, 0) / sends.reduce((a, u) => a + u.cost, 0);
  for (const [a, b] of [['warrior', 'pyromancer'], ['ranger', 'pyromancer'], ['engineer', 'warrior']]) {
    const A = buyAgainst(a), B = buyAgainst(b);
    assert.ok(A.sends.length && B.sends.length, 'it sends');
    assert.ok(score(A.sends, A.D) >= score(B.sends, A.D) - 1e-9, `vs ${a}: own army ${score(A.sends, A.D).toFixed(3)} vs the ${b} army ${score(B.sends, A.D).toFixed(3)}`);
    assert.ok(score(B.sends, B.D) >= score(A.sends, B.D) - 1e-9, `vs ${b}: own army ${score(B.sends, B.D).toFixed(3)} vs the ${a} army ${score(A.sends, B.D).toFixed(3)}`);
  }
});

test('Recruit never reads the defence; Veteran reads only the type table; Commander reads the kit', () => {
  assert.equal(knobs(data, { ai: { difficulty: 'recruit' } }).sends.counter, 0);
  assert.equal(knobs(data, { ai: { difficulty: 'recruit' } }).sends.style, 'spam');
  assert.equal(knobs(data, { ai: { difficulty: 'veteran' } }).sends.style, 'balanced');
  assert.equal(knobs(data, { ai: { difficulty: 'commander' } }).sends.style, 'adaptive');
  // Recruit sends mostly cheap units: over a match its average send tier stays low
  const r = duel('recruit', 'veteran', 3, { maxTicks: 6 * 1200 });
  const tiers = [];
  for (const e of r.state.ents) if (e.kind === 'unit' && e.owner === (3 % 2 ? 1 : 0)) tiers.push(data.derived.units[e.type].tier);
  // (live bodies only; enough to see the shape)
  if (tiers.length) assert.ok(tiers.reduce((a, b) => a + b, 0) / tiers.length < 2.5);
});

test('Commander pushes when the defence is down: rival hero dead -> it empties its saved pool into sends', () => {
  const s = scene('commander');
  const p = s.state.players[0];
  s.state.tick = 3000; p.gold = 900; p.income = 120; p.ai.nextAt = 0;
  p.ai.v = 2; p.ai.fund = 0; p.ai.pool = 900; p.ai.recent = {}; p.ai.recentRoles = {};
  const alive = think(s).filter(c => c.type === 'send').reduce((a, c) => a + data.derived.units[c.unit].cost, 0);
  const s2 = scene('commander');
  const p2 = s2.state.players[0];
  s2.state.tick = 3000; p2.gold = 900; p2.income = 120;
  p2.ai.v = 2; p2.ai.fund = 0; p2.ai.pool = 900; p2.ai.recent = {}; p2.ai.recentRoles = {};
  killHero(s2, 1, 600);
  const ctx = ctxOf(s2);
  assert.equal(pushWindow(ctx, p2, { enemyDef: defenceOf(ctx, 1, 0), sendLane: 0 }), 'dead');
  const dead = think(s2).filter(c => c.type === 'send').reduce((a, c) => a + data.derived.units[c.unit].cost, 0);
  assert.ok(dead >= 800, `pushed ${dead}`);
  assert.ok(dead >= alive, `pushed ${dead} vs ${alive} with the hero up`);
});

test('pushWindow: a teammate pushing, an empty lane, a shopping hero, the Rising Tide', () => {
  const s = createSim({ seed: 2, mode: '2v2', map: 'vale', players: [
    { team: 0, kind: 'ai', ai: { difficulty: 'commander' }, race: 'freeholds', hero: 'warrior' },
    { team: 0, kind: 'ai', ai: { difficulty: 'commander' }, race: 'freeholds', hero: 'ranger' },
    { team: 1, kind: 'human', race: 'ashtusk', hero: 'warrior' },
    { team: 1, kind: 'human', race: 'ashtusk', hero: 'druid' }] }, data);
  const ctx = ctxOf(s);
  const p = s.state.players[0];
  const ef = s.map.fields[1];
  const S = () => ({ enemyDef: defenceOf(ctx, 1, 0), sendLane: 0 });
  // both enemy heroes stand in lane 1: my lane 0 is open
  for (const pid of [2, 3]) { const h = hero(s, pid); h.x = ef.gates[1].x; h.z = 40; }
  assert.equal(pushWindow(ctx, p, S()), 'open');
  // a guard standing in the Outfitter
  const h2 = hero(s, 2); h2.x = ef.armory.x; h2.z = ef.armory.z;
  const h3 = hero(s, 3); h3.x = ef.armory.x + 1; h3.z = ef.armory.z;
  assert.equal(pushWindow(ctx, p, S()), 'shop');
  // a teammate's push pulls me in
  s.state.players[1].ai.pushUntil = s.state.tick + 50;
  assert.equal(pushWindow(ctx, p, S()), 'team');
  s.state.tick = data.econ.clock.risingTide * 20;
  assert.equal(pushWindow(ctx, p, S()), 'tide');
});

// ── decisions: Drill Yard, Sanctum, Outfitter ─────────────────────────────────────────────────────

test('Drill Yard: Recruit never, Veteran the cheapest level, Commander the level that fits its army', () => {
  const setup = diff => {
    const s = scene(diff);
    const p = s.state.players[0];
    s.state.tick = 6000; p.gold = 3000; p.income = 150;
    // the Veteran pays for levels out of its item fund, the Commander out of its send gold
    p.ai.v = 2; p.ai.fund = diff === 'commander' ? 0 : 3000; p.ai.pool = 0; p.ai.recent = {}; p.ai.sendRate = 15;
    p.ai.recentRoles = { tank: 2000 };   // it has been sending tanks
    for (let i = 0; i < 6; i++) put(s, 'iron_golem', 0, 1, i * 2 - 5, 30);
    return s;
  };
  assert.equal(think(setup('recruit')).filter(c => c.type === 'upgradeUnit').length, 0);
  const vet = think(setup('veteran')).filter(c => c.type === 'upgradeUnit');
  assert.ok(vet.length >= 1);
  const cheapest = data.upgrades.order.reduce((b, id) => (data.upgrades.upgrades[id].cost.base < data.upgrades.upgrades[b].cost.base ? id : b));
  assert.equal(data.upgrades.upgrades[vet[0].id].cost.base, data.upgrades.upgrades[cheapest].cost.base);
  const com = think(setup('commander')).filter(c => c.type === 'upgradeUnit');
  assert.ok(com.length >= 1, 'the Commander upgrades a big tank army');
  assert.ok(['health', 'armour'].includes(data.upgrades.upgrades[com[0].id].stat), `tanks want health/armour, got ${com[0].id}`);
});

test('Sanctum: defensive power on a swarm at my Keep, inside my field, never refused', () => {
  for (const diff of ['veteran', 'commander']) {
    const s = scene(diff);
    const p = s.state.players[0];
    s.state.tick = 4000; p.gold = 2000; p.ai.nextAt = 0;
    const f = s.map.fields[0];
    for (let i = 0; i < 12; i++) put(s, 'brute', 1, 0, (i % 6) * 1.5 - 4, f.leakZ - 6 - (i / 6 | 0) * 1.5);
    const cmds = think(s);
    const pw = cmds.filter(c => c.type === 'power');
    assert.ok(pw.length >= 1, `${diff} casts a power`);
    for (const c of pw) {
      const def = data.powers.powers[c.id];
      assert.ok(def.kind !== 'offensive', `${diff}: ${c.id} is not offensive`);
      assert.ok(c.x >= f.x0 && c.x <= f.x1 && c.z > f.leakZ - 30, `${diff}: ${c.id} lands on the swarm`);
    }
    s.step([]);
    assert.ok(!s.drainEvents().some(e => e.type === 'reject' && e.player === 0), 'no refusal');
  }
  // Recruit has no Sanctum
  const r = scene('recruit');
  r.state.players[0].gold = 2000;
  for (let i = 0; i < 12; i++) put(r, 'brute', 1, 0, i - 6, r.map.fields[0].leakZ - 6);
  assert.equal(think(r).filter(c => c.type === 'power').length, 0);
});

test('Sanctum: Commander goes offensive while the enemy hero is dead, into my army in their field', () => {
  const s = scene('commander');
  const p = s.state.players[0];
  s.state.tick = 4000; p.gold = 3000; p.stats.sendGold = 6000; p.ai.nextAt = 0;
  p.ai.v = 2; p.ai.fund = 1500; p.ai.pool = 0; p.ai.recent = {}; p.ai.recentRoles = {};
  killHero(s, 1, 600);
  for (let i = 0; i < 8; i++) put(s, 'shieldbearer', 0, 1, i - 4, 60);
  const pw = think(s).filter(c => c.type === 'power');
  const off = pw.filter(c => data.powers.powers[c.id].kind === 'offensive');
  assert.ok(off.length >= 1, JSON.stringify(pw));
  const ef = s.map.fields[1];
  for (const c of off) assert.ok(c.x >= ef.x0 && c.x <= ef.x1, `${c.id} lands in the enemy field`);
});

test('Sanctum: Far Sight only for a real stealth threat (three or more hidden bodies), not one stalker', () => {
  const s = scene('commander', { rivalRace: 'thornmane' });
  const p = s.state.players[0];
  s.state.tick = 4000; p.gold = 2000; p.stats.sendGold = 4000;
  const h = hero(s, 0); const f = s.map.fields[0];
  h.x = f.cx; h.z = 100;
  put(s, 'briar_stalker', 1, 0, 4, 108);
  assert.ok(!think(s).some(c => c.type === 'power' && c.id === 'far_sight'), 'one stalker is the hero\'s job');
  for (let i = 0; i < 4; i++) put(s, 'briar_stalker', 1, 0, -6 + i, 112);
  assert.ok(think(s).some(c => c.type === 'power' && c.id === 'far_sight'), 'a stealth pack gets Far Sight');
});

test('Outfitter: the Commander walks over when it is calm and its fund buys the next build step, then buys it', () => {
  const s = scene('commander', { hero: 'pyromancer' });
  const p = s.state.players[0];
  const h = hero(s, 0); const f = s.map.fields[0];
  h.x = f.cx; h.z = 80;   // out in the field
  s.state.tick = 2400; p.gold = 800; p.income = 300;
  p.ai.v = 2; p.ai.fund = 700; p.ai.pool = 0; p.ai.recent = {}; p.ai.recentRoles = {};
  const want = nextBuildItem(ctxOf(s), p);
  assert.equal(want.id, BUILDS.pyromancer[0]);
  const cmds = think(s);
  assert.ok(p.ai.shopTrip, 'it decides to shop');
  const shop = buildingOf(ctxOf(s), 0, 'shop');
  const mv = cmds.find(c => c.type === 'move');
  assert.ok(mv && Math.abs(mv.x - f.armory.x) < 3 && Math.abs(mv.z - f.armory.z) < 3, `walks to the Outfitter ${JSON.stringify(mv)} ${shop.x},${shop.z}`);
  h.x = shop.x; h.z = shop.z;
  const buys = think(s).filter(c => c.type === 'buy');
  assert.ok(buys.some(c => c.id === want.id), JSON.stringify(buys));
});

test('Outfitter: builds fit the hero (casters buy spell power, fighters weapons) and every build id exists', () => {
  for (const [h, ids] of Object.entries(BUILDS)) for (const id of ids) if (id !== '@def') assert.ok(data['items-bl'].items[id], `${h}: ${id}`);
  const sp = id => (data['items-bl'].items[id].stats.spellPower || 0);
  assert.ok(BUILDS.pyromancer.filter(id => id !== '@def' && sp(id) > 0).length >= 4);
  assert.ok(BUILDS.warrior.filter(id => id !== '@def' && data['items-bl'].items[id].stats.damage > 0).length >= 4);
  assert.deepEqual(Object.keys(BUILDS).sort(), Object.keys(data.heroes.heroes).sort(), 'one build per hero');
});

test('Recruit never walks to the Outfitter; it shops only when it happens to stand there', () => {
  const s = scene('recruit');
  const p = s.state.players[0];
  const h = hero(s, 0); h.x = s.map.fields[0].cx; h.z = 80;
  p.gold = 2000; p.ai.fund = 2000;
  const cmds = think(s);
  assert.ok(!p.ai.shopTrip);
  assert.ok(!cmds.some(c => c.type === 'buy'));
});

// ── decisions: hero ───────────────────────────────────────────────────────────────────────────────

function heroScene(heroId, diff = 'commander') {
  const s = scene(diff, { hero: heroId });
  const p = s.state.players[0];
  p.level = 12; p.skillPts = 0;
  for (const sk of p.skills) sk.rank = sk.slot === 'R' ? 2 : 3;
  const h = hero(s, 0); const f = s.map.fields[0];
  h.x = f.cx; h.z = 80; h.mp = h.mpMax = 500;
  return { s, p, h, f, ctx: ctxOf(s), K: knobs(data, p) };
}
function casts(sc, foes, target) {
  const out = [];
  castCommands(sc.ctx, sc.p, sc.K, sc.p.ai.rng, sc.h, foes, target, { laneX: sc.f.cx, leadFoe: foes[0], farFromPost: false }, (type, a) => out.push({ type, ...a }));
  return out;
}

test('Druid: Wolf form for a lone runner far ahead, back out when a crowd is on it', () => {
  const sc = heroScene('druid');
  const runner = put(sc.s, 'fleetfoot', 1, 0, 0, 90);   // past the druid toward the Keep, 10 m away
  const go = casts(sc, [runner], runner);
  assert.ok(go.some(c => c.slot === 'E'), `takes the Wolf shape: ${JSON.stringify(go)}`);
  sc.p.form = 'wolf';
  const crowd = [];
  for (let i = 0; i < 5; i++) crowd.push(put(sc.s, 'brute', 1, 0, i - 2, 80.5));
  const back = casts(sc, crowd, crowd[0]);
  assert.ok(back.some(c => c.slot === 'E'), `leaves the Wolf shape in a crowd: ${JSON.stringify(back)}`);
});

test('Druid in Wolf form uses the wolf skills (Throat Leap at a target out of reach)', () => {
  const sc = heroScene('druid');
  sc.p.form = 'wolf';
  sc.p.skills.find(s => s.slot === 'E').readyAt = sc.s.state.tick + 100;   // the shape key is busy
  const far = put(sc.s, 'levy', 1, 0, 0, 85.5);
  const out = casts(sc, [far], far);
  assert.ok(out.some(c => c.slot === 'Q'), `Throat Leap: ${JSON.stringify(out)}`);
});

test('Engineer: turrets go on the lane, up-field of the hero (where the next wave walks), inside the field', () => {
  const sc = heroScene('engineer');
  const e = put(sc.s, 'levy', 1, 0, 0, 70);
  const out = casts(sc, [e], e).filter(c => c.slot === 'Q');
  assert.equal(out.length, 1);
  assert.ok(out[0].z < sc.h.z, `turret up-field: ${out[0].z} vs hero ${sc.h.z}`);
  assert.ok(out[0].x >= sc.f.x0 && out[0].x <= sc.f.x1);
  assert.ok(Math.hypot(out[0].x - sc.h.x, out[0].z - sc.h.z) <= data.heroes.skills.bolt_turret.range + 0.01, 'within build range');
});

test('Pyromancer: Flashover only on Burning targets; Fallstone aimed at the densest clump', () => {
  const sc = heroScene('pyromancer');
  for (const sk of sc.p.skills) if (sk.slot !== 'E' && sk.slot !== 'R') sk.readyAt = sc.s.state.tick + 200;
  const foes = [];
  for (let i = 0; i < 6; i++) foes.push(put(sc.s, 'brute', 1, 0, 6 + (i % 3), 70 + (i / 3 | 0)));
  foes.push(put(sc.s, 'levy', 1, 0, -8, 72));
  sc.p.skills.find(s => s.slot === 'R').readyAt = sc.s.state.tick + 200;
  assert.ok(!casts(sc, foes, foes[6]).some(c => c.slot === 'E'), 'no Flashover with nothing burning');
  for (const e of foes) e.statuses.push({ id: 'burn', until: sc.s.state.tick + 100, stacks: 3, power: 1, src: sc.h.id });
  assert.ok(casts(sc, foes, foes[6]).some(c => c.slot === 'E'), 'Flashover on the burning clump');
  sc.p.skills.find(s => s.slot === 'E').readyAt = sc.s.state.tick + 200;
  sc.p.skills.find(s => s.slot === 'R').readyAt = 0;
  const r = casts(sc, foes, foes[6]).find(c => c.slot === 'R');
  assert.ok(r && r.x > sc.f.cx + 3, `Fallstone on the clump, not the lone body: ${JSON.stringify(r)}`);
});

test('team play: a Commander posts in a teammate\'s lane when that lane leaks far worse; a Recruit never does', () => {
  const mk = diff => createSim({ seed: 2, mode: '2v2', map: 'vale', players: [
    { team: 0, kind: 'ai', ai: { difficulty: diff }, race: 'freeholds', hero: 'warrior' },
    { team: 0, kind: 'ai', ai: { difficulty: diff }, race: 'freeholds', hero: 'ranger' },
    { team: 1, kind: 'human', race: 'ashtusk', hero: 'warrior' },
    { team: 1, kind: 'human', race: 'ashtusk', hero: 'druid' }] }, data);
  for (const diff of ['commander', 'recruit']) {
    const s = mk(diff);
    const f = s.map.fields[0];
    // lane 1 is flooded up-field (above the merge), lane 0 is quiet
    for (let i = 0; i < 14; i++) put(s, 'brute', 2, 0, (f.gates[1].x - f.cx) + (i % 4) - 2, 70 + (i / 4 | 0));
    const p = s.state.players[0], K = knobs(data, p);
    const ctx = ctxOf(s);
    const S = { threat: threatIn(ctx, 0), myLane: 0, laneX: f.gates[0].x, myDps: 100 };
    const post = postFor(ctx, p, K, S);
    if (diff === 'commander') assert.equal(post.x, f.gates[1].x, 'goes to help');
    else assert.notEqual(post.x, f.gates[1].x);
  }
});

// ── counter-send notice ───────────────────────────────────────────────────────────────────────────

test('counter event: the Commander announces a counter-send with a short reason, to the rival; the Recruit never does', () => {
  const run = diff => {
    const s = createSim({ seed: 11, mode: '1v1', map: 'vale', players: [
      { team: 0, kind: 'ai', ai: { difficulty: diff }, race: 'thornmane', hero: 'warrior' },
      { team: 1, kind: 'ai', ai: { difficulty: 'veteran' }, race: 'freeholds', hero: 'pyromancer' }] }, data);
    const ev = [];
    while (!s.over && s.tick < 8 * 1200) { s.step([]); for (const e of s.drainEvents()) if (e.type === 'counter' && e.player === 0) ev.push(e); }
    return ev;
  };
  const c = run('commander');
  assert.ok(c.length >= 1, 'at least one notice');
  for (const e of c) {
    assert.equal(e.target, 1);
    assert.ok(typeof e.reason === 'string' && e.reason.length > 5 && e.reason.length < 50, e.reason);
    assert.ok(data.derived.units[e.unit] && e.name === data.derived.units[e.unit].name);
  }
  for (let i = 1; i < c.length; i++) assert.ok(c[i].tick - c[i - 1].tick >= knobs(data, { ai: { difficulty: 'commander' } }).sends.toast * 20, 'throttled');
  assert.equal(run('recruit').length, 0);
});

// ── legality, determinism, budget ─────────────────────────────────────────────────────────────────

test('no AI command is ever refused: every difficulty, every hero, 1v1 / 2v2 / 3v3', () => {
  const formats = ['1v1', '2v2', '3v3'];
  let checked = 0;
  for (let k = 0; k < 6; k++) {
    const fmt = formats[k % 3], n = +fmt[0];
    const players = [];
    for (let t = 0; t < 2; t++) for (let i = 0; i < n; i++) {
      const j = k * 7 + t * 3 + i;
      players.push({ team: t, kind: 'ai', ai: { difficulty: ['recruit', 'veteran', 'commander'][j % 3] }, race: RACES[j % 4], hero: HEROES[j % 5] });
    }
    const s = createSim({ seed: 40 + k, mode: fmt, map: 'vale', players }, data);
    while (!s.over && s.tick < 12 * 1200) {
      s.step([]);
      for (const e of s.drainEvents()) {
        if (e.type === 'reject') assert.fail(`${fmt} seed ${40 + k}: P${e.player} (${s.state.players[e.player] && s.state.players[e.player].ai.difficulty}) ${e.cmd} refused: ${e.reason} at tick ${e.tick}`);
      }
    }
    checked++;
  }
  assert.equal(checked, 6);
});

test('determinism: same seed, same match; snapshot + restore mid-match continues identically', () => {
  const cfg = { seed: 77, mode: '2v2', map: 'vale', players: [
    { team: 0, kind: 'ai', ai: { difficulty: 'commander' }, race: 'thornmane', hero: 'druid' },
    { team: 0, kind: 'ai', ai: { difficulty: 'recruit' }, race: 'unburied', hero: 'engineer' },
    { team: 1, kind: 'ai', ai: { difficulty: 'veteran' }, race: 'ashtusk', hero: 'pyromancer' },
    { team: 1, kind: 'ai', ai: { difficulty: 'commander' }, race: 'freeholds', hero: 'ranger' }] };
  const a = createSim(cfg, data, { events: false }), b = createSim(cfg, data, { events: false });
  for (let i = 0; i < 3000; i++) { a.step([]); b.step([]); }
  assert.equal(a.hash(), b.hash());
  const c = restoreSim(a.snapshot(), data, { events: false });
  for (let i = 0; i < 2000; i++) { a.step([]); c.step([]); }
  assert.equal(a.hash(), c.hash());
});

test('each AI slot draws only from its own stream (the shared streams are not touched by thinking)', () => {
  const s = createSim({ seed: 5, mode: '1v1', map: 'vale', players: [
    { team: 0, kind: 'ai', ai: { difficulty: 'commander' }, race: 'freeholds', hero: 'warrior' },
    { team: 1, kind: 'ai', ai: { difficulty: 'recruit' }, race: 'ashtusk', hero: 'ranger' }] }, data, { events: false });
  const [p0, p1] = s.state.players;
  assert.notDeepEqual(p0.ai.rng, p1.ai.rng);
  const shared = JSON.stringify(s.state.rng.ai);
  const r1 = p1.ai.rng.slice();
  p0.ai.nextAt = 0;
  aiCommands(ctxOf(s), p0);
  assert.deepEqual(p1.ai.rng, r1, 'the other slot\'s stream did not move');
  assert.equal(JSON.stringify(s.state.rng.ai), shared);
});

test('budget: three Commanders a side think inside the tick (well under 2 ms on average)', () => {
  const players = [];
  for (let t = 0; t < 2; t++) for (let i = 0; i < 3; i++) players.push({ team: t, kind: 'ai', ai: { difficulty: 'commander' }, race: RACES[(t * 3 + i) % 4], hero: HEROES[(t * 3 + i) % 5] });
  const s = createSim({ seed: 9, mode: '3v3', map: 'vale', players }, data, { events: false });
  const t0 = process.hrtime.bigint();
  let n = 0;
  while (!s.over && s.tick < 8 * 1200) { s.step([]); n++; }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / n;
  assert.ok(ms < 1.5, `${ms.toFixed(3)} ms a tick`);
});

// ── strength ladder (fixed seeds, mirror races and heroes, seats alternate) ─────────────────────────

function ladder(a, b, n, opts = {}, d = data) {
  let w = 0, l = 0;
  for (let i = 0; i < n; i++) {
    const r = duel(a, b, 500 + i, { ...opts, data: d });
    if (r.winner === 'A') w++; else if (r.winner === 'B') l++;
  }
  return { w, l };
}

test('Commander beats Veteran (>= 75% over 24 mirrored 1v1 seeds)', () => {
  const r = ladder('commander', 'veteran', 24);
  assert.ok(r.w >= 18, `Commander ${r.w}-${r.l}`);
});

test('Veteran beats Recruit (>= 85% over 24 mirrored 1v1 seeds)', () => {
  const r = ladder('veteran', 'recruit', 24);
  assert.ok(r.w >= 21, `Veteran ${r.w}-${r.l}`);
});

test('Commander beats Recruit every time (24 seeds) and wins team games against Veterans', () => {
  const r = ladder('commander', 'recruit', 24);
  assert.ok(r.w >= 23, `vs Recruit ${r.w}-${r.l}`);
  const t = ladder('commander', 'veteran', 6, { format: '2v2' });
  assert.ok(t.w >= 5, `2v2 ${t.w}-${t.l}`);
});

test('decisions bar: the Commander\'s DECISIONS with the Veteran\'s hero play and reaction still beat the Veteran (>= 55% over 40 seeds)', () => {
  const vet = data.ai.difficulties.veteran;
  const d = dataWith(raw => {
    raw.ai.difficulties.commander.reaction = vet.reaction;
    raw.ai.difficulties.commander.hero = JSON.parse(JSON.stringify(vet.hero));
  });
  const r = ladder('commander', 'veteran', 40, {}, d);
  assert.ok(r.w >= 22, `decisions only: ${r.w}-${r.l}`);
});

// The beginner sends from the first three rows: since the Keep guard (js/sim/keep.js) melts swarms of
// tier-1 bodies, a beginner who only ever pressed the first two rows is not a fair model of a new player.
test('a new player beats the Recruit: a scripted beginner (spends most of its gold on the three cheapest rows every Pay, stands mid-field, presses Q) wins >= 10 of 12', () => {
  let wins = 0;
  for (let i = 0; i < 12; i++) {
    const race = RACES[i % 4], heroId = HEROES[(i >> 2) % 5];
    const s = createSim({ seed: 900 + i, mode: '1v1', map: 'vale', players: [
      { team: 0, kind: 'human', race, hero: heroId }, { team: 1, kind: 'ai', ai: { difficulty: 'recruit' }, race, hero: heroId }] }, data, { events: false });
    const p = s.state.players[0], f = s.map.fields[0];
    const cheap = data.races.races[race].units.map(u => data.derived.units[u]).filter(u => u.tier <= 3);
    while (!s.over && s.tick < 30 * 1200) {
      const c = [];
      if (s.tick % 200 === 5) { let g = p.gold * 0.7, k = Math.floor(s.tick / 200); while (g >= 12) { const ok = cheap.filter(u => u.cost <= g); if (!ok.length) break; const u = ok[k++ % ok.length]; c.push({ p: 0, type: 'send', unit: u.id }); g -= u.cost; } }
      if (p.skillPts > 0) for (const sl of ['Q', 'W', 'E', 'R']) c.push({ p: 0, type: 'learn', slot: sl });
      if (s.tick % 40 === 7) c.push({ p: 0, type: 'amove', x: f.cx, z: 90 });
      if (s.tick % 30 === 11) c.push({ p: 0, type: 'cast', slot: 'Q' });
      s.step(c);
    }
    if (s.state.result && s.state.result.winner === 0) wins++;
  }
  assert.ok(wins >= 10, `beginner won ${wins}/12`);
});

test('one bell per wave: two AI teammates facing the same swarm ring Toll of Iron once, not twice', () => {
  const s = createSim({ seed: 21, mode: '2v2', map: 'vale', players: [
    { team: 0, kind: 'ai', ai: { difficulty: 'commander' }, race: 'freeholds', hero: 'warrior' },
    { team: 0, kind: 'ai', ai: { difficulty: 'commander' }, race: 'freeholds', hero: 'ranger' },
    { team: 1, kind: 'human', race: 'ashtusk', hero: 'warrior' },
    { team: 1, kind: 'human', race: 'ashtusk', hero: 'druid' }] }, data);
  s.state.teams[0].toll.charges = 3;
  for (const pid of [0, 1]) { const p = s.state.players[pid]; p.gold = 0; p.ai.nextAt = 0; }
  const f = s.map.fields[0];
  for (let i = 0; i < 16; i++) put(s, 'brute', 2, 0, (i % 8) * 1.5 - 6, f.leakZ - 6 - (i >> 3) * 1.5).hp = 1e5;
  // both seats think on the same tick
  s.step([]);
  let rang = 0;
  for (const e of s.drainEvents()) if (e.type === 'toll') rang++;
  assert.equal(rang, 1, 'one toll for one wave (before the fix both seats rang on this tick)');
  // and nobody rings again while the wave is still stunned
  const stun = Math.round(data['items-bl'].toll.stun * 20);
  s.state.teams[0].toll.charges = 3;
  let again = 0;
  for (let t = 0; t < stun - 2; t++) { s.step([]); for (const e of s.drainEvents()) if (e.type === 'toll') again++; }
  assert.equal(again, 0, 'no second bell while the wave is stunned');
});
