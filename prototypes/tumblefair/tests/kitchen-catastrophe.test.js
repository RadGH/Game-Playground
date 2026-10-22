import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { DT, F } from '../js/shared/arena.js';
import { IN } from '../js/shared/protocol.js';
import { meta, create, RULES, RECIPES, STATIONS, TRAY, ITEMS, dealStations } from '../js/games/kitchen-catastrophe/sim.js';

const make = (n, seed = 3, difficulty = 'normal') => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: 10 + i, seat: i, name: 'P' + i })), difficulty });
const pids = g => [...g.bodies.keys()];
function tick(g, inputs = {}) {
  for (const pid of pids(g)) g.input(pid, inputs[pid] ?? { mx: 0, mz: 0, b: 0 });
  g.step(DT); const ev = g.events.splice(0); g.state(); return ev;
}
const toward = (b, x, z) => { const dx = x - b.x, dz = z - b.z, d = Math.hypot(dx, dz); return d < 0.25 ? { mx: 0, mz: 0 } : { mx: dx / d, mz: dz / d }; };
/** A kitchen hand: takes the earliest part of the front order that it owns and nobody carries, brings it to the tray
 *  and waits its turn beside it. `wrong` = sometimes adds whatever it holds without waiting (to test spoiling). */
function cooks(g, { lazy = 0 } = {}) {
  let k = 0;
  return () => {
    k++; const out = {}, st = g.state(), o = g.orders[0];
    const rec = o ? RECIPES[o.r] : null, need = rec ? rec.steps[g.tray.length] : -1;
    const held = new Set(Object.values(st.hold).filter(h => h >= 0));
    pids(g).forEach((pid, i) => {
      const b = g.bodies.get(pid), h = st.hold[pid], press = k % 2 ? IN.A : 0;
      if (lazy && i === 0) { out[pid] = { mx: 0, mz: 0, b: 0 }; return; }
      if (h >= 0) {
        if (h === need) { const u = TRAY.use; out[pid] = { ...toward(b, u.x, u.z), b: Math.hypot(b.x - u.x, b.z - u.z) < 1.2 ? press : 0 }; }
        else { const wx = TRAY.use.x + (i - 1.5) * 1.3, wz = TRAY.use.z + 1.4; out[pid] = { ...toward(b, wx, wz), b: 0 }; }
        if (!rec || !rec.steps.slice(g.tray.length).includes(h)) out[pid].b = 0;
        if (rec && !rec.steps.slice(g.tray.length).includes(h)) { /* go get something useful instead */ } else return;
      }
      const want = rec ? rec.steps.slice(g.tray.length).find(it => !held.has(it) && g.stations.find(s => s.item === it).own === pid) : undefined;
      if (want === undefined) { out[pid] = { mx: 0, mz: 0, b: 0 }; return; }
      held.add(want);
      const s = g.stations.find(s => s.item === want), u = STATIONS[s.spot].use;
      out[pid] = { ...toward(b, u.x, u.z), b: Math.hypot(b.x - u.x, b.z - u.z) < 1.0 ? press : 0 };
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

test('stations: every ingredient once, dealt evenly round the players, same from the same seed', () => {
  for (let n = 1; n <= 4; n++) for (let s = 1; s < 30; s++) {
    const ids = Array.from({ length: n }, (_, i) => i + 1), st = dealStations(makeRng(s), ids);
    assert.equal(st.length, STATIONS.length);
    assert.deepEqual(st.map(x => x.item).sort((a, b) => a - b), ITEMS.map((_, i) => i));
    const per = ids.map(id => st.filter(x => x.own === id).length);
    assert.ok(Math.max(...per) - Math.min(...per) <= 1, 'even split');
    assert.deepEqual(dealStations(makeRng(s), ids), st);
  }
  for (const r of RECIPES) assert.ok(r.steps.every(x => x >= 0 && x < ITEMS.length));
});

test('the tray: the right step goes on, a wrong one spoils it, a full recipe is served', () => {
  const g = make(1, 5), pid = 10, b = g.bodies.get(pid);
  tick(g); const o = g.orders[0], rec = RECIPES[o.r];
  const grab = item => { const s = g.stations.find(s => s.item === item), u = STATIONS[s.spot].use; b.x = u.x; b.z = u.z; tick(g, { [pid]: { mx: 0, mz: 0, b: IN.A } }); tick(g); };
  const add = () => { b.x = TRAY.use.x; b.z = TRAY.use.z; const ev = tick(g, { [pid]: { mx: 0, mz: 0, b: IN.A } }); tick(g); return ev; };
  grab(rec.steps[0]); assert.equal(g.player(pid).hold, rec.steps[0]); assert.ok(b.flags & F.CARRY);
  let ev = add(); assert.ok(ev.some(e => e.e === 'add')); assert.deepEqual(g.tray, [rec.steps[0]]); assert.equal(g.player(pid).hold, -1);
  const wrong = ITEMS.findIndex((_, i) => i !== rec.steps[1]);
  const left0 = g.orders[0].left;
  grab(wrong); ev = add(); assert.ok(ev.some(e => e.e === 'spoil')); assert.deepEqual(g.tray, []); assert.ok(g.orders[0].left < left0 - RULES.spoilCost + 0.2);
  for (const it of rec.steps) { grab(it); ev = add(); }
  assert.ok(ev.some(e => e.e === 'serve')); assert.equal(g.state().served, 1); assert.equal(g.player(pid).added, 1 + rec.steps.length);
});

test('only the owner can take from a station', () => {
  const g = make(2, 9), [a, c] = pids(g); tick(g);
  const s = g.stations.find(s => s.own === c), u = STATIONS[s.spot].use, b = g.bodies.get(a);
  b.x = u.x; b.z = u.z; const ev = tick(g, { [a]: { mx: 0, mz: 0, b: IN.A } });
  assert.ok(ev.some(e => e.e === 'nope' && e.to === a)); assert.equal(g.player(a).hold, -1);
});

for (const n of [1, 2, 3, 4]) test(`${n} player(s): nobody cooking = orders run out, the team loses at the bell`, () => {
  const g = make(n, 20 + n), { steps, ev } = play(g);
  assert.ok(g.over); assert.ok(steps <= meta.seconds / DT + 1);
  assert.ok(ev.some(e => e.e === 'gone'));
  const r = checkResult(g, n); assert.equal(r.coop.success, false); assert.ok(Object.values(r.scores).every(v => v === 0));
});

for (const n of [1, 2, 3, 4]) test(`${n} player(s): a team that cooks well fills the target before the bell`, () => {
  let wins = 0;
  for (let s = 0; s < 6; s++) {
    const g = make(n, 100 + s * 7 + n), { steps } = play(g, cooks(g));
    const r = checkResult(g, n); if (process.env.KC) console.log(n, "secs", (steps * DT).toFixed(1), r.coop.success, g.state().served, g.state().lost);
    if (r.coop.success) { wins++; assert.ok(steps < meta.seconds / DT, 'ends early on the target'); assert.ok(Object.values(r.scores).every(v => v > 0) || n === 1, 'everyone added something'); }
  }
  assert.ok(wins >= 5, `won ${wins}/6`);
});

test('the target is within reach but not trivial: a team with one idle player usually misses it', () => {
  let wins = 0;
  for (let s = 0; s < 6; s++) { const g = make(2, 300 + s), r = (play(g, cooks(g, { lazy: 1 })), g.result()); if (r.coop.success) wins++; }
  assert.ok(wins <= 1, `won ${wins}/6 with half the team idle`);
});
