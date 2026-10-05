// Frame watchdog: counts long frames and names what ran inside them.
//
// The owner's top complaint (play-test 1, P1) was 2-3 second freezes while walking with "no visible cause".
// A freeze is a frame that took too long, so this module keeps two things:
//   * named SPANS — `perf.span('zone:scatter', () => …)` or `const end = perf.begin('zone:parse'); …; end()` —
//     around every heavy piece of work (zone streaming, town/scatter builds, model builds, shader compiles), and
//   * a LONG-FRAME log — every frame longer than `longMs` (100 ms by default) is recorded with the spans that ran
//     since the previous frame, biggest first, so "what froze?" has an answer in `tv.perf()`.
// A `longtask` PerformanceObserver (Chromium) also catches main-thread tasks that ran outside the frame loop.
// It never throws and costs a couple of array pushes per span.
//
//   import { perf } from './perf.js'
//   perf.frame(now)                   // once per requestAnimationFrame, first thing
//   perf.stats()                      // { longFrames, worstMs, frames, programs, recent: [...] }

const now = () => performance.now();

export function createPerf({ longMs = 100, keepSpans = 400, keepLong = 40 } = {}) {
  const spans = [];             // { name, t0, ms }
  const long = [];              // { at, ms, spans: [[name, ms]], tasks: [ms] }
  const tasks = [];             // longtask entries { t0, ms }
  const totals = new Map();     // name -> { n, ms, max }
  let links = 0, linksAtReset = 0, frameStart = 0, maxBusy = 0, busyLong = 0;
  const busyList = [];
  const frameSpans = [];        // [start, end] of each frame callback: a long task holding one is a frame (GPU wait included)
  let last = 0, frames = 0, longFrames = 0, worstMs = 0, warmUntil = 0, programs = 0, programsAtWarm = 0;

  function record(name, t0, ms) {
    spans.push({ name, t0, ms });
    if (spans.length > keepSpans) spans.shift();
    let t = totals.get(name);
    if (!t) { t = { n: 0, ms: 0, max: 0 }; totals.set(name, t); }
    t.n++; t.ms += ms; if (ms > t.max) t.max = ms;
  }
  try {
    if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      new PerformanceObserver(list => { for (const e of list.getEntries()) { tasks.push({ t0: e.startTime, ms: e.duration }); if (tasks.length > 200) tasks.shift(); } }).observe({ type: 'longtask', buffered: false });
    }
  } catch { /* no observer: spans still work */ }

  const p = {
    longMs,
    /** Time a synchronous block. Returns what fn returns. */
    span(name, fn) { const t0 = now(); try { return fn(); } finally { record(name, t0, now() - t0); } },
    /** Start timing; call the returned function to stop. */
    begin(name) { const t0 = now(); return () => record(name, t0, now() - t0); },
    /** Call first thing in the frame loop. Frames before `warm()` ends are not counted (boot, the title screen). */
    frame(t = now()) {
      const ms = last ? t - last : 0;
      frames++;
      if (last && ms > longMs && t > warmUntil && !document.hidden) {
        longFrames++; worstMs = Math.max(worstMs, ms);
        const from = Math.min(last, frameStart || last);   // the previous frame's start, on the page clock
        const inside = spans.filter(s => s.t0 >= from - 1).sort((a, b) => b.ms - a.ms).slice(0, 8).map(s => [s.name, Math.round(s.ms)]);
        const lt = tasks.filter(x => x.t0 >= from - 1).map(x => Math.round(x.ms));
        long.push({ at: Math.round(t), ms: Math.round(ms), spans: inside, tasks: lt });
        if (long.length > keepLong) long.shift();
      }
      last = t; frameStart = now();
    },
    /** Call last thing in the frame loop: how long the frame's own JS kept the main thread (excludes waiting on the GPU). */
    frameEnd(t = now()) {
      const busy = t - frameStart;
      frameSpans.push([frameStart, t]); if (frameSpans.length > 600) frameSpans.shift();
      if (busy > maxBusy) maxBusy = busy;
      if (busy > longMs && t > warmUntil) { busyLong++; busyList.push({ at: Math.round(t), ms: Math.round(busy), spans: spans.filter(s => s.t0 >= frameStart - 1).sort((a, b) => b.ms - a.ms).slice(0, 8).map(s => [s.name, Math.round(s.ms)]) }); if (busyList.length > keepLong) busyList.shift(); }
    },
    /** Ignore long frames for `ms` from now (a loading screen is allowed to be slow). */
    quiet(ms) { warmUntil = Math.max(warmUntil, now() + ms); },
    /** Reset the counters (a test starts measuring from here). */
    reset() { long.length = 0; longFrames = 0; worstMs = 0; frames = 0; totals.clear(); tasks.length = 0; frameSpans.length = 0; maxBusy = 0; busyLong = 0; busyList.length = 0; programsAtWarm = programs; linksAtReset = links; },
    setPrograms(n) { programs = n; },
    /** Count shader links on a WebGL context (each one is a compile; a burst of them is a freeze). */
    hookGl(gl) {
      if (!gl || gl.__tvHooked) return;
      const link = gl.linkProgram.bind(gl);
      gl.linkProgram = prog => { links++; const t0 = now(); link(prog); record('gl:link', t0, now() - t0); };
      gl.__tvHooked = true;
    },
    /** Main-thread stalls: frames whose own JS ran longer than longMs, plus long tasks outside the frame loop. */
    stalls() {
      // a long task that contains a frame callback is that frame: its own JS is busyLong above, and the rest is the
      // browser waiting on the GPU (on a software rasteriser every frame is a "long task"). The ones that matter
      // here are tasks with NO frame in them — page work that ran between frames (a zone build, a body, a read-back).
      const outside = tasks.filter(x => x.t0 > warmUntil && x.ms > longMs && !frameSpans.some(([a, b]) => a >= x.t0 - 1 && b <= x.t0 + x.ms + 1));
      return { busyLong, maxBusyMs: Math.round(maxBusy), frames: busyList.slice(-12), longTasks: outside.length, maxTaskMs: Math.round(outside.reduce((a, x) => Math.max(a, x.ms), 0)) };
    },
    stats() {
      const top = [...totals.entries()].sort((a, b) => b[1].max - a[1].max).slice(0, 16).map(([name, t]) => ({ name, n: t.n, ms: Math.round(t.ms), max: Math.round(t.max) }));
      return { longFrames, worstMs: Math.round(worstMs), frames, programs, links: links - linksAtReset, newPrograms: programs - programsAtWarm, recent: long.slice(-12), top };
    },
  };
  return p;
}

/** The page's one watchdog (modules import this rather than passing it around). */
export const perf = createPerf();

/** Wait for the next frame — slice a long build so each piece lands in its own frame. */
export const nextFrame = () => new Promise(r => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 16)));

/**
 * A per-frame work budget for builds that can be cut into pieces: `await budget.slice()` between pieces yields
 * to the next frame once `ms` of work has been done in this one.
 */
export function createBudget(ms = 6) {
  let start = now();
  return {
    async slice() { if (now() - start >= ms) { await nextFrame(); start = now(); } },
    reset() { start = now(); },
  };
}

/**
 * Compile an object's shaders before it is first drawn (P1). With KHR_parallel_shader_compile (desktop Chrome on
 * most GPUs) compileAsync waits until the driver has finished, off the main thread. Without it, three links the
 * program and the FIRST DRAW blocks while the GPU process finishes — 1.5-3 s on a software renderer — so when new
 * programs were made we wait a moment before showing the object: the link finishes in the GPU process meanwhile
 * and the first draw finds it done. Never throws; resolves after `maxMs` at most.
 */
export async function compileBeforeShow(renderer, obj, camera, scene, { maxMs = 3000, settleMs = 1500 } = {}) {
  if (!renderer?.compileAsync || !obj) return false;
  const t0 = now(), before = renderer.info.programs?.length || 0;
  try { await Promise.race([renderer.compileAsync(obj, camera, scene), new Promise(r => setTimeout(r, maxMs))]); } catch { return false; }
  const made = (renderer.info.programs?.length || 0) > before;
  if (made && !renderer.extensions.has('KHR_parallel_shader_compile')) await new Promise(r => setTimeout(r, Math.max(0, Math.min(settleMs, maxMs - (now() - t0)))));
  return made;
}
