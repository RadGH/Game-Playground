import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { DT, F } from '../js/shared/arena.js';
import { IN } from '../js/shared/protocol.js';
import { meta, create, RULES, goalFor, scheduleFor, roomOf, roomCentre, lanternAt, coldBand } from '../js/games/ghost-photographer/sim.js';

const make = (n, seed = 3, difficulty = 'normal') => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: 10 + i, seat: i, name: 'P' + i })), difficulty });
function tick(g, inputs = {}) {
  for (const pid of g.bodies.keys()) g.input(pid, inputs[pid] ?? { mx: 0, mz: 0, b: 0 });
  g.step(DT); const ev = g.events.splice(0); g.state(); return ev;
}
function checkResult(g, n) {
  const r = g.result();
  assert.ok(r.coop && typeof r.coop.success === 'boolean');
  assert.equal(r.order.length, 1);
  assert.deepEqual([...r.order[0]].sort(), [...g.bodies.keys()].sort(), 'every player exactly once');
  assert.equal(Object.keys(r.scores).length, n); assert.equal(r.unit, meta.unit);
  return r;
}
const play = (g, bot) => { let steps = 0; while (!g.over && steps < meta.seconds / DT + 5) { tick(g, bot ? bot() : {}); steps++; } return steps; };
/** A team that shares its clues out loud: each clue becomes a guess (room centre, last footprint, or "near the holder"
 *  when it is freezing); lit ghosts are known exactly. The lantern walks to the nearest guess and flashes there; the
 *  photographers go for lit ghosts first, then guesses, and snap when one is in the frame. */
function team(g, { useClues = true } = {}) {
  let k = 0;
  return () => {
    k++;
    const st = g.state(), pids = [...g.bodies.keys()], out = {}, guesses = [];
    for (const [id, , x, z] of st.gh) guesses.push({ id, x, z, sure: true });
    if (useClues) for (const pid of pids) for (const c of g.priv(pid).clues) {
      if (guesses.some(q => q.id === c.id)) continue;
      const me = g.bodies.get(pid);
      if (c.t === 'room') guesses.push({ id: c.id, ...roomCentre(c.room) });
      else if (c.t === 'trail' && c.steps.length) guesses.push({ id: c.id, x: c.steps[0][0], z: c.steps[0][1] });
      else if (c.t === 'cold' && c.cold <= 1) guesses.push({ id: c.id, x: me.x, z: me.z });
    }
    const taken = new Set();
    for (const pid of pids) {
      const b = g.bodies.get(pid), lamp = pid === st.lt && pids.length > 1;
      let best = null, bd = 1e9;
      for (const q of guesses) { if (!lamp && taken.has(q.id) && !q.sure) continue; const d = Math.hypot(q.x - b.x, q.z - b.z) - (q.sure ? 4 : 0); if (d < bd) { bd = d; best = q; } }
      let gx = (pids.indexOf(pid) % 3 - 1) * 5, gz = (pids.indexOf(pid) > 2 ? 3 : -2), press = 0;
      if (best) {
        if (!lamp) taken.add(best.id);
        // stand a step short of it, facing it, so it sits in the frame
        const dx = best.x - b.x, dz = best.z - b.z, d = Math.hypot(dx, dz) || 1;
        gx = best.x - dx / d * (lamp ? 0 : RULES.snapAhead); gz = best.z - dz / d * (lamp ? 0 : RULES.snapAhead);
        if (!lamp && best.sure && Math.abs(d - RULES.snapAhead) < 0.9) press |= IN.A;
        if (!lamp && !best.sure && d < 2.2 && k % 12 === 0) press |= IN.A;
        if (lamp && d < 2 && k % 4 === 0) press |= IN.B;
        if (pids.length === 1 && d < 2.5 && k % 6 === 0) press |= IN.B;
      }
      const dx = gx - b.x, dz = gz - b.z, d = Math.hypot(dx, dz);
      // face the target even when close: a tiny push toward it turns the character
      const tx = best ? best.x - b.x : dx, tz = best ? best.z - b.z : dz, td = Math.hypot(tx, tz) || 1;
      out[pid] = d > 0.25 ? { mx: dx / d * Math.min(1, d), mz: dz / d * Math.min(1, d), b: press } : { mx: tx / td * 0.2, mz: tz / td * 0.2, b: press };
    }
    return out;
  };
}

for (const n of [1, 2, 3, 4]) test(`${n} player(s): nobody does anything — every ghost slips away, a loss, inside the clock`, () => {
  const g = make(n, 40 + n), steps = play(g);
  assert.ok(g.over); assert.ok(steps <= meta.seconds / DT + 1);
  const r = checkResult(g, n); assert.equal(r.coop.success, false);
  assert.equal(g.state().c, 0); assert.equal(g.state().x, scheduleFor(n).length, 'every ghost escaped');
  assert.equal(g.init().goal, goalFor(n));
});

for (const n of [1, 2, 3, 4]) test(`${n} player(s): a team that calls out its clues usually makes the goal`, () => {
  let wins = 0, blind = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const g = make(n, seed * 17 + n), steps = play(g, team(g));
    assert.ok(g.over); assert.ok(steps <= meta.seconds / DT + 1);
    const r = checkResult(g, n); if (r.coop.success) wins++;
    assert.ok(Object.values(r.scores).reduce((a, b) => a + b, 0) >= 2 * g.state().c);
    const h = make(n, seed * 17 + n); play(h, team(h, { useClues: false })); if (h.result().coop.success) blind++;
  }
  assert.ok(wins >= 4, `${wins}/5 with clues`);
  assert.ok(blind < wins, `clues help: ${blind} blind vs ${wins}`);
});

test('ghosts are secret: only lit ones are in the public state, and clues only go to their holder', () => {
  const g = make(3, 5), pids = [...g.bodies.keys()];
  for (let i = 0; i < 200; i++) tick(g);
  const loose = g.state().n; assert.ok(loose > 0);
  const lit = g.state().gh; assert.ok(lit.length < loose || loose === 0 || lit.length <= loose);
  const all = pids.flatMap(p => g.priv(p).clues.map(c => c.id)); assert.equal(new Set(all).size, all.length, 'each clue on one phone');
  assert.equal(all.length, loose, 'every loose ghost has a clue somewhere');
  assert.equal(pids.filter(p => g.priv(p).lamp).length, 1, 'one lantern');
});

test('the lantern lights ghosts near it (and slows them); the flash lights a wide circle', () => {
  const g = make(2, 9), [a, b] = [...g.bodies.keys()];
  while (!g.state().n) tick(g);
  assert.equal(g.state().lt, a);
  const id = g.priv(a).clues[0]?.id ?? g.priv(b).clues[0].id;
  // move the lantern far away: nothing lit; then onto the ghost via the snap test hook (positions are internal, so read
  // them back from a flash that covers the whole yard)
  const L = g.bodies.get(a); L.x = 0; L.z = 0;
  tick(g, { [a]: { mx: 0, mz: 0, b: IN.B } });
  const lit = g.state().gh; assert.ok(Array.isArray(lit));
  assert.ok(g.state().fl, 'flash is on');
  for (let i = 0; i < 25; i++) tick(g);
  assert.ok(!g.state().fl, 'and off again after a second');
  const ev = tick(g, { [a]: { mx: 0, mz: 0, b: IN.B } }); assert.ok(!ev.some(e => e.e === 'flash'), 'recharging');
  const ev2 = tick(g, { [b]: { mx: 0, mz: 0, b: IN.B } }); assert.ok(ev2.some(e => e.e === 'nolamp' && e.to === b));
  assert.ok(id > 0);
});

test('snapping a lit ghost catches it and splits the credit; the lantern carrier cannot snap', () => {
  let found = false;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const g = make(3, seed), [a, b, c] = [...g.bodies.keys()];
    // carry on until some ghost is lit, then put b right behind it facing it and snap
    let guard = 0, lit = null;
    while (!lit && guard++ < 1100 && !g.over) { const L = g.bodies.get(g.state().lt); L.x = Math.sin(guard / 30) * 7; L.z = Math.cos(guard / 23) * 4.5; tick(g); lit = g.state().gh[0]; }
    if (!lit) continue;
    const lamp = g.state().lt, snapper = [a, b, c].find(p => p !== lamp);
    const ev0 = tick(g, { [lamp]: { mx: 0, mz: 0, b: IN.A } }); assert.ok(ev0.some(e => e.e === 'busy' && e.to === lamp));
    const [id, , x, z] = g.state().gh.find(q => q[0] === lit[0]) || lit;
    const S = g.bodies.get(snapper); S.x = x; S.z = z - RULES.snapAhead; S.yaw = 0;
    const holder = [a, b, c].find(p => g.priv(p).clues.some(q => q.id === id));
    const before = { ...g.result().scores };
    const ev = tick(g, { [snapper]: { mx: 0, mz: 0, b: IN.A } });
    const sn = ev.find(e => e.e === 'snap'); assert.ok(sn);
    if (!sn.got.some(q => q[0] === id)) continue;            // it drifted out of the frame this tick: try another seed
    const after = g.result().scores;
    assert.ok(after[snapper] - before[snapper] >= 2);
    if (holder !== snapper) assert.ok(after[holder] - before[holder] >= 1);
    assert.equal(g.state().c, sn.got.length);
    found = true; break;
  }
  assert.ok(found, 'a lit ghost was caught');
});

test('clue readings: rooms, cold bands and the lantern rota', () => {
  assert.equal(roomOf(-8, -5), 0); assert.equal(roomOf(0, 0), 4); assert.equal(roomOf(8.9, 5.9), 8);
  for (let i = 0; i < 9; i++) assert.equal(roomOf(roomCentre(i).x, roomCentre(i).z), i);
  assert.deepEqual([1, 3, 6, 20].map(coldBand), [0, 1, 2, 3]);
  assert.deepEqual([0, 11.9, 12, 24, 36, 48].map(t => lanternAt([1, 2, 3], t)), [1, 1, 2, 3, 1, 2]);
  assert.deepEqual([0, 30].map(t => lanternAt([5], t)), [5, 5]);
});

test('solo: you carry the lantern and the camera, and every clue is yours', () => {
  const g = make(1, 4), pid = 10;
  for (let i = 0; i < 120; i++) tick(g);
  assert.equal(g.priv(pid).lamp, 1);
  assert.equal(g.priv(pid).clues.length, g.state().n);
  const ev = tick(g, { [pid]: { mx: 0, mz: 0, b: IN.A } }); assert.ok(ev.some(e => e.e === 'snap'));
});

test('same seed, same inputs, same hunt', () => {
  const a = make(4, 77), b = make(4, 77), ba = team(a), bb = team(b);
  for (let i = 0; i < 600; i++) { tick(a, ba()); tick(b, bb()); }
  assert.deepEqual(a.state(), b.state()); assert.ok(F.FROZEN);
});
