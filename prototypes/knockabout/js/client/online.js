// An online match as a "match source" (the same object js/client/local.js builds for couch play), so the renderer,
// the HUD and the screens work unchanged:
//   src.setInput(pid, held)  this device's players' held buttons -> sent to the server (other pids are ignored)
//   src.tick(dt)             sends the input; snapshots arrive from the socket by themselves
//   src.frame() -> { a, b, k } two snapshots and the blend between them, drawn a little in the past (see below)
//   src.drain() -> events    one-off events whose snapshot has been reached on screen (so a poof lines up with the fall)
//   src.over, src.result(), src.paused (always false: an online match does not stop for one person), src.dispose()
//
// Smoothness: the server steps at 60 a second and sends every 2nd step (30 a second), numbered by its step count. The
// page keeps a short list of snapshots and a clock that maps its own time onto the server's steps (Tumblefair's
// lesson, js/client/interp.js: follow the EARLIEST arrivals, which are the line's real delay without the hiccups, and
// measure how much later than that snapshots usually come — the jitter). Everyone is drawn at
// `server time - (one snapshot gap + jitter)`: far enough back that the two snapshots to blend between have almost
// always arrived, and no further. Nothing is predicted: floppy physics hides a few tens of milliseconds well, and a
// predicted ragdoll that is then corrected looks far worse than one drawn 60 ms late.
import { unpack } from '../net/pack.js';
import { STEP_HZ, SNAP_EVERY, toBits } from '../net/protocol.js';

const STEP_MS = 1000 / STEP_HZ, GAP_MS = STEP_MS * SNAP_EVERY;

export function createOnlineSession(net, start, { localPids = new Map() } = {}) {
  // localPids: pid -> local index on this device (whose input this page sends)
  const layout = start.layout;
  const buf = [];                      // [{ k: server step, snap }] oldest first
  const pending = [];                  // [{ k, ev }] events not drawn yet
  const held = new Map();              // local index -> last held state
  let base = null, jit = 8, lastArr = 0, shownDelay = null, renderK = null, overMsg = null, overAt = 0, disposed = false;
  let lastSent = '', sentAt = 0;
  const stats = { snaps: 0, bytes: 0, late: 0, since: performance.now() };

  function onSnap(data) {
    const u = unpack(data, layout); if (!u) return;
    stats.snaps++; stats.bytes += data.byteLength;
    const now = performance.now();
    const off = now - u.tick * STEP_MS;
    if (base == null || off < base) base = off;
    else base += Math.min(off - base, Math.max(0, now - lastArr) * 0.01);       // creep later by 10 ms a second, in case the line got slower for good
    const d = off - base;
    jit = d > jit ? jit + (d - jit) * 0.25 : jit + (d - jit) * 0.01;           // rises fast on a hiccup, settles slowly
    lastArr = now;
    if (buf.length && u.tick <= buf[buf.length - 1].k) return;                 // out of order (never on one socket, but cheap to guard)
    buf.push({ k: u.tick, snap: u.snap });
    if (buf.length > 40) buf.shift();
    for (const ev of u.events) pending.push({ k: u.tick, ev });
  }
  function onOver(m) { overMsg = m; overAt = performance.now(); }
  net.on('snap', onSnap); net.on('over', onOver);

  /** The server step to draw at, now. */
  function drawK(dt) {
    if (base == null) return null;
    const want = Math.min(250, GAP_MS + Math.max(6, jit) + 6);
    shownDelay = shownDelay == null ? want : shownDelay + (want - shownDelay) * Math.min(1, (dt || 0.016) * 2);
    return (performance.now() - base - shownDelay) / STEP_MS;
  }
  function frame() {
    if (!buf.length) return { a: start.first || null, b: start.first || EMPTY, k: 0 };
    const rk = renderK ?? buf[buf.length - 1].k;
    if (rk >= buf[buf.length - 1].k) { const last = buf[buf.length - 1]; if (rk > last.k + SNAP_EVERY) stats.late++; const prev = buf[buf.length - 2] || last; return { a: prev.snap, b: last.snap, k: 1 }; }
    if (rk <= buf[0].k) return { a: buf[0].snap, b: buf[0].snap, k: 0 };
    let i = buf.length - 1; while (i > 0 && buf[i - 1].k > rk) i--;
    const A = buf[i - 1], B = buf[i];
    return { a: A.snap, b: B.snap, k: Math.max(0, Math.min(1, (rk - A.k) / Math.max(1, B.k - A.k))) };
  }
  function tick(dt) {
    if (disposed) return;
    renderK = drawK(dt);
    // drop snapshots the screen has passed (keep two behind for blending)
    if (renderK != null) while (buf.length > 3 && buf[1].k < renderK - SNAP_EVERY) buf.shift();
    // input: send when anything changed, and at least every 100 ms (the server forgets input older than a second)
    const rows = [];
    for (const [local, h] of held) rows.push([local, Math.round((h.mx || 0) * 100) / 100, Math.round((h.mz || 0) * 100) / 100, toBits(h)]);
    if (rows.length) {
      const s = JSON.stringify(rows), now = performance.now();
      if (s !== lastSent || now - sentAt > 100) { net.send({ t: 'in', p: rows }); lastSent = s; sentAt = now; }
    }
  }
  return {
    kind: 'online', opts: start,
    setInput(pid, st) { const local = localPids.get(pid); if (local != null) held.set(local, st); },
    tick,
    frame,
    drain() {
      if (!pending.length) return [];
      const rk = renderK ?? Infinity, out = [];
      while (pending.length && (pending[0].k <= rk + 0.5 || pending.length > 200)) out.push(pending.shift().ev);
      return out;
    },
    // over once the server said so AND the screen has caught up with the last snapshot (or a second has passed)
    get over() { return !!overMsg && (renderK == null || !buf.length || renderK >= buf[buf.length - 1].k || performance.now() - overAt > 1000); },
    result: () => overMsg?.result || { order: [], scores: {}, mode: start.mode, arena: start.arena },
    get paused() { return false; }, set paused(v) { /* an online match never pauses */ },
    get stats() { const s = (performance.now() - stats.since) / 1000; return { snapsPerSec: Math.round(stats.snaps / s * 10) / 10, bytesPerSec: Math.round(stats.bytes / s), late: stats.late, jitterMs: Math.round(jit), delayMs: Math.round(shownDelay || 0), buffered: buf.length }; },
    dispose() { disposed = true; net.off('snap', onSnap); net.off('over', onOver); held.clear(); },
  };
}
const EMPTY = Object.freeze({ t: 0, phase: 'intro', round: 1, rounds: 1, fighters: [], props: [], hazards: [], score: {}, events: [] });
