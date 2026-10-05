// Day and night (PLAN §4.3, §17.2: ~2 hours a day, readable nights, telegraphs always visible).
// The realm clock comes from the gateway (`net.timeOfDay()`: 0 = midnight, 0.5 = noon), so everyone sees
// the same sky. This file is the pure part: a time of day -> the whole look (sun/moon direction, light
// colours and strengths, sky gradient, fog, how "night" it is for lamps and windows). scene.js applies it.
//
// Nights are blue and dim, never black: a moon fills in from the other side of the sky and the hemisphere
// light keeps a cool floor, so you can always read the ground and the red telegraphs (which are unlit and
// ignore all of this) stand out even more.

const KEYS = [
  // t      zenith     horizon    ground     sunCol     sunI  hemiSky    hemiGnd    hemiI  fogFar exposure
  [0.00, '#0b1430', '#26355a', '#1a2030', '#9fb4ff', 0.55, '#5d73b0', '#2a2c3a', 0.72, 2600, 1.15],
  [0.20, '#14204a', '#3a4570', '#222838', '#a8b8ff', 0.5, '#6678b0', '#2c2e3c', 0.72, 2800, 1.12],
  [0.25, '#3b4f8a', '#e89a6a', '#4a4440', '#ffb27a', 1.2, '#b0a4c0', '#5a4a40', 0.85, 4200, 1.08],
  [0.32, '#4a78bf', '#e9d6bf', '#6d6a5a', '#ffe2b8', 2.2, '#cfdcf2', '#6b5f48', 1.05, 6500, 1.05],
  [0.50, '#3f6fb3', '#c9d9e6', '#6d7a6a', '#fff1d8', 2.6, '#d6e6ff', '#6b5f48', 1.15, 7000, 1.05],
  [0.68, '#4672b4', '#d9d4c4', '#6d6a5a', '#ffe6c0', 2.3, '#d2ddf0', '#6b5f48', 1.08, 6500, 1.05],
  [0.75, '#41497e', '#f08a58', '#4a3e38', '#ff9a5c', 1.25, '#b49ab4', '#5a4438', 0.88, 4200, 1.08],
  [0.80, '#18214a', '#4b3e66', '#242434', '#a8b8ff', 0.5, '#6a72a8', '#2c2c3a', 0.74, 3000, 1.12],
  [1.00, '#0b1430', '#26355a', '#1a2030', '#9fb4ff', 0.55, '#5d73b0', '#2a2c3a', 0.72, 2600, 1.15],
];

function hex(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
const mixC = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mix = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);

/** How much it is night, 0 (day) .. 1 (deep night), the server's own night window (t < 0.22 or > 0.8) at its core. */
export function nightness(t) {
  t = ((t % 1) + 1) % 1;
  if (t < 0.2 || t > 0.82) return 1;
  if (t < 0.29) return 1 - smooth((t - 0.2) / 0.09);
  if (t > 0.72) return smooth((t - 0.72) / 0.1);
  return 0;
}

/** The sun's direction (unit, +y up): rises in the east (+x) at 0.25, overhead-ish at noon, sets west at 0.75. */
export function sunDirection(t) {
  const a = (t - 0.25) * Math.PI * 2;
  const x = Math.cos(a), y = Math.sin(a) * 0.92, z = 0.38;
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}

/** Everything the scene needs for time of day t (0..1). Pure. */
export function skyAt(t) {
  t = ((t % 1) + 1) % 1;
  let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1][0] <= t) i++;
  const A = KEYS[i], B = KEYS[i + 1], f = (t - A[0]) / Math.max(1e-6, B[0] - A[0]);
  const c = k => mixC(hex(A[k]), hex(B[k]), f), n = k => mix(A[k], B[k], f);
  const sun = sunDirection(t);
  const night = nightness(t);
  // the key light: the sun by day, the moon (opposite, held up in the sky) by night
  const moon = [-sun[0], Math.max(0.45, -sun[1]), -sun[2] * 0.6];
  const ml = Math.hypot(...moon);
  const keyDir = sun[1] > 0.06 ? sun : [moon[0] / ml, moon[1] / ml, moon[2] / ml];
  return {
    t, night, sun, keyDir, moonUp: night > 0.3,
    zenith: c(1), horizon: c(2), ground: c(3), keyColor: c(4), keyIntensity: n(5),
    hemiSky: c(6), hemiGround: c(7), hemiIntensity: n(8), fogFar: n(9), fogNear: Math.min(260, n(9) * 0.06), exposure: n(10),
    stars: Math.max(0, night - 0.15) / 0.85,
  };
}

/** "Dusk", "Night"… for the HUD clock. */
export function timeName(t) {
  t = ((t % 1) + 1) % 1;
  if (t < 0.2 || t >= 0.85) return 'Night';
  if (t < 0.3) return 'Dawn';
  if (t < 0.45) return 'Morning';
  if (t < 0.58) return 'Midday';
  if (t < 0.72) return 'Afternoon';
  return 'Dusk';
}
export function clockText(t) {
  const mins = Math.floor((((t % 1) + 1) % 1) * 24 * 60);
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}
