// Tick timing for /status (PLAN §11.4): p50/p95/p99/max over the last minute, worst in 10 minutes.

export function createTickStats({ tickMs = 50 } = {}) {
  const perMin = Math.round(60000 / tickMs);
  const ring = new Float64Array(perMin);
  let n = 0, i = 0;
  const minuteWorst = new Float64Array(10);   // worst of each of the last 10 minutes
  let mi = 0, sinceMinute = 0;
  let overruns = 0, skipped = 0, total = 0;
  return {
    add(ms) {
      ring[i] = ms; i = (i + 1) % perMin; if (n < perMin) n++;
      total++;
      if (ms > tickMs) overruns++;
      if (ms > minuteWorst[mi]) minuteWorst[mi] = ms;
      if (++sinceMinute >= perMin) { sinceMinute = 0; mi = (mi + 1) % 10; minuteWorst[mi] = 0; }
    },
    skip(k = 1) { skipped += k; },
    summary() {
      const a = Array.from(ring.subarray(0, n)).sort((x, y) => x - y);
      const p = f => (a.length ? a[Math.min(a.length - 1, Math.floor(f * a.length))] : 0);
      const r = v => Math.round(v * 1000) / 1000;
      return { p50: r(p(0.5)), p95: r(p(0.95)), p99: r(p(0.99)), max: r(a.length ? a[a.length - 1] : 0), worst10m: r(Math.max(...minuteWorst)), overruns, skipped, ticks: total, window: a.length };
    },
  };
}
