// The weather of a world, per region (world-tools round 2026-11-26). The SERVER owns it: everyone in a world sees the
// same storm. World Forge (worldgen/js/weather.js) decides the odds from each region's climate (js/world/weather-data.js);
// this keeps one small clock per region that holds a weather for a while and then rolls into the next one.
// Pure (no three, no DOM, no clock, no unseeded dice): the server, the browser and the tests all run it, and the state is
// plain JSON so it rides in the world save (ws.weather) and the world-state message.
//
//   const wx = normWeather(ws.weather, { seed, regions })   a fresh or loaded state (unknown regions added, bad fields fixed)
//   stepWeather(wx, dt, { seed })                       → true when something changed that browsers must hear about
//   forceWeather(wx, key, { region, lock, instant })    the dev command / map editor: 'storm' now (lock = stays until released)
//   releaseWeather(wx, { region })                      let the clock choose again
//   weatherWire(wx)                                     what the browser is sent: { r: { region: [a, b, p, secs, lock] } }
//   regionNumbers(entry, ahead = 0)                     the numbers to draw (cloud, rain, fog, wind, lightning, gloom…)
//   numbersAt(wire, T, x, z, ahead)                     the same at a spot, two regions blended across their border
//   strikesBetween(seed, t0, t1, rate)                  lightning strikes in a span of world time (same for everyone)
import { WEATHER_BY_KEY, weatherWeights, CALM } from '../../../../worldgen/js/weather.js';
import { makeRng, subSeed, hashStr } from '../../../../worldgen/js/noise.js';
import { WEATHER_SETUP } from './weather-data.js';

export { WEATHER_SETUP };
const FIELDS = Object.keys(CALM);
const clamp01 = v => Math.max(0, Math.min(1, v));
const r2 = v => Math.round(v * 100) / 100;

/** Every weather a region may have, and how likely: World Forge's odds for its climate × the region's own bias. */
export function regionOdds(regionId, setup = WEATHER_SETUP) {
  const c = setup.regions[regionId] || setup.fallback;
  const allowed = new Set([...setup.kinds, ...(c.snow ? setup.snowKinds : [])]);
  const raw = weatherWeights(c);
  const out = {};
  for (const [k, v] of Object.entries(raw)) if (allowed.has(k) && v > 0) out[k] = v * (c.bias?.[k] ?? 1);
  if (!Object.keys(out).length) out.clear = 1;
  return out;
}

/** The names a player sees, in the order a picker shows them. */
export const WEATHER_CHOICES = Object.freeze([...WEATHER_SETUP.kinds, ...WEATHER_SETUP.snowKinds].map(k => ({ key: k, name: WEATHER_BY_KEY[k].name })));
export const isWeather = k => typeof k === 'string' && Object.hasOwn(WEATHER_BY_KEY, k) && WEATHER_CHOICES.some(c => c.key === k);

function rngFor(seed, region, n) { return makeRng(subSeed((seed >>> 0) ^ hashStr(region), 'oathwild-wx:' + n)); }
function roll(odds, rng) {
  let total = 0; for (const v of Object.values(odds)) total += v;
  let r = rng() * total;
  for (const [k, v] of Object.entries(odds)) { r -= v; if (r <= 0) return k; }
  return Object.keys(odds)[0];
}
function holdFor(rng, setup) { const [a, b] = setup.holdMinutes; return Math.round((a + rng() * (b - a)) * 60); }

/** A fresh or saved weather state, made whole: every region present, every field sane. */
export function normWeather(saved, { seed = 1, regions = [], setup = WEATHER_SETUP } = {}) {
  const wx = { v: 1, regions: {} };
  const old = saved && typeof saved === 'object' && saved.regions && typeof saved.regions === 'object' ? saved.regions : {};
  for (const id of regions) {
    const o = old[id];
    if (o && isWeather(o.a)) {
      wx.regions[id] = {
        a: o.a, b: isWeather(o.b) ? o.b : null, p: clamp01(Number(o.p) || 0), held: Math.max(0, Number(o.held) || 0),
        hold: Math.max(30, Number(o.hold) || 600), n: Math.max(0, Math.floor(Number(o.n) || 0)), lock: !!o.lock,
        secs: Math.max(0.5, Number(o.secs) || setup.changeSeconds),
      };
      if (!wx.regions[id].b) wx.regions[id].p = 0;
      continue;
    }
    // a new world (or a region added since the save): its first weather, from the world's own seed
    const rng = rngFor(seed, id, 0);
    wx.regions[id] = { a: roll(regionOdds(id, setup), rng), b: null, p: 0, held: 0, hold: holdFor(rng, setup), n: 1, lock: false, secs: setup.changeSeconds };
  }
  return wx;
}

/** Move every region's clock on by dt seconds. → true when a change started or finished (browsers need the news). */
export function stepWeather(wx, dt, { seed = 1, setup = WEATHER_SETUP } = {}) {
  let news = false;
  for (const [id, R] of Object.entries(wx.regions)) {
    if (R.b) {
      R.p += dt / R.secs;
      if (R.p >= 1) { R.a = R.b; R.b = null; R.p = 0; R.held = 0; news = true; }
      continue;
    }
    if (R.lock) continue;
    R.held += dt;
    if (R.held < R.hold) continue;
    const rng = rngFor(seed, id, R.n++);
    const next = roll(regionOdds(id, setup), rng);
    R.held = 0; R.hold = holdFor(rng, setup);
    if (next !== R.a) { R.b = next; R.p = 0; R.secs = setup.changeSeconds; news = true; }
  }
  return news;
}

/** Force a weather (dev command, map editor). region: one id or null for every region. → false for an unknown weather. */
export function forceWeather(wx, key, { region = null, lock = true, instant = false, seconds = 8, setup = WEATHER_SETUP } = {}) {
  if (!isWeather(key)) return false;
  const ids = region ? [region].filter(id => wx.regions[id]) : Object.keys(wx.regions);
  if (!ids.length) return false;
  for (const id of ids) {
    const R = wx.regions[id];
    if (instant || (!R.b && R.a === key)) { R.a = key; R.b = null; R.p = 0; }
    else { if (R.b && R.p > 0.5) R.a = R.b; R.b = key; R.p = 0; R.secs = Math.max(0.5, seconds); }
    R.held = 0; R.hold = holdFor(rngFor(1, id, R.n), setup); R.lock = !!lock;
  }
  return true;
}
export function releaseWeather(wx, { region = null } = {}) {
  for (const [id, R] of Object.entries(wx.regions)) if (!region || id === region) { R.lock = false; R.held = 0; }
}

/** The browser's copy: per region [from, to | null, how far (0..1), seconds the change takes, locked]. */
export function weatherWire(wx) {
  const r = {};
  for (const [id, R] of Object.entries(wx.regions)) r[id] = [R.a, R.b, r2(R.p), r2(R.secs), R.lock ? 1 : 0];
  return { r };
}

/**
 * The numbers to draw for one region: a wire row [a, b, p, secs, lock] (or a server entry). `ahead` = seconds since the
 * row was sent, so a change keeps rolling in between messages. → { cloud, rain, snow, dust, fog, wind, lightning, gloom,
 * key, name, changing }
 */
export function regionNumbers(row, ahead = 0, out = {}) {
  const [a, b, p0, secs] = Array.isArray(row) ? row : [row?.a, row?.b, row?.p, row?.secs];
  const A = WEATHER_BY_KEY[a] || WEATHER_BY_KEY.clear, B = b ? WEATHER_BY_KEY[b] || A : A;
  const t = b ? clamp01((p0 || 0) + ahead / Math.max(0.5, secs || 1)) : 0;
  const s = t * t * (3 - 2 * t);
  for (const f of FIELDS) out[f] = A[f] + (B[f] - A[f]) * s;
  out.key = s > 0.5 ? B.key : A.key;
  out.name = (s > 0.5 ? B : A).name;
  out.changing = !!b && t < 1;
  return out;
}

/** The numbers at a spot: the region you are in, blended with the neighbour within `border` metres of the line. */
export function numbersAt(wire, T, x, z, ahead = 0, setup = WEATHER_SETUP) {
  const rows = wire?.r || {};
  const here = T?.regionAt ? T.regionAt(x, z) : Object.keys(rows)[0];
  const out = regionNumbers(rows[here] || ['clear', null, 0, 1], ahead);
  out.region = here;
  if (!T?.borderX || !T.map?.border) return out;
  const { west, east } = T.map.border;
  const d = x - T.borderX(z);                                 // < 0 west of the line
  const k = Math.max(0, Math.min(1, 0.5 + d / (2 * setup.border)));
  if (k <= 0 || k >= 1 || !rows[west] || !rows[east]) return out;
  const W = regionNumbers(rows[west], ahead), E = regionNumbers(rows[east], ahead);
  for (const f of FIELDS) out[f] = W[f] + (E[f] - W[f]) * k;
  return out;
}

/**
 * Lightning strikes between world times t0 and t1 (seconds), at a weather's lightning `rate` (0..1). One roll per whole
 * second of world time from the world's seed, so every player in the world sees a strike at the same moment and place;
 * each hears its thunder after its own distance. → [{ t, angle (radians), dist (m), restrike (s or 0), seed }]
 */
export function strikesBetween(seed, t0, t1, rate, setup = WEATHER_SETUP) {
  const out = [];
  if (!(rate > 0.01) || !(t1 > t0)) return out;
  const p = setup.strikesPerSecond * rate;
  const [near, far] = setup.strikeMetres;
  for (let s = Math.floor(t0) + 1; s <= Math.floor(t1); s++) {
    const rng = makeRng(subSeed(seed >>> 0, 'oathwild-strike:' + s));
    if (rng() >= p) continue;
    const u = rng();
    out.push({ t: s, angle: rng() * Math.PI * 2, dist: near + (far - near) * u * u, restrike: rng() < 0.6 ? 0.08 + rng() * 0.12 : 0, seed: Math.floor(rng() * 1e9) });
  }
  return out;
}
