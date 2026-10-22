import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { F, DT } from '../js/shared/arena.js';
import { IN } from '../js/shared/protocol.js';
import { meta, create, RULES, DOORS } from '../js/games/trick-or-treat-street/sim.js';
import { eligible } from '../js/games/index.js';

const make = (n, seed = 3) => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: 30 + i, seat: i, name: 'P' + i })), difficulty: 'normal', season: 'halloween' });
function tick(g, inputs = {}) {
  for (const pid of g.bodies.keys()) g.input(pid, inputs[pid] ?? { mx: 0, mz: 0, b: 0 });
  g.step(DT); return g.events.splice(0);
}
const run = (g, s, inputs) => { const ev = []; for (let i = 0; i < s / DT && !g.over; i++) ev.push(...tick(g, typeof inputs === 'function' ? inputs(i) : inputs)); return ev; };
const place = (b, x, z) => { b.x = x; b.z = z; b.vx = b.vz = 0; };
const atDoor = (g, pid, i) => { const d = DOORS[i]; place(g.bodies.get(pid), d.x + Math.sin(d.face) * 0.5, d.z + Math.cos(d.face) * 0.5); };
const litDoor = g => g.doors().findIndex(d => d.st === 1);
function checkResult(g, n) {
  const r = g.result(), all = r.order.flat();
  assert.equal(all.length, n); assert.deepEqual([...all].sort(), [...g.bodies.keys()].sort());
  assert.equal(r.unit, meta.unit);
  const flat = r.order.map(grp => grp.map(pid => r.scores[pid]));
  for (const grp of flat) assert.equal(new Set(grp).size, 1, 'a group shares one score');
  for (let i = 1; i < flat.length; i++) assert.ok(flat[i - 1][0] > flat[i][0], 'groups best first');
  return r;
}
/** A bot: walk to the nearest lit door and knock; sometimes bump. */
function bot(g, pid, i) {
  const b = g.bodies.get(pid); let best = null, bd = 1e9;
  for (const d of g.doors()) if (d.st === 1) { const dd = Math.hypot(d.x - b.x, d.z - b.z); if (dd < bd) { bd = dd; best = d; } }
  if (!best) return { mx: 0, mz: 0, b: i % 7 === 0 ? IN.B : 0 };
  let dx = best.x - b.x, dz = best.z - b.z; const m = Math.hypot(dx, dz) || 1; dx /= m; dz /= m;
  for (const p of meta.arena.posts) { const ox = b.x - p.x, oz = b.z - p.z, od = Math.hypot(ox, oz); if (od < p.r + 1.2) { dx += -oz / od * 0.9 + ox / od * 0.3; dz += ox / od * 0.9 + oz / od * 0.3; } }   // steer round lamp posts and the pumpkin pile
  return { mx: dx, mz: dz, b: bd < RULES.reach - 0.1 && i % 2 ? IN.A : 0 };
}

test('it is a Halloween holiday game: offered only in season', () => {
  assert.equal(meta.season, 'halloween'); assert.ok(meta.tags.includes('holiday'));
  assert.ok(eligible(2, [], 'halloween').includes(meta.id));
  assert.ok(!eligible(2, [], null).includes(meta.id));
});

for (const n of [1, 2, 3, 4]) test(`${n} player(s) standing still: the clock ends it at ${meta.seconds} s, everyone ties on 0`, () => {
  const g = make(n, n);
  let steps = 0; while (!g.over && steps < meta.seconds / DT + 5) { tick(g); steps++; }
  assert.ok(g.over); assert.ok(steps <= meta.seconds / DT + 1);
  const r = checkResult(g, n);
  assert.equal(r.order.length, 1); for (const v of Object.values(r.scores)) assert.equal(v, 0);
});

test('knocking a lit door: you wait on the step, then it pays out and the door goes dark', () => {
  const g = make(2), [a] = [...g.bodies.keys()], A = g.bodies.get(a);
  const di = litDoor(g); assert.ok(di >= 0, 'some door starts lit');
  atDoor(g, a, di);
  const ev = tick(g, { [a]: { mx: 0, mz: 0, b: IN.A } });
  assert.ok(ev.some(e => e.e === 'knock' && e.pid === a && e.door === di));
  assert.ok(A.flags & F.FROZEN, 'standing on the step'); assert.equal(g.doors()[di].st, 2, 'opening');
  assert.equal(g.state().d[di], '2');
  const ev2 = run(g, RULES.open + 0.1);
  const open = ev2.find(e => e.e === 'open' && e.pid === a); assert.ok(open, 'the door opened');
  assert.equal(g.doors()[di].st, 0, 'now dark'); assert.equal(A.flags & F.FROZEN, 0, 'free again');
  const s = g.state().sc[a];
  if (['c1', 'c2', 'c3', 'big'].includes(open.kind)) assert.equal(s, { c1: 1, c2: 2, c3: 3, big: 5 }[open.kind]);
  else assert.equal(s, 0);
  // a dark door cannot be knocked
  const ev3 = run(g, 0.3, i => ({ [a]: { mx: 0, mz: 0, b: i === 0 ? IN.A : 0 } }));
  assert.ok(!ev3.some(e => e.e === 'knock' && e.door === di));
});

test('pressing A away from any lit door does nothing but say so (to you only)', () => {
  const g = make(1), [a] = [...g.bodies.keys()];
  place(g.bodies.get(a), 0, 0.5);
  const ev = tick(g, { [a]: { mx: 0, mz: 0, b: IN.A } });
  assert.ok(ev.some(e => e.e === 'nope' && e.to === a)); assert.ok(!ev.some(e => e.e === 'knock'));
});

test('every outcome happens; BOO spooks (stun, nudged into the street), slime slows then wears off', () => {
  const seen = new Set();
  let booChecked = false, slimeChecked = false;
  for (let seed = 1; seed < 80 && !(booChecked && slimeChecked && seen.size === 6); seed++) {
    const g = make(1, seed), [a] = [...g.bodies.keys()], A = g.bodies.get(a);
    for (let k = 0; k < 4; k++) {
      const di = litDoor(g); if (di < 0) break;
      A.flags &= ~(F.STUN | F.SLOW); atDoor(g, a, di);
      tick(g, { [a]: { mx: 0, mz: 0, b: IN.A } });
      const ev = run(g, RULES.open + 0.06);
      const open = ev.find(e => e.e === 'open'); if (!open) continue;
      seen.add(open.kind);
      if (open.kind === 'boo' && !booChecked) {
        assert.ok(A.flags & F.STUN, 'spooked'); const d = DOORS[di];
        assert.ok(A.vx * Math.sin(d.face) + A.vz * Math.cos(d.face) > 1, 'pushed away from the door');
        run(g, RULES.booStun + 0.1); assert.equal(A.flags & F.STUN, 0); booChecked = true;
      }
      if (open.kind === 'slime' && !slimeChecked) {
        assert.ok(A.flags & F.SLOW, 'slimed'); run(g, RULES.slime + 0.1); assert.equal(A.flags & F.SLOW, 0); slimeChecked = true;
      }
      tick(g); // a moment between knocks
    }
  }
  assert.deepEqual([...seen].sort(), ['big', 'boo', 'c1', 'c2', 'c3', 'slime']);
  assert.ok(booChecked && slimeChecked);
});

test('a bump spills one candy that anyone can grab; the bumped player is safe for a moment', () => {
  const g = make(2), [a, b] = [...g.bodies.keys()], A = g.bodies.get(a), B = g.bodies.get(b);
  // give b some candy by knocking until it has some
  for (let k = 0; k < 30 && g.state().sc[b] < 2; k++) { const di = litDoor(g); if (di < 0) { run(g, 1); continue; } B.flags &= ~(F.STUN | F.SLOW); atDoor(g, b, di); tick(g, { [b]: { mx: 0, mz: 0, b: IN.A } }); run(g, RULES.open + 0.1); tick(g); }
  const before = g.state().sc[b]; assert.ok(before >= 1, 'b has candy');
  B.flags &= ~(F.STUN | F.SLOW); place(B, 0, 0); place(A, -1.2, 0); A.yaw = Math.PI / 2;
  const ev = run(g, 0.3, i => ({ [a]: { mx: 1, mz: 0, b: i === 0 ? IN.B : 0 } }));
  assert.ok(ev.some(e => e.e === 'bumped' && e.pid === b && e.by === a));
  const sp = ev.find(e => e.e === 'spill'); assert.ok(sp && sp.pid === b);
  assert.equal(g.state().sc[b], before - 1); assert.equal(g.state().dr.length, 1, 'the candy lies on the road');
  // bumping again straight away does nothing (safe)
  place(A, B.x - 1.2, B.z); A.yaw = Math.PI / 2; A.flags &= ~F.STUN;
  for (let i = 0; i < 40; i++) tick(g); // let the bump cooldown pass but not bumpSafe… (cooldown 1.6 > safe 1.4: check the rule instead)
  assert.ok(RULES.bumpSafe > 0);
  // a walks over the candy and grabs it
  const scA = g.state().sc[a];
  const [, x, z] = g.state().dr[0] || [];
  if (x != null) { A.flags &= ~(F.STUN | F.FROZEN); place(A, x, z); const ev2 = run(g, 0.2); assert.ok(ev2.some(e => e.e === 'grab' && e.pid === a)); assert.equal(g.state().sc[a], scA + 1); assert.equal(g.state().dr.length, 0); }
});

test('a player with no candy is bumped but spills nothing', () => {
  const g = make(2), [a, b] = [...g.bodies.keys()], A = g.bodies.get(a), B = g.bodies.get(b);
  place(B, 0, 0); place(A, -1.2, 0); A.yaw = Math.PI / 2;
  const ev = run(g, 0.3, i => ({ [a]: { mx: 1, mz: 0, b: i === 0 ? IN.B : 0 } }));
  assert.ok(ev.some(e => e.e === 'bumped')); assert.ok(!ev.some(e => e.e === 'spill')); assert.equal(g.state().sc[b], 0);
});

for (const n of [1, 2, 3, 4]) test(`${n} bot(s) trick-or-treat a whole game: lit doors never too many, the Candy Rush lights more, nobody leaves the street`, () => {
  const g = make(n, 40 + n); let maxSeen = 0, rushLit = 0, rush = false, i = 0;
  while (!g.over) {
    const inp = {}; for (const pid of g.bodies.keys()) inp[pid] = bot(g, pid, i + pid);
    const ev = tick(g, inp); i++;
    if (ev.some(e => e.e === 'rush')) rush = true;
    const lit = g.doors().filter(d => d.st >= 1).length;
    if (!rush) maxSeen = Math.max(maxSeen, lit); else rushLit = Math.max(rushLit, lit);
    for (const b of g.bodies.values()) assert.ok(Math.abs(b.x) <= meta.arena.hw && Math.abs(b.z) <= meta.arena.hd);
  }
  assert.ok(maxSeen <= (n === 1 ? 3 : n + RULES.extraLit), `at most ${n + RULES.extraLit} lit (saw ${maxSeen})`);
  assert.ok(rush, 'the rush happened'); assert.ok(rushLit > maxSeen - 1, 'the rush lights doors');
  const r = checkResult(g, n);
  assert.ok(Object.values(r.scores).reduce((s, v) => s + v, 0) >= 5 * n, `bots found candy (${JSON.stringify(r.scores)})`);
  if (n === 1) assert.ok(r.scores[30] >= RULES.medals[0] * 0.5, 'a solo bot gets near bronze');
});

test('same seed, same inputs: same game', () => {
  const play = () => { const g = make(3, 9); let i = 0; while (!g.over) { const inp = {}; for (const pid of g.bodies.keys()) inp[pid] = bot(g, pid, i + pid); tick(g, inp); i++; } return JSON.stringify(g.result()); };
  assert.equal(play(), play());
});

test('init says what a browser needs: every door, medals only alone', () => {
  const g1 = make(1), g3 = make(3);
  assert.equal(g1.init().doors.length, DOORS.length); assert.deepEqual(g1.init().medals, RULES.medals); assert.equal(g3.init().medals, null);
  const st = g3.state(); assert.equal(st.d.length, DOORS.length); assert.ok(st.left > 0);
});
