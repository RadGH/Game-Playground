// W9 professions — the eight mini-games as PURE state machines (no DOM, no three, no clock of their own).
//
// Every game is 3–6 seconds, one or two inputs, and ends in a score 0..1 that the server turns into a quality
// (Poor / Good / Fine / Perfect). The drawing lives in prof-draw.js, the frame (keys, pointer, pad, sound, the result
// card) in prof-minigame.js; this file is what a node test, the gallery and the spec's "synthetic player" all drive.
//
//   const run = createRun('mining', spec, seed)        // spec: the server's numbers (missing ones fall back to DEFAULTS)
//   run.advanceTo(seconds)                             // play the game forward to a moment (fixed 1/240 s steps inside)
//   run.press(side?) · run.release() · run.aim(y)      // inputs, applied AT the moment the run is at
//   run.state.done → run.result()                      // { score, quality, parts: [...], over?, bonus? }
//   run.bot()                                          // what a perfect player would do right now (tests, gallery, spec)
//
// FRAME-RATE INDEPENDENT BY CONSTRUCTION: nothing here is stepped "per frame". The frame calls advanceTo(the time of
// the input event) before applying an input, so a press at 10 frames a second lands where it was pressed, not where
// the last picture was drawn. A test plays every game at 240, 60 and 10 "fps" and gets the same score.
//
//   mining      strike    a marker sweeps a bar; hit it inside the sweet spot, three times (the spot moves and narrows)
//   logging     chop      beats come down alternating sides; chop left, right, left… on the beat
//   foraging    pick      five buds open one after another and close again; pick each while it is open
//   skinning    trace     a cut line scrolls under the knife; keep the knife on the line
//   smithing    forge     the bar cools through a glowing band; hammer while it is in the band (a cold bar goes back in the fire)
//   outfitting  stitch    the needle runs along a seam; press as it crosses each mark
//   alchemy     pour      hold to pour, let go at the mark — twice; over the mark is spoiled
//   tempering   gauge     a gauge climbs toward a band that keeps narrowing; stop it inside (past the band = over-tempered)

export const GAME_OF = { mining: 'strike', logging: 'chop', foraging: 'pick', skinning: 'trace', smithing: 'forge', outfitting: 'stitch', alchemy: 'pour', tempering: 'gauge' };
export const PROFESSION_OF_GAME = Object.fromEntries(Object.entries(GAME_OF).map(([p, g]) => [g, p]));
export const QUALITIES = ['poor', 'good', 'fine', 'perfect'];
export const QUALITY_WORD = { fail: 'Failed', poor: 'Poor', good: 'Good', fine: 'Fine', perfect: 'Perfect' };
/** Score (0..1) -> quality id. The server decides the real one; this is the same table for the card shown before its answer. */
export const QUALITY_AT = { good: 0.4, fine: 0.7, perfect: 0.9 };
export function qualityOf(score, at = QUALITY_AT) { return score >= at.perfect ? 'perfect' : score >= at.fine ? 'fine' : score >= at.good ? 'good' : 'poor'; }

const H = 1 / 240;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export function rngOf(seed) { let a = (seed >>> 0) || 0x9e3779b9; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const tri = p => { const f = p - Math.floor(p); return f < 0.5 ? f * 2 : 2 - f * 2; };        // 0..1..0 once per unit
const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

/** The numbers each game runs on. A server spec overrides any of them; `hard` (0..1) is the one dial for "a harder node / recipe". */
export const DEFAULTS = {
  strike: { strikes: 3, sweep: 1.3, zone: 0.24, core: 0.085, narrow: 0.82, drift: 0.07, lock: 0.5, ms: 6000 },
  chop: { chops: 6, beat: 0.56, lead: 0.9, window: 0.15 },
  pick: { plants: 5, ripe: 1.0, gap: 0.68, lead: 0.55, fresh: 0.6 },
  trace: { ms: 4200, tol: 0.085, lead: 0.5, rise: 1.5, fall: 1.2 },
  forge: { strikes: 4, ms: 6500, lo: 0.52, hi: 0.76, cool: 0.5, drop: 0.13, reheat: 0.5, lock: 0.14 },
  stitch: { holes: 6, travel: 3.9, lead: 0.45, window: 0.13 },
  pour: { pours: 2, rate: 0.17, surge: 0.5, settle: 0.4, ms: 2500 },
  gauge: { ms: 3300, centre: 0.72, wide: 0.34, narrow: 0.075, ease: 1.7, lead: 0.35 },
};
/** A harder node or recipe: one dial tightens whatever makes that game hard. Pure. */
export function specFor(game, spec = {}) {
  const d = { ...DEFAULTS[game] }, k = clamp(Number(spec.hard) || 0);
  if (game === 'strike') { d.zone *= 1 - 0.35 * k; d.core *= 1 - 0.3 * k; d.sweep *= 1 - 0.22 * k; }
  if (game === 'chop') { d.beat *= 1 - 0.2 * k; d.window *= 1 - 0.25 * k; }
  if (game === 'pick') { d.ripe *= 1 - 0.3 * k; d.gap *= 1 - 0.15 * k; }
  if (game === 'trace') { d.tol *= 1 - 0.3 * k; }
  if (game === 'forge') { d.cool *= 1 + 0.3 * k; }
  if (game === 'stitch') { d.window *= 1 - 0.3 * k; d.travel *= 1 - 0.15 * k; }
  if (game === 'pour') { d.rate *= 1 + 0.35 * k; }
  if (game === 'gauge') { d.narrow *= 1 - 0.35 * k; d.ms *= 1 - 0.15 * k; }
  for (const [key, v] of Object.entries(spec)) if (key in d && Number.isFinite(v)) d[key] = v;
  d.hard = k;
  return d;
}
/** How long a game can last at most, in seconds (the frame's time bar; the server's own time-out sits above this). */
export function maxSeconds(game, spec = {}) {
  const d = specFor(game, spec);
  switch (game) {
    case 'strike': case 'forge': return d.ms / 1000;
    case 'chop': return d.lead + d.chops * d.beat + d.window * 2;
    case 'pick': return d.lead + (d.plants - 1) * d.gap + d.ripe + 0.25;
    case 'trace': return d.lead + d.ms / 1000;
    case 'stitch': return d.lead + d.travel + 0.2;
    case 'pour': return d.pours * (d.ms / 1000 + d.settle) + 0.2;
    case 'gauge': return d.lead + d.ms / 1000 + 0.1;
    default: return 6;
  }
}

// ------------------------------------------------------------------------------------------------ the games
// Each: make(d, rnd) -> state · step(s, d, dt) · press(s, d, side) · release(s, d) · aim(s, d, y) · bot(s, d) -> { press?, side?, hold?, aim? }
// A state always has: t (seconds played), done, parts (one grade 0..1 per strike / chop / bud / pour …), note (the last
// thing that happened, for the frame's flash and sound: { kind, grade, at }).
const note = (s, kind, grade, more = {}) => { s.note = { kind, grade, at: s.t, n: (s.note?.n || 0) + 1, ...more }; };

const GAMES = {
  // ---- mining ---------------------------------------------------------------------------------------------
  strike: {
    make(d, rnd) { return { pos: 0, phase: rnd() * 0.3, centre: 0.3 + rnd() * 0.4, c0: 0, zone: d.zone, core: d.core, lock: 0, from: 0, wob: rnd() * 6.28, _rnd: rnd }; },
    step(s, d, dt) {
      if (s.lock > 0) { s.lock -= dt; if (s.lock <= 0) s.phase = s.from; else return; }      // the pick is drawn back: it starts again from an end of the bar
      s.phase += dt / d.sweep; s.pos = tri(s.phase);
      s.wob += dt * 1.9; s.c0 = clamp(s.centre + Math.sin(s.wob) * d.drift, s.zone / 2, 1 - s.zone / 2);
      if (s.t * 1000 >= d.ms) { while (s.parts.length < d.strikes) s.parts.push(0); note(s, 'timeout', 0); s.done = true; }
    },
    press(s, d) {
      if (s.lock > 0) return;
      const dist = Math.abs(s.pos - s.c0);
      const grade = dist <= s.core / 2 ? 1 : dist <= s.zone / 2 ? 0.8 - 0.3 * ((dist - s.core / 2) / (s.zone / 2 - s.core / 2)) : 0;
      s.parts.push(grade); note(s, grade >= 1 ? 'perfect' : grade > 0 ? 'hit' : 'miss', grade, { pos: s.pos });
      if (s.parts.length >= d.strikes) { s.done = true; return; }
      s.lock = d.lock; s.zone *= d.narrow; s.core *= Math.sqrt(d.narrow);
      // the spot jumps somewhere else, at least a quarter of the bar away
      let c = s.centre; for (let i = 0; i < 6 && Math.abs(c - s.centre) < 0.25; i++) c = 0.16 + s._rnd() * 0.68; s.centre = c;
      s.from = s.pos < 0.5 ? 0 : 0.5;                                      // (phase 0 = the left end, 0.5 = the right end)
    },
    bot(s) { return { press: s.lock <= 0 && Math.abs(s.pos - s.c0) <= s.core * 0.3 }; },
    bonus: s => s.parts.length > 0 && s.parts.every(g => g >= 1),
  },
  // ---- logging --------------------------------------------------------------------------------------------
  chop: {
    make(d, rnd) { const first = rnd() < 0.5 ? 'L' : 'R'; return { beats: Array.from({ length: d.chops }, (_, i) => ({ at: d.lead + i * d.beat, side: (i % 2 === 0) === (first === 'L') ? 'L' : 'R', grade: null })), next: 0, swing: null }; },
    step(s, d) {
      const b = s.beats[s.next];
      if (b && s.t > b.at + d.window * 1.7) { b.grade = 0; s.parts.push(0); s.next++; note(s, 'miss', 0, { side: b.side }); }
      if (s.next >= s.beats.length) s.done = true;
    },
    press(s, d, side) {
      const b = s.beats[s.next]; if (!b) return;
      const dt = Math.abs(s.t - b.at);
      if (dt > d.window * 1.7) { if (s.t < b.at - d.beat * 0.6) return; b.grade = 0; }                 // far too early: this beat is spoiled (no mashing)
      else {
        let g = dt <= d.window * 0.45 ? 1 : dt <= d.window ? 0.75 : 0.4;
        if (side && side !== b.side) g = 0;                                // the wrong side: the axe bites the bark, nothing more
        else if (!side) g = Math.min(g, 0.75);                             // "any button": it chops, but a clean cut needs the side
        b.grade = g;
      }
      s.swing = { side: side || b.side, at: s.t };
      s.parts.push(b.grade); s.next++; note(s, b.grade >= 1 ? 'perfect' : b.grade > 0 ? 'hit' : 'miss', b.grade, { side: side || b.side });
      if (s.next >= s.beats.length) s.done = true;
    },
    bot(s) { const b = s.beats[s.next]; return b && s.t >= b.at - H ? { press: true, side: b.side } : {}; },
  },
  // ---- foraging -------------------------------------------------------------------------------------------
  pick: {
    make(d, rnd) {
      const order = Array.from({ length: d.plants }, (_, i) => i);
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      const plants = Array.from({ length: d.plants }, () => null);
      order.forEach((slot, k) => { plants[slot] = { slot, open: d.lead + k * d.gap + (rnd() - 0.5) * 0.12, grade: null }; });
      for (const p of plants) p.close = p.open + d.ripe;
      return { plants, cursor: order[0], picked: 0 };
    },
    step(s, d) {
      for (const p of s.plants) if (p.grade == null && s.t > p.close) { p.grade = 0; s.parts.push(0); note(s, 'miss', 0, { slot: p.slot }); }
      if (s.plants.every(p => p.grade != null)) s.done = true;
    },
    /** `side`: a slot number picks that bud; 'L' / 'R' move the cursor; nothing = pick the bud under the cursor. */
    press(s, d, side) {
      if (side === 'L' || side === 'R') { const step = side === 'L' ? -1 : 1; let c = s.cursor; for (let i = 0; i < s.plants.length; i++) { c = (c + step + s.plants.length) % s.plants.length; if (s.plants[c].grade == null) break; } s.cursor = c; note(s, 'move', null, { slot: c }); return; }
      const p = s.plants[Number.isInteger(side) ? side : s.cursor]; if (!p || p.grade != null) return;
      s.cursor = p.slot;
      if (s.t < p.open) { p.grade = 0; note(s, 'bruise', 0, { slot: p.slot }); }                       // picked shut: bruised
      else { p.grade = s.t <= p.open + d.ripe * d.fresh ? 1 : 0.7; s.picked++; note(s, p.grade >= 1 ? 'perfect' : 'hit', p.grade, { slot: p.slot }); }
      s.parts.push(p.grade);
      if (s.plants.every(q => q.grade != null)) s.done = true;
      else if (s.plants[s.cursor].grade != null) {                         // the cursor steps to the bud that opens next
        const nxt = s.plants.filter(q => q.grade == null).sort((a, b) => a.open - b.open)[0]; if (nxt) s.cursor = nxt.slot;
      }
    },
    bot(s) { const p = s.plants.filter(q => q.grade == null && s.t >= q.open + 0.02).sort((a, b) => a.open - b.open)[0]; return p ? { press: true, side: p.slot } : {}; },
    stateOf(p, t, d) { return p.grade != null ? (p.grade > 0 ? 'picked' : 'lost') : t < p.open - 0.35 ? 'bud' : t < p.open ? 'swell' : t <= p.open + d.ripe * d.fresh ? 'ripe' : 'wilt'; },
  },
  // ---- skinning -------------------------------------------------------------------------------------------
  trace: {
    make(d, rnd) { return { y: 0.5, hold: false, aimed: null, on: 0, played: 0, w: [0.16 + rnd() * 0.06, 0.07 + rnd() * 0.05, 1.1 + rnd() * 0.5, 2.6 + rnd() * 1.0, rnd() * 6.28, rnd() * 6.28], inLine: true }; },
    /** The line's height (0..1) at progress x (0..1). */
    path(s, x) { const [a1, a2, f1, f2, p1, p2] = s.w; return clamp(0.5 + a1 * Math.sin(x * f1 * 6.283 + p1) + a2 * Math.sin(x * f2 * 6.283 + p2), 0.1, 0.9); },
    x(s, d) { return clamp((s.t - d.lead) / (d.ms / 1000)); },
    step(s, d, dt) {
      if (s.aimed != null) s.y += clamp(s.aimed - s.y, -dt * 3.2, dt * 3.2);                            // a finger or the mouse leads the knife (it cannot teleport)
      else s.y = clamp(s.y + (s.hold ? d.rise : -d.fall) * dt * 0.5, 0.04, 0.96);
      if (s.t < d.lead) return;
      const off = Math.abs(s.y - GAMES.trace.path(s, GAMES.trace.x(s, d)));
      s.inLine = off <= d.tol; s.played += dt; s.on += dt * (off <= d.tol ? 1 : off <= d.tol * 1.8 ? 0.45 : 0);
      if (s.t >= d.lead + d.ms / 1000) { s.parts = [clamp(s.on / s.played)]; s.done = true; note(s, 'end', s.parts[0]); }
    },
    press(s) { s.hold = true; s.aimed = null; }, release(s) { s.hold = false; },
    aim(s, d, y) { s.aimed = clamp(y, 0.04, 0.96); },
    bot(s, d) { return { aim: GAMES.trace.path(s, clamp(GAMES.trace.x(s, d) + 0.012)) }; },
    /** A player with one button: hold when the knife is under the line. */
    botHold(s, d) { return { hold: s.y < GAMES.trace.path(s, clamp(GAMES.trace.x(s, d) + 0.02)) }; },
    score: s => (s.played > 0 ? clamp(s.on / s.played) : 0),
  },
  // ---- smithing -------------------------------------------------------------------------------------------
  forge: {
    make() { return { heat: 1, fire: 0, lock: 0, hits: 0 }; },
    step(s, d, dt) {
      if (s.lock > 0) s.lock -= dt;
      if (s.fire > 0) { s.fire -= dt; s.heat = Math.min(1, s.heat + dt * (1 - (d.lo - 0.1)) / d.reheat); if (s.fire <= 0) { s.heat = 1; note(s, 'hot', null); } }
      else { s.heat -= d.cool * dt; if (s.heat <= d.lo - 0.1) { s.fire = d.reheat; note(s, 'reheat', null); } }
      if (s.t * 1000 >= d.ms) { while (s.parts.length < d.strikes) s.parts.push(0); note(s, 'timeout', 0); s.done = true; }
    },
    press(s, d) {
      if (s.lock > 0 || s.fire > 0) return;                                 // the bar is in the fire: nothing to hit
      const mid = (d.lo + d.hi) / 2, half = (d.hi - d.lo) / 2, off = Math.abs(s.heat - mid);
      let g;
      if (s.heat > d.hi) g = 0.3;                                           // too hot: it smears
      else if (s.heat < d.lo) g = 0;                                        // cold: it rings and does nothing
      else g = off <= half * 0.45 ? 1 : 0.75;
      s.parts.push(g); s.hits++; s.lock = d.lock;
      note(s, g >= 1 ? 'perfect' : g >= 0.7 ? 'hit' : g > 0 ? 'soft' : 'miss', g, { heat: s.heat });
      s.heat -= d.drop;
      if (g === 0) { s.fire = d.reheat; }
      if (s.parts.length >= d.strikes) s.done = true;
    },
    bot(s, d) { const mid = (d.lo + d.hi) / 2; return { press: s.fire <= 0 && s.lock <= 0 && s.heat <= mid + (d.hi - d.lo) * 0.2 && s.heat >= d.lo + 0.01 }; },
  },
  // ---- outfitting -----------------------------------------------------------------------------------------
  stitch: {
    make(d, rnd) {
      // marks along the seam, never closer than 0.11 of its length (two presses must be two decisions)
      const n = d.holes, raw = Array.from({ length: n }, () => 0.6 + rnd()), sum = raw.reduce((a, b) => a + b, 0);
      let acc = 0.07; const holes = raw.map(g => { acc += (g / sum) * 0.86; return { s: acc - (g / sum) * 0.43, grade: null }; });
      return { holes, next: 0, strays: 0, bend: [rnd() * 6.28, 0.6 + rnd() * 0.6, rnd() * 6.28] };
    },
    /** Where the needle is along the seam, 0..1. */
    pos(s, d) { return clamp((s.t - d.lead) / d.travel); },
    step(s, d) {
      const h = s.holes[s.next], at = h ? d.lead + h.s * d.travel : Infinity;
      if (h && s.t > at + d.window * 1.7) { h.grade = 0; s.parts.push(0); s.next++; note(s, 'miss', 0, { i: s.next - 1 }); }
      if (s.t >= d.lead + d.travel + 0.05) { for (const q of s.holes) if (q.grade == null) { q.grade = 0; s.parts.push(0); } s.done = true; }
    },
    press(s, d) {
      const h = s.holes[s.next]; if (!h) return;
      const at = d.lead + h.s * d.travel, dt = Math.abs(s.t - at);
      if (dt > d.window * 1.7) { s.strays++; note(s, 'stray', 0); return; }  // a stitch in the wrong place (costs a little at the end)
      h.grade = dt <= d.window * 0.45 ? 1 : dt <= d.window ? 0.75 : 0.4;
      s.parts.push(h.grade); s.next++; note(s, h.grade >= 1 ? 'perfect' : 'hit', h.grade, { i: s.next - 1 });
    },
    bot(s, d) { const h = s.holes[s.next]; return h && s.t >= d.lead + h.s * d.travel - H ? { press: true } : {}; },
    score: s => clamp(mean(s.parts) - 0.06 * s.strays),
  },
  // ---- alchemy --------------------------------------------------------------------------------------------
  pour: {
    make(d, rnd) {
      const marks = []; let base = 0;
      for (let i = 0; i < d.pours; i++) { const m = base + 0.26 + rnd() * 0.16; marks.push(Math.min(0.94, m)); base = marks[i]; }
      return { level: 0, from: 0, marks, i: 0, hold: false, flow: 0, idle: 0, began: 0, poured: false };
    },
    step(s, d, dt) {
      if (s.done) return;
      const mark = s.marks[s.i];
      // the stream builds while you hold and takes a blink to stop when you let go
      s.flow = s.hold ? Math.min(1, s.flow + dt / d.surge) : Math.max(0, s.flow - dt / 0.07);
      if (s.flow > 0) { s.level = Math.min(1, s.level + d.rate * (0.55 + 1.6 * s.flow) * dt); s.poured = true; }
      if (s.hold) s.idle = 0; else if (s.poured) s.idle += dt;
      const over = s.level > mark + 0.1, timeUp = s.t - s.began > d.ms / 1000;
      if ((s.poured && !s.hold && s.flow <= 0 && s.idle >= d.settle) || over || timeUp) {
        const off = s.level - mark, a = Math.abs(off);
        const g = off > 0.1 ? 0 : a <= 0.018 ? 1 : a <= 0.045 ? 0.8 : a <= 0.09 ? 0.5 : a <= 0.16 ? 0.25 : 0.1;
        s.parts.push(s.poured ? g : 0); note(s, off > 0.045 ? 'spill' : g >= 1 ? 'perfect' : g >= 0.5 ? 'hit' : 'miss', g, { i: s.i, off });
        s.i++; s.hold = false; s.flow = 0; s.idle = 0; s.poured = false; s.began = s.t;
        if (s.level > mark) s.level = mark;                                  // what went over is skimmed off (and paid for in the grade)
        s.from = s.level;
        if (s.i >= s.marks.length) s.done = true;
      }
    },
    press(s) { s.hold = true; }, release(s) { s.hold = false; },
    bot(s, d) { const mark = s.marks[s.i]; if (mark == null) return { hold: false }; const coast = d.rate * (0.55 + 1.6 * s.flow) * 0.035; return { hold: s.level + coast < mark - 0.004 }; },
  },
  // ---- tempering ------------------------------------------------------------------------------------------
  gauge: {
    make(d, rnd) { return { level: 0, centre: clamp(d.centre + (rnd() - 0.5) * 0.12, 0.55, 0.85), width: d.wide, stopped: false }; },
    step(s, d) {
      if (s.stopped) return;
      const u = clamp((s.t - d.lead) / (d.ms / 1000));
      s.level = Math.pow(u, d.ease) * 1.06;
      // the band is at its narrowest as the gauge reaches the middle of it
      const k = clamp(s.level / s.centre); s.width = d.wide + (d.narrow - d.wide) * k * k;
      if (s.level > s.centre + s.width / 2 + 0.05 || u >= 1) { s.stopped = true; s.over = true; s.parts = [0]; s.done = true; note(s, 'over', 0); }
    },
    press(s, d) {
      if (s.stopped || s.t < d.lead * 0.5) return;
      s.stopped = true;
      const off = s.level - s.centre, a = Math.abs(off), half = s.width / 2;
      let g;
      if (off > half) { g = 0; s.over = true; }
      else if (off < -half) g = Math.max(0.12, 0.38 - (a - half) * 1.2);       // stopped short: a weak temper, nothing lost
      else g = a <= 0.02 ? 1 : a <= d.narrow / 2 ? 0.82 : 0.5 + 0.25 * (1 - a / half);
      s.parts = [g]; s.done = true; note(s, s.over ? 'over' : g >= 1 ? 'perfect' : g >= 0.5 ? 'hit' : 'short', g);
    },
    bot(s) { return { press: !s.stopped && s.level >= s.centre - 0.004 }; },
  },
};

export const GAME_IDS = Object.keys(GAMES);
/** What each game listens to: 'tap' (one button), 'sides' (left / right), 'slots' (pick one of several), 'hold', 'aim' (a height). */
export const GAME_INPUT = { strike: ['tap'], chop: ['sides', 'tap'], pick: ['slots', 'sides', 'tap'], trace: ['aim', 'hold'], forge: ['tap'], stitch: ['tap'], pour: ['hold'], gauge: ['tap'] };

/**
 * One play of one game. `game` is a game id ('strike') or a profession id ('mining').
 * Time only moves through advanceTo() / advance(); inputs are applied at the run's present moment.
 */
export function createRun(game, spec = {}, seed = 1) {
  const id = GAMES[game] ? game : GAME_OF[game];
  const G = GAMES[id]; if (!G) throw new Error('prof-games: no game "' + game + '"');
  const d = specFor(id, spec), rnd = rngOf(seed);
  const s = { t: 0, done: false, parts: [], note: null, ...G.make(d, rnd) };
  const inputs = [];                     // a log of what was pressed and when (sent with the result when the server wants it)
  // Time moves in whole 1/240 s steps counted as an integer, so the game played is the same however the caller cuts
  // the time up (a frame at a time, or straight to the moment of a key press).
  let steps = 0;
  function advanceTo(t) {
    const want = Math.min(steps + 240 * 30, Math.floor(t / H + 1e-6));
    while (steps < want && !s.done) { steps++; s.t = steps * H; G.step(s, d, H); }
    return s;
  }
  const advance = dt => advanceTo(steps * H + Math.max(0, dt));
  const log = (k, v) => { if (inputs.length < 6000) inputs.push([s.t, k, v ?? 0]); };
  let lastAim = -1;
  const run = {
    id, game: id, profession: PROFESSION_OF_GAME[id], spec: d, state: s, seed, inputs,
    advance, advanceTo,
    press(side) { if (s.done) return; log('p', side === 'L' ? -1 : side === 'R' ? 1 : Number.isInteger(side) ? side + 10 : 0); G.press?.(s, d, side); },
    release() { if (s.done) return; log('r'); G.release?.(s, d); },
    aim(y) { if (s.done || !G.aim) return; if (Math.abs(y - lastAim) > 0.002) { lastAim = y; log('a', y); } G.aim(s, d, y); },
    /** Do what `bot` says (tests, the gallery's demo, the spec's synthetic player decide with this and press real keys). */
    bot(kind = 'best') { return (kind === 'hold' && G.botHold ? G.botHold : G.bot)(s, d); },
    apply(act = {}) {
      if (act.aim != null) run.aim(act.aim);
      if (act.hold != null && !!act.hold !== !!s.hold) { if (act.hold) run.press(); else run.release(); }
      if (act.press) run.press(act.side);
    },
    score() { return s.done || id === 'trace' ? clamp(G.score ? G.score(s) : mean(s.parts)) : clamp(mean(s.parts)); },
    result() { const score = +run.score().toFixed(3); return { game: id, profession: run.profession, score, quality: qualityOf(score), parts: s.parts.map(g => +g.toFixed(2)), over: !!s.over, bonus: !!G.bonus?.(s), ms: Math.round(s.t * 1000) }; },
    max: maxSeconds(id, spec),
    helpers: G,
  };
  return run;
}

/** Play a whole game with the bot, which looks at the state `rate` times a second (240 = every step). Returns the result and the input log. */
export function autoplay(game, { spec = {}, seed = 1, rate = 240, kind = 'best' } = {}) {
  const run = createRun(game, spec, seed), dt = 1 / rate;
  for (let i = 0; i < 40000 && !run.state.done; i++) { run.advance(dt); run.apply(run.bot(kind)); }
  return { ...run.result(), inputs: run.inputs.slice() };
}
/**
 * Play a recorded input log back while "drawing" at `fps`: the run is advanced a frame at a time, and — as the frame
 * does with real events — forward to each input's own moment before it is applied. The result must not depend on `fps`.
 */
export function replay(game, { spec = {}, seed = 1, inputs = [], fps = 60 } = {}) {
  const run = createRun(game, spec, seed), dt = 1 / fps;
  let i = 0, frame = 0;
  for (let n = 0; n < 40000 && !run.state.done; n++) {
    frame += dt;
    while (i < inputs.length && inputs[i][0] <= frame && !run.state.done) {
      const [t, k, v] = inputs[i++]; run.advanceTo(t);
      if (k === 'p') run.press(v === -1 ? 'L' : v === 1 ? 'R' : v >= 10 ? v - 10 : undefined); else if (k === 'r') run.release(); else if (k === 'a') run.aim(v);
    }
    run.advanceTo(frame);
  }
  return run.result();
}

/** One line of "how to play" per game, per device: 'keyboard' | 'pad' | 'touch'. */
export const HOW = {
  strike: { title: 'Strike the vein', keyboard: 'Press when the pick is over the bright spot. Three strikes.', pad: 'Press when the pick is over the bright spot. Three strikes.', touch: 'Tap when the pick is over the bright spot. Three strikes.' },
  chop: { title: 'Chop in rhythm', keyboard: 'Left, right, left… press the side as each mark reaches the trunk.', pad: 'Left, right, left… press the side as each mark reaches the trunk.', touch: 'Tap the left or right half as each mark reaches the trunk.' },
  pick: { title: 'Pick them ripe', keyboard: 'Pick each one while it is open. Shut ones bruise.', pad: 'Move to each one and pick it while it is open.', touch: 'Tap each one while it is open. Shut ones bruise.' },
  trace: { title: 'Follow the cut', keyboard: 'Keep the knife on the line: hold to lift it, let go to lower it — or steer with the mouse.', pad: 'Keep the knife on the line: hold to lift it, let go to lower it.', touch: 'Keep your finger on the line as it moves.' },
  forge: { title: 'Strike while it glows', keyboard: 'Hammer while the heat is inside the band. Four blows.', pad: 'Hammer while the heat is inside the band. Four blows.', touch: 'Tap while the heat is inside the band. Four blows.' },
  stitch: { title: 'Stitch the seam', keyboard: 'Press as the needle crosses each mark.', pad: 'Press as the needle crosses each mark.', touch: 'Tap as the needle crosses each mark.' },
  pour: { title: 'Pour to the mark', keyboard: 'Hold to pour, let go at the line. Twice. Too much spoils it.', pad: 'Hold to pour, let go at the line. Twice. Too much spoils it.', touch: 'Hold to pour, lift your finger at the line. Twice.' },
  gauge: { title: 'Stop it in the band', keyboard: 'Stop the gauge inside the band. The band narrows; past it the work is lost.', pad: 'Stop the gauge inside the band. The band narrows; past it the work is lost.', touch: 'Tap to stop the gauge inside the band. Past it the work is lost.' },
};
