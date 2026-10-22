import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { DT, F } from '../js/shared/arena.js';
import { IN } from '../js/shared/protocol.js';
import { meta, create, RULES, KINDS, planWaves, segOf } from '../js/games/castle-defense/sim.js';

const make = (n, seed = 3, difficulty = 'normal') => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: 10 + i, seat: i, name: 'P' + i })), difficulty });
const pids = g => [...g.bodies.keys()];
function tick(g, inputs = {}) {
  for (const pid of pids(g)) g.input(pid, inputs[pid] ?? { mx: 0, mz: 0, b: 0 });
  g.step(DT); const ev = g.events.splice(0); g.state(); return ev;
}
const toward = (b, x, z) => { const dx = x - b.x, dz = z - b.z, d = Math.hypot(dx, dz); return d < 0.2 ? { mx: 0, mz: 0 } : { mx: dx / d, mz: dz / d }; };
/**
 * Castle hands. Players 0 and 1 man a cannon each (solo: player 0 does everything, two players: each feeds their own
 * cannon), player 2 carries ammo and planks, player 3 patches and bonks. A gunner aims at the creature nearest the
 * wall (leading it) and fires when lined up; with no ammo and no supplier it fetches a crate itself.
 */
function defenders(g, { active = 9, aimErr = 0 } = {}) {
  let k = 0;
  const n = Math.min(active, pids(g).length), goal = new Map();
  return () => {
    k++; const out = {}, press = k % 2 ? IN.A : 0;
    pids(g).forEach((pid, i) => {
      const b = g.bodies.get(pid), st = g.player(pid);
      if (i >= n) return;
      const go = (x, z, near = 0.7) => { out[pid] = { ...toward(b, x, z), b: Math.hypot(b.x - x, b.z - z) < near ? press : 0 }; };
      const weakest = [0, 1, 2].sort((a, c) => g.segs[a] - g.segs[c])[0], segX = s => -meta.arena.hw + (s + 0.5) * (meta.arena.hw * 2 / 3);
      const fetch = kind => go(RULES.piles[kind].x, RULES.piles[kind].z - 0.9, 0.9);
      const gunner = i < 2 && (n >= 2 || i === 0), ci = n === 1 ? 0 : i;
      const fixLimit = n === 1 ? 45 : 55;
      if (st.man >= 0) {
        const c = g.cannons[st.man];
        const fixer = n <= 2 && g.segs[weakest] < fixLimit - 10;
        if (c.ammo <= 0 && (n <= 2) || fixer) { out[pid] = { mx: 0, mz: 0, b: k % 2 ? IN.B : 0 }; return; }
        const foes = g.foes.filter(f => !f.dead).sort((a, c2) => c2.z - a.z);
        const f = foes.find(f => Math.abs(Math.atan2(f.x - c.x, -3.3 - f.z)) < RULES.aimMax);
        if (!f) { out[pid] = { mx: 0, mz: -1, b: 0 }; return; }
        const tt = Math.hypot(f.x - c.x, f.z + 3.3) / RULES.ballSpeed, ez = f.dead || g.foes.find(x => x.id === f.id)?.at ? f.z : f.z + KINDS[f.k].speed * tt;
        const want = Math.atan2(f.x - c.x, -3.3 - ez) + (aimErr ? Math.sin(k * 0.37 + i) * aimErr : 0);
        out[pid] = { mx: Math.sin(want), mz: -Math.cos(want), b: Math.abs(want - c.aim) < 0.06 ? press : 0 };
        return;
      }
      const job = st.carry === 'plank' || (!gunner && i !== 2 && g.segs[weakest] < 100) || (n <= 2 && g.segs[weakest] < fixLimit - 10) ? 'fix'
        : gunner ? (g.cannons[ci].ammo > 0 || n >= 3 ? 'gun' : 'ammo') : i === 2 ? (g.segs[weakest] < 50 ? 'fix' : 'ammo') : 'bonk';
      if (job === 'fix') { if (st.carry !== 'plank') return fetch('plank'); return go(segX(weakest), -2.4, 0.5); }
      if (job === 'ammo') {
        const target = gunner ? ci : (g.cannons[0].ammo <= g.cannons[1].ammo ? 0 : 1);
        if (st.carry !== 'ammo') { if (g.cannons[target].ammo >= RULES.maxAmmo - 1 && !gunner) { goal.set(pid, 'wait'); out[pid] = { mx: 0, mz: 0, b: 0 }; return; } return fetch('ammo'); }
        return go(g.cannons[target].x + (g.cannons[target].man != null && !gunner ? 0.7 : 0), RULES.seatZ, 0.4);
      }
      if (job === 'gun') { if (st.carry) { out[pid] = { mx: 0, mz: 0, b: k % 2 ? IN.B : 0 }; return; } return go(g.cannons[ci].x, RULES.seatZ, 0.35); }
      // bonk: stand at the busiest stretch and swing
      const at = g.foes.filter(f => f.at && !f.dead)[0];
      if (st.carry) { out[pid] = { mx: 0, mz: 0, b: k % 2 ? IN.B : 0 }; return; }
      go(at ? at.x : 0, -2.4, at ? 0.9 : 0);
    });
    return out;
  };
}
function play(g, bot) { const ev = []; let steps = 0; while (!g.over && steps++ < meta.seconds / DT + 5) ev.push(...tick(g, bot ? bot() : {})); return { ev, steps }; }
function checkResult(g, n) {
  const r = g.result();
  assert.equal(r.order.length, 1); assert.deepEqual([...r.order[0]].sort(), pids(g).sort(), 'every player exactly once, one group');
  assert.equal(Object.keys(r.scores).length, n); assert.equal(typeof r.coop.success, 'boolean'); assert.equal(r.unit, meta.unit);
  return r;
}

test('waves: fixed by the seed, scaled by headcount, every wave in the plan and inside the clock', () => {
  for (let n = 1; n <= 4; n++) {
    const a = planWaves(makeRng(4), n), b = planWaves(makeRng(4), n);
    assert.deepEqual(a, b);
    for (let w = 0; w < RULES.waves.length; w++) assert.ok(a.some(s => s.w === w), `wave ${w}`);
    assert.ok(a.every(s => s.at < meta.seconds - 8 && Math.abs(s.x) <= RULES.fieldX));
  }
  assert.ok(planWaves(makeRng(4), 1).length < planWaves(makeRng(4), 4).length, 'fewer creatures for fewer players');
  assert.ok(planWaves(makeRng(4), 4, 'easy').length < planWaves(makeRng(4), 4, 'hard').length);
});

test('a cannon: man it, aim, fire, run dry, load a crate, step off', () => {
  const g = make(1, 5), pid = 10, b = g.bodies.get(pid), st = g.player(pid);
  b.x = RULES.cannons[0]; b.z = RULES.seatZ; let ev = tick(g, { [pid]: { mx: 0, mz: 0, b: IN.A } });
  assert.ok(ev.some(e => e.e === 'man')); assert.equal(st.man, 0); assert.ok(b.flags & F.FROZEN);
  for (let i = 0; i < 20; i++) tick(g, { [pid]: { mx: 1, mz: -0.2, b: 0 } });
  assert.ok(g.cannons[0].aim > 0.8 && g.cannons[0].aim <= RULES.aimMax + 1e-9, 'aims right, no further than the stop');
  assert.equal(b.x, RULES.cannons[0]); assert.equal(b.z, RULES.seatZ, 'a gunner does not walk');
  let fired = 0;
  for (let i = 0; i < 200 && g.cannons[0].ammo > 0; i++) { ev = tick(g, { [pid]: { mx: 0, mz: 0, b: i % 2 ? IN.A : 0 } }); fired += ev.filter(e => e.e === 'fire').length; }
  assert.equal(fired, RULES.startAmmo); for (let i = 0; i < 15; i++) tick(g); ev = tick(g, { [pid]: { mx: 0, mz: 0, b: IN.A } });
  assert.ok(ev.some(e => e.e === 'empty' && e.to === pid));
  tick(g, { [pid]: { mx: 0, mz: 0, b: IN.B } }); assert.equal(st.man, -1); assert.ok(!(b.flags & F.FROZEN));
  b.x = RULES.piles.ammo.x; b.z = RULES.piles.ammo.z - 1; tick(g); ev = tick(g, { [pid]: { mx: 0, mz: 0, b: IN.A } }); assert.equal(st.carry, 'ammo'); assert.ok(b.flags & F.CARRY);
  tick(g); b.x = RULES.cannons[0] + 0.3; b.z = RULES.seatZ + 0.3; ev = tick(g, { [pid]: { mx: 0, mz: 0, b: IN.A } });
  assert.ok(ev.some(e => e.e === 'load')); assert.equal(g.cannons[0].ammo, RULES.crate); assert.equal(st.carry, '');
});

test('creatures bash the wall, a hole lets them through to the keep, a plank patches it', () => {
  const g = make(1, 8), pid = 10, b = g.bodies.get(pid);
  let ev = [];
  while (!g.over && !ev.some(e => e.e === 'breach')) ev.push(...tick(g));
  const s = ev.find(e => e.e === 'breach').s; assert.equal(g.segs[s], 0);
  while (!g.over && g.hearts === RULES.hearts) tick(g);
  assert.ok(g.hearts < RULES.hearts, 'a creature ran through the hole');
  b.x = RULES.piles.plank.x; b.z = RULES.piles.plank.z - 1; tick(g); tick(g, { [pid]: { mx: 0, mz: 0, b: IN.A } }); assert.equal(g.player(pid).carry, 'plank');
  const x = -meta.arena.hw + (s + 0.5) * (meta.arena.hw * 2 / 3); b.x = x; b.z = -2.4; tick(g);
  ev = tick(g, { [pid]: { mx: 0, mz: 0, b: IN.A } });
  assert.ok(ev.some(e => e.e === 'fix' && e.s === s)); assert.equal(segOf(x), s); assert.ok(g.segs[s] > 0);
});

for (const n of [1, 2, 3, 4]) test(`${n} player(s): nobody defending = the castle falls before the bell`, () => {
  const g = make(n, 30 + n), { steps } = play(g);
  assert.ok(g.over); assert.ok(steps < meta.seconds / DT, 'falls early');
  const r = checkResult(g, n); assert.equal(r.coop.success, false); assert.equal(g.hearts, 0);
});

for (const n of [1, 2, 3, 4]) test(`${n} player(s): a team that works the jobs holds every wave`, () => {
  let wins = 0; const hearts = [];
  for (let s = 0; s < 5; s++) {
    const g = make(n, 200 + s * 11 + n), { steps } = play(g, defenders(g));
    const r = checkResult(g, n); hearts.push(g.hearts);
    if (r.coop.success) wins++;
    assert.ok(steps <= meta.seconds / DT + 1);
    if (n >= 3) assert.ok(Object.values(r.scores).filter(v => v > 0).length >= 3, 'the jobs all scored');
  }
  if (process.env.CD) console.log(n, wins, hearts.join(","));
  assert.ok(wins >= 4, `won ${wins}/5 (hearts left ${hearts})`);
});

test('the job needs the whole team: one defender alone in a four-player match loses', () => {
  let wins = 0;
  for (let s = 0; s < 5; s++) { const g = make(4, 500 + s); play(g, defenders(g, { active: 1 })); if (g.result().coop.success) wins++; }
  if (process.env.CD) console.log('lone', wins);
  assert.ok(wins <= 1, `won ${wins}/5 alone`);
});
for (const n of [1, 2, 4]) test(`${n} player(s): sloppy aim still holds most of the time`, () => {
  let wins = 0; const hearts = [];
  for (let s = 0; s < 5; s++) { const g = make(n, 700 + s * 3 + n); play(g, defenders(g, { aimErr: 0.12 })); hearts.push(g.hearts); if (g.result().coop.success) wins++; }
  if (process.env.CD) console.log('sloppy', n, wins, hearts.join(','));
  assert.ok(wins >= 3, `won ${wins}/5`);
});
