// Oathwild — the lag recorder (owner 2026-11-26: "severe stalls/lag on desktop … How can we capture that info to
// investigate?"). Always on and cheap: the last two minutes of frame times, and every stall (a frame of 50 ms or more)
// with what was going on in it, so a "Send a lag report" from the ☰ menu (ui/win-lag.js) carries real evidence.
//
//   const lag = createLagMeter(app, view)       (play.js, once per world)
//   lag.begin(t)  … game update …  lag.mid()  … view.render() …  lag.end()       (every frame)
//   lag.note('what')                            mark an event in the current frame (a tile built, a model loaded…)
//   lag.summary()                               the short numbers (every bug report carries them too)
//   lag.report()                                the whole record for a lag report (≈ 40 KB of JSON)
//
// What a stall row says (each one helps point at a cause):
//   ms / update / render   the frame, the game's own work (input, network, sim, HUD) and the drawing of the picture
//   programs               new shader programs compiled this frame (a shader compile is the classic 100-500 ms stall)
//   geometries / textures  new GPU buffers or pictures uploaded this frame (a model or a ground tile loaded)
//   heapMB                 the change in memory (a big drop = the browser cleaning up memory: a "GC" pause)
//   calls / tris           draw calls and triangles that frame (a sudden jump = a lot of new things in view)
//   notes                  events other code marked with lag.note()
//   scripts                Chrome only: the scripts that ran long in that frame (long-animation-frame timing)
//   gap                    true when the page was hidden or the tab was in the background (not a real stall)

const SEC = 120, CAP = SEC * 75;                      // two minutes at up to 75 frames a second
const STALL_MS = 50, KEEP_STALLS = 200;

export function createLagMeter(app, view) {
  const renderer = view.renderer;
  const ms = new Float32Array(CAP), up = new Float32Array(CAP);
  let n = 0, head = 0;                               // ring buffer of frame times (total, update)
  const stalls = [];
  const notes = [];
  let t0 = 0, tMid = 0, lastEnd = 0, hiddenAt = 0;
  let last = snapInfo();
  const started = performance.now();
  const scripts = [];                                // long-animation-frame entries (Chrome 123+)
  let po = null;

  try {
    po = new PerformanceObserver(list => {
      for (const e of list.getEntries()) {
        if (e.duration < STALL_MS) continue;
        scripts.push({ at: e.startTime, ms: Math.round(e.duration), blocking: Math.round(e.blockingDuration || 0),
          s: (e.scripts || []).slice(0, 4).map(s => ({ ms: Math.round(s.duration), fn: s.sourceFunctionName || '', src: shortSrc(s.sourceURL), kind: s.invokerType || '' })) });
        if (scripts.length > 300) scripts.shift();
      }
    });
    po.observe({ type: 'long-animation-frame', buffered: false });
  } catch { /* not Chrome: the stall rows still carry everything else */ }
  const onVis = () => { if (document.hidden) hiddenAt = performance.now(); };
  addEventListener('visibilitychange', onVis);

  function snapInfo() {
    const i = renderer?.info || {};
    return { programs: i.programs?.length ?? 0, geometries: i.memory?.geometries ?? 0, textures: i.memory?.textures ?? 0,
      heap: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null };
  }

  const lag = {
    begin(t) { t0 = performance.now(); },
    mid() { tMid = performance.now(); },
    note(what) { notes.push({ at: performance.now(), what: String(what).slice(0, 80) }); if (notes.length > 400) notes.shift(); },
    end() {
      const now = performance.now();
      const frame = lastEnd ? now - lastEnd : 16.7;     // wall time since the last frame ended = what the player felt
      lastEnd = now;
      const update = (tMid || now) - t0;
      ms[head] = frame; up[head] = update; head = (head + 1) % CAP; n = Math.min(CAP, n + 1);
      const info = snapInfo();
      if (frame >= STALL_MS && now - started > 1500) {
        const gap = document.hidden || (hiddenAt && now - hiddenAt < frame + 50);
        const ri = renderer?.info?.render || {};
        const me = app.play?.me?.() ?? null;
        const row = {
          at: Math.round((now - started) / 100) / 10, ms: Math.round(frame), update: Math.round(update), render: Math.round(now - (tMid || now)),
          programs: info.programs - last.programs, geometries: info.geometries - last.geometries, textures: info.textures - last.textures,
          heapMB: info.heap != null && last.heap != null ? Math.round((info.heap - last.heap) * 10) / 10 : null,
          calls: ri.calls ?? null, tris: ri.triangles ?? null,
          notes: notes.filter(x => x.at > now - frame - 5).map(x => x.what),
          scripts: scripts.filter(s => s.at > now - frame - 120 && s.at < now + 5).flatMap(s => s.s).slice(0, 4),
          where: me ? [Math.round(me.x), Math.round(me.z)] : null,
          quality: app.settings?.quality ?? null,
        };
        if (gap) row.gap = true;
        stalls.push(row); if (stalls.length > KEEP_STALLS) stalls.shift();
      }
      last = info;
    },
    frames() { const out = []; for (let i = 0; i < n; i++) { const k = (head - n + i + CAP) % CAP; out.push(Math.round(ms[k])); } return out; },
    summary() {
      const f = lag.frames().filter(x => x > 0).sort((a, b) => a - b);
      const real = stalls.filter(s => !s.gap);
      const q = p => f.length ? f[Math.min(f.length - 1, Math.floor(f.length * p))] : null;
      return {
        seconds: Math.round(f.reduce((s, x) => s + x, 0) / 1000), fps: q(0.5) ? Math.round(1000 / q(0.5)) : null,
        frameMs: { median: q(0.5), p95: q(0.95), p99: q(0.99), worst: f[f.length - 1] ?? null },
        stalls: { total: real.length, over100: real.filter(s => s.ms >= 100).length, over250: real.filter(s => s.ms >= 250).length,
          withCompile: real.filter(s => s.programs > 0).length, withUploads: real.filter(s => s.geometries > 0 || s.textures > 0).length,
          withMemoryDrop: real.filter(s => s.heapMB != null && s.heapMB < -8).length, mostlyUpdate: real.filter(s => s.update > s.render).length },
      };
    },
    stalls: () => stalls.slice(),
    stop() { try { po?.disconnect(); } catch { /* gone */ } removeEventListener('visibilitychange', onVis); },
    report() {
      const ri = renderer?.info || {};
      return {
        lag: {
          summary: lag.summary(), stalls: stalls.slice(-KEEP_STALLS), frames: lag.frames(),
          gpu: gpuName(renderer), pixelRatio: renderer?.getPixelRatio?.() ?? null, size: renderer ? [renderer.domElement.width, renderer.domElement.height] : null,
          programs: ri.programs?.length ?? null, geometries: ri.memory?.geometries ?? null, textures: ri.memory?.textures ?? null,
          heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, cores: navigator.hardwareConcurrency || null,
          deviceMemoryGB: navigator.deviceMemory || null, settings: app.settings ?? null, chromeScripts: scripts.length > 0,
        },
      };
    },
  };
  return lag;
}

function shortSrc(u) { if (!u) return ''; try { const p = new URL(u).pathname; return p.split('/').slice(-3).join('/'); } catch { return String(u).slice(-60); } }
function gpuName(renderer) {
  try { const gl = renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch { return null; }
}
