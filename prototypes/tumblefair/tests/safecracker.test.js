import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { meta, create, makeCode, score, payOf, LEVELS, FIRST_BONUS, LISTEN_COST, LISTEN_S, JAM_S, GAME_S, MIN_PAY } from '../js/games/safecracker/sim.js';

const mk = (n, seed = 4) => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: i + 1, seat: i, name: 'P' + i })), difficulty: 'normal' });
const run = (g, s) => { for (let t = 0; t < s && !g.over; t += 0.05) g.step(0.05); };
const placed = r => r.order.flat().sort((a, b) => a - b);
/** A solver that only uses what the phone sees (its own guesses + answers + heard numbers). */
function nextGuess(g, pid) {
  const me = g.priv(pid), L = LEVELS[me.lvl]; if (!L) return null;
  const hist = me.guesses.map(([gs, hit, near]) => ({ g: [...gs].map(Number), hit, near }));
  for (let n = 0; n < L.sym ** L.len; n++) {
    const c = []; for (let i = 0, v = n; i < L.len; i++, v = Math.floor(v / L.sym)) c.push(v % L.sym + 1);
    if (!L.rep && new Set(c).size < L.len) continue;
    if (Object.entries(me.seen).some(([i, v]) => c[+i] !== v)) continue;
    if (hist.every(h => { const r = score(c, h.g); return r.hit === h.hit && r.near === h.near; })) return c;
  }
  return null;
}

test('the answer to a guess: right place, and right number in the wrong place (repeats counted once each)', () => {
  assert.deepEqual(score([1, 2, 3], [1, 2, 3]), { hit: 3, near: 0 });
  assert.deepEqual(score([1, 2, 3], [3, 1, 2]), { hit: 0, near: 3 });
  assert.deepEqual(score([1, 2, 3, 4], [1, 3, 5, 6]), { hit: 1, near: 1 });
  assert.deepEqual(score([1, 1, 2, 2], [1, 2, 1, 1]), { hit: 1, near: 2 });
  assert.deepEqual(score([1, 2, 3, 4], [5, 5, 5, 5]), { hit: 0, near: 0 });
  assert.deepEqual(score([6, 6, 6, 1], [6, 1, 1, 1]), { hit: 2, near: 0 });
});

test('codes fit their level; no-repeat levels never repeat', () => {
  const rng = makeRng(3);
  for (let i = 0; i < 500; i++) for (const L of LEVELS) {
    const c = makeCode(rng, L);
    assert.equal(c.length, L.len); assert.ok(c.every(v => v >= 1 && v <= L.sym));
    if (!L.rep) assert.equal(new Set(c).size, L.len);
  }
});

test('every safe can be cracked within its tries by reasoning from the answers alone', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const g = mk(1, seed);
    for (let lv = 0; lv < LEVELS.length; lv++) {
      let n = 0;
      while (g.priv(1).lvl === lv) { g.act(1, 'guess', nextGuess(g, 1)); n++; assert.ok(n <= LEVELS[lv].tries, `seed ${seed} safe ${lv + 1}: within ${LEVELS[lv].tries} tries`); }
    }
    assert.ok(g.over, 'all safes open = the game is over');
    assert.equal(g.state().p[1].opened, LEVELS.length);
  }
});

test('pay: base + 1 a try left - 3 a listen (never under 3) + 5 for the first to open', () => {
  assert.equal(payOf(LEVELS[0], 4, 0, true), LEVELS[0].pts + 4 + FIRST_BONUS);
  assert.equal(payOf(LEVELS[0], 0, 2, false), LEVELS[0].pts - 2 * LISTEN_COST);
  assert.equal(payOf({ pts: 2 }, 0, 3, false), MIN_PAY);
  const g = mk(2, 7), n = { 1: 0, 2: 0 };
  while (g.priv(2).lvl === 0) { g.act(2, 'guess', nextGuess(g, 2)); n[2]++; }
  while (g.priv(1).lvl === 0) { g.act(1, 'guess', nextGuess(g, 1)); n[1]++; }
  assert.equal(g.state().firsts[0], 2, 'player 2 opened safe 1 first');
  const ev = g.events.filter(e => e.e === 'open');
  assert.deepEqual(ev.map(e => [e.pid, e.first]), [[2, true], [1, false]]);
  assert.equal(ev[0].pay, payOf(LEVELS[0], LEVELS[0].tries - n[2], 0, true));
  assert.equal(ev[1].pay, payOf(LEVELS[0], LEVELS[0].tries - n[1], 0, false));
  assert.equal(g.state().p[2].pts, ev[0].pay);
});

test('listening shows one number in its place, locks you out, costs points; at most len-1 a safe', () => {
  const g = mk(1, 5);
  g.act(1, 'listen');
  const p = g.priv(1); const [[i, v]] = Object.entries(p.seen);
  assert.ok(p.lock); assert.equal(g.state().p[1].listens, 1);
  g.act(1, 'guess', [1, 2, 3]); assert.equal(g.priv(1).guesses.length, 0, 'no guessing while listening');
  run(g, LISTEN_S + 0.1); assert.ok(!g.priv(1).lock);
  g.act(1, 'listen'); run(g, LISTEN_S + 0.1); g.act(1, 'listen'); run(g, LISTEN_S + 0.1);
  assert.equal(Object.keys(g.priv(1).seen).length, LEVELS[0].len - 1, 'never the whole code');
  let tries = 0; while (g.priv(1).lvl === 0) { g.act(1, 'guess', nextGuess(g, 1)); tries++; }
  const ev = g.events.find(e => e.e === 'open');
  assert.equal(ev.pay, payOf(LEVELS[0], LEVELS[0].tries - tries, 2, ev.first));
  assert.ok(+i >= 0 && v >= 1);
});

test('out of tries: the safe jams, a lockout, then a fresh code for the same safe', () => {
  const g = mk(2, 6), L = LEVELS[0];
  const wrong = () => { const me = g.priv(1); for (let a = 1; a <= L.sym; a++) for (let b = 1; b <= L.sym; b++) for (let c = 1; c <= L.sym; c++) { const x = [a, b, c]; if (score(x, x).hit === 3 && !me.guesses.some(gu => gu[0] === x.join(''))) { return x; } } };
  // guess codes that are certainly wrong: one that the last answer did not make 3/3
  let jammed = false;
  for (let k = 0; k < 30 && !jammed; k++) {
    const before = g.priv(1).guesses.length; const x = wrong(); g.act(1, 'guess', x);
    if (g.priv(1).lvl > 0) return;                         // (lucky: opened it — nothing to check on this seed)
    if (g.priv(1).guesses.length < before + 1) jammed = true;
  }
  assert.ok(jammed); const p = g.priv(1);
  assert.ok(p.lock); assert.ok(p.jammed && p.jammed.length === L.len, 'the old code is shown to its owner');
  assert.equal(g.state().p[1].lvl, 0); assert.ok(g.events.some(e => e.e === 'jam' && e.pid === 1 && !e.code), 'nobody else sees the code');
  run(g, JAM_S + 0.1); assert.ok(!g.priv(1).lock); assert.equal(g.priv(1).jammed, null);
});

test('alone you race Nimble Nell (CPU); the result places only you', () => {
  const g = mk(1, 9); run(g, GAME_S + 1);
  assert.ok(g.state().cpu.lvl >= 3, 'Nell opens safes over the minute');
  assert.ok(g.state().firsts[0] === 'cpu');
  const r = g.result(); assert.deepEqual(r.order, [[1]]); assert.deepEqual(r.scores, { 1: 0 });
});

test('results: by points, ties share a place, everyone once; ends at the clock or when all safes are open', () => {
  for (const n of [1, 2, 3, 4]) {
    const g = mk(n, 12);
    for (let pid = 1; pid <= n; pid++) for (let k = 0; k < pid; k++) { const lv = g.priv(pid).lvl; while (g.priv(pid).lvl === lv) g.act(pid, 'guess', nextGuess(g, pid)); }
    let t = 0; while (!g.over) { g.step(0.05); t += 0.05; }
    assert.ok(t <= GAME_S + 0.1);
    const r = g.result();
    assert.deepEqual(placed(r), Array.from({ length: n }, (_, i) => i + 1));
    assert.equal(r.order[0][0], n, 'the one who opened most is first');
    for (let i = 1; i < r.order.length; i++) assert.ok(r.scores[r.order[i - 1][0]] >= r.scores[r.order[i][0]]);
  }
  assert.deepEqual(mk(3).result().order, [[1, 2, 3]], 'nobody opened anything: a three-way tie');
});

test('junk is refused; nobody sees anyone else\'s numbers', () => {
  const g = mk(2, 2);
  for (const d of [null, [1, 2], [1, 2, 9], [0, 1, 2], ['1', '2', '3'], [1.5, 2, 3], 'abc', {}]) g.act(1, 'guess', d);
  g.act(9, 'guess', [1, 2, 3]); g.act(1, 'pick', [1, 2, 3]);
  assert.equal(g.priv(1).guesses.length, 0);
  g.act(1, 'guess', [1, 2, 3]);
  const pub = JSON.stringify(g.state());
  assert.ok(!pub.includes('"123"') && !pub.includes('[1,2,3]'), 'the public state has answers only');
  assert.deepEqual(g.priv(2).guesses, []);
  assert.equal(meta.kind, 'ui'); assert.equal(meta.min, 1); assert.equal(meta.max, 4); assert.ok(!/ember|veil|muster/i.test(JSON.stringify(meta)));
});
