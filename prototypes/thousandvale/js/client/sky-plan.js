// Which painted sky is up, and how two of them blend (play-test 11, Z59 — live #60: "Add a beautiful skybox, maybe
// several variations depending on location / weather / time … Currently the sky always looks grey / overcast").
// Pure: no three, no DOM. sky-box.js draws what this decides; tests/D/pt11-world.test.js walks the clock through it.
//
// Six panoramas (assets/sky/*.webp, Codex-painted, made by tools/sky-art.py): two day skies (clear, cloudy), dawn, dusk,
// night, and Vharlen's own hazy volcanic day. The clock (0 = midnight, 0.5 = noon, the server's realm clock) walks:
//
//   night ── 0.20 ─> dawn ── 0.29 ─> day ── 0.67 ─> dusk ── 0.78 ─> night
//
// with a crossfade at each arrow (a sky never snaps). WEATHER picks which day sky a realm day has — the same for every
// player, from the realm's day number — and PLACE can swap it (Vharlen, the Burning Isle, has its own ash-hazed day).

export const SKY_IDS = ['day_clear', 'cloudy', 'dawn', 'dusk', 'night', 'vharlen'];

/** [start, end, from, to]: inside a window the sky crossfades from -> to; outside the windows it holds. */
const WINDOWS = [
  [0.200, 0.255, 'night', 'dawn'],
  [0.285, 0.345, 'dawn', 'day'],
  [0.655, 0.715, 'day', 'dusk'],
  [0.765, 0.820, 'dusk', 'night'],
];
const smooth = t => t * t * (3 - 2 * t);

/** Which stage (and how far to the next) the clock is at: { a: stage, b: stage, k: 0..1 }. Stages: night, dawn, day, dusk. */
export function skyStage(t) {
  t = ((Number(t) % 1) + 1) % 1;
  for (const [s, e, from, to] of WINDOWS) if (t >= s && t < e) return { a: from, b: to, k: smooth((t - s) / (e - s)) };
  const hold = t < 0.200 || t >= 0.820 ? 'night' : t < 0.285 ? 'dawn' : t < 0.655 ? 'day' : 'dusk';
  return { a: hold, b: hold, k: 0 };
}

/**
 * The weather of a realm day: 'clear' or 'cloudy'. Same day number + province = same answer for everyone. About one day
 * in three is cloudy; never two cloudy days in a row would be too neat, so it is a plain hash.
 */
export function weatherFor(day, province = '') {
  let h = 2166136261 ^ (Math.floor(Number(day) || 0) | 0);
  for (const c of String(province || '')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  h = Math.imul(h ^ (h >>> 15), 2246822507); h ^= h >>> 13;
  return ((h >>> 0) % 100) < 34 ? 'cloudy' : 'clear';
}

/** The day sky for a place and weather. */
export function daySky({ province = null, weather = 'clear' } = {}) {
  if (String(province || '').toLowerCase() === 'vharlen') return 'vharlen';
  return weather === 'cloudy' ? 'cloudy' : 'day_clear';
}

/**
 * Everything sky-box.js needs for a clock + place + weather: the two pictures and the blend.
 *   -> { a: skyId, b: skyId, k: 0..1, stage, weather, day }   (k = how much of b; a === b when the sky holds)
 */
export function skyPlan(t, { province = null, day = 0, weather = null } = {}) {
  const w = weather || weatherFor(day, province);
  const d = daySky({ province, weather: w });
  const pick = s => (s === 'day' ? d : s);
  const st = skyStage(t);
  const a = pick(st.a), b = pick(st.b);
  return { a, b: a === b ? a : b, k: a === b ? 0 : st.k, stage: st.k < 0.5 ? st.a : st.b, weather: w, day: d };
}

/** The realm's day number from the net client's clock ({ epoch, dayMs, skew }); 0 when there is none. */
export function realmDay(clock, now = Date.now()) {
  if (!clock || !(clock.dayMs > 0)) return 0;
  return Math.floor((now - (clock.skew || 0) - (clock.epoch || 0)) / clock.dayMs);
}

/** Mix two [r, g, b] colours. */
export const mixRGB = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

/**
 * The fog colour for a plan: the painted horizon of each picture (skies.json `fog`), blended like the pictures. The
 * fog is drawn by three AFTER tone mapping, so this colour is what a fully fogged hill shows on screen — the same colour
 * the painting has where it meets the land.
 */
export function fogColourFor(plan, skies) {
  const A = skies?.[plan.a], B = skies?.[plan.b];
  if (!A) return null;
  const fa = A.fog || A.horizon, fb = (B || A).fog || (B || A).horizon;
  return mixRGB(fa, fb, plan.k);
}
