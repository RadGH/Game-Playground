// Couch play: the whole match runs in this page. The sim steps at a fixed 1/60 s however fast the screen draws; the
// renderer is handed the last two snapshots and how far between them "now" is, so motion is smooth at any frame rate.
//
// THE SEAM FOR ONLINE PLAY: the renderer and the screens only ever talk to a "match source" with this shape —
//   src.setInput(pid, held)   this device's players' held buttons (online: sent to the server instead)
//   src.tick(dt)              advance (local: run sim steps; online: nothing — snapshots arrive from the socket)
//   src.frame() -> { a, b, k } two snapshots and the blend 0..1 between them
//   src.drain() -> events     one-off events since the last call (punch, out, round …)
//   src.over, src.result(), src.paused (local only), src.dispose()
// An online.js only has to build the same object from the server's 30-a-second snapshots (keep the last two, blend by
// arrival time) and the renderer, HUD and screens work unchanged.
export const STEP = 1 / 60;

export function createLocalSession(sim, opts) {
  const m = sim.createMatch(opts);
  const held = new Map();
  let a = m.snapshot(), b = a, acc = 0, paused = false, disposed = false;
  const out = [];
  function tick(dt) {
    if (paused || disposed) return;
    acc += Math.min(0.25, Math.max(0, dt));
    let n = 0;
    while (acc >= STEP && n < 8) {
      for (const [pid, st] of held) m.input(pid, st);
      m.step(STEP); acc -= STEP; n++;
      if (m.events.length) { out.push(...m.events); m.events.length = 0; }
      a = b; b = m.snapshot();
    }
    if (n === 8) acc = 0;                    // a long stall: drop the backlog rather than fast-forward
  }
  return {
    kind: 'local', match: m, opts,
    setInput(pid, st) { held.set(pid, st); },
    tick,
    frame: () => ({ a, b, k: Math.min(1, acc / STEP) }),
    drain() { return out.splice(0, out.length); },
    get over() { return !!m.over; },
    result: () => m.result(),
    get paused() { return paused; }, set paused(v) { paused = !!v; },
    dispose() { disposed = true; held.clear(); },
  };
}
