// 2026-10-20 — the performance log (js/client/perf-log.js) and the watchdog's new parts (js/client/perf.js): the shape of
// an entry, the caps, the cause in plain words, the bug-report lines and the server's limits for them.
//   node --test tests/D/perf-log.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPerfLog, causeOf, reportLines, reportText, stutterLine, spanWords, PERF_REPORT_LINES, PERF_LINE_MAX } from '../../js/client/perf-log.js';
import { createPerf, siteOf } from '../../js/client/perf.js';
import { sanitize, FEEDBACK } from '../../js/sim/feedback.js';
import { feedbackPreview } from '../../js/client/ui/pt5-core.js';

test('a cause in plain words, most certain first', () => {
  assert.equal(causeOf({ ms: 1530, busyMs: 1520, compiles: [{ name: 'MeshBasicMaterial', what: 'unnamed Mesh (MeshBasicMaterial, glowing)' }] }).code, 'shader');
  assert.match(causeOf({ ms: 1530, busyMs: 1520, compiles: [{ what: 'a fire ring' }] }).text, /new graphics shader.*a fire ring/);
  assert.match(causeOf({ ms: 900, compiles: [{ what: 'a' }, { what: 'b' }] }).text, /2 new graphics shaders/);
  assert.equal(causeOf({ ms: 400, busyMs: 10, tasks: [380], outside: true }).code, 'outside');
  assert.equal(causeOf({ ms: 300, busyMs: 200, heapDropMB: 60 }).code, 'gc');
  const w = causeOf({ ms: 300, busyMs: 280, spans: [['zone:scatter', 240], ['render', 20]] });
  assert.equal(w.code, 'work'); assert.match(w.text, /loading a piece of the world \(240 ms\)/);
  assert.match(causeOf({ ms: 300, busyMs: 280, spans: [['render', 260]], draws: 900 }).text, /Drawing the frame took 260 ms \(900 draw calls/);
  const g = causeOf({ ms: 1800, busyMs: 12, spans: [['render', 9]] });
  assert.equal(g.code, 'gpu'); assert.match(g.text, /Waiting on the graphics card.*12 ms of a 1800 ms frame/);
  assert.equal(causeOf({ ms: 120, busyMs: 50 }).code, 'unknown');
  assert.equal(causeOf({ ms: 130, busyMs: 90 }).code, 'work');
  assert.equal(spanWords('zone:town'), 'loading a piece of the world');
  assert.equal(spanWords('something:new'), 'something:new');
});

test('the log is capped and counts by cause', () => {
  const log = createPerfLog({ cap: 5, compileCap: 3 });
  for (let i = 0; i < 12; i++) log.stutter({ at: i * 1000, ms: 150 + i, busyMs: 10 });
  for (let i = 0; i < 7; i++) log.compile({ at: i, name: 'P' + i, what: 'thing', afterLoad: i > 2 });
  const s = log.snapshot({ fps: 40 });
  assert.equal(s.stutters.length, 5); assert.equal(s.compiles.length, 3);
  assert.equal(s.counts.stutters, 12); assert.equal(s.counts.compiles, 7); assert.equal(s.counts.compilesAfterLoad, 4);
  assert.equal(s.counts.worstMs, 161); assert.equal(s.counts.byCause.gpu, 12);
  assert.equal(s.stutters[0].ms, 157, 'the oldest go first');
  for (const x of s.stutters) assert.ok(x.cause && x.cause.code && x.cause.text, 'every stutter carries its cause');
  assert.equal(s.fps, 40); assert.equal(s.v, 1);
  s.stutters[0].ms = 0; assert.equal(log.stutters[0].ms, 157, 'a snapshot is a copy');
  log.clear(); assert.equal(log.snapshot().counts.stutters, 0);
});

test('the bug report lines: a header, newest first, capped in count and length; the copy text reads plainly', () => {
  const log = createPerfLog();
  for (let i = 0; i < 30; i++) log.stutter({ at: 1000 + i * 100, ms: 200, busyMs: 190, spans: [['zone:scatter' + 'x'.repeat(400), 180]], draws: 500, programs: 80 });
  log.compile({ at: 5000, name: 'MeshBasicMaterial', what: 'unnamed Mesh (MeshBasicMaterial, glowing)', site: 'spellfx.js:310', frameMs: 1530, afterLoad: true });
  log.compile({ at: 10, name: 'MeshStandardMaterial', what: 'terrain', afterLoad: false });
  const snap = log.snapshot({ fps: 55, gpu: 'ANGLE (NVIDIA, Direct3D11)', parallel: true, now: 9000 });
  const L = reportLines(snap);
  assert.ok(L.length <= PERF_REPORT_LINES);
  for (const l of L) assert.ok(l.length <= PERF_LINE_MAX, 'line too long: ' + l.length);
  assert.match(L[0], /fps 55 · worst 200 ms · 30 stutters · 1 shaders built after load · ANGLE/);
  assert.match(L[1], /^4 s ago: shader MeshBasicMaterial for unnamed Mesh \(MeshBasicMaterial, glowing\) \(spellfx\.js:310\), frame 1530 ms$/, 'the newest entry comes first: ' + L[1]);
  assert.ok(!L.some(l => /terrain/.test(l)), 'shaders built while loading are not reported as stutters');
  const T = reportText(snap);
  assert.match(T, /^Thousandvale performance report/);
  assert.match(T, /Graphics card \(as the browser names it\): ANGLE/);
  assert.match(T, /Shaders built while playing/);
  assert.match(stutterLine(snap.stutters[0]), /^200 ms — The game's own work/);
});

test('the server keeps the performance log of a bug report, inside its size limit', () => {
  const perf = Array.from({ length: 40 }, (_, i) => 'stutter ' + i + ' ' + 'y'.repeat(300));
  const c = sanitize({ name: 'Aldra', perf, logs: Array.from({ length: 60 }, () => 'z'.repeat(300)) });
  assert.ok(JSON.stringify(c).length <= FEEDBACK.ctxMax);
  assert.ok(Array.isArray(c.perf) && c.perf.length >= 1 && c.perf.length <= FEEDBACK.perfLines);
  for (const l of c.perf) assert.ok(l.length <= FEEDBACK.perfLine);
  assert.match(c.perf[0], /^stutter 0 /, 'the header line (the first) is the one kept longest');
  // a normal report keeps it whole
  const small = sanitize({ name: 'Aldra', perf: ['fps 60 · worst 120 ms', 'stutter 1'], logs: ['a', 'b'] });
  assert.deepEqual(small.perf, ['fps 60 · worst 120 ms', 'stutter 1']);
  assert.deepEqual(feedbackPreview(small).perf, small.perf, 'the admin view reads it');
  assert.deepEqual(feedbackPreview(small).log, ['a', 'b'], 'and the stored log (`logs`) too');
});

test('the watchdog: a long frame goes in the log with its spans and scene numbers; shader builds are named', () => {
  globalThis.document ||= { hidden: false };
  const realNow = performance.now.bind(performance);
  let t = realNow() + 60000;
  performance.now = () => t;
  try {
    const p = createPerf({ longMs: 100 });
    // a fake renderer + scene: one program appears after a render, used by one named mesh
    const prog = { id: 7, name: 'MeshBasicMaterial', cacheKey: 'abc' };
    const mat = { type: 'MeshBasicMaterial', name: '', transparent: true, blending: 2 };
    const props = new WeakMap([[mat, { currentProgram: prog }]]);
    const mesh = { type: 'Mesh', name: 'fire-ring', material: mat, parent: null };
    const scene = { isScene: true, traverse(fn) { fn(mesh); } };
    let linked = 0;
    const gl = { linkProgram() { linked++; }, getExtension: () => null, getParameter: () => 'Test GPU', RENDERER: 1 };
    const renderer = { info: { programs: [], render: { calls: 321, triangles: 4567 }, memory: { textures: 12, geometries: 34 } }, properties: { get: m => props.get(m) }, extensions: { has: () => false }, getContext: () => gl };
    p.watch(renderer, scene);
    p.setContext(() => ({ effects: 9, actors: 14 }));
    p.loaded();
    p.frame(t); p.frameEnd(t + 5);
    t += 16;
    p.frame(t);
    // the slow frame: a program is linked during the render
    gl.linkProgram({}); renderer.info.programs.push(prog);
    t += 1500; p.afterRender(); p.frameEnd(t);
    t += 20; p.frame(t);
    const s = p.snapshot();
    assert.equal(linked, 1, 'the real linkProgram still runs');
    assert.equal(s.compiles.length, 1);
    assert.equal(s.compiles[0].what, 'fire-ring (MeshBasicMaterial, see-through, glowing)');
    assert.equal(s.compiles[0].afterLoad, true);
    assert.equal(s.stutters.length, 1);
    const st = s.stutters[0];
    assert.equal(st.cause.code, 'shader');
    assert.equal(st.draws, 321); assert.equal(st.textures, 12); assert.equal(st.effects, 9); assert.equal(st.actors, 14);
    assert.equal(s.gpu, 'Test GPU');
    const h = p.history();
    assert.equal(h.ms.length, 2); assert.equal(Math.round(h.ms[1]), 1520);
  } finally { performance.now = realNow; }
});

test('siteOf names the first file in a stack that is not three.js or the watchdog', () => {
  const st = 'Error\n    at set (http://x/js/client/perf.js:120:5)\n    at new Material (http://x/vendor/three/three.core.js:21110:8)\n    at new MeshBasicMaterial (http://x/vendor/three/three.core.js:22000:3)\n    at ring (http://x/avatar-3d/js/spellfx.js:310:20)\n    at y (http://x/js/client/spells.js:99:1)';
  assert.equal(siteOf(st), 'spellfx.js:310');
  assert.equal(siteOf('Error\n    at http://x/vendor/three/three.module.js:1:1'), null);
});
