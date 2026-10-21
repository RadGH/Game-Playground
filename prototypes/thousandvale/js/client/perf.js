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
//
// 2026-10-20 (the owner's combat-stutter report) — the PERFORMANCE LOG (perf-log.js keeps it, capped):
//   perf.watch(renderer, scene)       // once: count shader builds and find WHAT each new one was built for
//   perf.afterRender()                // every frame, right after the render: names any shader built in this frame
//   perf.setContext(() => ({ effects, actors }))   // what a stutter record should say about the scene
//   perf.loaded()                     // loading is over: from now on a shader build is a stutter worth reporting
//   perf.traceMaterials(THREE)        // remember where every material was made (?perf=trace, or the panel is on)
//   perf.snapshot() / perf.history()  // the log, and the last 240 frame times (ui/perf-panel.js draws them)
// Every frame over `longMs` goes in the log with the spans that ran, draw calls, triangles, shaders, textures,
// meshes, the JavaScript heap (Chrome), live effects and nearby bodies, and a cause in plain words (perf-log.js
// causeOf: a new shader, page work between frames, memory clean-up, the game's own code, or waiting on the GPU).

import { createPerfLog } from './perf-log.js';

const now = () => performance.now();
const HIST = 240;
const THREE_FILE = /three\.(module|core)\.js|\/perf\.js|\/warmup\.js/;
/** "spells.js:123" — the first place in a stack that is not three.js or this file. */
export function siteOf(stack) {
  for (const line of String(stack || '').split('\n').slice(1)) {
    const m = /([\w.-]+\.m?js):(\d+)(?::\d+)?\)?\s*$/.exec(line.trim());
    if (m && !THREE_FILE.test('/' + m[1])) return `${m[1]}:${m[2]}`;
  }
  return null;
}

export function createPerf({ longMs = 100, keepSpans = 400, keepLong = 40 } = {}) {
  const spans = [];             // { name, t0, ms }
  const long = [];              // { at, ms, spans: [[name, ms]], tasks: [ms] }
  const tasks = [];             // longtask entries { t0, ms }
  const totals = new Map();     // name -> { n, ms, max }
  let links = 0, linksAtReset = 0, frameStart = 0, maxBusy = 0, busyLong = 0;
  const busyList = [];
  const frameSpans = [];        // [start, end] of each frame callback: a long task holding one is a frame (GPU wait included)
  let last = 0, frames = 0, longFrames = 0, worstMs = 0, warmUntil = 0, programs = 0, programsAtWarm = 0;
  let resetAt = 0;              // page clock at the last reset(): long tasks that began before it belong to the run before
  // 2026-10-20: the performance log
  const log = createPerfLog({ cap: 40, compileCap: 40 });
  const hist = new Float32Array(HIST), histBusy = new Float32Array(HIST);
  let hi = 0, lastBusy = null, lastHeapMB = null, loadedAt = Infinity, ctxFn = null;
  let W = null;                 // { renderer, scene, known: Set<program id>, linksSeen, gpu }
  const pending = [];           // shader builds found after this frame's render: they belong to the frame being timed
  const linkSites = [];         // where gl.linkProgram was called from, since the last look
  const heapMB = () => { const m = typeof performance !== 'undefined' && performance.memory; return m && m.usedJSHeapSize ? Math.round(m.usedJSHeapSize / 1048576) : null; };
  const materialSite = new WeakMap();
  let tracing = false;
  /** What a scene object is, for a person: its name path, or its kind, plus what its material looks like. */
  function describe(o, m) {
    const names = [];
    for (let p = o; p && names.length < 3; p = p.parent) if (p.name && !p.isScene) names.push(p.name);
    const bits = [o.isInstancedMesh && 'instanced', o.isSkinnedMesh && 'skinned', o.isBatchedMesh && 'batched', m.transparent && 'see-through', m.blending === 2 && 'glowing', m.map && 'textured', m.vertexColors && 'vertex colours', m.fog === false && 'no fog'].filter(Boolean);
    return `${names.length ? names.reverse().join('/') : 'unnamed ' + o.type} (${m.type}${m.name ? ' "' + m.name + '"' : ''}${bits.length ? ', ' + bits.join(', ') : ''})`;
  }
  /** After a render: which programs are new since the last look, and which objects in the scene use them. */
  function findNew() {
    const r = W.renderer, progs = r.info.programs || [];
    const fresh = progs.filter(pr => !W.known.has(pr.id));
    for (const pr of progs) W.known.add(pr.id);
    const sites = linkSites.splice(0);
    if (!fresh.length) return;
    const byId = new Map(fresh.map(pr => [pr.id, { pr, users: [] }]));
    try {
      W.scene.traverse(o => {
        if (!o.material) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          const cur = r.properties.get(m)?.currentProgram, hit = cur && byId.get(cur.id);
          if (hit && hit.users.length < 3) hit.users.push({ what: describe(o, m), site: materialSite.get(m) || null });
        }
      });
    } catch { /* a scene mid-change: the names stay unknown */ }
    const t = now(), after = t > loadedAt;
    for (const { pr, users } of byId.values()) {
      const u = users[0] || null;
      pending.push({ at: Math.round(t), name: pr.name || 'shader', what: u ? u.what : null, site: (u && u.site) || sites[0] || null, users: users.map(x => x.what), key: String(pr.cacheKey || '').slice(0, 160), afterLoad: after });
    }
  }

  function record(name, t0, ms) {
    spans.push({ name, t0, ms });
    if (spans.length > keepSpans) spans.shift();
    let t = totals.get(name);
    if (!t) { t = { n: 0, ms: 0, max: 0 }; totals.set(name, t); }
    t.n++; t.ms += ms; if (ms > t.max) t.max = ms;
  }
  try {
    if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      // An entry is DELIVERED some time after its task ended. A task that ended just before reset() used to arrive just
      // after it — with the frame span that explains it already wiped — and was reported as "one ~1.8 s task outside
      // the frame loop" (freeze.spec.js, one run in three or four since round 5; ~1.8 s is simply what one frame's wait
      // on the software rasteriser costs on the test VM). Nothing that started before the reset is counted.
      new PerformanceObserver(list => { for (const e of list.getEntries()) { if (e.startTime < resetAt) continue; tasks.push({ t0: e.startTime, ms: e.duration }); if (tasks.length > 200) tasks.shift(); } }).observe({ type: 'longtask', buffered: false });
    }
  } catch { /* no observer: spans still work */ }

  const p = {
    longMs,
    /** What is being compiled right now (compileBeforeShow sets it): names a shader build that has no other trace. */
    building: null,
    /** Time a synchronous block. Returns what fn returns. */
    span(name, fn) { const t0 = now(); try { return fn(); } finally { record(name, t0, now() - t0); } },
    /** Start timing; call the returned function to stop. */
    begin(name) { const t0 = now(); return () => record(name, t0, now() - t0); },
    /** Call first thing in the frame loop. Frames before `warm()` ends are not counted (boot, the title screen). */
    frame(t = now()) {
      const ms = last ? t - last : 0;
      frames++;
      if (last) { hist[hi % HIST] = ms; histBusy[hi % HIST] = lastBusy ?? 0; hi++; }
      const heap = heapMB(), drop = heap != null && lastHeapMB != null ? lastHeapMB - heap : 0;
      const built = pending.splice(0);
      for (const c of built) log.compile({ ...c, frameMs: ms });
      if (last && ms > longMs && t > warmUntil && !document.hidden) {
        longFrames++; worstMs = Math.max(worstMs, ms);
        const from = Math.min(last, frameStart || last);   // the previous frame's start, on the page clock
        const inside = spans.filter(s => s.t0 >= from - 1).sort((a, b) => b.ms - a.ms).slice(0, 8).map(s => [s.name, Math.round(s.ms)]);
        const lt = tasks.filter(x => x.t0 >= from - 1).map(x => Math.round(x.ms));
        long.push({ at: Math.round(t), ms: Math.round(ms), spans: inside, tasks: lt });
        if (long.length > keepLong) long.shift();
        const outside = tasks.some(x => x.t0 >= from - 1 && !frameSpans.some(([a, b]) => a >= x.t0 - 1 && b <= x.t0 + x.ms + 1));
        let ctx = {};
        try { ctx = ctxFn ? ctxFn() || {} : {}; } catch { /* the context is a nice-to-have */ }
        log.stutter({ at: Math.round(t), ms, busyMs: lastBusy, spans: inside.slice(0, 5), tasks: lt.slice(0, 4), outside, compiles: built.map(c => ({ name: c.name, what: c.what, site: c.site })), heapMB: heap, heapDropMB: drop > 0 ? drop : 0, ...p.sceneNow(), ...ctx });
      }
      lastHeapMB = heap;
      last = t; frameStart = now();
    },
    /** Call last thing in the frame loop: how long the frame's own JS kept the main thread (excludes waiting on the GPU). */
    frameEnd(t = now()) {
      const busy = t - frameStart;
      lastBusy = busy;
      frameSpans.push([frameStart, t]); if (frameSpans.length > 600) frameSpans.shift();
      if (busy > maxBusy) maxBusy = busy;
      if (busy > longMs && t > warmUntil) { busyLong++; busyList.push({ at: Math.round(t), ms: Math.round(busy), spans: spans.filter(s => s.t0 >= frameStart - 1).sort((a, b) => b.ms - a.ms).slice(0, 8).map(s => [s.name, Math.round(s.ms)]) }); if (busyList.length > keepLong) busyList.shift(); }
    },
    /** Ignore long frames for `ms` from now (a loading screen is allowed to be slow). */
    quiet(ms) { warmUntil = Math.max(warmUntil, now() + ms); },
    /** Reset the counters (a test starts measuring from here). */
    reset() { long.length = 0; longFrames = 0; worstMs = 0; frames = 0; totals.clear(); tasks.length = 0; frameSpans.length = 0; maxBusy = 0; busyLong = 0; busyList.length = 0; programsAtWarm = programs; linksAtReset = links; resetAt = now(); log.clear(); pending.length = 0; },
    setPrograms(n) { programs = n; },
    /** Count shader links on a WebGL context (each one is a compile; a burst of them is a freeze). */
    hookGl(gl) {
      if (!gl || gl.__tvHooked) return;
      const link = gl.linkProgram.bind(gl);
      gl.linkProgram = prog => {
        links++; const t0 = now(); link(prog); record('gl:link', t0, now() - t0);
        if (linkSites.length < 8) { try { linkSites.push(siteOf(new Error().stack) || p.building || null); } catch { /* fine */ } }
      };
      gl.__tvHooked = true;
    },
    /** Count shader builds on this renderer and name what each new one was built for (afterRender). */
    watch(renderer, scene) {
      if (!renderer || W) return;
      p.hookGl(renderer.getContext());
      let gpu = null;
      try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER)); } catch { /* hidden by the browser */ }
      W = { renderer, scene, known: new Set((renderer.info.programs || []).map(pr => pr.id)), linksSeen: links, gpu: gpu ? gpu.slice(0, 140) : null };
    },
    /** Right after the frame's render. Costs one comparison unless a shader was built. */
    afterRender() { if (!W || links === W.linksSeen) return; W.linksSeen = links; findNew(); },
    /** Loading is over: shader builds from here on are reported as "while playing". */
    loaded() { loadedAt = Math.min(loadedAt, now()); },
    setContext(fn) { ctxFn = fn; },
    /** Draw calls, triangles, shaders, textures and meshes of the last frame. */
    sceneNow() {
      const i = W?.renderer?.info; if (!i) return {};
      return { draws: i.render?.calls ?? null, tris: i.render?.triangles ?? null, programs: i.programs?.length ?? null, textures: i.memory?.textures ?? null, geometries: i.memory?.geometries ?? null };
    },
    /** Remember where each material is made (a stack per material: only while someone is looking). */
    traceMaterials(THREE) {
      if (tracing || !THREE?.Material) return; tracing = true;
      const store = new WeakMap();
      try {
        Object.defineProperty(THREE.Material.prototype, 'uuid', { configurable: true, get() { return store.get(this); }, set(v) {
          store.set(this, v);
          if (!materialSite.has(this)) { const lim = Error.stackTraceLimit; Error.stackTraceLimit = 14; try { materialSite.set(this, siteOf(new Error().stack)); } catch { /* fine */ } Error.stackTraceLimit = lim; }
        } });
      } catch { tracing = false; }
    },
    get tracing() { return tracing; },
    /** The last HIST frame times, oldest first: { ms: number[], busy: number[] }. */
    history() {
      const n = Math.min(hi, HIST), ms = new Array(n), busy = new Array(n);
      for (let k = 0; k < n; k++) { const j = (hi - n + k) % HIST; ms[k] = hist[j]; busy[k] = histBusy[j]; }
      return { ms, busy };
    },
    /** The performance log, with what the page knows about the machine. */
    snapshot(extra = {}) { return log.snapshot({ now: Math.round(now()), longMs, readyMs: Number.isFinite(loadedAt) ? Math.round(loadedAt) : null, gpu: W?.gpu || null, parallel: !!W?.renderer?.extensions?.has?.('KHR_parallel_shader_compile'), scene: { ...p.sceneNow(), heapMB: heapMB() }, ...extra }); },
    log,
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
  // (the links happen inside compileAsync's first, synchronous part: name them after what is being compiled)
  perf.building = `${obj.name || obj.userData?.kind || obj.type} (compiled before it is shown)`;
  let job;
  try { job = renderer.compileAsync(obj, camera, scene); } catch { perf.building = null; return false; }
  perf.building = null;
  try { await Promise.race([job, new Promise(r => setTimeout(r, maxMs))]); } catch { return false; }
  const made = (renderer.info.programs?.length || 0) > before;
  if (made && !renderer.extensions.has('KHR_parallel_shader_compile')) await new Promise(r => setTimeout(r, Math.max(0, Math.min(settleMs, maxMs - (now() - t0)))));
  return made;
}
