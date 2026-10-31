// Speed numbers (PLAN §3): frame times, what each frame cost, and what went to the GPU. The readout is a setting; the
// same object feeds bug reports and the soak test, so every number means the same thing everywhere.

export function createPerf(renderer) {
  const N = 900, ring = new Float32Array(N); let at = 0, filled = 0, drops = 0;
  const parts = { rules: 0, picture: 0, draw: 0 };
  const self = {
    parts, draws: 0, tris: 0, peakDraws: 0, peakTris: 0,
    frame(ms, p) {
      ring[at] = ms; at = (at + 1) % N; filled = Math.min(N, filled + 1); if (ms > 50) drops++;
      for (const k in parts) parts[k] += ((p[k] || 0) - parts[k]) * 0.05;
      self.draws = renderer.info.render.calls; self.tris = renderer.info.render.triangles;
      if (self.draws > self.peakDraws) self.peakDraws = self.draws;
      if (self.tris > self.peakTris) self.peakTris = self.tris;
    },
    /** Frame-time summary of the last `last` frames (default: all kept). */
    summary(last = filled) {
      const n = Math.min(last, filled); if (!n) return { frames: 0 };
      const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = ring[(at - 1 - i + N * 2) % N];
      let sum = 0; for (const v of a) sum += v; a.sort();
      const q = k => +a[Math.min(n - 1, Math.floor(n * k))].toFixed(1);
      return { frames: n, fps: +(1000 / (sum / n)).toFixed(1), p50: q(0.5), p95: q(0.95), p99: q(0.99), worst: +a[n - 1].toFixed(1) };
    },
    report() {
      const heap = performance.memory?.usedJSHeapSize;
      return { ...self.summary(), ms: { rules: +parts.rules.toFixed(2), picture: +parts.picture.toFixed(2), draw: +parts.draw.toFixed(2) }, draws: self.draws, tris: self.tris, peakDraws: self.peakDraws, peakTris: self.peakTris, longFrames: drops, heapMB: heap ? Math.round(heap / 1048576) : null, gpu: renderer.info.memory };
    },
    resetPeaks() { self.peakDraws = self.peakTris = 0; },
  };
  return self;
}
