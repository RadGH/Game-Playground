// CLAW MACHINE — everyone has their OWN prize machine (the same heap of prizes for everyone, from the seed), seen
// from above through the glass. Drag anywhere to move the claw (it follows your finger, a little behind), then tap
// DROP. The claw hangs on a cable, so when it stops it SWINGS: wait for it to settle (or catch it over the middle of
// the swing) before you drop. Where the claw comes down is what counts: right over the middle of a prize = a strong
// grip, near its edge = a weak one, and a weak grip often slips and drops the prize back on the heap. Every grab
// nudges the prizes around it (it is a slippery heap), so look again before the next one. Prizes: ball 1, duck 2,
// heart 2, bear 3 (big but heavy), star 4 (small), and one GOLDEN EGG worth 8 (small and slippery). 5 grabs each
// (4 on hard); most points wins. Solo: medals at 7 / 12 / 18 points.
//
// TIMING: the claw's swing is worked out on the phone with the same pure `stepClaw` the tests use; the phone sends
// `drop` { x, y } (where the claw head is). The server picks the prize, rolls the grip from the seed and plays the grab
// out on its own clock: down 0.7 s, close, up, over to the chute, let go. The heap only changes when a grab resolves.
import { placeOrder, r1 } from '../toss-kit.js';

export const meta = {
  id: 'crane-claw', title: 'Claw Machine', blurb: 'Steer the claw over a prize, let the swing settle and DROP — grab the most points!',
  how: ['Drag anywhere to move the claw, then tap DROP.', 'The claw swings: let it settle over the MIDDLE of a prize for a strong grip.', 'Ball 1 · duck 2 · bear 3 · star 4 · golden egg 8. Five grabs each!'],
  kind: 'ui', min: 1, max: 4, seconds: 52, scoring: 'points', unit: 'points', tags: ['action'], card: 'card-crane-claw', css: true,
  controls: { a: 'Drop' },
};
export const PW = 100, PH = 80;                                  // the pit, in its own units (seen from above)
export const CHUTE = { x: 0, y: 58, w: 22, h: 22 };              // the prize chute: bottom-left corner
export const HOME = { x: 11, y: 69 };                            // where the claw waits, over the chute
export const COUNT_S = 3, PLAY_S = 38, END_S = 4;
export const T = { down: 0.7, close: 0.35, up: 0.6, carry: 1.0, drop: 0.3 };   // a grab, in seconds
export const GRAB_S = T.down + T.close + T.up + T.carry + T.drop;              // 2.95 s
export const KINDS = [
  { id: 'ball', r: 7, pts: 1, grip: 0.82, n: 3 },
  { id: 'duck', r: 7.5, pts: 2, grip: 0.95, n: 3 },
  { id: 'heart', r: 7, pts: 2, grip: 0.95, n: 2 },
  { id: 'bear', r: 9.5, pts: 3, grip: 0.78, n: 3 },
  { id: 'star', r: 6.2, pts: 4, grip: 0.86, n: 2 },
  { id: 'egg', r: 5.4, pts: 8, grip: 0.62, n: 1 },
];
export const LEVELS = {
  easy: { grabs: 5, grip: 1.0, speed: 62, sway: 0.8 },
  normal: { grabs: 5, grip: 0.92, speed: 56, sway: 1 },
  hard: { grabs: 4, grip: 0.86, speed: 50, sway: 1.25 },
};
export const MEDALS = [7, 12, 18];
const clampX = v => Math.max(4, Math.min(PW - 4, v)), clampY = v => Math.max(4, Math.min(PH - 4, v));
const inChute = (x, y, m = 0) => x < CHUTE.x + CHUTE.w + m && y > CHUTE.y - m;

/** The heap from the seed: every prize kind its `n` times, spread over the pit outside the chute, a little overlapping
 *  (it is a heap) but never centre on centre. The golden egg sits somewhere far from the chute. */
export function makeHeap(rng) {
  const out = [];
  const list = KINDS.flatMap((k, ki) => Array.from({ length: k.n }, () => ki));
  for (const ki of list) {
    const k = KINDS[ki];
    for (let t = 0; t < 400; t++) {
      const x = r1(rng.range(6 + k.r, PW - 4 - k.r)), y = r1(rng.range(4 + k.r, PH - 4 - k.r));
      if (inChute(x, y, k.r + 3)) continue;
      if (k.id === 'egg' && Math.hypot(x - HOME.x, y - HOME.y) < 55) continue;
      if (out.every(o => Math.hypot(o.x - x, o.y - y) > (KINDS[o.k].r + k.r) * (t < 300 ? 0.82 : 0.6))) { out.push({ id: out.length, k: ki, x, y }); break; }
    }
  }
  return out;
}
/** The claw, as the phone simulates it: a gantry that chases `target` at no more than `speed`, and a head that hangs on
 *  a cable and swings when the gantry speeds up or stops (a damped spring). Returns the claw (mutated). */
export const SWING = { k: 40, damp: 2.2, gain: 1.15, max: 14, acc: 260 };
export const newClaw = () => ({ x: HOME.x, y: HOME.y, vx: 0, vy: 0, sx: 0, sy: 0, svx: 0, svy: 0 });
export function stepClaw(c, target, dt, L = LEVELS.normal) {
  const tx = target ? clampX(target.x) : c.x, ty = target ? clampY(target.y) : c.y;
  const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy);
  const want = Math.min(L.speed, d * 7), wx = d > 1e-6 ? dx / d * want : 0, wy = d > 1e-6 ? dy / d * want : 0;
  let ax = (wx - c.vx) / dt, ay = (wy - c.vy) / dt; const a = Math.hypot(ax, ay);
  if (a > SWING.acc) { ax *= SWING.acc / a; ay *= SWING.acc / a; }
  c.vx += ax * dt; c.vy += ay * dt; c.x = clampX(c.x + c.vx * dt); c.y = clampY(c.y + c.vy * dt);
  const g = SWING.gain * L.sway;
  c.svx += (-SWING.k * c.sx - SWING.damp * c.svx - g * ax) * dt; c.svy += (-SWING.k * c.sy - SWING.damp * c.svy - g * ay) * dt;
  c.sx += c.svx * dt; c.sy += c.svy * dt;
  const s = Math.hypot(c.sx, c.sy); if (s > SWING.max) { c.sx *= SWING.max / s; c.sy *= SWING.max / s; }
  return c;
}
/** How big the swing is right now (its whole arc, not just where it is this instant). */
export const swingOf = c => Math.hypot(c.sx, c.sy, c.svx / Math.sqrt(SWING.k), c.svy / Math.sqrt(SWING.k));
export const headOf = c => ({ x: clampX(c.x + c.sx), y: clampY(c.y + c.sy) });
/** Which prize a claw coming down at (x, y) closes on (the one it is most centred over, within 1.1 of its radius), or null. */
export function pickPrize(heap, x, y) {
  let best = null, bq = 1.1;
  for (const p of heap) { const q = Math.hypot(p.x - x, p.y - y) / KINDS[p.k].r; if (q < bq) { bq = q; best = p; } }
  return best;
}
/** The chance a grab holds on: how centred you were (1 = dead centre, 0 = the very edge) times the prize's grip. */
export function gripChance(p, x, y, L = LEVELS.normal) {
  const k = KINDS[p.k], c = Math.max(0, 1 - (Math.hypot(p.x - x, p.y - y) / k.r) ** 2);
  return Math.min(0.97, k.grip * L.grip * (0.12 + 0.88 * c));
}
/** A grab shakes the heap: every prize near where the claw came down slides away from it, then overlaps are eased apart
 *  and everything stays in the pit and out of the chute. `u` (0..1, from the seed) varies the slide. */
export function nudge(heap, x, y, u) {
  for (const p of heap) {
    const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy), r = KINDS[p.k].r;
    if (d > r + 13) continue;
    const push = (3 + 4 * u) * (1 - d / (r + 13)) * (KINDS[p.k].id === 'ball' ? 1.8 : 1);
    const a = d > 0.01 ? Math.atan2(dy, dx) : u * 6.28;
    p.x += Math.cos(a) * push; p.y += Math.sin(a) * push;
  }
  settle(heap);
}
export function settle(heap) {
  for (let it = 0; it < 4; it++) {
    for (let i = 0; i < heap.length; i++) for (let j = i + 1; j < heap.length; j++) {
      const a = heap[i], b = heap[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01, min = (KINDS[a.k].r + KINDS[b.k].r) * 0.6;
      if (d >= min) continue; const m = (min - d) / 2; a.x -= dx / d * m; a.y -= dy / d * m; b.x += dx / d * m; b.y += dy / d * m;
    }
    for (const p of heap) {
      const r = KINDS[p.k].r; p.x = Math.max(r, Math.min(PW - r, p.x)); p.y = Math.max(r, Math.min(PH - r, p.y));
      if (inChute(p.x, p.y, r)) { if (CHUTE.x + CHUTE.w + r - p.x < p.y - (CHUTE.y - r)) p.x = CHUTE.x + CHUTE.w + r; else p.y = CHUTE.y - r; }
    }
  }
  for (const p of heap) { p.x = r1(p.x); p.y = r1(p.y); }
}

export function create({ rng, players, difficulty = 'normal' }) {
  const L = LEVELS[difficulty] || LEVELS.normal, pids = players.map(p => p.pid), solo = pids.length === 1;
  const heap0 = makeHeap(rng);
  // every grab's dice, rolled up front in seat order so a grab never moves anyone else's luck
  const rolls = new Map(pids.map(p => [p, Array.from({ length: L.grabs }, () => [rng(), rng(), rng()])]));
  const S = new Map(pids.map(p => [p, { heap: heap0.map(o => ({ ...o })), score: 0, left: L.grabs, used: 0, won: [], g: null, held: null }]));
  let phase = 'count', left = COUNT_S, el = 0, over = false, endT = 0;
  const events = [];
  function resolve(pid, s) {
    const g = s.g, t = el - g.t0;
    if (g.st === 0 && t >= T.down + T.close) {              // the claw has closed: it holds the prize, or it does not
      g.st = 1;
      if (g.res === 'w' || g.res === 's') { const i = s.heap.findIndex(p => p.id === g.id); s.held = s.heap.splice(i, 1)[0]; }
      if (g.res !== 'w') nudge(s.heap, g.x, g.y, g.u);
      events.push({ e: 'close', pid, res: g.res, k: s.held ? s.held.k : -1 });
    }
    if (g.st === 1 && g.res === 's' && t >= T.down + T.close + T.up * 0.6) {   // slipped out on the way up
      g.st = 2; const p = s.held; s.held = null;
      p.x = g.lx; p.y = g.ly; s.heap.push(p); settle(s.heap);
      events.push({ e: 'slip', pid, k: p.k, x: p.x, y: p.y });
    }
    if (g.st === 1 && g.res === 'w' && t >= GRAB_S - T.drop) {               // over the chute: let go
      g.st = 2; const p = s.held; s.held = null; s.won.push(p.k); s.score += KINDS[p.k].pts;
      events.push({ e: 'win', pid, k: p.k, pts: KINDS[p.k].pts });
    }
    if (t >= GRAB_S) { s.g = null; events.push({ e: 'ready', pid, left: s.left }); }
  }
  const busy = () => [...S.values()].some(s => s.g);
  return {
    events,
    init: () => ({ heap: heap0, kinds: KINDS, pw: PW, ph: PH, chute: CHUTE, home: HOME, grab: T, level: L, play: PLAY_S, solo, medals: MEDALS }),
    act(pid, a, d) {
      const s = S.get(pid); if (a !== 'drop' || !s || phase !== 'play' || over || s.g || s.left <= 0) return;
      if (!d || typeof d !== 'object' || ![d.x, d.y].every(v => typeof v === 'number' && Number.isFinite(v))) return;
      const x = r1(clampX(d.x)), y = r1(clampY(d.y)), roll = rolls.get(pid)[s.used];
      s.left--; s.used++;
      const p = pickPrize(s.heap, x, y);
      const g = { t0: el, x, y, st: 0, u: roll[2], id: p ? p.id : -1, k: p ? p.k : -1, res: 'e', lx: 0, ly: 0 };
      if (p) {
        const ch = gripChance(p, x, y, L);
        g.res = roll[0] < ch ? 'w' : roll[0] < ch + (1 - ch) * 0.55 ? 's' : 'm';
        if (g.res === 's') { const a2 = roll[1] * 6.283, dist = 8 + roll[2] * 10; g.lx = r1(clampX(p.x + Math.cos(a2) * dist)); g.ly = r1(clampY(p.y + Math.sin(a2) * dist)); }
        g.ch = Math.round(ch * 100);
      }
      s.g = g;
      events.push({ e: 'drop', pid, x, y, res: g.res, k: g.k });
    },
    step(dt) {
      if (over) return;
      if (phase === 'count') { left -= dt; if (left <= 0) { phase = 'play'; el = 0; } return; }
      el += dt;
      for (const [pid, s] of S) if (s.g) resolve(pid, s);
      if (phase === 'play' && (el >= PLAY_S || [...S.values()].every(s => s.left <= 0 && !s.g))) { phase = 'end'; endT = el; events.push({ e: 'end' }); }
      if (phase === 'end' && !busy() && el >= endT + END_S - 1) over = true;
      if (phase === 'end' && el >= endT + END_S + GRAB_S) over = true;
    },
    state() {
      const st = { phase, el: r1(el), left: phase === 'count' ? Math.max(0, Math.ceil(left)) : phase === 'end' ? 0 : Math.max(0, Math.ceil(PLAY_S - el)), sc: {}, gl: {}, hp: {}, gr: {} };
      for (const [pid, s] of S) {
        st.sc[pid] = s.score; st.gl[pid] = s.left;
        st.hp[pid] = s.heap.map(p => [p.id, p.k, p.x, p.y]);
        // a grab under way: [start, x, y, result (w win / s slip / m miss / e empty), kind, slip x, slip y, held now]
        if (s.g) st.gr[pid] = [r1(s.g.t0), s.g.x, s.g.y, s.g.res, s.g.k, s.g.lx, s.g.ly, s.held ? 1 : 0];
      }
      return st;
    },
    get over() { return over; },
    result() {
      const scores = Object.fromEntries(pids.map(p => [p, S.get(p).score]));
      const r = { order: placeOrder(pids, p => scores[p] * 100 + S.get(p).won.length), scores, unit: meta.unit };
      if (solo) r.medal = MEDALS.filter(m => scores[pids[0]] >= m).length;
      return r;
    },
    get _el() { return el; }, get _phase() { return phase; }, _S: S, _level: L,
  };
}

/** A bot's (or test's) choice: the prize worth most for how easy it is to grab, and the dead centre of it. */
export function bestTarget(heap, L = LEVELS.normal) {
  let best = null, bv = -1;
  for (const p of heap) { const k = KINDS[p.k], v = k.pts * k.grip * L.grip; if (v > bv) { bv = v; best = p; } }
  return best ? { x: best.x, y: best.y, id: best.id } : null;
}
