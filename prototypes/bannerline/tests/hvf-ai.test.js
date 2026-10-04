// Stream E — the Hunters vs Farmers AI (docs/hvf-PLAN.md §10; js/sim/modes/hvf/ai/**, data/hvf/ai.json).
//
//   decisions per difficulty   set-up scenes that ask a seat what it would DO: hollow choice, the Bell,
//                              the door hedge, flee / Lie Low, home as a refuge, the flip to an army,
//                              crows first, the hunter's suspicion (no peeking at unexplored hollows),
//                              fair chase, retreat to a lodge, shopping at the kennel, lodges
//   careless vs careful        the same hunter finds a Recruit's farm sooner than a Commander's
//   strength                   Commander hunters down more farmers than Recruit hunters; Commander farmers
//                              lose fewer matches than Recruit farmers (fixed seeds, 3v1, 20 minutes)
//   legality                   no AI command is refused, every format and difficulty
//   determinism                same seed -> same hash; snapshot + restore mid-match continues identically;
//                              a seat draws only from its own stream
//
// Measured with the scratch harness on 40 seeds (2026-10-03, 3v1): hunters beat Recruit farmers 15/40,
// Veteran 12/40, Commander 7/40; first farm found at 1.9 / 3.1 / 3.1 min. Recruit / Veteran / Commander
// hunters win 5 / 8 / 9 of 30 against Veteran farmers and down 2.5 / 2.8 / 3.2 farmers a match. On this file's
// seeds: careless farms found at 3.0 min vs careful 6.6 (12 min); farmers downed by Commander hunters 38 vs
// Recruit 27 and their gold 38k vs 50k (16 seeds, 15 min); Commander farmers downed 14 times vs Recruit 27.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHvf, restoreHvf, seats, data, hvfData, ent } from './hvf-helpers.mjs';
import { hvfAi, hvfKnobs } from '../js/sim/modes/hvf/ai/index.js';
import { hollowScore } from '../js/sim/modes/hvf/ai/farmer.js';
import { known, poisOf, bestPoi } from '../js/sim/modes/hvf/ai/suspicion.js';
import { cellOf, cellX, cellZ, liveGrid, KIND } from '../js/sim/modes/hvf/ai/common.js';
import { applyHvfCommand } from '../js/sim/modes/hvf/commands.js';
import { hasBit } from '../js/sim/modes/hvf/vision.js';

const aiSeats = (format, fd, hd) => seats(format).map(s => ({ ...s, kind: 'ai', ai: { difficulty: s.role === 'farmer' ? fd : hd } }));
/** A match where only the named seats are AI (the rest stand still as humans). */
function scene(format, ai = {}, seed = 7) {
  const players = seats(format).map((s, i) => (ai[i] ? { ...s, kind: 'ai', ai: { difficulty: ai[i] } } : s));
  return createHvf({ format, seed, players });
}
function think(s, pid) {
  const p = s.state.players[pid];
  p.ai.nextAt = 0;
  return hvfAi(s.ctx(), p);
}
const put = (s, e, x, z) => { e.x = e.px = x; e.z = e.pz = z; };
const released = s => { s.state.hvf.releaseTick = 0; s.state.tick = Math.max(s.state.tick, 1); };

// ── farmer decisions ──────────────────────────────────────────────────────────────────────────────

test('hiding: Veteran takes the best-scored hollow; two Commanders spread out; a Recruit picks at random', () => {
  const s = scene('3v1', { 0: 'veteran' });
  think(s, 0);
  const p = s.state.players[0], K = hvfKnobs(s.data, p);
  const scores = s.map.hollows.map(h => hollowScore(s.ctx(), p, h, K));
  assert.equal(p.ai.hollow, scores.indexOf(Math.max(...scores)), 'the best-scored hollow');
  const c = scene('3v1', { 0: 'commander', 1: 'commander' });
  think(c, 0); think(c, 1);
  const [a, b] = [c.state.players[0].ai.hollow, c.state.players[1].ai.hollow].map(id => c.map.hollows[id]);
  assert.notEqual(a.id, b.id);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 30, `spread: ${Math.hypot(a.x - b.x, a.z - b.z).toFixed(0)} m apart`);
  // Recruit: over several seeds the pick is not always the Veteran's
  let differs = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const r = scene('3v1', { 0: 'recruit', 1: 'veteran' }, seed);
    think(r, 0);
    const v = scene('3v1', { 0: 'veteran' }, seed);
    think(v, 0);
    if (r.state.players[0].ai.hollow !== v.state.players[0].ai.hollow) differs++;
  }
  assert.ok(differs >= 2, `recruit differs from the best pick on ${differs}/6 seeds`);
});

test('herding: the Bell rings at 4 strays for a Recruit, 2 for a Veteran, 1 for a Commander', () => {
  for (const [diff, at] of [['recruit', 4], ['veteran', 2], ['commander', 1]]) {
    const s = scene('2v1', { 0: diff });
    const p = s.state.players[0], h = s.map.hollows[0];
    p.ai.v = 1; p.ai.cleared = []; p.ai.hollow = 0; p.ai.arrived = true; p.ai.nextAt = 0;
    const f = ent(s, 0); put(s, f, h.x, h.z);
    // strays of my own
    const mk = n => { s.state.ents = s.state.ents.filter(e => e.kind !== 'animal'); for (let i = 0; i < n; i++) s.state.ents.push({ id: s.state.nextId++, kind: 'animal', type: 'sheep', owner: 0, team: 0, home: -1, hx: h.x, hz: h.z, x: h.x + 14, z: h.z, px: h.x + 14, pz: h.z, face: 0, pface: 0, r: 0.4, hp: 60, hpMax: 60, alive: true, _gone: false, ord: { k: 'idle' }, stray: true, nextAt: 1e9, fleeUntil: -1, tx: h.x, tz: h.z }); };
    mk(at - 1);
    assert.ok(!think(s, 0).some(c => c.type === 'cast' && c.slot === 'E'), `${diff}: not at ${at - 1}`);
    mk(at);
    assert.ok(think(s, 0).some(c => c.type === 'cast' && c.slot === 'E'), `${diff}: rings at ${at}`);
  }
});

test('the door: after the first producer a Veteran or Commander hedges every gap into home; a Recruit never does', () => {
  for (const diff of ['recruit', 'veteran', 'commander']) {
    const s = scene('2v1', { 0: diff }, 9);
    s.state.hvf.releaseTick = 1e9;   // no hunters: just the farm
    let hedges = 0;
    for (let t = 0; t < 20 * 240 && !s.over; t++) { s.step(); for (const e of s.drainEvents()) if (e.type === 'built' && e.kind === 'hedge' && e.player === 0) hedges++; }
    if (diff === 'recruit') assert.equal(hedges, 0);
    else assert.ok(hedges >= 1, `${diff} hedged the door`);
  }
});

test('danger: a Recruit ignores a hunter 10 m off, a Veteran runs, a Commander in cover lies low', () => {
  const run = diff => {
    const s = scene('2v1', { 0: diff });
    released(s);
    const p = s.state.players[0], f = ent(s, 0), h = ent(s, 2);
    p.ai.v = 1; p.ai.cleared = []; p.ai.hollow = 0; p.ai.arrived = true;
    // stand the farmer next to a tree (cover) in open ground, the hunter 10 m away in plain sight
    const g = liveGrid(s.ctx());
    let spot = -1;
    for (let c = 0; c < g.cells.length && spot < 0; c++) {
      if (g.cells[c] !== KIND.grass || g.cells[c + 1] !== KIND.tree) continue;
      let open = true;
      for (let k = 1; k <= 6; k++) if (g.cells[c - k] !== KIND.grass && g.cells[c - k] !== KIND.trail) open = false;
      if (open) spot = c;
    }
    put(s, f, cellX(s.map, spot), cellZ(s.map, spot));
    put(s, h, cellX(s.map, spot - 5), cellZ(s.map, spot));
    for (let k = 0; k < 4; k++) s.step();   // vision catches up
    const cmds = think(s, 0);
    return cmds;
  };
  assert.ok(!run('recruit').some(c => c.type === 'move' || c.type === 'cast'), 'recruit does nothing yet');
  assert.ok(run('veteran').some(c => c.type === 'move'), 'veteran runs');
  assert.ok(run('commander').some(c => c.type === 'cast' && c.slot === 'W'), 'commander lies low');
});

test('the flip: a Commander with a Harvest Hall trains a crow flock first, then scarecrows, and marches on a kennel when the Turn favours it', () => {
  const s = scene('2v1', { 0: 'commander' }, 9);
  s.state.hvf.releaseTick = 1e9;
  const p = s.state.players[0];
  // let it settle in, then hand it a hall and three producers (the test is about what it does with them)
  for (let t = 0; t < 20 * 200; t++) s.step();
  // place a hall directly (the test is about what it does with one)
  const ctx = s.ctx();
  const ents = s.state.ents;
  const f = ent(s, 0);
  const hall = { id: s.state.nextId++, kind: 'building', type: 'hall', owner: 0, team: 0, x: f.x, z: f.z, px: f.x, pz: f.z, face: 0, pface: 0, r: 3, hp: 1200, hpMax: 1200, alive: true, _gone: false, ord: { k: 'idle' }, cells: null, blocks: 'none' };
  ents.push(hall);
  for (let i = 0; i < 3; i++) ents.push({ id: s.state.nextId++, kind: 'building', type: 'coop', owner: 0, team: 0, x: f.x + 30 + i * 5, z: f.z, px: f.x, pz: f.z, face: 0, pface: 0, r: 2, hp: 200, hpMax: 200, alive: true, _gone: false, ord: { k: 'idle' }, cells: null, blocks: 'none' });
  p.gold = 5000;
  // one purchase a think (the door, a tower may come first): collect the first two trains
  const trains = [];
  for (let k = 0; k < 20 && trains.length < 2; k++) {
    p.ai.spendAt = 0; p.gold = Math.max(p.gold, 3000); f.ord = { k: 'idle' };
    for (const c of think(s, 0)) { if (c.type === 'train') { trains.push(c.unit); applyHvfCommand(ctx, c); } }
  }
  assert.deepEqual(trains, ['crow', 'scarecrow'], 'a crow flock first, then scarecrows: ' + p.ai.why);
  // three scarecrows standing and the Turn in the farmers' favour: march on a kennel
  for (let i = 0; i < 3; i++) applyHvfCommand(ctx, { p: 0, type: 'train', unit: 'scarecrow', building: hall.id });
  s.state.hvf.turn = 0.5;
  for (const u of s.state.ents) if (u.kind === 'army') u.ord = { k: 'idle' };
  p.ai.spendAt = 1e9;   // only the army part
  const orders = think(s, 0).filter(c => c.type === 'order');
  const k = s.map.kennels[0];
  assert.ok(orders.some(o => o.kind === 'amove' && Math.hypot(o.x - k.x, o.z - k.z) < 6), JSON.stringify(orders));
});

// ── hunter decisions ──────────────────────────────────────────────────────────────────────────────

test('no peeking: a hunter never targets a hollow nobody on its team has seen', () => {
  const s = createHvf({ format: '3v1', seed: 5, players: aiSeats('3v1', 'veteran', 'commander') });
  for (let t = 0; t < 20 * 180; t++) {
    s.step();
    if (t % 20) continue;
    const p = s.state.players[3], me = ent(s, 3);
    if (!p.ai.sus || !me.alive) continue;
    const P = poisOf(s.map), b = bestPoi(s.ctx(), p, me);
    if (b >= 0) assert.ok(known(s.state, s.map, P[b]), `tick ${s.state.tick}: targets an unseen ${P[b].kind}`);
    for (let i = 0; i < P.length; i++) if (P[i].kind === 'pocket' && !known(s.state, s.map, P[i])) assert.equal(p.ai.sus[i] > 0, false, 'no suspicion on an unseen pocket');
  }
});

test('suspicion fades fast for a Recruit, slowly for a Commander', () => {
  const left = diff => {
    const s = scene('2v1', { 2: diff });
    released(s);
    const p = s.state.players[2];
    p.gold = 0;   // nothing to shop for: straight to the search
    think(s, 2);
    p.ai.sus = p.ai.sus.map(() => 10);
    for (let k = 0; k < 10; k++) { p.ai.lastThink = s.state.tick; think(s, 2); }
    // points in sight are cleared outright; compare one far from the hunter
    const P = poisOf(s.map), me = ent(s, 2);
    let far = 0;
    for (let i = 0; i < P.length; i++) if (!hasBit(s.state.hvf.vision[1], cellOf(s.map, P[i].x, P[i].z)) && known(s.state, s.map, P[i])) { far = i; break; }
    return p.ai.sus[far];
  };
  assert.ok(left('recruit') < left('veteran') && left('veteran') < left('commander'), `${left('recruit')} < ${left('veteran')} < ${left('commander')}`);
});

test('fair chase: a hunter lets go of a farmer it can no longer see and heads for where it last saw him', () => {
  const s = scene('2v1', { 2: 'veteran' });
  released(s);
  const p = s.state.players[2], h = ent(s, 2), f = ent(s, 0);
  p.gold = 0;
  think(s, 2);
  p.ai.lastSeen = { x: 50, z: 60, tick: s.state.tick, kind: 'farmer' };
  h.ord = { k: 'attack', target: f.id };
  put(s, f, 2, 2);   // far away in the fog
  for (let k = 0; k < 4; k++) s.state.tick++;
  const cmds = think(s, 2);
  assert.ok(cmds.some(c => c.type === 'move' && Math.abs(c.x - 50) < 2 && Math.abs(c.z - 60) < 2) || cmds.some(c => c.type === 'stop'), JSON.stringify(cmds));
});

test('a hurt Veteran or Commander hunter goes back to a lodge; a Recruit fights on', () => {
  for (const [diff, back] of [['recruit', false], ['veteran', true], ['commander', true]]) {
    const s = scene('2v1', { 2: diff });
    released(s);
    const h = ent(s, 2);
    put(s, h, s.map.commons.x, s.map.commons.z);
    h.hp = h.hpMax * 0.2;
    const k = s.map.kennels[0];
    const cmds = think(s, 2);
    const home = cmds.some(c => c.type === 'move' && Math.hypot(c.x - k.x, c.z - k.z) < 8);
    assert.equal(home, back, `${diff}: ${JSON.stringify(cmds)}`);
  }
});

test('shopping at the kennel before release: Veteran and Commander buy a Pony first', () => {
  for (const diff of ['veteran', 'commander']) {
    const s = scene('2v1', { 2: diff });
    const cmds = think(s, 2);
    assert.ok(cmds.some(c => c.type === 'buy' && c.id === 'horse1'), `${diff}: ${JSON.stringify(cmds)}`);
  }
});

// ── careless vs careful, strength ─────────────────────────────────────────────────────────────────

function play(fd, hd, seed, format = '3v1', minutes = 12) {
  const s = createHvf({ format, seed, players: aiSeats(format, fd, hd) }, data, { events: true });
  let find = null, downs = 0, rejects = 0;
  while (!s.over && s.tick < minutes * 1200) {
    s.step();
    for (const e of s.drainEvents()) { if (e.type === 'farmerDown') downs++; if (e.type === 'reject') rejects++; }
    if (find == null && s.state.hvf.seen[1].length) find = s.tick;
  }
  const earned = s.state.players.filter(p => p.role === 'farmer').reduce((a, p) => a + p.stats.earned, 0);
  return { find: find ?? minutes * 1200, downs, earned, hunters: !!(s.state.result && s.state.result.winner === 1), rejects };
}

test('the same hunter finds a careless (Recruit) farm sooner than a careful (Commander) one', () => {
  let rec = 0, com = 0;
  for (let i = 0; i < 8; i++) { rec += play('recruit', 'veteran', 700 + i).find; com += play('commander', 'veteran', 700 + i).find; }
  assert.ok(rec < com, `recruit farms found after ${(rec / 8 / 1200).toFixed(1)} min, commander farms after ${(com / 8 / 1200).toFixed(1)} min`);
});

test('strength (hunters): Commander hunters win more matches and cost the farmers more gold than Recruit hunters (32 seeds, 15 min)', () => {
  // (farmers DOWNED is not the measure: a Recruit hunter downs the same farmers again and again while
  // their friends keep reviving them; catching them all, and starving the farms, is what wins)
  let wr = 0, wc = 0, er = 0, ec = 0;
  for (let i = 0; i < 32; i++) {
    const r = play('veteran', 'recruit', 820 + i, '3v1', 15), c = play('veteran', 'commander', 820 + i, '3v1', 15);
    wr += r.hunters ? 1 : 0; wc += c.hunters ? 1 : 0; er += r.earned; ec += c.earned;
  }
  assert.ok(wc > wr, `hunter wins: commander ${wc} vs recruit ${wr}`);
  assert.ok(ec < er, `farmers earned: under commander hunters ${Math.round(ec)} vs recruit ${Math.round(er)}`);
});

test('strength (farmers): Commander farmers are downed less often than Recruit farmers (8 seeds, 12 min)', () => {
  let fr = 0, fc = 0;
  for (let i = 0; i < 8; i++) { fr += play('recruit', 'veteran', 800 + i).downs; fc += play('commander', 'veteran', 800 + i).downs; }
  assert.ok(fc < fr, `farmers downed: commander ${fc} vs recruit ${fr}`);
});

// ── legality, determinism, own streams ───────────────────────────────────────────────────────────

test('no AI command is ever refused (2v1, 3v1, 5v2, 6v3; every difficulty on both sides)', () => {
  const D = ['recruit', 'veteran', 'commander'];
  for (const [k, format] of ['2v1', '3v1', '5v2', '6v3'].entries()) {
    const players = seats(format).map((s, i) => ({ ...s, kind: 'ai', ai: { difficulty: D[(i + k) % 3] } }));
    const s = createHvf({ format, seed: 60 + k, players });
    while (!s.over && s.tick < 8 * 1200) {
      s.step();
      for (const e of s.drainEvents()) if (e.type === 'reject') assert.fail(`${format}: P${e.player} (${s.state.players[e.player].role} ${s.state.players[e.player].ai.difficulty}) ${e.cmd} refused: ${e.reason} at tick ${e.tick}`);
    }
  }
});

test('determinism: two matches with the same seed agree; a snapshot restored mid-match continues identically', () => {
  const cfg = { format: '3v1', seed: 33, players: aiSeats('3v1', 'commander', 'veteran') };
  const a = createHvf(cfg), b = createHvf(cfg);
  for (let t = 0; t < 2400; t++) { a.step(); b.step(); }
  assert.equal(a.hash(), b.hash());
  const c = restoreHvf(a.snapshot());
  for (let t = 0; t < 2400; t++) { a.step(); c.step(); if (t % 400 === 0) assert.equal(a.hash(), c.hash(), `tick ${a.tick}`); }
  assert.equal(a.hash(), c.hash());
});

test('each seat draws only from its own stream', () => {
  const s = createHvf({ format: '2v1', seed: 4, players: aiSeats('2v1', 'commander', 'commander') });
  released(s);
  const others = s.state.players.slice(1).map(p => p.ai.rng.slice());
  const shared = JSON.stringify(s.state.rng);
  for (let k = 0; k < 5; k++) think(s, 0);
  assert.deepEqual(s.state.players.slice(1).map(p => p.ai.rng), others);
  assert.equal(JSON.stringify(s.state.rng), shared);
});

test('budget: nine Commander farmers and three Commander hunters stay well inside the tick on average', () => {
  const s = createHvf({ format: '9v3', seed: 11, players: aiSeats('9v3', 'commander', 'commander') }, data, { events: false });
  const t0 = process.hrtime.bigint();
  let n = 0;
  while (!s.over && s.tick < 6 * 1200) { s.step(); n++; }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / n;
  assert.ok(ms < 1.5, `${ms.toFixed(3)} ms a tick`);
});
