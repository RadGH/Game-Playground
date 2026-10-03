// Deterministic maths for the sim. The engines' Math.sin/cos/atan2/pow/exp... are NOT specified
// bit-for-bit by the language, so two browsers can disagree in the last bit and a lockstep match
// desyncs. Everything here uses only + - * / and Math.sqrt (exactly specified by IEEE 754),
// Math.floor/round/abs/min/max (exact). Accuracy ~1e-9 for sin/cos, ~1e-7 for atan2: plenty for
// facing angles and arcs.

export const PI = 3.141592653589793;
export const TAU = 6.283185307179586;
const HALF_PI = 1.5707963267948966;

/** Wrap an angle into (-PI, PI]. */
export function wrapAngle(a) {
  if (a > PI || a <= -PI) {
    a = a - TAU * Math.floor((a + PI) / TAU);
    if (a <= -PI) a += TAU;
  }
  return a;
}

// Taylor series on [-PI/2, PI/2] to x^15 (error < 1e-10).
function sinCore(x) {
  const x2 = x * x;
  return x * (1 - x2 / 6 * (1 - x2 / 20 * (1 - x2 / 42 * (1 - x2 / 72 * (1 - x2 / 110 * (1 - x2 / 156 * (1 - x2 / 210)))))));
}

export function sin(a) {
  let x = wrapAngle(a);
  if (x > HALF_PI) x = PI - x;
  else if (x < -HALF_PI) x = -PI - x;
  return sinCore(x);
}

export function cos(a) { return sin(a + HALF_PI); }

// atan on [0, 1] by argument halving + series.
function atanCore(t) {
  // reduce: atan(t) = 2 atan(t / (1 + sqrt(1 + t^2))), twice -> |t| <= ~0.2
  let k = 1;
  for (let i = 0; i < 2; i++) { t = t / (1 + Math.sqrt(1 + t * t)); k *= 2; }
  const t2 = t * t;
  let sum = 0, term = t;
  for (let n = 1; n <= 23; n += 2) { sum += term / n; term *= -t2; }
  return sum * k;
}

/** atan2(y, x) in (-PI, PI], same convention as Math.atan2. */
export function atan2(y, x) {
  if (x === 0 && y === 0) return 0;
  const ax = Math.abs(x), ay = Math.abs(y);
  let a = ay <= ax ? atanCore(ay / ax) : HALF_PI - atanCore(ax / ay);
  if (x < 0) a = PI - a;
  return y < 0 ? -a : a;
}

/** Facing angle (bannerline convention: 0 faces +z) of the vector (dx, dz). */
export function faceOf(dx, dz) { return atan2(dx, dz); }

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az; return dx * dx + dz * dz; };
export const dist = (ax, az, bx, bz) => Math.sqrt(dist2(ax, az, bx, bz));
/** Round to 0.01 (command positions). */
export const q2 = v => Math.round(v * 100) / 100;
/** Round to 0.1 (event amounts). */
export const q1 = v => Math.round(v * 10) / 10;
/** Smallest signed difference b - a between two angles. */
export const angleDiff = (a, b) => wrapAngle(b - a);
