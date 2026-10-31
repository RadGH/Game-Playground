// The one-tap phone test (PLAN §3): open the page with ?soak=1 and the car drives itself round the whole map for 20
// minutes while we keep frame times and send them to the LAN inbox (POST /api/inbox/oddhaven-soak). Numbers go out as
// they come, so a phone that dies at minute 12 still reports 12 minutes. Nothing waits for this: a result that cannot
// be sent stays in this browser and is sent the next time the page opens. `?mins=` shortens it for tests.
//
// Sent: { kind:'soak', done, device, tier, minutes:[{ minute, frames, fps, p50, p95, p99, worst, draws, tris, heapMB, hidden }], best, worst }

const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* private window */ } } };
export const SOAK_KEY = 'oddhaven.soak.pending';

export function soakAsked(search) { const q = new URLSearchParams(search); return q.get('soak') === '1' ? { mins: Math.max(0.1, Number(q.get('mins')) || 20) } : null; }

/** Pure: the summary of the whole run from its minutes (a phone that starts fine and then throttles shows here). */
export function soakSummary(minutes) {
  if (!minutes.length) return { minutes: 0 };
  const fps = minutes.map(m => m.fps), p95 = minutes.map(m => m.p95);
  const third = Math.max(1, Math.floor(minutes.length / 3)), avg = l => +(l.reduce((a, b) => a + b, 0) / l.length).toFixed(1);
  return { minutes: minutes.length, fpsFirst: avg(fps.slice(0, third)), fpsLast: avg(fps.slice(-third)), fpsLow: Math.min(...fps), p95High: Math.max(...p95), peakDraws: Math.max(...minutes.map(m => m.draws)), peakTris: Math.max(...minutes.map(m => m.tris)), worstFrame: Math.max(...minutes.map(m => m.worst)) };
}

export function createSoak({ mins, perf, url, facts, onTick }) {
  const started = Date.now(), minutes = [];
  let lastMinute = Date.now(), frames = 0, hiddenMs = 0, hiddenAt = 0, done = false, peakD = 0, peakT = 0;
  const period = Math.min(60000, mins * 60000 / 4);
  document.addEventListener('visibilitychange', () => { if (document.hidden) hiddenAt = Date.now(); else if (hiddenAt) { hiddenMs += Date.now() - hiddenAt; hiddenAt = 0; } });
  let lock = null;
  const stayAwake = async () => { try { lock = await navigator.wakeLock?.request?.('screen'); } catch { /* http page or refused: the screen may sleep, and the numbers will say so */ } };
  stayAwake();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !done) stayAwake(); });
  const body = () => ({ kind: 'soak', at: new Date().toISOString(), done, target: mins, elapsed: Math.round((Date.now() - started) / 1000), hiddenSecs: Math.round(hiddenMs / 1000), awake: !!lock, summary: soakSummary(minutes), minutes, ...facts() });
  async function send() {
    const b = JSON.stringify(body());
    ls.set(SOAK_KEY, b);
    try { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: b }); if (r.ok) { if (done) ls.set(SOAK_KEY, ''); return true; } } catch { /* kept for next time */ }
    return false;
  }
  return {
    get done() { return done; }, minutes, body, send,
    frame() {
      if (done) return;
      frames++;
      peakD = Math.max(peakD, perf.draws); peakT = Math.max(peakT, perf.tris);
      const now = Date.now();
      if (now - lastMinute >= period) {
        const s = perf.summary(Math.min(frames, 900));
        minutes.push({ minute: minutes.length + 1, ...s, draws: peakD, tris: peakT, heapMB: perf.report().heapMB, hidden: !!hiddenAt, realFrames: frames });
        frames = 0; lastMinute = now; peakD = peakT = 0;
        const m = minutes.length;
        if (m === 1 || m % 4 === 0) send();
      }
      if (now - started >= mins * 60000) { done = true; try { lock?.release?.(); } catch { /* gone */ } send(); }
      onTick?.(Math.min(1, (now - started) / (mins * 60000)), mins * 60 - (now - started) / 1000);
    },
  };
}

/** Sends a result left behind by an earlier run. */
export async function sendLeftover(url) {
  const b = ls.get(SOAK_KEY);
  if (!b) return;
  try { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: b }); if (r.ok) ls.set(SOAK_KEY, ''); } catch { /* try again next time */ }
}
