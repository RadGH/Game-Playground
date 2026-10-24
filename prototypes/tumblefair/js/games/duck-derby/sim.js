// DUCK DERBY — rubber ducks race down a fairground stream, one lane each. Two paddle buttons, LEFT and RIGHT:
// alternate them in a steady rhythm (about three strokes a second) to paddle. A steady beat is the fastest; mashing is
// splashy and weak, and the same button twice in a row is a weak stroke that also nudges you that way. Rapids push
// your duck sideways toward the rocks — a rock bonk stops you for a moment — so paddle an extra stroke to steer.
// Hit BOTH buttons together for a SPLASH: the nearest duck just ahead of you gets soaked and paddles at half power for
// a second (every 4 s). First across the finish wins; when the clock runs out the furthest down the stream wins.
// Alone you race Puddles, the fair's champion duck (faster on harder settings).
//
// TIMING: a phone sends `p` { s: 'L' | 'R', t: its own game clock }. A stroke's power comes from the gap since your
// last stroke, measured on the PHONE's clock (so network jitter cannot spoil your rhythm); the server only checks the
// times for sense (not ahead of its clock, not too old, never going back) and applies the stroke when it arrives.
export const meta = {
  id: 'duck-derby', title: 'Duck Derby', blurb: 'Paddle your rubber duck down the stream: a steady beat beats mashing!',
  how: ['Tap LEFT, RIGHT, LEFT, RIGHT in a steady beat to paddle.', 'Rapids push you sideways: an extra tap on one side steers.', 'Both buttons at once = SPLASH the duck just ahead!'],
  kind: 'ui', min: 1, max: 4, seconds: 62, scoring: 'points', unit: 'm', tags: ['action'], card: 'card-duck-derby', css: true,
  controls: { a: 'Left paddle', b: 'Right paddle' },
};
export const LEN = 100, HALF = 0.8;                     // the course (metres), half a lane's width
export const COUNT_S = 3, PLAY_S = 52, END_S = 3;
export const LAG_S = 0.8, AHEAD_S = 0.15;
export const STROKE = { imp: 1.3, drag: 1.2, vmax: 4.6, side: 0.5, sideDrag: 3, sweet: [0.26, 0.5], mash: 0.16, same: 0.5 };
export const SPLASH = { pair: 0.1, cool: 4, soak: 1.0, ahead: 4.5, behind: 1.5 };
export const ROCK = { r: 0.32, stun: 0.6 }, REED = 0.6;
export const LEVELS = { easy: { current: 0.35, rocks: 4, cpu: 0.37, steer: 0.5 }, normal: { current: 0.5, rocks: 6, cpu: 0.3, steer: 0.7 }, hard: { current: 0.65, rocks: 8, cpu: 0.27, steer: 0.85 } };
export const CPU = 'cpu', CPU_NAME = 'Puddles';
const r2 = v => Math.round(v * 100) / 100;

/** How good a stroke is (0.1-1) from the gap since the last one and whether it is the same side again. */
export function quality(gap, same) {
  let q;
  if (gap < STROKE.mash) q = 0.1;
  else if (gap < STROKE.sweet[0]) q = 0.1 + 0.9 * (gap - STROKE.mash) / (STROKE.sweet[0] - STROKE.mash);
  else if (gap <= STROKE.sweet[1]) q = 1;
  else q = Math.max(0.55, 1 - (gap - STROKE.sweet[1]) * 0.9);
  return same ? q * STROKE.same : q;
}
/** The stream from the seed: rapids [{ y0, y1, c }] (c = sideways push, + = right) and rocks [{ x, y }] in lane units,
 *  the same in every lane so the race is fair. Rocks sit on the side the rapids push you toward. */
export function makeCourse(rng, difficulty = 'normal') {
  const L = LEVELS[difficulty] || LEVELS.normal, rapids = [], rocks = [];
  let y = 14;
  while (y < LEN - 12) {
    const len = rng.range(5, 8), dir = rng.chance(0.5) ? 1 : -1;
    rapids.push({ y0: r2(y), y1: r2(y + len), c: r2(dir * L.current * rng.range(0.85, 1.15)) });
    y += len + rng.range(7, 13);
  }
  for (let i = 0; i < L.rocks; i++) {
    const rp = rapids[i % rapids.length], dir = Math.sign(rp.c);
    rocks.push({ x: r2(dir * rng.range(0.35, 0.6)), y: r2(rp.y1 + rng.range(0.5, 2.5)) });
  }
  return { rapids, rocks: rocks.sort((a, b) => a.y - b.y) };
}
export const currentAt = (course, y) => { for (const r of course.rapids) if (y >= r.y0 && y < r.y1) return r.c; return 0; };
/** A fresh duck. */
export const newDuck = () => ({ rock: null, y: 0, x: 0, v: 0, vx: 0, last: null, lastT: -9, stun: 0, soak: 0, cool: 0, done: null, strokes: 0, bonks: 0, splashes: 0, soaked: 0 });
/** One stroke at phone time t. Returns 'stroke' | 'splash' (both buttons together: the caller soaks someone) | null. */
export function stroke(d, side, t) {
  if (d.done != null || d.stun > 0) { d.last = side; d.lastT = t; return null; }
  const gap = t - d.lastT;
  if (d.last && d.last !== side && gap <= SPLASH.pair && d.cool <= 0) { d.cool = SPLASH.cool; d.last = null; d.lastT = t; d.splashes++; return 'splash'; }
  const q = quality(gap, d.last === side) * (d.soak > 0 ? 0.5 : 1);
  d.v = Math.min(STROKE.vmax, d.v + STROKE.imp * q);
  d.vx += (side === 'L' ? -1 : 1) * STROKE.side * (d.last === side ? 2.4 : 1);      // the same side again steers
  d.last = side; d.lastT = t; d.strokes++;
  return 'stroke';
}
/** Move a duck dt seconds along the course. Returns 'bonk' when it hits a rock. */
export function move(d, course, dt) {
  if (d.done != null) return null;
  d.v *= Math.exp(-STROKE.drag * dt); d.vx *= Math.exp(-STROKE.sideDrag * dt);
  if (d.stun > 0) { d.stun -= dt; d.v *= 0.5; }
  if (d.soak > 0) d.soak -= dt; if (d.cool > 0) d.cool -= dt;
  d.y += d.v * dt; d.x += (d.vx + currentAt(course, d.y)) * dt;
  if (Math.abs(d.x) > HALF - 0.12) { d.x = Math.sign(d.x) * (HALF - 0.12); d.vx = 0; d.v *= Math.exp(-REED * 4 * dt); }   // in the reeds
  for (const r of course.rocks) if (r !== d.rock && Math.abs(r.y - d.y) < ROCK.r && Math.abs(r.x - d.x) < ROCK.r && d.stun <= 0) {
    d.stun = ROCK.stun; d.v = 0.2; d.vx = -Math.sign(r.x || 1) * 2.2; d.rock = r; d.bonks++; return 'bonk';     // bounced toward the middle, past this rock
  }
  return null;
}

export function create({ rng, players, difficulty = 'normal' }) {
  const L = LEVELS[difficulty] || LEVELS.normal, pids = players.map(p => p.pid), solo = pids.length === 1;
  const course = makeCourse(rng, difficulty);
  const ducks = new Map(pids.map(p => [p, newDuck()]));
  const cpuRng = rng.fork();
  if (solo) ducks.set(CPU, newDuck());
  let phase = 'count', left = COUNT_S, el = 0, over = false, finished = 0, cpuNext = 0, cpuSide = 'L';
  const events = [];
  const racing = () => [...ducks.values()].some(d => d.done == null);
  function splashFrom(pid) {
    const me = ducks.get(pid); let best = null, bd = Infinity;
    for (const [q, d] of ducks) {
      if (q === pid || d.done != null) continue;
      const dy = d.y - me.y; if (dy > SPLASH.ahead || dy < -SPLASH.behind) continue;
      const score = dy >= 0 ? dy : 10 - dy; if (score < bd) { bd = score; best = q; }
    }
    if (best == null) { events.push({ e: 'splash', pid, to: null }); return; }
    const d = ducks.get(best); d.soak = SPLASH.soak; d.soaked++;
    events.push({ e: 'splash', pid, to: best });
  }
  function act(pid, a, d) {
    if (a !== 'p' || !ducks.has(pid) || phase !== 'play' || over) return;
    const side = d?.s === 'L' || d?.s === 'R' ? d.s : null; if (!side) return;
    const duck = ducks.get(pid);
    let t = typeof d.t === 'number' && Number.isFinite(d.t) ? d.t : el;
    if (t > el + AHEAD_S || t < el - LAG_S) t = el;
    if (t < duck.lastT) t = duck.lastT;                                  // never back in time
    const r = stroke(duck, side, t);
    if (r === 'splash') splashFrom(pid);
  }
  return {
    events,
    init: () => ({ course, len: LEN, half: HALF, play: PLAY_S, solo, cpu: solo ? CPU_NAME : null, sweet: STROKE.sweet, cool: SPLASH.cool }),
    act,
    step(dt) {
      if (over) return;
      if (phase === 'count') { left -= dt; if (left <= 0) { phase = 'play'; el = 0; } return; }
      el += dt;
      if (phase === 'play') {
        if (solo && el >= cpuNext) {                                      // Puddles: a steady beat, steering out of the current
          const c = ducks.get(CPU), want = c.x > 0.25 ? 'L' : c.x < -0.25 ? 'R' : null;
          const steer = want && cpuRng.chance(L.steer), side = steer ? want : cpuSide; if (!steer) cpuSide = side === 'L' ? 'R' : 'L';
          stroke(c, side, el); cpuNext = el + L.cpu * cpuRng.range(0.92, 1.08);
        }
        for (const [pid, d] of ducks) {
          if (move(d, course, dt) === 'bonk') events.push({ e: 'bonk', pid });
          if (d.done == null && d.y >= LEN) { d.y = LEN; d.done = r2(el); finished++; events.push({ e: 'finish', pid, place: finished, t: d.done }); }
        }
        if (el >= PLAY_S || !racing() || (!solo && pids.every(p => ducks.get(p).done != null))) { phase = 'end'; left = END_S; }
      } else if (phase === 'end') { left -= dt; if (left <= 0) over = true; }
    },
    state() {
      const g = { phase, el: r2(el), left: phase === 'count' ? Math.max(0, Math.ceil(left)) : phase === 'play' ? Math.max(0, Math.ceil(PLAY_S - el)) : 0 };
      g.d = {}; for (const [pid, d] of ducks) g.d[pid] = [r2(d.y), r2(d.x), r2(d.v), d.stun > 0 ? 1 : 0, d.soak > 0 ? 1 : 0, d.done, d.cool > 0 ? Math.ceil(d.cool) : 0];
      g.sc = Object.fromEntries(pids.map(p => [p, Math.floor(ducks.get(p).y)]));
      return g;
    },
    get over() { return over; },
    get _el() { return el; }, get _phase() { return phase; }, _ducks: ducks, _course: course,
    result() {
      const scores = Object.fromEntries(pids.map(p => [p, Math.floor(ducks.get(p).y)])), groups = new Map();
      const key = p => { const d = ducks.get(p); return d.done != null ? 1e6 - Math.round(d.done * 100) : Math.floor(d.y * 100); };
      for (const p of pids) { const k = key(p); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
      const r = { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
      r.times = Object.fromEntries(pids.map(p => [p, ducks.get(p).done]));
      if (solo) { const c = ducks.get(CPU), me = ducks.get(pids[0]); r.cpu = c.done; r.beat = key(pids[0]) > (c.done != null ? 1e6 - Math.round(c.done * 100) : Math.floor(c.y * 100)); void me; }
      return r;
    },
  };
}
