// Fixed 60 Hz simulation with render interpolation (docs/10 §4.1). The only file that calls
// requestAnimationFrame — injected, so Node tests drive it by hand.
export const STEP = 1 / 60;
export function createLoop({ tick, render, raf = globalThis.requestAnimationFrame?.bind(globalThis), now = () => performance.now() }) {
  const MAX_STEPS = 5;
  let acc = 0, last = 0, running = false, paused = false, speed = 1;
  const stats = { steps: 0, slowFrames: 0, simMs: 0, frameMs: 0, fps: 60 };
  function frame(t) {
    if (!running) return;
    const dt = last ? Math.min(0.25, (t - last) / 1000) : STEP; last = t;
    if (!paused) acc += dt * speed;
    let n = 0; const s0 = now();
    while (acc >= STEP && n < MAX_STEPS) { tick(); acc -= STEP; n++; }
    if (n === MAX_STEPS && acc >= STEP) { acc = 0; stats.slowFrames++; }
    stats.simMs = now() - s0; stats.steps = n;
    const r0 = now(); render(paused ? 1 : acc / STEP, dt); stats.renderMs = now() - r0;
    stats.frameMs = dt * 1000; stats.fps = stats.fps * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;
    raf(frame);
  }
  return {
    start() { if (running) return; running = true; last = 0; raf(frame); },
    stop() { running = false; },
    pause(on) { paused = on; }, get paused() { return paused; },
    setSpeed(x) { speed = x; },
    stepOnce() { tick(); render(1, STEP); },
    stepRender() { render(1, STEP); },
    stats,
  };
}
