// Thousandvale — PROFESSION MINI-GAMES (round 8, W9; stream P-core). Pure: no files, no DOM, no clock, no Math.random.
//
// One file both sides run. The SERVER makes a game from a seed (`makeGame`) and sends the pattern; the CLIENT draws it
// from the pattern alone and sends back nothing but its raw inputs — a flat list `[t0, v0, t1, v1, …]`, `t` = ms since
// the game appeared, `v` = the input's value; the SERVER (and the client, for live feedback) scores them with the same
// `scoreGame`. No score ever crosses the wire, so none can be made up.
//
//   makeGame(type, { seed, ease = 0, base })      -> game   (`base` = data/rules/professions.json `games.<type>`)
//   scoreGame(game, inputs)                       -> { marks: [0|1|2 …], score 0..1, steps, used, flags: [..] }
//   checkInputs(game, inputs, { elapsedMs, graceMs, lateMs, minGapMs }) -> { ok, why?, inputs (cleaned pairs) }
//   qualityOf(score, mins)                        -> 'fail' | 'poor' | 'good' | 'fine' | 'perfect'
//   perfectInputs(game) / botInputs(game, rng, sloppy)   what a flawless player / a human-ish one would send (tests, the sim)
//   gaugeAt / heatAt / levelAt / lineAt / markerAt        the curves, so a client draws exactly what is scored
//
// `ease` (0..1) = how far the worker's skill and tool are past what the work needs: it widens every "good" window by up
// to +50%. The eight types: strike (mining), rhythm (logging), pick (foraging), trace (skinning), forge (smithing),
// stitch (outfitting), pour (alchemy, cooking), gauge (tempering).

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const frac = x => x - Math.floor(x);
const r3 = v => Math.round(v * 1000) / 1000;

/** A small seeded generator (mulberry32) — the pattern of a game is a pure function of its seed. */
export function seeded(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const GAME_TYPES = Object.freeze(['strike', 'rhythm', 'pick', 'trace', 'forge', 'stitch', 'pour', 'gauge']);
/** Which game each profession plays (angling keeps its own tug: js/rules/fishing.js). */
export const GAME_OF = Object.freeze({ mining: 'strike', logging: 'rhythm', foraging: 'pick', skinning: 'trace', smithing: 'forge', outfitting: 'stitch', alchemy: 'pour', cooking: 'pour', tempering: 'gauge' });

/** What each type falls back to when the data file gives nothing (the file's numbers win). */
export const GAME_DEFAULTS = Object.freeze({
  strike: { steps: 3, ms: 6000, period: [1150, 1500], half: 0.11, perfect: 0.38 },
  rhythm: { steps: 5, ms: 5200, lead: 900, beat: [480, 560], good: 130, perfect: 55 },
  pick: { steps: 3, ms: 5000, spots: 6, open: [900, 1300], gap: [250, 700], lead: 500 },
  trace: { steps: 12, ms: 3600, amp: [0.16, 0.07], freq: [0.9, 2.3], band: 0.11, perfect: 0.045 },
  forge: { steps: 4, ms: 7000, cool: 0.00034, band: [0.45, 0.78], sweet: 0.07, reheat: 900, gap: 300 },
  stitch: { steps: 6, ms: 5600, lead: 800, gap: [380, 780], good: 120, perfect: 50 },
  pour: { steps: 2, ms: 6000, rate: [0.00028, 0.00038], accel: [1.2e-7, 2.2e-7], mark: [0.55, 0.9], good: 0.06, perfect: 0.022, pause: 400 },
  gauge: { steps: 1, ms: 4200, rise: [2600, 3300], pow: 1.6, centre: [0.6, 0.85], half0: 0.14, half1: 0.05, perfect: 0.4 },
});

const pickIn = (r, rng) => (Array.isArray(r) ? r[0] + rng() * (r[1] - r[0]) : r);
const wide = (v, ease) => v * (1 + 0.5 * clamp(ease || 0, 0, 1));

/**
 * Build one game. Same seed + same ease + same base = the same game, on any machine.
 * `opts.steps` overrides the number of steps (cooking's one-stage `pour`).
 */
export function makeGame(type, a = {}, b = null) {
  // makeGame(type, seed, opts?) is accepted too (P-client's ask)
  const { seed = 1, ease = 0, base = null, steps = null } = typeof a === 'number' ? { ...(b || {}), seed: a } : (a || {});
  if (!GAME_TYPES.includes(type)) return null;
  const B = { ...GAME_DEFAULTS[type], ...(base || {}) };
  const rng = seeded(seed);
  const n = Math.max(1, steps || B.steps);
  const g = { type, seed: seed >>> 0, ms: B.ms, steps: n };
  switch (type) {
    case 'strike': {
      g.period = Math.round(pickIn(B.period, rng));
      g.phase = r3(rng());
      g.half = r3(wide(B.half, ease));
      g.perfect = r3(g.half * B.perfect);
      g.spots = [];
      for (let i = 0; i < n; i++) g.spots.push(r3(0.15 + rng() * 0.7));
      break;
    }
    case 'rhythm': {
      g.lead = B.lead; g.beat = Math.round(pickIn(B.beat, rng)); g.first = rng() < 0.5 ? 0 : 1;
      g.good = Math.round(wide(B.good, ease)); g.perfect = B.perfect;
      g.ms = Math.max(B.ms, g.lead + n * g.beat + 600);
      break;
    }
    case 'pick': {
      g.spots = B.spots;
      // `n` of the places ripen, one after another with a little overlap; the others never do
      const order = [...Array(B.spots).keys()];
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      g.ripe = [];
      let t = B.lead;
      for (let k = 0; k < n; k++) {
        const open = Math.round(wide(pickIn(B.open, rng), ease));
        g.ripe.push({ i: order[k], from: Math.round(t), to: Math.round(t + open) });
        t += pickIn(B.gap, rng) + open * 0.45;
      }
      g.ms = Math.max(B.ms, g.ripe[n - 1].to + 500);
      break;
    }
    case 'trace': {
      g.a = [r3(pickIn([B.amp[0] * 0.7, B.amp[0]], rng)), r3(pickIn([B.amp[1] * 0.5, B.amp[1]], rng))];
      g.f = [r3(B.freq[0] * (0.8 + rng() * 0.4)), r3(B.freq[1] * (0.8 + rng() * 0.4))];
      g.p = [r3(rng()), r3(rng())];
      g.band = r3(wide(B.band, ease)); g.perfect = B.perfect;
      break;
    }
    case 'forge': {
      g.cool = B.cool * (0.9 + rng() * 0.2);
      const mid = (B.band[0] + B.band[1]) / 2, halfW = wide((B.band[1] - B.band[0]) / 2, ease);
      g.band = [r3(mid - halfW), r3(Math.min(0.95, mid + halfW))];
      g.sweet = B.sweet; g.reheat = B.reheat; g.gap = B.gap;
      break;
    }
    case 'stitch': {
      g.at = [];
      let t = B.lead;
      for (let i = 0; i < n; i++) { g.at.push(Math.round(t)); t += pickIn(B.gap, rng); }
      g.good = Math.round(wide(B.good, ease)); g.perfect = B.perfect;
      g.ms = Math.max(B.ms, g.at[n - 1] + 700);
      break;
    }
    case 'pour': {
      g.pause = B.pause; g.stages = [];
      for (let i = 0; i < n; i++) g.stages.push({ rate: pickIn(B.rate, rng), accel: pickIn(B.accel, rng), mark: r3(pickIn(B.mark, rng)), good: r3(wide(B.good, ease)), perfect: B.perfect });
      break;
    }
    case 'gauge': {
      g.rise = Math.round(pickIn(B.rise, rng)); g.pow = B.pow; g.centre = r3(pickIn(B.centre, rng));
      g.half0 = r3(wide(B.half0, ease)); g.half1 = r3(wide(B.half1, ease)); g.perfect = B.perfect;
      break;
    }
  }
  return g;
}

// ---- the curves (a client draws these; the scorer reads these) ----
/** strike: where the marker is on the bar (0..1) at `t` ms. */
export const markerAt = (g, t) => { const f = frac(t / g.period + g.phase); return f < 0.5 ? 2 * f : 2 - 2 * f; };
/** trace: where the cut line is (0..1) at `t` ms. */
export const lineAt = (g, t) => { const u = t / g.ms; let y = 0.5; for (let i = 0; i < g.a.length; i++) y += g.a[i] * Math.sin(2 * Math.PI * (g.f[i] * u + g.p[i])); return y; };
/** pour: how full stage `i` is, `tau` ms after it began. */
export const levelAt = (st, tau) => (tau <= 0 ? 0 : st.rate * tau + st.accel * tau * tau);
/** gauge: the needle (0..) and the band's half-width at `t` ms. */
export const gaugeAt = (g, t) => Math.pow(Math.max(0, t) / g.rise, g.pow);
export const gaugeHalf = (g, t) => g.half0 + (g.half1 - g.half0) * clamp(t / g.rise, 0, 1);
/**
 * forge: replay the inputs up to `t` — `{ heat, pausedUntil }`. Heat starts at 1 and falls `cool` per ms; a re-heat
 * (`v === 1`) stops everything for `reheat` ms and the bar comes out at 1 again.
 */
export function heatAt(g, pairs, t) {
  let heat = 1, at = 0, paused = 0;
  for (const [ti, v] of pairs) {
    if (ti > t) break;
    if (v !== 1 || ti < paused) continue;
    heat = 1; at = ti + g.reheat; paused = at;
  }
  if (t < paused) return { heat: 1, pausedUntil: paused };
  return { heat: Math.max(0, heat - g.cool * (t - at)), pausedUntil: paused };
}

const toPairs = inputs => { const out = []; for (let i = 0; i + 1 < (inputs || []).length; i += 2) out.push([inputs[i], inputs[i + 1]]); return out; };

/**
 * Is this input list something a person could have sent for this game? `elapsedMs` = how long the server saw between
 * handing the game out and getting the answer. Returns the cleaned pairs (double-presses dropped) or a refusal.
 */
export function checkInputs(game, inputs, { elapsedMs = Infinity, graceMs = 350, lateMs = 4000, minGapMs = 90 } = {}) {
  if (!game) return { ok: false, why: 'game' };
  if (!Array.isArray(inputs) || inputs.length > 64 || inputs.length % 2) return { ok: false, why: 'shape' };
  const pairs = toPairs(inputs);
  let last = -1;
  for (const [t, v] of pairs) {
    if (!Number.isFinite(t) || !Number.isFinite(v) || t < 0 || t > game.ms + graceMs) return { ok: false, why: 'range' };
    if (t <= last) return { ok: false, why: 'order' };
    last = t;
  }
  // the answer cannot come before its own last input could have been played, nor long after the game ran out
  if (pairs.length && elapsedMs + graceMs < last) return { ok: false, why: 'early' };
  if (elapsedMs > game.ms + lateMs) return { ok: false, why: 'late' };
  const clean = [];
  const gapFree = game.type === 'trace';           // samples of a held pointer are not presses
  for (const p of pairs) { if (!gapFree && clean.length && p[0] - clean[clean.length - 1][0] < minGapMs) continue; clean.push(p); }
  return { ok: true, inputs: clean };
}

const timed = (d, good, perfect) => (d <= perfect ? 2 : d <= good ? 1 : 0);

/** Score a game from its raw inputs (flat list or pairs). Extra inputs never help. */
export function scoreGame(game, inputs) {
  const g = game, pairs = Array.isArray(inputs) && Array.isArray(inputs[0]) ? inputs : toPairs(inputs);
  const n = g.steps, marks = new Array(n).fill(0), flags = [];
  let penalty = 0;
  switch (g.type) {
    case 'strike':
      pairs.slice(0, n).forEach(([t], i) => { marks[i] = timed(Math.abs(markerAt(g, t) - g.spots[i]), g.half, g.perfect); });
      break;
    case 'rhythm': case 'stitch': {
      const beats = g.type === 'rhythm' ? marks.map((_, k) => g.lead + k * g.beat) : g.at;
      const taken = new Set();
      for (const [t, v] of pairs.slice(0, n + 2)) {
        let best = -1, bd = Infinity;
        beats.forEach((bt, k) => { const d = Math.abs(t - bt); if (!taken.has(k) && d < bd) { bd = d; best = k; } });
        if (best < 0 || bd > g.good) continue;
        taken.add(best);
        if (g.type === 'rhythm' && (v ? 1 : 0) !== (g.first + best) % 2) { flags.push('side'); continue; }
        marks[best] = timed(bd, g.good, g.perfect);
      }
      break;
    }
    case 'pick': {
      for (const [t, v] of pairs.slice(0, g.spots + 2)) {
        const k = g.ripe.findIndex(r => r.i === (v | 0) && t >= r.from - 80 && t <= r.to + 80);
        if (k < 0) { penalty++; flags.push('unripe'); continue; }
        if (marks[k]) continue;
        const r = g.ripe[k], mid = (r.from + r.to) / 2, half = (r.to - r.from) / 2;
        marks[k] = Math.abs(t - mid) <= half * 0.6 ? 2 : 1;
      }
      break;
    }
    case 'trace': {
      const slot = g.ms / n;
      for (let k = 0; k < n; k++) {
        const want = (k + 0.5) * slot;
        let best = null, bd = slot / 2;
        for (const p of pairs) { const d = Math.abs(p[0] - want); if (d <= bd) { bd = d; best = p; } }
        if (best) marks[k] = timed(Math.abs(best[1] - lineAt(g, best[0])), g.band, g.perfect);
      }
      break;
    }
    case 'forge': {
      let k = 0, lastHit = -Infinity;
      const mid = (g.band[0] + g.band[1]) / 2;
      for (const [t, v] of pairs) {
        if (k >= n) break;
        if (v === 1) continue;
        const h = heatAt(g, pairs, t);
        if (t < h.pausedUntil || t - lastHit < g.gap) continue;      // a blow while the bar is in the fire, or a double tap: nothing
        lastHit = t;
        marks[k++] = h.heat >= g.band[0] && h.heat <= g.band[1] ? (Math.abs(h.heat - mid) <= g.sweet ? 2 : 1) : 0;
        if (h.heat > g.band[1]) flags.push('hot'); else if (h.heat < g.band[0]) flags.push('cold');
      }
      break;
    }
    case 'pour': {
      let start = 0;
      pairs.slice(0, n).forEach(([t], i) => {
        const st = g.stages[i], lv = levelAt(st, t - start);
        marks[i] = lv > 1 ? 0 : timed(Math.abs(lv - st.mark), st.good, st.perfect);
        if (lv > 1) flags.push('spilled');
        start = t + g.pause;
      });
      break;
    }
    case 'gauge': {
      if (!pairs.length) { flags.push('over'); break; }
      const t = pairs[0][0], v = gaugeAt(g, t), half = gaugeHalf(g, t), d = v - g.centre;
      if (Math.abs(d) <= half) marks[0] = Math.abs(d) <= half * g.perfect ? 2 : 1;
      else flags.push(d > 0 ? 'over' : 'under');
      break;
    }
  }
  const sum = Math.max(0, marks.reduce((a, b) => a + b, 0) - penalty);
  return { marks, score: Math.round(sum / (2 * n) * 1000) / 1000, steps: n, used: pairs.length, flags };
}

export const QUALITIES = Object.freeze(['fail', 'poor', 'good', 'fine', 'perfect']);
export const QUALITY_MIN = Object.freeze({ poor: 0.2, good: 0.4, fine: 0.65, perfect: 0.9 });
export function qualityOf(score, mins = QUALITY_MIN) {
  const m = { ...QUALITY_MIN, ...(mins || {}) };
  return score >= m.perfect ? 'perfect' : score >= m.fine ? 'fine' : score >= m.good ? 'good' : score >= m.poor ? 'poor' : 'fail';
}

/** The inputs of a flawless play (flat list). */
export function perfectInputs(game) { return botInputs(game, () => 0.5, 0); }

/**
 * What a player whose timing is off by up to `sloppy` (0 = flawless, 1 = about the width of a "good" window) would
 * send. `rng` decides each error. Used by the tests and the economy sim; never by the server.
 */
export function botInputs(game, rng = () => 0.5, sloppy = 0) {
  const g = game, out = [];
  const err = span => (rng() * 2 - 1) * span * sloppy;
  switch (g.type) {
    case 'strike': {
      let t = 150;
      for (let i = 0; i < g.steps; i++) {
        // the next time the marker crosses the spot, at least a quarter second after the last strike
        let best = t;
        for (let x = t; x < g.ms; x += 4) { if (Math.abs(markerAt(g, x) - g.spots[i]) <= 0.012) { best = x; break; } best = x; }
        const hit = Math.round(best + err(g.half * g.period / 2));
        out.push(Math.max(t, hit), 0); t = Math.max(t, hit) + 260;
      }
      break;
    }
    case 'rhythm': for (let k = 0; k < g.steps; k++) out.push(Math.round(g.lead + k * g.beat + err(g.good)), (g.first + k) % 2); break;
    case 'stitch': for (const at of g.at) out.push(Math.round(at + err(g.good)), 0); break;
    case 'pick': for (const r of [...g.ripe].sort((a, b) => a.from - b.from)) out.push(Math.round((r.from + r.to) / 2 + err((r.to - r.from) / 2)), r.i); break;
    case 'trace': { const slot = g.ms / g.steps; for (let k = 0; k < g.steps; k++) { const t = Math.round((k + 0.5) * slot); out.push(t, r3(lineAt(g, t) + err(g.band))); } break; }
    case 'forge': {
      const mid = (g.band[0] + g.band[1]) / 2;
      // two blows per heat, either side of the middle of the glow, then back into the fire
      const sweetMs = g.sweet / g.cool, off = Math.max(g.gap / 2 + 5, Math.min(sweetMs * 0.75, g.gap));
      let base = 0, k = 0, t = 0;                       // base = when the bar last came out at heat 1
      while (k < g.steps && base < g.ms) {
        const tMid = base + (1 - mid) / g.cool, span = (g.band[1] - g.band[0]) / 2 / g.cool;
        for (const side of [-1, 1]) {
          if (k >= g.steps) break;
          const hit = Math.round(Math.max(t + g.gap, tMid + side * off + err(span)));
          out.push(hit, 0); t = hit; k++;
        }
        if (k < g.steps) { const re = t + 80; out.push(re, 1); base = re + g.reheat; t = base; }
      }
      break;
    }
    case 'pour': {
      let start = 0;
      for (const st of g.stages) {
        // solve rate·τ + accel·τ² = mark
        const tau = (-st.rate + Math.sqrt(st.rate * st.rate + 4 * st.accel * st.mark)) / (2 * st.accel);
        const t = Math.round(start + tau + err(st.good / (st.rate + 2 * st.accel * tau)));
        out.push(t, 0); start = t + g.pause;
      }
      break;
    }
    case 'gauge': { const t0 = g.rise * Math.pow(g.centre, 1 / g.pow); const slope = g.pow * Math.pow(t0 / g.rise, g.pow - 1) / g.rise; out.push(Math.round(t0 + err(gaugeHalf(g, t0) / slope)), 0); break; }
  }
  // strictly rising times, whatever the errors did
  for (let i = 2; i < out.length; i += 2) if (out[i] <= out[i - 2]) out[i] = out[i - 2] + 1;
  return out;
}
