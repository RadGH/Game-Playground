// WOBBLE TOWER — every player builds their own tower of candy blocks. A block swings back and forth above the top of
// your tower; press DROP and it falls straight down.
//   * dead on (within RULES.perfect)        PERFECT: it snaps true, the tower steadies, and the block grows back a little
//   * a little off (up to RULES.keep of the width)   it lands whole but hangs over the edge: the tower leans and wobbles
//   * further off                            the overhang is sliced off and falls (the next block is that much narrower)
//   * missed the tower altogether            it tumbles away and the tower shakes
// Wobble builds up (more the taller and the more crooked the tower is) and settles slowly by itself; when it reaches
// 1 the top of the tower TOPPLES — you lose about a third of it and keep building. Tallest tower at the bell wins.
// Solo: the same thing as a score attack.
//
// Lag: the block's swing is a phase the server advances; the phone draws the same swing and, on a press, sends the
// phase it SAW (act 'drop' [blockId, phase]). The server takes it if it lies within the last RULES.lag seconds of the
// swing, so a press is judged by what the player saw, not by when it arrived. A plain A press on the input stream
// (keyboard / gamepad without a view, bots) still drops, at the server's phase when it arrived, unless the act comes in
// within RULES.pendWait.
import { makeBody, stepBody, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'wobble-tower', title: 'Wobble Tower', blurb: 'Stack the swinging blocks — tallest tower at the bell wins!',
  how: ['A block swings over your tower: press DROP to let it fall.', 'Dead centre = PERFECT. Off-centre makes the tower lean and wobble.', 'Too much wobble and the top topples off — keep building!'],
  kind: 'arena', min: 1, max: 4, seconds: 45, scoring: 'points', unit: 'blocks', tags: ['action'],
  controls: { stick: false, a: 'DROP' }, move: { speed: 1, accel: 10 },   // characters stand on their lifts (F.FROZEN)
  arena: { shape: 'rect', hw: 4, hd: 2, wall: true }, pitch: 14, card: 'card-wobble-tower', css: true,
};

export const RULES = {
  BH: 0.45, W0: 1.6, amp: 2.0,                    // block height, starting width, how far the swing reaches either side of the top
  w0: 1.7, wPer: 0.055, wMax: 3.8,                // swing speed (radians a second) at height 0, added per block, cap
  perfect: 0.12, keep: 0.3, minW: 0.35, grow: 0.2,
  wobPerfect: 0.15, wobKeep: [0.03, 0.65], wobTrim: 0.08, wobMiss: 0.12, decay: 0.07, hFactor: 30, leanFactor: 0.5,
  toppleFrac: 0.35, toppleMin: 2, toppleWob: 0.2,
  fall: 0.3, next: 0.4, missRest: 0.5, toppleRest: 1.4,
  spacing: 4.0, lift: 1.25, liftZ: -1.1,           // towers this far apart; your lift stands this far right of (and behind) your tower
  lag: 0.7, ahead: 0.12, pendWait: 0.1,
  speed: { easy: 0.85, normal: 1, hard: 1.15 },
};
const r2 = v => Math.round(v * 100) / 100;
const r3 = v => Math.round(v * 1000) / 1000;

export function create({ rng, players, difficulty = 'normal' }) {
  const n = players.length, bodies = new Map(), events = [], S = RULES, pace = S.speed[difficulty] ?? 1;
  const towers = players.map((p, i) => ({ pid: p.pid, x: r2((i - (n - 1) / 2) * S.spacing) }));
  const arena = { shape: 'rect', hw: r2(n * S.spacing / 2 + 0.6), hd: 2.2, wall: true };
  const T = new Map();
  towers.forEach(t => {
    const b = makeBody(t.x + S.lift, S.liftZ, -Math.PI / 2); b.flags = F.FROZEN; bodies.set(t.pid, b);
    T.set(t.pid, { x: t.x, stack: [], mode: 'wait', wait: 0.6, bid: 0, ph: 0, ph0: 0, w: 0, wob: 0, perfects: 0, topples: 0, misses: 0, peak: 0, prevB: 0, pend: null });
  });
  let time = meta.seconds, over = false;
  const top = t => t.stack[t.stack.length - 1] || { x: 0, w: S.W0 };
  function spawn(t) {
    t.bid++; t.mode = 'swing';
    t.w = Math.min(S.wMax, S.w0 + S.wPer * t.stack.length) * pace;
    t.ph = t.ph0 = r3(rng.range(0, Math.PI * 2));
  }
  function drop(pid, ph) {
    const t = T.get(pid); if (!t || t.mode !== 'swing' || over) return;
    t.pend = null;
    const tp = top(t), dx = S.amp * Math.sin(ph), ad = Math.abs(dx), r = ad / tp.w, h = t.stack.length;
    const overlap = tp.w - ad;
    t.mode = 'wait';
    if (overlap < S.minW) {                                               // missed the tower
      t.wob += S.wobMiss; t.misses++; t.wait = S.fall + S.missRest;
      events.push({ e: 'miss', pid, x: r2(tp.x + dx), w: r2(tp.w), y: h });
      return checkTopple(pid, t);
    }
    const lean = 1 + Math.abs(tp.x + dx) / S.W0 * S.leanFactor, hf = (1 + h / S.hFactor) * lean;
    let kind, blk, cut = null;
    if (ad <= S.perfect) { kind = 'perfect'; blk = { x: tp.x, w: Math.min(S.W0, tp.w + S.grow) }; t.wob = Math.max(0, t.wob - S.wobPerfect); t.perfects++; }
    else if (r <= S.keep) { kind = 'lean'; blk = { x: tp.x + dx, w: tp.w }; t.wob += (S.wobKeep[0] + S.wobKeep[1] * r) * hf; }
    else {
      // only the part hanging out further than RULES.keep is sliced off; the rest leans like a 'lean' drop
      const sg = Math.sign(dx), cw = ad - S.keep * tp.w, near = tp.x + dx - sg * tp.w / 2, far = tp.x + sg * (tp.w / 2 + S.keep * tp.w);
      kind = 'trim'; blk = { x: (near + far) / 2, w: tp.w - cw }; t.wob += (S.wobKeep[0] + S.wobKeep[1] * S.keep + S.wobTrim) * hf;
      cut = [r2(far + sg * cw / 2), r2(cw)];                                // the sliced-off piece: centre, width
    }
    blk = { x: r2(blk.x), w: r2(blk.w) };
    t.stack.push(blk); t.peak = Math.max(t.peak, t.stack.length); t.wait = S.fall + S.next;
    events.push({ e: 'place', pid, k: kind, x: blk.x, w: blk.w, h: t.stack.length, from: r2(tp.x + dx), ...(cut ? { cut } : {}) });
    checkTopple(pid, t);
  }
  function checkTopple(pid, t) {
    if (t.wob < 1) return;
    const h = t.stack.length, k = Math.min(h, Math.max(S.toppleMin, Math.ceil(h * S.toppleFrac)));
    const lost = t.stack.splice(h - k, k);
    t.wob = S.toppleWob; t.topples++; t.mode = 'wait'; t.wait = Math.max(t.wait, S.toppleRest);
    events.push({ e: 'topple', pid, k, h: t.stack.length, lost: lost.map(b => [b.x, b.w]) });
  }
  function finish() {
    over = true; time = 0;
    for (const t of T.values()) { t.mode = 'done'; t.pend = null; }
    events.push({ e: 'end' });
  }
  const sorted = () => players.map(p => p.pid).sort((a, b) => T.get(b).stack.length - T.get(a).stack.length);
  return {
    bodies, events,
    init: () => ({ arena, towers, left: Math.ceil(time), stacks: Object.fromEntries([...T].map(([pid, t]) => [pid, t.stack.map(b => [b.x, b.w])])), R: { BH: S.BH, W0: S.W0, amp: S.amp, lift: S.lift, liftZ: S.liftZ } }),
    input(pid, inp) {
      const b = bodies.get(pid), t = T.get(pid); if (!b || !t) return;
      stepBody(b, inp, meta.move, arena);
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(t.prevB & IN.A); t.prevB = bits;
      if (pa && t.mode === 'swing' && !t.pend && !over) t.pend = { ph: t.ph, age: 0 };
    },
    act(pid, a, d) {
      if (a !== 'drop' || over) return;
      const t = T.get(pid); if (!t || t.mode !== 'swing' || !Array.isArray(d)) return;
      const [bid, ph] = d;
      if (bid !== t.bid || typeof ph !== 'number' || !Number.isFinite(ph)) return;
      drop(pid, Math.max(t.ph0, t.ph - t.w * S.lag, Math.min(t.ph + t.w * S.ahead, ph)));
    },
    step(dt) {
      if (over) return;
      for (const [pid, t] of T) {
        t.wob = Math.max(0, t.wob - S.decay * dt);
        if (t.mode === 'wait') { t.wait -= dt; if (t.wait <= 0) spawn(t); }
        else if (t.mode === 'swing') {
          t.ph = r3(t.ph + t.w * dt);
          if (t.pend && (t.pend.age += dt) >= S.pendWait - 1e-9) drop(pid, t.pend.ph);
        }
        const b = bodies.get(pid); b.y = r2(t.stack.length * S.BH);
      }
      time -= dt;
      if (time <= 0) finish();
    },
    state() {
      const p = {};
      // per tower: [height, wobble, swinging (1/0), block id, phase, speed, top width, top x]
      for (const [pid, t] of T) { const tp = top(t); p[pid] = [t.stack.length, r2(t.wob), t.mode === 'swing' ? 1 : 0, t.bid, r2(t.ph), r2(t.w), tp.w, tp.x]; }
      return { p, left: Math.max(0, Math.ceil(time)) };
    },
    get over() { return over; },
    /** For tests: one player's tower. */
    tower: pid => T.get(pid),
    result() {
      const scores = {}, order = [];
      for (const p of players) scores[p.pid] = T.get(p.pid).stack.length;
      for (const pid of sorted()) { const g = order[order.length - 1]; if (g && scores[g[0]] === scores[pid]) g.push(pid); else order.push([pid]); }
      return { order, scores, unit: meta.unit };
    },
  };
}
