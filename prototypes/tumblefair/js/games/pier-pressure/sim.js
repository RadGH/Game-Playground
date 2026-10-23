// PIER PRESSURE — everyone sits side by side on the end of the fairground pier, one lane of sea each, ONE big button.
// Tap to CAST. Then watch the water under your bobber: a shape swims up out of the deep.
//   a FISH  nibbles first (little twitches — tapping now scares it off) and then BITES (the bobber plunges, "!"):
//           tap then to land it. Too late and it is gone.
//   JUNK    (a boot, a kettle, a clump of weed) drifts up instead: tap BEFORE it reaches the bobber to pull your line
//           out of its way. Let it reach the hook and it snags: tap tap tap to untangle (no points, lots of time).
// Bigger fish score more (Tiddler 1 … Moonscale 12) and three fish in a row without a slip get +1 each. Most points
// when the whistle blows wins. Alone you race Skipper Pebble, the old pier-end fisher, in the next lane.
//
// TIMING (the Apple Bobbing way): everything a lane will do is a script on the game clock `el`, sent in the state, so
// every screen draws the same fish at the same moment. A phone counts its own clock and sends `tap` { t: the time it
// pressed }; the server takes t only if it is not in the future (AHEAD_S) or too old (LAG_S) and judges the tap at t,
// so lag never decides a bite. A tap with no t (a keyboard bot) is judged on the server's clock.
import { pickSpecies } from '../fish-kit.js';
import { BY_ID, speciesIn } from '../fish-species.js';

export const meta = {
  id: 'pier-pressure', title: 'Pier Pressure', blurb: 'Hook the fish, dodge the junk, and land the most before the whistle!',
  how: ['Tap to cast. A fish nibbles, then BITES: tap then!', 'Tap too soon and it swims off.', 'Junk floating up? Tap before it reaches your hook!', 'Snagged? Tap tap tap to untangle.'],
  kind: 'ui', min: 1, max: 4, seconds: 62, scoring: 'points', unit: 'pts', tags: ['action'], card: 'card-pier-pressure', css: true,
};
export const COUNT_S = 3, PLAY_S = 55, END_S = 2;
export const LAG_S = 0.7, AHEAD_S = 0.15;
export const CAST_S = 0.5, SPOOK_S = 0.9, DODGE_S = 0.35, MISS_S = 0.3, GOT_S = 0.7, FREE_S = 0.3;
export const LEVELS = {
  easy:   { junk: 0.25, approach: 1.4, fakes: [0, 1], window: 0.9, tangle: 4, delay: [0.4, 1.2], cpu: { react: [0.25, 0.5], fooled: 0.1, dodge: 0.55, taps: 4.5 } },
  normal: { junk: 0.3, approach: 1.15, fakes: [0, 2], window: 0.65, tangle: 6, delay: [0.4, 1.4], cpu: { react: [0.18, 0.42], fooled: 0.07, dodge: 0.75, taps: 6 } },
  hard:   { junk: 0.36, approach: 0.9, fakes: [1, 3], window: 0.48, tangle: 8, delay: [0.3, 1.5], cpu: { react: [0.14, 0.34], fooled: 0.04, dodge: 0.9, taps: 7.5 } },
};
export const CPU = 'cpu', CPU_NAME = 'Skipper Pebble';
export const STREAK = 3;
const r2 = v => Math.round(v * 100) / 100;
const FISH = speciesIn('pier', { junk: false }), JUNK = speciesIn('pier', { junk: true });

/** A new visitor for a lane, starting no earlier than t0: { id, sp, junk, from, arrive, fakes: [t], bite, end }. */
export function makeVisitor(rng, t0, id, L) {
  const junk = rng.chance(L.junk), sp = junk ? pickSpecies(rng, JUNK) : pickSpecies(rng, FISH);
  const from = r2(t0 + rng.range(L.delay[0], L.delay[1])), arrive = r2(from + L.approach);
  if (junk) return { id, sp: sp.id, junk: true, from, arrive, fakes: [], bite: arrive, end: arrive };
  const nf = rng.int(L.fakes[0], L.fakes[1]), bite = r2(arrive + rng.range(0.5, 1.3) + nf * 0.45), fakes = [];
  for (let i = 0; i < nf; i++) fakes.push(r2(arrive + 0.2 + (bite - arrive - 0.45) * (i + rng.range(0.15, 0.85)) / nf));
  return { id, sp: sp.id, junk: false, from, arrive, fakes, bite, end: r2(bite + L.window) };
}
/** What a tap at time t does to a lane that is waiting on visitor v: 'hook' | 'spook' | 'dodge' | 'snag' | 'late'. */
export function tapResult(v, t) {
  if (v.junk) return t < v.arrive ? 'dodge' : 'snag';
  if (t < v.bite) return 'spook';
  return t <= v.end ? 'hook' : 'late';
}
export const newLane = () => ({ st: 0, v: null, vid: 0, until: 0, taps: 0, pts: 0, n: 0, junk: 0, streak: 0, best: null, last: -9 });
// st: 0 ready to cast, 1 line in (waiting on v), 2 snagged (taps to go), 3 a short pause (just landed / freed / scared)

export function create({ rng, players, difficulty = 'normal' }) {
  const D = LEVELS[difficulty] ? difficulty : 'normal', L = LEVELS[D];
  const pids = players.map(p => p.pid), solo = pids.length === 1, ids = solo ? [...pids, CPU] : pids;
  const lanes = new Map(ids.map(id => [id, newLane()])), events = [];
  const cpuRng = rng.fork();                     // Skipper Pebble's choices never shift the players' fish
  let phase = 'count', left = COUNT_S, el = 0, over = false, cpuAt = null;
  function next(id, t0) { const lane = lanes.get(id); lane.st = 1; lane.v = makeVisitor(rng, t0, ++lane.vid, L); lane.taps = 0; planCpu(id); }
  function pause(lane, t, secs) { lane.st = 3; lane.v = null; lane.until = r2(t + secs); }
  function slip(lane) { lane.streak = 0; }
  /** Settle anything that has run out on lane `id` up to time t (a bite not answered, junk that reached the hook, a pause over). */
  function settle(id, t) {
    const lane = lanes.get(id);
    if (lane.st === 3 && t >= lane.until) lane.st = 0;
    if (lane.st !== 1 || !lane.v) return;
    if (lane.v.junk && t >= lane.v.arrive) { lane.st = 2; lane.taps = L.tangle; lane.junk++; slip(lane); events.push({ e: 'snag', pid: id, sp: lane.v.sp }); }
    else if (!lane.v.junk && t > lane.v.end) { const sp = lane.v.sp; slip(lane); events.push({ e: 'miss', pid: id, sp }); next(id, r2(lane.v.end + MISS_S)); }
  }
  function tap(id, t) {
    const lane = lanes.get(id); if (!lane || t < lane.last) return;
    lane.last = t;
    settle(id, t);
    if (lane.st === 0) { events.push({ e: 'cast', pid: id, t: r2(t) }); next(id, r2(t + CAST_S)); return; }
    if (lane.st === 2) {
      lane.taps--; events.push({ e: 'tug', pid: id, left: lane.taps });
      if (lane.taps <= 0) { events.push({ e: 'free', pid: id, sp: lane.v?.sp }); pause(lane, t, FREE_S); }
      return;
    }
    if (lane.st !== 1 || !lane.v) return;
    const v = lane.v;
    if (t < v.from) { events.push({ e: 'early', pid: id, to: id }); return; }      // nothing there yet: the line is still sinking
    const r = tapResult(v, t);
    if (r === 'hook') {
      const sp = BY_ID[v.sp]; lane.n++; lane.streak++;
      const bonus = lane.streak >= STREAK ? 1 : 0; lane.pts += sp.pts + bonus;
      if (!lane.best || sp.pts > BY_ID[lane.best].pts) lane.best = sp.id;
      events.push({ e: 'hook', pid: id, sp: sp.id, pts: sp.pts + bonus, streak: lane.streak, fast: r2(t - v.bite) });
      pause(lane, t, GOT_S);
    } else if (r === 'spook') { slip(lane); events.push({ e: 'spook', pid: id }); next(id, r2(t + SPOOK_S)); }
    else if (r === 'dodge') { events.push({ e: 'dodge', pid: id, sp: v.sp }); next(id, r2(t + DODGE_S)); }
  }
  // ---- Skipper Pebble (solo): plans one tap per visitor from its own rng
  function planCpu(id) {
    if (id !== CPU) return;
    const v = lanes.get(CPU).v, C = L.cpu;
    if (v.junk) cpuAt = cpuRng.chance(C.dodge) ? r2(v.from + (v.arrive - v.from) * cpuRng.range(0.45, 0.85)) : null;
    else if (v.fakes.length && cpuRng.chance(C.fooled)) cpuAt = r2(v.fakes[0] + 0.12);
    else cpuAt = r2(v.bite + cpuRng.range(C.react[0], C.react[1]));
  }
  function stepCpu() {
    const lane = lanes.get(CPU);
    settle(CPU, el);
    if (lane.st === 0) { tap(CPU, r2(el)); return; }
    if (lane.st === 2) { if (cpuRng.chance(L.cpu.taps * 0.05)) tap(CPU, r2(el)); return; }
    if (lane.st === 1 && cpuAt != null && el >= cpuAt) { const t = cpuAt; cpuAt = null; tap(CPU, t); }
  }
  return {
    events,
    init: () => ({ play: PLAY_S, count: COUNT_S, lag: LAG_S, solo, cpu: solo ? { id: CPU, name: CPU_NAME } : null, tangle: L.tangle, window: L.window, streak: STREAK, d: D }),
    act(pid, a, d) {
      if (a !== 'tap' || !lanes.has(pid) || pid === CPU || phase !== 'play' || over) return;
      let t = el;
      if (d && typeof d === 'object' && typeof d.t === 'number' && Number.isFinite(d.t)) {
        if (d.t > el + AHEAD_S || d.t < el - LAG_S) t = el; else t = Math.min(el, d.t);
      }
      tap(pid, r2(Math.max(0, t)));
    },
    step(dt) {
      if (over) return;
      if (phase === 'count') { left -= dt; if (left <= 0) { phase = 'play'; el = 0; } return; }
      el += dt;
      if (phase === 'play') {
        for (const id of pids) settle(id, el - LAG_S);
        if (solo) stepCpu();
        if (el >= PLAY_S) { phase = 'end'; for (const id of ids) { settle(id, el); } events.push({ e: 'whistle' }); }
      } else if (el >= PLAY_S + END_S) over = true;
    },
    state() {
      const g = { phase, left: phase === 'count' ? Math.max(0, Math.ceil(left)) : Math.max(0, Math.ceil(PLAY_S - el)), el: Math.floor(el * 2) / 2 };
      g.l = Object.fromEntries(ids.map(id => { const x = lanes.get(id), v = x.v; return [id, [x.st, x.pts, x.n, x.streak, x.st === 2 ? x.taps : 0, x.until, v && x.st === 1 ? [v.id, v.sp, v.from, v.arrive, v.fakes, v.bite, v.end] : null]]; }));
      return g;
    },
    get over() { return over; },
    result() {
      const groups = new Map();
      for (const p of pids) { const x = lanes.get(p), k = x.pts * 1000 + x.n; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
      const cpu = solo ? lanes.get(CPU).pts : null;
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores: Object.fromEntries(pids.map(p => [p, lanes.get(p).pts])), unit: meta.unit, ...(solo ? { cpu, beat: lanes.get(pids[0]).pts > cpu } : {}) };
    },
    _lanes: lanes, get _el() { return el; }, get _phase() { return phase; },
  };
}
