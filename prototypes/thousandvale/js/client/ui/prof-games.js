// W9 professions — the eight mini-games as the client plays them: a VIEW-MODEL over P-core's patterns (pure: no DOM,
// no three, no clock of its own).
//
// The game itself is not ours. js/rules/professions-games.js (stream P-core) makes a pattern from a seed on the
// server and scores the raw inputs there; this file turns "the pattern + what has been pressed so far + the time" into
// what the drawer needs (where the marker is, which bud is open, how hot the bar is) and collects the inputs in the
// shape the server wants: a flat list `[t0, v0, t1, v1, …]`, `t` = whole ms since the game appeared.
//
//   const run = createRun(game)                         // game = gatherR.game / craftR.game (or makeGame(type, {seed}))
//   run.advanceTo(ms)                                   // the present moment (the frame calls this with the time of an input BEFORE applying it)
//   run.press(v?) · run.hold(on) · run.aim(y)           // v: rhythm side 0|1, pick place i, forge 1 = back in the fire
//   run.view()                                          // everything the drawer draws, derived from P-core's own curves
//   run.done → run.result()                             // { inputs, marks, score, quality, flags } — marks from P-core's scoreGame
//   run.botNext()                                       // the next input a flawless player would make (tests, gallery, the spec)
//
// FRAME-RATE INDEPENDENT BY CONSTRUCTION: every curve is a closed function of the time, and an input is stamped with
// the time it was MADE (the frame advances the run to the event's moment first), so a press at 10 frames a second
// lands where it was pressed, not where the last picture was drawn. tests/P/client-games.test.js plays the same
// presses "drawn" at 240, 60 and 10 fps and compares.
//
//   mining      strike   a marker sweeps a bar; strike as it crosses the bright spot — three times, the spot moves
//   logging     rhythm   marks slide in from left and right; chop that side as each reaches the trunk
//   foraging    pick     some buds open, one after another, and close again; pick each while it is open, leave the rest
//   skinning    trace    the knife runs along a cut line; keep it on the line
//   smithing    forge    the bar cools through a glowing band; hammer while it is in the band, put it back in the fire when cold
//   outfitting  stitch   the needle runs along a seam; press as it crosses each mark
//   alchemy     pour     the flask fills by itself; stop it at the mark — twice (cooking: once)
//   tempering   gauge    a gauge climbs toward a band that keeps narrowing; stop it inside. Past the band the work is lost.

import { makeGame, scoreGame, qualityOf, perfectInputs, markerAt, lineAt, levelAt, gaugeAt, gaugeHalf, heatAt, GAME_TYPES, QUALITY_MIN } from '../../rules/professions-games.js';

export { makeGame, GAME_TYPES, qualityOf };
export const GAME_OF = { mining: 'strike', logging: 'rhythm', foraging: 'pick', skinning: 'trace', smithing: 'forge', outfitting: 'stitch', alchemy: 'pour', cooking: 'pour', tempering: 'gauge' };
/** A profession that plays each type (for the drawer's colours and the gallery's titles). */
export const PROF_OF_GAME = { strike: 'mining', rhythm: 'logging', pick: 'foraging', trace: 'skinning', forge: 'smithing', stitch: 'outfitting', pour: 'alchemy', gauge: 'tempering' };
/** The words on the result card when the data file is not loaded yet (data/rules/professions.json `quality.name` wins). */
export const QUALITY_WORD = { fail: 'Failed', poor: 'Poor', good: 'Good', fine: 'Fine', perfect: 'Perfect' };
export const MIN_GAP_MS = 90, MAX_PAIRS = 32;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

/** What each game listens to: 'tap' (the work button), 'sides' (left / right), 'slots' (pick one of several places), 'aim' (a height), 'hold' (hold = up), 'second' (the other button). */
export const GAME_INPUT = { strike: ['tap'], rhythm: ['sides'], pick: ['slots', 'sides', 'tap'], trace: ['aim', 'hold'], forge: ['tap', 'second'], stitch: ['tap'], pour: ['tap'], gauge: ['tap'] };

/** One line of "how to play" per game, per device: 'keyboard' | 'pad' | 'touch'. `{work}` `{left}` `{right}` are replaced by the frame with key caps. */
export const HOW = {
  strike: { title: 'Strike the vein', keyboard: '{work} when the pick crosses the bright spot. Three strikes.', pad: '{work} when the pick crosses the bright spot. Three strikes.', touch: 'Tap when the pick crosses the bright spot. Three strikes.' },
  rhythm: { title: 'Chop in rhythm', keyboard: '{left} and {right}: chop that side as each mark reaches the trunk.', pad: '{left} and {right}: chop that side as each mark reaches the trunk.', touch: 'Tap the left or right half as each mark reaches the trunk.' },
  pick: { title: 'Pick them ripe', keyboard: 'Press its number — or {left} {right} and {work} — while one is open. Leave the shut ones.', pad: '{left} {right} to move, {work} to pick one while it is open. Leave the shut ones.', touch: 'Tap each one while it is open. Leave the shut ones.' },
  trace: { title: 'Follow the cut', keyboard: 'Keep the knife on the line: move the mouse, or hold {work} to lift it and let go to lower it.', pad: 'Keep the knife on the line: hold {work} to lift it, let go to lower it.', touch: 'Slide your finger up and down to keep the knife on the line.' },
  forge: { title: 'Strike while it glows', keyboard: '{work} to hammer while the heat is in the band. {right} puts the bar back in the fire.', pad: '{work} to hammer while the heat is in the band. {right} puts the bar back in the fire.', touch: 'Tap the anvil while the heat is in the band. Tap the fire to re-heat.' },
  stitch: { title: 'Stitch the seam', keyboard: '{work} as the needle crosses each mark.', pad: '{work} as the needle crosses each mark.', touch: 'Tap as the needle crosses each mark.' },
  pour: { title: 'Stop at the mark', keyboard: '{work} to stop the pour at the line. Over the top is spilled.', pad: '{work} to stop the pour at the line. Over the top is spilled.', touch: 'Tap to stop the pour at the line. Over the top is spilled.' },
  gauge: { title: 'Stop it in the band', keyboard: '{work} to stop the gauge inside the band. It narrows; past it the materials are lost.', pad: '{work} to stop the gauge inside the band. It narrows; past it the materials are lost.', touch: 'Tap to stop the gauge inside the band. Past it the materials are lost.' },
};

const pairsOf = inputs => { const out = []; for (let i = 0; i + 1 < (inputs || []).length; i += 2) out.push([inputs[i], inputs[i + 1]]); return out; };
/** rhythm / stitch: when each beat is. */
export const beatsOf = g => (g.type === 'rhythm' ? Array.from({ length: g.steps }, (_, k) => g.lead + k * g.beat) : g.type === 'stitch' ? g.at.slice() : []);
/** pour: when stage i begins, given the stops made so far. */
const stageStart = (g, pairs, i) => (i <= 0 ? 0 : pairs[i - 1] ? pairs[i - 1][0] + g.pause : Infinity);
/** forge: the blows that counted (the scorer's own rule: not while in the fire, not within `gap` of the last). */
function forgeBlows(g, pairs) {
  const out = []; let last = -Infinity;
  for (const [t, v] of pairs) { if (out.length >= g.steps) break; if (v === 1) continue; const h = heatAt(g, pairs, t); if (t < h.pausedUntil || t - last < g.gap) continue; last = t; out.push({ t, heat: h.heat }); }
  return out;
}
/** When the game is over by itself (ms): the last moment anything can still be scored. */
export function endsAt(g) {
  switch (g.type) {
    case 'rhythm': case 'stitch': { const b = beatsOf(g); return Math.min(g.ms, b[b.length - 1] + g.good + 60); }
    case 'pick': return Math.min(g.ms, Math.max(...g.ripe.map(r => r.to)) + 100);
    default: return g.ms;
  }
}

/**
 * One play of one game. Time is milliseconds since the game appeared and only moves through advanceTo().
 * `opts.mins` = the server's quality bands (data/rules/professions.json `quality.min`).
 */
export function createRun(game, opts = {}) {
  const g = game; if (!g || !GAME_TYPES.includes(g.type)) throw new Error('prof-games: no game "' + (g && g.type) + '"');
  const pairs = [];                 // [[t, v], …] exactly as they will be sent
  const st = { t: 0, done: false, note: null, y: 0.5, holding: false, aimed: null, cursor: 0, sample: 0, inLine: true, why: null };
  let scored = null, scoredN = -1;
  const score = () => { if (scoredN !== pairs.length) { scored = scoreGame(g, pairs); scoredN = pairs.length; } return scored; };
  const note = (kind, more = {}) => { st.note = { kind, at: st.t, n: (st.note?.n || 0) + 1, ...more }; return st.note; };
  if (g.type === 'pick') st.cursor = [...g.ripe].sort((a, b) => a.from - b.from)[0]?.i ?? 0;
  if (g.type === 'trace') st.y = clamp(lineAt(g, 0), 0.05, 0.95);
  const perfect = pairsOf(perfectInputs(g));

  function finish(why) { if (st.done) return; st.done = true; st.why = why; }
  function push(t, v) {
    if (pairs.length >= MAX_PAIRS) return false;
    const last = pairs.length ? pairs[pairs.length - 1][0] : -1;
    pairs.push([Math.max(last + 1, Math.round(t)), v]);
    return true;
  }
  /** After an input: is there anything left to play? */
  function settle() {
    const n = g.steps;
    switch (g.type) {
      case 'strike': if (pairs.length >= n) finish('played'); break;
      case 'rhythm': case 'stitch': if (pairs.length >= n + 2 || score().marks.every(m => m > 0)) finish('played'); break;
      case 'pick': if (pairs.length >= g.spots + 2 || score().marks.every(m => m > 0)) finish('played'); break;
      case 'forge': if (forgeBlows(g, pairs).length >= n || pairs.length >= MAX_PAIRS) finish('played'); break;
      case 'pour': if (pairs.length >= n) finish('played'); break;
      case 'gauge': if (pairs.length >= 1) finish('played'); break;
    }
  }

  const run = {
    game: g, type: g.type, state: st, pairs, perfect,
    get t() { return st.t; }, get done() { return st.done; },
    /** Move the present to `ms`. Things that happen by themselves (a trace sample, a spill, the end) happen on the way. */
    advanceTo(ms) {
      if (st.done) return st;
      const to = Math.max(st.t, Math.min(ms, g.ms));
      if (g.type === 'trace') {
        // the knife: a pointer puts it where the finger is; one button lifts it while held and lets it sink when not
        const slot = g.ms / g.steps;
        let t = st.t;
        for (let guard = 0; t < to && guard < 5000; guard++) {
          const due = st.sample < g.steps ? (st.sample + 0.5) * slot : Infinity;
          const next = Math.min(to, t + 8, due > t ? due : to);
          const dt = (next - t) / 1000;
          if (st.aimed != null) st.y = st.aimed; else st.y = clamp(st.y + (st.holding ? 0.85 : -0.7) * dt, 0.04, 0.96);
          t = next;
          if (st.sample < g.steps && t >= due - 1e-6) {
            push(due, Math.round(st.y * 1000) / 1000); st.sample++;
            const m = score().marks[st.sample - 1]; st.inLine = m > 0; note(m >= 2 ? 'perfect' : m >= 1 ? 'hit' : 'miss', { i: st.sample - 1, mark: m, auto: true });
          }
        }
        st.t = to;
        if (st.t >= g.ms) finish('time');
        return st;
      }
      st.t = to;
      if (g.type === 'pour') {
        for (let k = 0; k < g.steps && !st.done; k++) {                              // over the top: it stops itself, spilled (and the next stage begins)
          const i = pairs.length, s0 = stageStart(g, pairs, i);
          if (!(i < g.steps && levelAt(g.stages[i], st.t - s0) > 1.02)) break;
          const stg = g.stages[i]; let tau = st.t - s0; while (tau > 0 && levelAt(stg, tau - 4) > 1.005) tau -= 4;
          push(s0 + tau, 0); note('spill', { i, mark: 0 }); settle();
        }
      } else if (g.type === 'gauge') {
        if (!pairs.length && gaugeAt(g, st.t) > g.centre + gaugeHalf(g, st.t) + 0.07) { note('over', { mark: 0 }); finish('over'); }
      }
      if (!st.done && st.t >= endsAt(g)) finish('time');
      return st;
    },
    /**
     * The work button (v = 0), a side (rhythm: 0 left / 1 right), a place (pick: its index) or the fire (forge: 1).
     * Returns the note it made ({ kind: 'perfect'|'hit'|'miss'|…, mark, i }) or null when it was not taken.
     */
    press(v = 0) {
      if (st.done) return null;
      if (g.type === 'trace') { st.holding = true; st.aimed = null; return null; }
      const last = pairs.length ? pairs[pairs.length - 1][0] : -Infinity;
      if (st.t - last < MIN_GAP_MS) return null;                                      // the server drops these too: do not show what will not count
      const before = score().marks.slice(), flagsBefore = score().flags.length;
      let i = null;
      if (g.type === 'forge') {
        const h = heatAt(g, pairs, st.t);
        if (st.t < h.pausedUntil) return null;                                        // in the fire: nothing to hit, nothing to re-heat
        if (v === 1) { push(st.t, 1); return note('reheat'); }
        const blows = forgeBlows(g, pairs); if (blows.length && st.t - blows[blows.length - 1].t < g.gap) return null;
        v = 0; i = blows.length;
      } else if (g.type === 'pick') { v = Number.isInteger(v) && arguments.length ? clamp(v, 0, g.spots - 1) : st.cursor; st.cursor = v; }
      else if (g.type === 'rhythm') v = v ? 1 : 0;
      else v = 0;
      if (g.type === 'strike' || g.type === 'pour' || g.type === 'gauge') i = pairs.length;
      const heat = g.type === 'forge' ? heatAt(g, pairs, st.t).heat : undefined;
      if (!push(st.t, v)) return null;
      const now = score();
      if (i == null) { i = now.marks.findIndex((m, k) => m !== before[k]); if (i < 0) i = null; }
      const mark = i != null ? now.marks[i] || 0 : 0, flag = now.flags.length > flagsBefore ? now.flags[now.flags.length - 1] : null;
      const n = note(mark >= 2 ? 'perfect' : mark >= 1 ? 'hit' : flag === 'spilled' ? 'spill' : flag === 'over' ? 'over' : 'miss', { i, mark, v, flag, pos: g.type === 'strike' ? markerAt(g, st.t) : undefined, heat });
      if (g.type === 'pick' && mark > 0) { const left = g.ripe.filter((r, k) => !now.marks[k] && r.to > st.t).sort((a, b) => a.from - b.from)[0]; if (left) st.cursor = left.i; }
      settle();
      return n;
    },
    /** trace with one button: held = the knife lifts. (Other games: a hold is a press.) */
    hold(on) { if (g.type === 'trace') { st.holding = !!on; if (on) st.aimed = null; return null; } return on ? run.press() : null; },
    /** trace with a pointer or a stick: put the knife at this height (0 bottom .. 1 top). */
    aim(y) { if (g.type === 'trace' && !st.done) st.aimed = clamp(y, 0.04, 0.96); },
    /** pick: move the cursor to the next place in a direction (-1 / +1). */
    move(dir) { if (g.type !== 'pick' || st.done) return; st.cursor = (st.cursor + (dir < 0 ? -1 : 1) + g.spots) % g.spots; note('move', { i: st.cursor }); },
    score,
    /** What is sent, and what the card shows before the server answers. */
    result() { const s = score(); return { type: g.type, inputs: pairs.flat(), marks: s.marks.slice(), score: s.score, flags: s.flags.slice(), quality: qualityOf(s.score, opts.mins || QUALITY_MIN), ms: Math.round(st.t), over: st.why === 'over' || s.flags.includes('over') }; },
    /** The next input of a flawless play that has not been made yet: { t, v } (trace: where the knife should be now: { aim }). */
    botNext() {
      if (st.done) return null;
      if (g.type === 'trace') return { aim: clamp(lineAt(g, Math.min(g.ms, st.t + 20)), 0.04, 0.96) };
      const p = perfect[pairs.length]; return p ? { t: p[0], v: p[1] } : null;
    },
    /** Everything the drawer needs, from P-core's curves. */
    view() {
      const t = st.t, s = score(), base = { type: g.type, t, ms: g.ms, left: clamp(1 - t / endsAt(g)), marks: s.marks, steps: g.steps, note: st.note, done: st.done };
      switch (g.type) {
        case 'strike': { const i = Math.min(pairs.length, g.steps - 1); return { ...base, pos: markerAt(g, t), spot: g.spots[i], half: g.half, perfect: g.perfect, made: pairs.length }; }
        case 'rhythm': case 'stitch': {
          const beats = beatsOf(g), taken = new Map();
          for (const [pt, v] of pairs.slice(0, g.steps + 2)) {           // the scorer's own matching, kept for the picture
            let best = -1, bd = Infinity; beats.forEach((bt, k) => { const d = Math.abs(pt - bt); if (!taken.has(k) && d < bd) { bd = d; best = k; } });
            if (best < 0 || bd > g.good) continue; taken.set(best, { t: pt, v });
          }
          return { ...base, good: g.good, perfectMs: g.perfect, total: endsAt(g), strays: pairs.length - taken.size, presses: pairs.length, budget: g.steps + 2,
            beats: beats.map((at, k) => ({ at, side: g.type === 'rhythm' ? (g.first + k) % 2 : 0, taken: taken.has(k), mark: s.marks[k], gone: !taken.has(k) && t > at + g.good })) };
        }
        case 'pick': return { ...base, cursor: st.cursor, penalty: s.flags.filter(f => f === 'unripe').length,
          places: Array.from({ length: g.spots }, (_, i) => {
            const k = g.ripe.findIndex(r => r.i === i), r = k >= 0 ? g.ripe[k] : null, bruised = pairs.some(([pt, v]) => v === i && !(r && pt >= r.from - 80 && pt <= r.to + 80));
            const state = r && s.marks[k] ? 'picked' : bruised ? 'bruised' : !r ? 'shut' : t < r.from - 350 ? 'shut' : t < r.from ? 'swell' : t <= r.to ? 'ripe' : 'gone';
            return { i, state, mark: r ? s.marks[k] : 0, left: r && state === 'ripe' ? (r.to - t) / (r.to - r.from) : 0, swell: r && state === 'swell' ? 1 - (r.from - t) / 350 : 0 };
          }) };
        case 'trace': return { ...base, u: t / g.ms, y: st.y, line: u => lineAt(g, u * g.ms), band: g.band, perfect: g.perfect, inLine: st.inLine, samples: st.sample, holding: st.holding };
        case 'forge': { const h = heatAt(g, pairs, t), blows = forgeBlows(g, pairs); return { ...base, heat: h.heat, inFire: t < h.pausedUntil, fireLeft: Math.max(0, h.pausedUntil - t) / g.reheat, band: g.band, sweet: g.sweet, blows: blows.length }; }
        case 'pour': { const i = Math.min(pairs.length, g.steps), s0 = stageStart(g, pairs, i), stg = g.stages[Math.min(i, g.steps - 1)];
          return { ...base, stage: i, waiting: i < g.steps && t < s0, level: i < g.steps ? clamp(levelAt(stg, t - s0), 0, 1.05) : null,
            stages: g.stages.map((x, k) => ({ mark: x.mark, good: x.good, level: k < pairs.length ? Math.min(1.05, levelAt(x, pairs[k][0] - stageStart(g, pairs, k))) : null, score: s.marks[k] })) }; }
        case 'gauge': { const stopAt = pairs.length ? pairs[0][0] : t; return { ...base, level: gaugeAt(g, stopAt), centre: g.centre, half: gaugeHalf(g, stopAt), perfect: g.perfect, stopped: pairs.length > 0, over: st.why === 'over' || s.flags.includes('over'), under: s.flags.includes('under') }; }
      }
      return base;
    },
  };
  return run;
}

/**
 * Play a list of inputs back while "drawing" at `fps`: the run is advanced a frame at a time and — as the frame does
 * with real events — to each input's own moment before it is applied. The result must not depend on `fps`.
 * `inputs` = [[t, kind, v], …] with kind 'p' (press v), 'h' (hold v = 0|1), 'a' (aim v).
 */
export function replay(game, inputs, fps = 60) {
  const run = createRun(game), dt = 1000 / fps;
  let i = 0;
  for (let frame = dt; !run.done && frame < game.ms + 2 * dt; frame += dt) {
    while (i < inputs.length && inputs[i][0] <= frame && !run.done) { const [t, k, v] = inputs[i++]; run.advanceTo(t); if (k === 'p') run.press(v); else if (k === 'h') run.hold(!!v); else if (k === 'a') run.aim(v); }
    run.advanceTo(frame);
  }
  return run.result();
}
/** A flawless play as a replay list (trace: the knife is put on the line every 8 ms). */
export function perfectPlay(game) {
  if (game.type === 'trace') { const out = []; for (let t = 0; t <= game.ms; t += 8) out.push([t, 'a', clamp(lineAt(game, Math.min(game.ms, t + 8)), 0.04, 0.96)]); return out; }
  return pairsOf(perfectInputs(game)).map(([t, v]) => [t, 'p', v]);
}
