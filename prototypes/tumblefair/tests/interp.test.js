// Other players drawn from the server's updates over a bad line: delay, jitter and the odd lost update.
// The old two-update slide left them frozen ~90% of frames and 330-650 ms behind; these are the numbers it must beat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServerClock, createTrack } from '../js/client/interp.js';

function run({ delay = 30, jitter = 0, loss = 0, seconds = 12, speed = 5 }) {
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const clock = createServerClock(), track = createTrack();
  const arrivals = [];
  for (let k = 0; k < seconds * 20; k++) { if (rnd() < loss) continue; arrivals.push({ k, at: k * 50 + delay + rnd() * jitter, b: { x: k * 0.05 * speed, z: 0, y: 0, yaw: 0, vx: speed, vz: 0, flags: 0 } }); }
  arrivals.sort((a, b) => a.at - b.at);       // (TCP keeps order; a late one just holds the others back)
  for (let i = 1; i < arrivals.length; i++) arrivals[i].at = Math.max(arrivals[i].at, arrivals[i - 1].at);
  let i = 0, prev = null, frozen = 0, n = 0, behind = 0, worst = 0, back = 0;
  for (let now = 0; now < seconds * 1000; now += 1000 / 60) {
    while (i < arrivals.length && arrivals[i].at <= now) { clock.sample(arrivals[i].k, arrivals[i].at); track.push(arrivals[i].k, arrivals[i].b); i++; }
    const b = track.at(clock.renderTick(now, 1000 / 60)); if (!b) continue;
    if (now > 2000) {
      const truth = now / 1000 * speed, lag = (truth - b.x) / speed * 1000;
      behind += lag; worst = Math.max(worst, lag); n++;
      if (prev != null && Math.abs(b.x - prev) < 1e-6) frozen++;
      if (prev != null && b.x < prev - 1e-6) back++;
    }
    prev = b.x;
  }
  return { avg: behind / n, worst, frozen: frozen / n, back: back / n };
}

test('a clean line: others move every frame and are drawn about one tick + the line behind', () => {
  const r = run({ delay: 30 });
  assert.ok(r.frozen < 0.02, `frozen ${r.frozen}`);
  assert.ok(r.avg < 130, `avg ${r.avg}`);
  assert.equal(r.back, 0);
});
test('a jittery phone on wifi (0-60 ms extra): still smooth, and never further back than it needs to be', () => {
  const r = run({ delay: 40, jitter: 60 });
  assert.ok(r.frozen < 0.05, `frozen ${r.frozen}`);
  assert.ok(r.avg < 220, `avg ${r.avg}`);
  assert.ok(r.back < 0.02, `backwards ${r.back}`);
});
test('lost updates (5%): the gap is bridged by carrying on at the last speed', () => {
  const r = run({ delay: 40, jitter: 20, loss: 0.05 });
  assert.ok(r.frozen < 0.05, `frozen ${r.frozen}`);
  assert.ok(r.avg < 200, `avg ${r.avg}`);
});
test('a respawn (a jump of more than 3 m) is not slid across', () => {
  const t = createTrack();
  t.push(1, { x: 0, z: 0, y: 0, yaw: 0, vx: 0, vz: 0 }); t.push(2, { x: 10, z: 0, y: 0, yaw: 0, vx: 0, vz: 0 });
  assert.equal(t.at(1.3).x, 0); assert.equal(t.at(1.7).x, 10);
});
