// Time of day → light. tod 0 = dawn, 0.25 noon, 0.5 dusk, 0.75 midnight (js/sim/sim.js).
// Owner: colour grading per time — warm dusk, cool night, bright noon.

const KEYS = [
  [0.00, [0.86, 0.70, 0.62]],
  [0.07, [1.00, 0.94, 0.88]],
  [0.25, [1.05, 1.04, 1.00]],
  [0.42, [1.00, 0.93, 0.84]],
  [0.50, [0.98, 0.64, 0.46]],
  [0.56, [0.46, 0.38, 0.52]],
  [0.62, [0.30, 0.34, 0.52]],
  [0.90, [0.30, 0.34, 0.52]],
  [0.96, [0.44, 0.38, 0.50]],
  [1.00, [0.86, 0.70, 0.62]],
];

/** { ambient: [r, g, b], nightness: 0..1 } for a time of day; `dark` 0..1 scales how dark night gets. */
export function lightAt(tod, dark = 1) {
  tod = ((tod % 1) + 1) % 1;
  let k = 0; while (k < KEYS.length - 2 && KEYS[k + 1][0] <= tod) k++;
  const [t0, a] = KEYS[k], [t1, b] = KEYS[k + 1];
  const f = (tod - t0) / Math.max(1e-6, t1 - t0);
  let amb = a.map((v, i) => v + (b[i] - v) * f);
  amb = amb.map(v => 1 - (1 - v) * dark);
  const bright = (amb[0] + amb[1] + amb[2]) / 3;
  return { ambient: amb, nightness: Math.max(0, Math.min(1, (0.9 - bright) / 0.6)) };
}

/** Clock text: day number and hour. */
export function clockText(tick, dayTicks) {
  const day = Math.floor(tick / dayTicks) + 1;
  const tod = (tick % dayTicks) / dayTicks;
  const hour = Math.floor((tod * 24 + 6) % 24);
  return `Day ${day} ${String(hour).padStart(2, '0')}:00`;
}
