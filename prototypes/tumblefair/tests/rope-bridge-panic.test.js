import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { DT, F } from '../js/shared/arena.js';
import { IN } from '../js/shared/protocol.js';
import { meta, create, RULES, makeCourse } from '../js/games/rope-bridge-panic/sim.js';

const make = (n, seed = 3, difficulty = 'normal') => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: 10 + i, seat: i, name: 'P' + i })), difficulty });
const pids = g => [...g.bodies.keys()];
function tick(g, inputs = {}) {
  for (const pid of pids(g)) g.input(pid, inputs[pid] ?? { mx: 0, mz: 0, b: 0 });
  g.step(DT); const ev = g.events.splice(0); g.state(); return ev;
}
const segOf = (g, z) => g.course.segs.find(s => z <= s.z0 && z > s.z1);
/**
 * The team bot: everyone walks up the course in their own lane, hops a hole just before reaching it, leans against
 * the wind; `stagger` seconds between each player setting off (so they do not crowd a plank); `lean` off = ignore wind.
 */
function team(g, { stagger = 0.8, lean = true } = {}) {
  const ids = pids(g), n = ids.length; let t = 0;
  return () => {
    t += DT; const st = g.state(), out = {};
    ids.forEach((pid, i) => {
      const b = g.bodies.get(pid), seg = segOf(g, b.z);
      let tx = n === 1 ? 0 : -1 + 2 * i / (n - 1), hop = 0;
      if (seg?.k === 'span') {
        const sp = st.sp[seg.i];
        if (lean && sp[1]) tx = tx * 0.4 - sp[1] * 0.6; else if (lean) tx -= Math.max(-1, Math.min(1, sp[0] * 1.5));
        const ahead = Math.floor((seg.z0 - (b.z - 0.45)) / RULES.PL);
        if (ahead < sp[3].length && sp[3][ahead] === '-') hop = IN.A;
      } else if (seg) {
        const nx = g.course.segs[g.course.segs.indexOf(seg) + 1];
        if (nx?.k === 'span' && b.z - nx.z0 < 0.45 && st.sp[nx.i][3][0] === '-') hop = IN.A;
      }
      out[pid] = { mx: Math.max(-1, Math.min(1, (tx - b.x) * 2)) * 0.6, mz: t < i * stagger ? 0 : -0.9, b: hop };
    });
    return out;
  };
}
function play(g, bot) { let steps = 0; const ev = []; while (!g.over && steps++ < meta.seconds / DT + 5) ev.push(...tick(g, bot ? bot() : {})); return { steps, ev }; }
function checkResult(g, n) {
  const r = g.result();
  assert.ok(r.coop && typeof r.coop.success === 'boolean');
  const all = r.order.flat(); assert.equal(all.length, n); assert.deepEqual([...all].sort(), pids(g).sort(), 'every player exactly once');
  assert.equal(Object.keys(r.scores).length, n); assert.equal(r.unit, meta.unit);
  return r;
}

test('the course: three spans between four lands, plank-sized, holes apart, and the same from the same seed', () => {
  for (let s = 1; s < 30; s++) {
    const c = makeCourse(makeRng(s));
    assert.deepEqual(c.segs.map(x => x.k), ['land', 'span', 'land', 'span', 'land', 'span', 'land']);
    for (let i = 1; i < c.segs.length; i++) assert.equal(c.segs[i].z0, c.segs[i - 1].z1, 'segments join');
    assert.ok(Math.abs(c.segs[0].z0 - c.hd) < 0.01 && Math.abs(c.segs[6].z1 + c.hd) < 0.01);
    c.segs.filter(x => x.k === 'span').forEach((sp, i) => {
      assert.equal(sp.n, Math.round((sp.z0 - sp.z1) / RULES.PL)); assert.equal(sp.weak.length, sp.n);
      assert.equal(sp.holes.length, RULES.holes[i]);
      for (const h of sp.holes) assert.ok(h >= 2 && h <= sp.n - 3);
      for (let a = 1; a < sp.holes.length; a++) assert.ok(sp.holes[a] - sp.holes[a - 1] >= 4);
    });
    assert.deepEqual(makeCourse(makeRng(s)), c);
  }
});

for (const n of [1, 2, 3, 4]) test(`${n} player(s): nobody moves — the clock runs out, a co-op failure`, () => {
  const g = make(n, 30 + n), { steps } = play(g);
  assert.ok(g.over); assert.ok(steps <= meta.seconds / DT + 1);
  const r = checkResult(g, n); assert.equal(r.coop.success, false);
  assert.ok(Object.values(r.scores).every(s => s === 0));
});

for (const n of [1, 2, 3, 4]) test(`${n} player(s): a team that staggers, hops holes and leans into the wind gets everyone over, early`, () => {
  let wins = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const g = make(n, seed * 11 + n), { steps, ev } = play(g, team(g));
    const r = checkResult(g, n);
    if (r.coop.success) {
      wins++; assert.ok(steps < meta.seconds / DT, 'ended before the bell');
      assert.ok(Object.values(r.scores).every(s => s === 3), 'everyone crossed three bridges');
      // the order is who made it first
      const made = ev.filter(e => e.e === 'made').map(e => e.pid);
      assert.deepEqual(r.order.flat(), made.filter((p, i) => made.indexOf(p) === i));
    }
  }
  assert.ok(wins >= 4, `${wins}/5`);
});

test('crowding: four people walking abreast break the planks under each other more than a staggered line does', () => {
  let abreast = 0, staggered = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const a = make(4, seed); play(a, team(a, { stagger: 0 })); abreast += a.spans.reduce((s, sp) => s + sp.hp.filter(h => h <= 0).length - sp.s.holes.length, 0);
    const b = make(4, seed); play(b, team(b)); staggered += b.spans.reduce((s, sp) => s + sp.hp.filter(h => h <= 0).length - sp.s.holes.length, 0);
  }
  assert.ok(abreast > staggered * 1.5 + 2, `abreast ${abreast}, staggered ${staggered}`);
});

test('standing still on a plank wears it through and drops you; you come back at the start of that bridge', () => {
  const g = make(1, 7), [p] = pids(g), b = g.bodies.get(p), sp = g.spans[0];
  // walk onto the first bridge, three planks in, then stop
  let ev = [];
  while (b.z > sp.s.z0 - RULES.PL * 3.5) ev.push(...tick(g, { [p]: { mx: 0, mz: -1, b: 0 } }));
  assert.ok(b.flags & F.SLOW, 'careful steps on a bridge');
  for (let i = 0; i < 80 && !ev.some(e => e.e === 'fall'); i++) ev.push(...tick(g));
  const fall = ev.find(e => e.e === 'fall'); assert.ok(fall, 'fell'); assert.equal(fall.why, 'snap');
  assert.ok(ev.some(e => e.e === 'snap'));
  assert.ok(b.flags & F.STUN); for (let i = 0; i < 10; i++) tick(g); assert.ok(b.y < -1, 'falling into the gorge');
  for (let i = 0; i < RULES.fallTime / DT + 2; i++) tick(g);
  assert.equal(b.y, 0); assert.equal(b.flags & F.STUN, 0);
  assert.ok(b.z > sp.s.z0 && b.z < g.course.segs[0].z0, 'back on the near cliff');
  assert.equal(g.state().pr[p][2], 1, 'one fall counted');
});

test('a hop clears a hole; walking into one drops you', () => {
  const g = make(1, 8), [p] = pids(g), b = g.bodies.get(p), sp = g.spans[1], hole = sp.s.holes[0];
  assert.ok(hole != null);
  b.z = g.course.segs[2].z1 + 0.5; b.x = 0;                                    // on the first pillar, facing the second bridge
  const holeZ = sp.s.z0 - hole * RULES.PL;
  let ev = [];
  while (b.z > holeZ + 0.25 && !g.over) ev.push(...tick(g, { [p]: { mx: 0, mz: -1, b: 0 } }));
  ev.push(...tick(g, { [p]: { mx: 0, mz: -1, b: IN.A } }));
  for (let i = 0; i < 14; i++) ev.push(...tick(g, { [p]: { mx: 0, mz: -1, b: 0 } }));
  assert.ok(ev.some(e => e.e === 'hop')); assert.ok(!ev.some(e => e.e === 'fall'), 'hopped it'); assert.ok(b.z < holeZ - RULES.PL);
  const g2 = make(1, 8), b2 = g2.bodies.get(p);
  b2.z = g2.course.segs[2].z1 + 0.5; b2.x = 0; ev = [];
  for (let i = 0; i < 200 && !ev.some(e => e.e === 'fall'); i++) ev.push(...tick(g2, { [p]: { mx: 0, mz: -1, b: 0 } }));
  assert.equal(ev.find(e => e.e === 'fall')?.why, 'hole');
});

test('weight tips a bridge: everyone on one edge throws them off; spread out it stays level', () => {
  const g = make(4, 12), ids = pids(g), sp = g.spans[0];
  // put all four on the first bridge, on the +x edge, a plank apart, and hold them there (planks are mended so only the tip counts)
  ids.forEach((pid, i) => { const b = g.bodies.get(pid); b.x = 1.0; b.z = sp.s.z0 - RULES.PL * (2.5 + i * 2); });
  sp.gust.next = 99;
  let ev = [];
  for (let i = 0; i < 40 && !ev.some(e => e.e === 'tip'); i++) { sp.hp.fill(1); ev.push(...tick(g, Object.fromEntries(ids.map(p => [p, { mx: 1, mz: 0, b: 0 }])))); }
  const tip = ev.find(e => e.e === 'tip'); assert.ok(tip, 'tipped'); assert.equal(tip.dir, 1); assert.equal(tip.n, 4);
  assert.equal(ev.filter(e => e.e === 'fall' && e.why === 'tip').length, 4);
  const g2 = make(4, 12), sp2 = g2.spans[0]; sp2.gust.next = 99;
  pids(g2).forEach((pid, i) => { const b = g2.bodies.get(pid); b.x = i % 2 ? 1 : -1; b.z = sp2.s.z0 - RULES.PL * (2.5 + i * 2); });
  ev = [];
  for (let i = 0; i < 60; i++) { sp2.hp.fill(1); ev.push(...tick(g2, Object.fromEntries(pids(g2).map((p, k) => [p, { mx: k % 2 ? 1 : -1, mz: 0, b: 0 }])))); }
  assert.ok(!ev.some(e => e.e === 'tip')); assert.ok(Math.abs(sp2.T) < 0.2);
});

test('gusts are warned before they blow, and push the bridge their way', () => {
  const g = make(1, 3), sp = g.spans[0];
  let warned = false, blew = null;
  for (let i = 0; i < 400 && !blew; i++) { const ev = tick(g); const s = g.state().sp[0]; if (s[1] && !s[2]) warned = true; blew = ev.find(e => e.e === 'gust' && e.s === 0) || null; }
  assert.ok(warned && blew, 'a warning, then the gust');
  for (let i = 0; i < 20; i++) tick(g);
  assert.ok(Math.sign(sp.T) === blew.dir && Math.abs(sp.T) > 0.3, `tilt ${sp.T}`);
});

test('state is small and rounded', () => {
  const g = make(4, 2), bot = team(g); for (let i = 0; i < 200; i++) tick(g, bot());
  const s = JSON.stringify(g.state()); assert.ok(s.length < 400, `${s.length} bytes`);
  assert.ok(!/\d\.\d{3,}/.test(s));
});
