// Survey kits — the pure rules (Expansion 1 M10, docs/EXPANSION-1.md "Survey kits"). No DOM / three.js / Rapier /
// sockets: the room's referee (js/game/jobs/survey.js), the page's live readout (js/game/survey-play.js) and the Moon
// jobs (M12) all ask THESE functions, over the SAME coarse grid of the place, so the green you see is the green the
// room accepts.
//
//   const grid = surveyGrid(world)            a place's survey grid (8 m): heights, road + water distance, ground kinds,
//                                             special areas, the Survey Office, gravity. Built once per world (the
//                                             server's sitesFor, the page after its world is made): sites.surveyGrid.
//   const view = placeView(grid)              questions about the place: heightAt, slopeAt, roadDist, waterDist,
//                                             groundAt, specialAt, pct(share) — cached per grid
//   judgeSpot(kit, view, [x,y,z], ctx)        -> { ok, why, checks: [{ t, ok, text }], q (0..1 spot quality), grade }
//                                             ctx = { others: [{ kit, x, z, mine }], office: { x, z } }
//   spotPay(kit, q, metresFromOffice)         gold for one set-up kit reported at the office
//   surveyRules(upgrades)                     what the upgrades change: { setupScale, crates, sling, scanner }
//   setupMs(kit, upgrades)                    how long E is held to unfold it
//   levelMeets(need, sites) / levelText(need, sites)    a level's goal against a player's REPORTED sites
//   goodSpots(kit, view, ctx, { x, z, r })    the Site scanner: passing spots near (x, z), best first, spread out
//   kitById(id) / rulesFor(kit, map)
//
// A place is anything with a grid: the County (map 'county'), the Moon (M12: map 'moon', gravity 1.62, regolith).
import { KITS, SURVEY_UPS, SLING } from './survey-kits.js';

export const GRID_STEP = 8;
const CAP = 9999;
const r1 = v => Math.round(v * 10) / 10;
const clamp01 = v => Math.max(0, Math.min(1, v));
export const kitById = id => KITS.find(k => k.id === id) || null;
/** A kit's rules for a place (a place may carry its own: the Moon has no weather and no water). */
export const rulesFor = (kit, map) => kit?.places?.[map]?.rules || kit?.rules || [];

// ------------------------------------------------------------------------------------------------------------ the grid
/**
 * The survey grid of a generated world (worldgen's contract: heightAt, roadDistAt, waterAt, surfaceAt, objects, sites).
 * Typed arrays; a test may hand placeView plain arrays of the same shape.
 */
export function surveyGrid(world, { step = GRID_STEP } = {}) {
  const size = world.size, n = Math.floor(size / step) + 1, x0 = -size / 2, z0 = -size / 2, N = n * n;
  const h = new Float32Array(N), road = new Uint16Array(N), water = new Uint16Array(N), ground = new Uint8Array(N);
  const grounds = ['water'], gIdx = new Map([['water', 0]]);
  const wet = new Uint8Array(N);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = Math.min(size / 2, x0 + i * step), z = Math.min(size / 2, z0 + j * step), k = j * n + i;
    h[k] = world.heightAt(x, z);
    const rd = world.roadDistAt ? world.roadDistAt(x, z) : CAP;
    road[k] = Math.max(0, Math.min(CAP, Math.round(Number.isFinite(rd) ? rd : CAP)));
    const w = world.waterAt ? world.waterAt(x, z) : null;
    let name = w != null && w > h[k] + 0.05 ? 'water' : (world.surfaceAt?.(x, z)?.name || 'ground');
    if (name === 'water') wet[k] = 1;
    if (!gIdx.has(name)) { gIdx.set(name, grounds.length); grounds.push(name); }
    ground[k] = gIdx.get(name);
  }
  // metres to the nearest water (two-pass chamfer over the grid)
  const D = new Float32Array(N).fill(1e9), d1 = step, d2 = step * Math.SQRT2;
  for (let k = 0; k < N; k++) if (wet[k]) D[k] = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i; let v = D[k];
    if (i > 0) v = Math.min(v, D[k - 1] + d1);
    if (j > 0) { v = Math.min(v, D[k - n] + d1); if (i > 0) v = Math.min(v, D[k - n - 1] + d2); if (i < n - 1) v = Math.min(v, D[k - n + 1] + d2); }
    D[k] = v;
  }
  for (let j = n - 1; j >= 0; j--) for (let i = n - 1; i >= 0; i--) {
    const k = j * n + i; let v = D[k];
    if (i < n - 1) v = Math.min(v, D[k + 1] + d1);
    if (j < n - 1) { v = Math.min(v, D[k + n] + d1); if (i < n - 1) v = Math.min(v, D[k + n + 1] + d2); if (i > 0) v = Math.min(v, D[k + n - 1] + d2); }
    D[k] = v;
  }
  for (let k = 0; k < N; k++) water[k] = Math.min(CAP, Math.round(D[k]));
  // special areas: the giant wood (where the tree_giants stand), the named viewpoints, a place's craters / base
  const specials = [];
  const giants = (world.objects || []).filter(o => o && o.kind === 'tree_giant');
  if (giants.length >= 5) {
    const cx = giants.reduce((a, o) => a + o.x, 0) / giants.length, cz = giants.reduce((a, o) => a + o.z, 0) / giants.length;
    const ds = giants.map(o => Math.hypot(o.x - cx, o.z - cz)).sort((a, b) => a - b);
    specials.push({ id: 'giant_wood', kind: 'giant_wood', name: 'the Elderwood', x: r1(cx), z: r1(cz), r: r1(ds[Math.floor(ds.length * 0.85)] + 25) });
  }
  for (const c of world.craters || world.sites?.craters || []) if (Number.isFinite(c?.x) && Number.isFinite(c?.r) && c.r >= 20) specials.push({ id: 'crater_' + specials.length, kind: 'crater', name: c.name || 'a crater', x: r1(c.x), z: r1(c.z), r: r1(c.r * 1.15) });
  if (world.sites?.base && Number.isFinite(world.sites.base.x)) specials.push({ id: 'base', kind: 'base', name: world.sites.base.name || 'the base', x: world.sites.base.x, z: world.sites.base.z, r: (world.sites.base.r || 60) + 120 });
  const off = (world.sites?.places || []).find(p => p.kind === 'survey_office') || null;
  return { v: 1, map: world.map || 'classic', step, x0, z0, n, h, road, water, ground, grounds, specials,
    office: off ? { x: off.x, z: off.z, y: off.y ?? null, name: off.name || 'Survey Office', id: off.id } : null,
    gravity: Number.isFinite(world.gravity) ? world.gravity : world.map === 'moon' ? 1.62 : 9.81 };
}

// ------------------------------------------------------------------------------------------------------- the place view
const VIEWS = new WeakMap();
export function placeView(g) {
  if (!g || !g.n) return null;
  if (VIEWS.has(g)) return VIEWS.get(g);
  const { n, step, x0, z0 } = g, size = (n - 1) * step;
  const ci = v => Math.max(0, Math.min(n - 1, v));
  const at = (A, x, z) => A[ci(Math.round((z - z0) / step)) * n + ci(Math.round((x - x0) / step))];
  function heightAt(x, z) {
    const fx = Math.max(0, Math.min(n - 1.0001, (x - x0) / step)), fz = Math.max(0, Math.min(n - 1.0001, (z - z0) / step));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, w = fz - j, H = g.h;
    const a = H[j * n + i], b = H[j * n + i + 1], c = H[(j + 1) * n + i], d = H[(j + 1) * n + i + 1];
    return a * (1 - u) * (1 - w) + b * u * (1 - w) + c * (1 - u) * w + d * u * w;
  }
  function slopeAt(x, z) {
    const s = step;
    const dx = (heightAt(x + s, z) - heightAt(x - s, z)) / (2 * s), dz = (heightAt(x, z + s) - heightAt(x, z - s)) / (2 * s);
    return Math.atan(Math.hypot(dx, dz)) * 180 / Math.PI;
  }
  let sorted = null;
  function pct(q) {
    if (!sorted) {
      const out = [];
      for (let k = 0; k < g.h.length; k += 3) if (g.grounds[g.ground[k]] !== 'water') out.push(g.h[k]);
      sorted = out.sort((a, b) => a - b);
    }
    if (!sorted.length) return 0;
    return sorted[Math.max(0, Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1))))];
  }
  const V = {
    map: g.map, gravity: g.gravity, office: g.office, specials: g.specials || [], step,
    inside: (x, z) => x >= x0 && x <= x0 + size && z >= z0 && z <= z0 + size,
    heightAt, slopeAt, pct,
    roadDist: (x, z) => at(g.road, x, z),
    waterDist: (x, z) => at(g.water, x, z),
    groundAt: (x, z) => g.grounds[at(g.ground, x, z)] || 'ground',
    specialAt: (x, z, kinds = null) => (g.specials || []).find(s => (!kinds || kinds.includes(s.kind)) && Math.hypot(x - s.x, z - s.z) <= s.r) || null,
  };
  VIEWS.set(g, V);
  return V;
}

// ------------------------------------------------------------------------------------------------------------ the rules
const GROUND_WORDS = { water: 'water', shallows: 'shallow water', ice: 'ice', road: 'a road', asphalt: 'a road', concrete: 'concrete', mud: 'mud', sand: 'sand', snow: 'snow', farm: 'a ploughed field', regolith: 'loose dust' };
const m = v => `${Math.round(v)} m`;
/** A place's office named in a sentence: 'the Highgate Survey Office', 'Greywatch Base' stays as it is if it has its own 'the'. */
const theName = n => !n ? 'the Survey Office' : /^the /i.test(n) ? n : `the ${n}`;

/** One rule at (x, z): { ok, text, k (0..1 how comfortably it passes) }. */
const RULES = {
  high(r, V, x, z) {
    const need = V.pct(r.pct ?? 0.7), have = V.heightAt(x, z), top = V.pct(0.985);
    return have >= need ? { ok: true, text: `High enough (${m(have)} up)`, k: clamp01((have - need) / Math.max(1, top - need)) }
      : { ok: false, text: `Too low — ${m(have)} up, it needs ${m(need)} or more. Go higher`, k: 0 };
  },
  slope(r, V, x, z) {
    const s = V.slopeAt(x, z), max = r.max ?? 20, word = r.word === 'flat' ? 'flat' : 'level';
    return s <= max ? { ok: true, text: `Ground ${word} enough (${Math.round(s)}°)`, k: clamp01(1 - s / max) }
      : { ok: false, text: r.word === 'flat' ? `Not flat — ${Math.round(s)}° of slope, it needs under ${max}°` : `Too steep — ${Math.round(s)}°, it needs under ${max}°`, k: 0 };
  },
  road(r, V, x, z) {
    const d = V.roadDist(x, z), min = r.min ?? 50;
    return d >= min ? { ok: true, text: `Away from the roads (${d >= 999 ? 'far' : m(d)})`, k: clamp01((d - min) / min) }
      : { ok: false, text: `Too near a road (${m(Math.max(0, d))}) — get ${m(min)} away from roads`, k: 0 };
  },
  ground(r, V, x, z) {
    const gname = V.groundAt(x, z), bad = (r.not && r.not.includes(gname)) || (r.only && !r.only.includes(gname));
    return bad ? { ok: false, text: `Not on ${GROUND_WORDS[gname] || gname} — find firmer ground`, k: 0 } : { ok: true, text: 'Good ground', k: 1 };
  },
  summit(r, V, x, z) {
    const h = V.heightAt(x, z), R = r.r ?? 40, by = r.by ?? 2;
    let hi = -Infinity, hiD = 0, sum = 0, cnt = 0;
    for (let a = 0; a < 16; a++) for (const f of [1 / 3, 2 / 3, 1]) {
      const px = x + Math.cos(a * Math.PI / 8) * R * f, pz = z + Math.sin(a * Math.PI / 8) * R * f, ph = V.heightAt(px, pz);
      if (ph > hi) { hi = ph; hiD = R * f; } sum += ph; cnt++;
    }
    const above = h - sum / cnt, rise = r.rise ?? 0;
    if (hi - h > by) return { ok: false, text: `Not the top — the ground ${m(hiD)} away is ${m(hi - h)} higher. Climb to the highest point`, k: 0 };
    if (above < rise) return { ok: false, text: `Not a hilltop — it needs to stand above the ground around it`, k: 0 };
    return { ok: true, text: `On top — a clear view all round`, k: clamp01((above - rise) / (R * 0.25)) };
  },
  apart(r, V, x, z, kit, ctx) {
    const mine = (ctx.others || []).filter(o => r.any ? true : o.kit === kit.id);
    let best = Infinity, near = null;
    for (const o of mine) { const d = Math.hypot(o.x - x, o.z - z); if (d < best) { best = d; near = o; } }
    const need = r.m ?? 300;
    if (best >= need) return { ok: true, text: mine.length ? `Clear of the other kits (${best === Infinity ? 'none near' : m(best)})` : 'No other kit nearby', k: clamp01(best === Infinity ? 1 : (best - need) / need) };
    const what = near && near.kit !== kit.id ? (kitById(near.kit)?.name || 'kit') : kit.name;
    return { ok: false, text: `Too close to another ${what} (${m(best)}) — keep ${m(need)} apart`, k: 0 };
  },
  near(r, V, x, z) {
    const sp = r.special?.length ? V.specialAt(x, z, r.special) : null;
    if (sp) return { ok: true, text: `In ${sp.name}`, k: 1 };
    if (Number.isFinite(r.water)) {
      const d = V.waterDist(x, z);
      if (d <= r.water) return { ok: true, text: `Water nearby (${m(d)})`, k: clamp01(1 - d / r.water) };
    }
    const where = [Number.isFinite(r.water) ? `within ${m(r.water)} of water` : null,
      ...[...new Set((r.special || []).map(k => k === 'crater' ? 'a big crater' : (V.specials.find(s => s.kind === k)?.name) || k.replace(/_/g, ' ')))].map(n => `in ${n}`)].filter(Boolean);
    return { ok: false, text: `${Number.isFinite(r.water) ? 'Too dry' : 'Not here'} — set it up ${where.join(', or ')}`, k: 0 };
  },
  office(r, V, x, z, kit, ctx) {
    const o = ctx.office || V.office; if (!o) return { ok: true, text: 'Far out', k: 1 };
    const d = Math.hypot(x - o.x, z - o.z), min = r.min ?? 600;
    return d >= min ? { ok: true, text: `Far enough out (${(d / 1000).toFixed(1)} km from ${theName(o.name)})`, k: clamp01((d - min) / min) }
      : { ok: false, text: `Too near ${theName(o.name)} (${m(d)}) — take it ${m(min)} out`, k: 0 };
  },
};
export const RULE_KINDS = Object.freeze(Object.keys(RULES));

/** Is (x, z) a good spot for `kit` in this place? Every rule must pass; q = how comfortably (0..1). */
export function judgeSpot(kit, V, p, ctx = {}) {
  if (!kit || !V || !p) return { ok: false, why: 'Nothing to judge', checks: [], q: 0, grade: null };
  const x = p[0], z = p[2];
  if (!V.inside(x, z)) return { ok: false, why: 'Off the edge of the map', checks: [], q: 0, grade: null };
  const checks = [];
  for (const r of rulesFor(kit, V.map)) {
    const f = RULES[r.t]; if (!f) continue;
    const c = f(r, V, x, z, kit, ctx);
    checks.push({ t: r.t, ok: c.ok, text: c.text, k: c.k });
  }
  const bad = checks.find(c => !c.ok);
  const q = bad ? 0 : checks.length ? checks.reduce((a, c) => a + c.k, 0) / checks.length : 1;
  return { ok: !bad, why: bad ? bad.text : null, checks, q: Math.round(q * 100) / 100, grade: bad ? null : grade(q) };
}
export const grade = q => q >= 0.62 ? 'excellent' : q >= 0.3 ? 'good' : 'fair';

/** Gold for one set-up kit, reported at the office: by kit, distance from the office and how good the spot is. */
export function spotPay(kit, q, metres) {
  const P = kit?.pay || { base: 80, per_km: 40 };
  return Math.max(1, Math.round((P.base + P.per_km * Math.max(0, metres) / 1000) * (0.75 + 0.5 * clamp01(q || 0))));
}

/** What the survey upgrades change (rule 5: the PLAY, not a number on the pay). */
export function surveyRules(upgrades = []) {
  const has = id => upgrades.includes(id);
  return { setupScale: has(SURVEY_UPS.quick) ? 0.5 : 1, crates: has(SURVEY_UPS.twin) ? 2 : 1, sling: has(SURVEY_UPS.sling) ? SLING.long : SLING.short, scanner: has(SURVEY_UPS.scanner) };
}
export const setupMs = (kit, upgrades = []) => Math.round((kit?.setup ?? 5) * 1000 * surveyRules(upgrades).setupScale);

// ------------------------------------------------------------------------------------------------------------ levels
/**
 * A level's goal (data/jobs.json survey level.need) against a player's REPORTED, still-standing sites [{ kit, p, paid }]:
 * need = { kits: { <kitId>: n }, apart?: metres between kits of the same kind that count }.
 */
export function levelCount(need, sites) {
  const have = {};
  for (const [id, n] of Object.entries(need?.kits || {})) {
    const list = sites.filter(s => s.kit === id && s.paid);
    if (!need.apart) { have[id] = Math.min(n, list.length); continue; }
    // the most kits of this kind that are all `apart` from each other (greedy is enough for 3)
    const pick = [];
    for (const s of list) if (pick.every(o => Math.hypot(o.p[0] - s.p[0], o.p[2] - s.p[2]) >= need.apart)) pick.push(s);
    have[id] = Math.min(n, pick.length);
  }
  return have;
}
export function levelMeets(need, sites) {
  if (!need?.kits) return false;
  const have = levelCount(need, sites);
  return Object.entries(need.kits).every(([id, n]) => (have[id] || 0) >= n);
}
export function levelText(need, sites) {
  if (!need?.kits) return '';
  const have = levelCount(need, sites);
  return Object.entries(need.kits).map(([id, n]) => `${kitById(id)?.name || id}: ${have[id] || 0} / ${n}`).join(' · ') + (need.apart ? ` (each ${need.apart} m apart)` : '') + ' reported';
}

// ------------------------------------------------------------------------------------------------------------ scanner
/** The Site scanner: passing spots within r of (x, z), best first, at least `gap` metres apart, at most `max`. */
export function goodSpots(kit, V, ctx = {}, { x = 0, z = 0, r = 700, step = 24, gap = 90, max = 24 } = {}) {
  if (!kit || !V) return [];
  const found = [];
  for (let dz = -r; dz <= r; dz += step) for (let dx = -r; dx <= r; dx += step) {
    if (dx * dx + dz * dz > r * r) continue;
    const px = x + dx, pz = z + dz;
    if (!V.inside(px, pz)) continue;
    const j = judgeSpot(kit, V, [px, 0, pz], ctx);
    if (j.ok) found.push({ x: px, z: pz, q: j.q });
  }
  found.sort((a, b) => b.q - a.q);
  const out = [];
  for (const s of found) { if (out.length >= max) break; if (out.every(o => Math.hypot(o.x - s.x, o.z - s.z) >= gap)) out.push(s); }
  return out;
}
export { KITS };
