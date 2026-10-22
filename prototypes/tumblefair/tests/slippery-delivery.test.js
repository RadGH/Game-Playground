import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { DT, F, BODY_R } from '../js/shared/arena.js';
import { IN } from '../js/shared/protocol.js';
import { meta, create, RULES, makeSquare } from '../js/games/slippery-delivery/sim.js';

const make = (n, seed = 3) => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: 10 + i, seat: i, name: 'P' + i })), difficulty: 'normal' });
const pids = g => [...g.bodies.keys()];
function tick(g, inputs = {}) {
  for (const pid of pids(g)) g.input(pid, inputs[pid] ?? { mx: 0, mz: 0, b: 0 });
  g.step(DT); const ev = g.events.splice(0); g.state(); return ev;
}
/** A courier: drives to the counter, brakes there until it has `want` pies, then drives to the rush door. */
function courier(g, want = new Map()) {
  return () => {
    const st = g.state(), out = {};
    for (const [pid, b] of g.bodies) {
      const pies = st.pies[pid], w = want.get(pid) ?? 3;
      let tx, tz, brake = 0;
      if (pies < w) { tx = 0; tz = meta.arena.hd - 1.2; if (Math.hypot(tx - b.x, tz - b.z) < 2.2) brake = IN.A; }
      else { tx = RULES.doors[st.rush]; tz = -meta.arena.hd + 0.8; }
      const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz) || 1;
      out[pid] = d < 0.5 && pies < w ? { mx: 0, mz: 0, b: brake } : { mx: dx / d, mz: dz / d, b: brake };
    }
    return out;
  };
}
function play(g, bot) { const ev = []; let steps = 0; while (!g.over && steps++ < meta.seconds / DT + 5) ev.push(...tick(g, bot ? bot() : {})); return { ev, steps }; }
function checkResult(g, n) {
  const r = g.result(), all = r.order.flat();
  assert.equal(all.length, n); assert.deepEqual([...all].sort(), pids(g).sort(), 'every player exactly once');
  assert.equal(Object.keys(r.scores).length, n); assert.equal(r.unit, meta.unit);
  for (let i = 1; i < r.order.length; i++) assert.ok(r.scores[r.order[i - 1][0]] > r.scores[r.order[i][0]], 'groups best first');
  for (const grp of r.order) assert.ok(grp.every(p => r.scores[p] === r.scores[grp[0]]));
  return r;
}

test('the square: crates clear of the barrel lanes and the signs, inside the walls, same from the same seed', () => {
  for (let s = 1; s < 40; s++) {
    const q = makeSquare(makeRng(s)), A = q.arena;
    assert.equal(q.barrels.length, RULES.lanes.length); assert.equal(q.arms.length, RULES.arms.length);
    assert.ok(A.blocks.length >= 2);
    for (const b of A.blocks) {
      assert.ok(Math.abs(b.x) + b.hw < A.hw && Math.abs(b.z) + b.hd < A.hd);
      assert.ok(q.barrels.every(r => Math.abs(r.z - b.z) >= 1.5)); assert.ok(q.arms.every(a => Math.hypot(a.x - b.x, a.z - b.z) >= a.L + 1.3));
      assert.ok(b.z < A.hd - RULES.counterD - 0.5 && b.z > -A.hd + RULES.doorD + 0.5, 'not on the counter or a door');
    }
    assert.deepEqual(makeSquare(makeRng(s)), q);
  }
});

for (const n of [1, 2, 3, 4]) test(`${n} player(s): ends at the bell; nobody moving = all 0, tied`, () => {
  const g = make(n, 40 + n), { steps } = play(g);
  assert.ok(g.over); assert.ok(steps <= meta.seconds / DT + 1);
  const r = checkResult(g, n); assert.equal(r.order.length, 1);
});

for (const n of [1, 2, 3, 4]) test(`${n} player(s): couriers deliver pies, and every point comes from a delivery`, () => {
  const g = make(n, 7 + n), { ev } = play(g, courier(g));
  const r = checkResult(g, n);
  const total = ev.filter(e => e.e === 'deliver').reduce((s, e) => s + e.pts, 0);
  assert.equal(total, Object.values(r.scores).reduce((a, b) => a + b, 0));
  assert.ok(total > 0, 'somebody delivered');
  for (const e of ev.filter(e2 => e2.e === 'deliver')) assert.equal(e.pts, e.n * (e.rush ? 2 : 1) + (e.full ? RULES.fullBonus : 0));
  for (const b of g.bodies.values()) { assert.ok(Math.abs(b.x) <= meta.arena.hw && Math.abs(b.z) <= meta.arena.hd, 'inside the square'); }
});

test('loading: stop on the counter and pies stack one at a time up to five; driving past loads nothing', () => {
  const g = make(1, 2), [p] = pids(g), b = g.bodies.get(p);
  const ev = []; for (let i = 0; i < 60; i++) ev.push(...tick(g));
  assert.equal(g.state().pies[p], RULES.maxPies); assert.ok(b.flags & F.CARRY);
  assert.deepEqual(ev.filter(e => e.e === 'load').map(e => e.n), [1, 2, 3, 4, 5]);
  const g2 = make(1, 2), b2 = g2.bodies.get(p); b2.x = 0; b2.z = 0;
  for (let i = 0; i < 40; i++) tick(g2); assert.equal(g2.state().pies[p], 0, 'not at the counter');
});

test('a door takes the whole stack; the rush door doubles; a full stack earns the bonus', () => {
  const g = make(1, 5), [p] = pids(g), b = g.bodies.get(p), st = g.player(p);
  const deliverAt = (door, pies) => { st.pies = pies; b.flags |= F.CARRY; b.x = RULES.doors[door]; b.z = -meta.arena.hd + 0.6; b.vx = b.vz = 0; return tick(g).find(e => e.e === 'deliver'); };
  const rush = g.state().rush, other = (rush + 1) % 3;
  let d = deliverAt(other, 3); assert.equal(d.pts, 3); assert.equal(d.rush, 0); assert.equal(g.state().pies[p], 0); assert.equal(b.flags & F.CARRY, 0);
  d = deliverAt(rush, 3); assert.equal(d.pts, 6); assert.equal(d.rush, 1);
  d = deliverAt(other, 5); assert.equal(d.pts, 5 + RULES.fullBonus); assert.equal(d.full, 1);
  assert.equal(g.result().scores[p], 3 + 6 + 5 + RULES.fullBonus);
});

test('the rush door moves every so often', () => {
  const g = make(2, 9), seen = new Set([g.state().rush]);
  const ev = []; for (let i = 0; i < 40 / DT; i++) ev.push(...tick(g));
  for (const e of ev.filter(x => x.e === 'rush')) seen.add(e.door);
  assert.ok(ev.filter(e => e.e === 'rush').length >= 3); assert.ok(seen.size >= 2);
});

test('slamming into the wall knocks pies off; a gentle touch does not', () => {
  const g = make(1, 4), [p] = pids(g), b = g.bodies.get(p), st = g.player(p);
  st.pies = 5; b.flags |= F.CARRY; b.x = meta.arena.hw - 3; b.z = -8.5; b.yaw = Math.PI / 2; b.vx = 6; b.vz = 0;   // sliding fast toward the right wall
  let ev = []; for (let i = 0; i < 20; i++) ev.push(...tick(g, { [p]: { mx: 1, mz: 0, b: 0 } }));
  const drop = ev.find(e => e.e === 'drop'); assert.ok(drop, 'pies fell'); assert.ok(drop.n >= 1); assert.equal(g.state().pies[p], 5 - ev.filter(e => e.e === 'drop').reduce((s, e) => s + e.n, 0));
  const g2 = make(1, 4), b2 = g2.bodies.get(p), st2 = g2.player(p);
  st2.pies = 5; b2.x = meta.arena.hw - 1; b2.z = -8.5; b2.yaw = Math.PI / 2; b2.vx = 1; ev = [];
  for (let i = 0; i < 20; i++) ev.push(...tick(g2, { [p]: { mx: 0.25, mz: 0, b: IN.A } }));
  assert.ok(!ev.some(e => e.e === 'drop'), 'gentle'); assert.equal(st2.pies, 5);
});

test('a rolling barrel knocks you back, stuns you and costs two pies', () => {
  const g = make(1, 6), [p] = pids(g), b = g.bodies.get(p), st = g.player(p), br = g.square.barrels[0];
  st.pies = 4; b.flags |= F.CARRY;
  let ev = [];
  for (let i = 0; i < 200 && !ev.some(e => e.e === 'hit'); i++) { b.z = br.z + 0.2; b.x = 0; b.vx = b.vz = 0; ev.push(...tick(g)); }
  const hit = ev.find(e => e.e === 'hit'); assert.ok(hit); assert.equal(hit.why, 'barrel');
  assert.ok(b.flags & F.STUN); assert.equal(st.pies, 2);
  assert.ok(Math.hypot(b.vx, b.vz) > 3, 'knocked back');
});

test('two carts crashing head on each lose a pie', () => {
  const g = make(2, 8), [a, c] = pids(g), A = g.bodies.get(a), C = g.bodies.get(c);
  for (const [pid] of [[a], [c]]) { g.player(pid).pies = 3; g.bodies.get(pid).flags |= F.CARRY; }
  A.x = -1; A.z = -6.6; A.yaw = Math.PI / 2; A.vx = 4; C.x = 1; C.z = -6.6; C.yaw = -Math.PI / 2; C.vx = -4;
  g.square.barrels.forEach(br => { br.A = 0; br.z = 50; });
  let ev = []; for (let i = 0; i < 10; i++) ev.push(...tick(g, { [a]: { mx: 1, mz: 0, b: 0 }, [c]: { mx: -1, mz: 0, b: 0 } }));
  assert.ok(ev.some(e => e.e === 'crash'), 'crash');
  assert.equal(g.player(a).pies, 2); assert.equal(g.player(c).pies, 2);
  assert.ok(Math.hypot(A.x - C.x, A.z - C.z) >= BODY_R * 2 - 0.05, 'pushed apart');
});

test('careful beats reckless: a courier who carries 3 out-scores one who mashes the stick around', () => {
  let careful = 0, wild = 0;
  for (const seed of [1, 2, 3, 4]) {
    const g = make(2, seed), [a, b] = pids(g), smart = courier(g), rnd = makeRng(seed * 9);
    let t = 0;
    play(g, () => { t += DT; const o = smart(); const ang = Math.sin(t * 1.3 + rnd() * 0.1) * 3; o[b] = { mx: Math.sin(ang), mz: Math.cos(ang), b: 0 }; return o; });
    careful += g.result().scores[a]; wild += g.result().scores[b];
  }
  assert.ok(careful > wild + 10, `careful ${careful}, wild ${wild}`);
});

test('state is small and rounded', () => {
  const g = make(4, 2), bot = courier(g); for (let i = 0; i < 400; i++) tick(g, bot());
  const s = JSON.stringify(g.state()); assert.ok(s.length < 300, `${s.length} bytes`); assert.ok(!/\d\.\d{3,}/.test(s));
});
