// CASTLE ARCHERS — co-op. Everyone stands on the same castle wall (seen from the side) and goblins march in from the
// right in three waves. DRAG BACK on the screen like a bow string and let go: the direction sets the angle, the length
// sets the power, and the arrow flies on a real arc (gravity, and the wind blows it — each wave has its own wind,
// shown by the flag). A goblin that reaches the gate bashes it. The team wins if the gate still stands when the last
// wave is beaten. Goblins: Grunt (1 hit), Runner (quick, 1 hit), Shield (the first hit knocks the shield off), Kite
// (flies high on a kite: aim up), Bruiser (big, 4 hits). Points for each goblin you finish off.
//
// The arrow's flight is one pure function (`stepArrow`), so the phone's dotted aim arc and the server's arrows agree.
import { placeOrder, r1, r2 } from '../toss-kit.js';

export const meta = {
  id: 'castle-archers', title: 'Castle Archers', blurb: 'Fire arrows over the wall together and keep the goblins from the gate!',
  how: ['Drag BACK from anywhere and let go to shoot, like a bow string.', 'Further back = more power. The arrow flies in an arc and the wind pushes it.', 'Stop the goblins reaching the gate. Bruisers take 4 arrows!'],
  kind: 'ui', min: 1, max: 4, seconds: 80, scoring: 'coop', unit: 'points', tags: ['coop', 'action'], card: 'card-castle-archers', css: true,
  controls: { a: 'Shoot' },
};
export const FIELD = 40, GATE_X = 5, WALL_Y = 7, G = 11, VMIN = 9, VMAX = 24, COOL_S = 0.55, ARROW_LIFE = 4;
export const COUNT_S = 3, WAVE_GAP = 3, END_S = 3, GATE_HP = 100, PLAY_MAX = 73;
export const KINDS = {
  grunt: { hp: 1, speed: 2.2, w: 1.1, h: 1.9, dps: 5, pts: 1 },
  runner: { hp: 1, speed: 3.9, w: 1.0, h: 1.6, dps: 4, pts: 2 },
  shield: { hp: 2, speed: 1.9, w: 1.2, h: 2.0, dps: 5, pts: 2 },
  kite: { hp: 1, speed: 2.5, w: 1.4, h: 1.6, dps: 4, pts: 2, fly: true },
  bruiser: { hp: 4, speed: 1.8, w: 1.8, h: 2.8, dps: 12, pts: 4 },
};
export const LEVELS = {
  easy: { count: 0.85, speed: 0.9, wind: 1.2, dps: 0.9 },
  normal: { count: 1, speed: 1, wind: 2, dps: 1 },
  hard: { count: 1.25, speed: 1.12, wind: 2.8, dps: 1.25 },
};
const WAVES = [
  { len: 12, mix: { grunt: 6, runner: 1 } },
  { len: 13, mix: { grunt: 4, runner: 2, shield: 2, kite: 2 } },
  { len: 14, mix: { grunt: 4, runner: 2, shield: 2, kite: 2, bruiser: 2 } },
];
/** Where archer `i` of `n` stands on the wall (x, y). */
export const archerAt = (i, n) => ({ x: r2(1.2 + (n <= 1 ? 1.6 : i * 3.2 / (n - 1))), y: WALL_Y + 0.9 });
/** An arrow from angle a (radians, up = +) and power p (0..1). */
export function launch(a, p, at) { const v = VMIN + (VMAX - VMIN) * Math.max(0, Math.min(1, p)); return { x: at.x, y: at.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0 }; }
/** One step of flight (gravity + wind as a sideways push). */
export function stepArrow(A, wind, dt) { A.vx += wind * dt; A.vy -= G * dt; A.x += A.vx * dt; A.y += A.vy * dt; A.t += dt; return A; }
/** Where a goblin is at time t (x, foot height). Kites bob in the air. */
export function goblinAt(gb, t, L) {
  const K = KINDS[gb.k], walked = Math.max(0, t - gb.t0) * K.speed * L.speed * gb.sp;
  const x = Math.max(GATE_X + K.w / 2, FIELD + 2 - walked);
  return { x, y: K.fly ? gb.alt + Math.sin(t * 2.1 + gb.id) * 0.6 : 0 };
}
/** The goblins of the match, fixed from the seed: [{ id, k, t0, sp, alt, wave }]. */
export function makeGoblins(rng, n, L) {
  const out = []; let t = 0;
  WAVES.forEach((W, wave) => {
    const list = [];
    for (const [k, c] of Object.entries(W.mix)) { const m = Math.max(1, Math.round(c * L.count * (0.3 + 0.22 * n))); for (let i = 0; i < m; i++) list.push(k); }
    const order = rng.shuffle(list);
    order.forEach((k, i) => out.push({ id: out.length, k, t0: r2(t + 0.6 + i * (W.len / order.length) * rng.range(0.75, 1.15)), sp: r2(rng.range(0.9, 1.1)), alt: r2(rng.range(4, 8)), wave }));
    t += W.len + WAVE_GAP;
  });
  return out;
}
export const waveStarts = () => { const s = []; let t = 0; for (const W of WAVES) { s.push(t); t += W.len + WAVE_GAP; } return s; };
export const valid = d => d && typeof d === 'object' && Number.isFinite(d.a) && Number.isFinite(d.p) && d.a >= -0.6 && d.a <= 1.5 && d.p >= 0 && d.p <= 1;

export function create({ rng, players, difficulty = 'normal' }) {
  const L = LEVELS[difficulty] || LEVELS.normal, pids = players.map(p => p.pid), n = pids.length;
  const goblins = makeGoblins(rng, n, L), starts = waveStarts();
  const winds = WAVES.map((_, i) => r1((i === 0 ? 0.4 : 1) * L.wind * rng.range(0.4, 1) * (rng.chance(0.5) ? 1 : -1)));
  const posOf = new Map(pids.map((p, i) => [p, archerAt(i, n)]));
  const S = Object.fromEntries(pids.map(p => [p, { pts: 0, shots: 0, hits: 0, cool: 0 }]));
  const live = new Map();                               // id -> { hp, shield, atGate }
  let arrows = [], aid = 0, gate = GATE_HP, phase = 'count', left = COUNT_S, el = 0, over = false, success = false, next = 0;
  const events = [];
  const waveOf = t => { let w = 0; for (let i = 0; i < starts.length; i++) if (t >= starts[i]) w = i; return w; };
  return {
    events,
    init: () => ({ goblins, kinds: KINDS, winds, starts, archers: Object.fromEntries(pids.map(p => [p, posOf.get(p)])), field: FIELD, gateX: GATE_X, wallY: WALL_Y, gateHp: GATE_HP, level: L, g: G, vmin: VMIN, vmax: VMAX, cool: COOL_S, count: COUNT_S, waves: WAVES.length }),
    act(pid, a, d) {
      if (a !== 'shoot' || !S[pid] || phase !== 'play' || over || !valid(d)) return;
      const s = S[pid]; if (s.cool > 0) return;
      s.cool = COOL_S; s.shots++;
      const A = launch(d.a, d.p, posOf.get(pid)); A.id = ++aid; A.by = pid; arrows.push(A);
      events.push({ e: 'shot', pid, id: A.id, a: r2(d.a), p: r2(d.p) });
    },
    step(dt) {
      if (over) return;
      if (phase === 'count') { left -= dt; if (left <= 0) { phase = 'play'; el = 0; events.push({ e: 'wave', w: 0, wind: winds[0] }); } return; }
      if (phase === 'end') { left -= dt; if (left <= 0) over = true; return; }
      el += dt;
      const w = waveOf(el); if (w !== waveOf(el - dt)) events.push({ e: 'wave', w, wind: winds[w] });
      for (const p of pids) if (S[p].cool > 0) S[p].cool -= dt;
      while (next < goblins.length && goblins[next].t0 <= el) { const gb = goblins[next++]; live.set(gb.id, { hp: KINDS[gb.k].hp, shield: gb.k === 'shield', atGate: false }); }
      // arrows fly (three small steps a tick) and hit the first goblin they pass through
      const wind = winds[w];
      for (const A of arrows) {
        for (let k = 0; k < 3 && !A.done; k++) {
          stepArrow(A, wind, dt / 3);
          for (const [id, st] of live) {
            const gb = goblins[id], K = KINDS[gb.k], at = goblinAt(gb, el, L);
            if (Math.abs(A.x - at.x) > K.w / 2 + 0.05 || A.y < at.y || A.y > at.y + K.h) continue;
            A.done = true;
            if (st.shield) { st.shield = false; st.hp--; events.push({ e: 'hit', id, by: A.by, aid: A.id, shield: 1, x: r1(A.x), y: r1(A.y) }); break; }
            st.hp--; S[A.by].hits++;
            if (st.hp <= 0) { live.delete(id); S[A.by].pts += K.pts; events.push({ e: 'down', id, by: A.by, aid: A.id, pts: K.pts, x: r1(at.x), y: r1(A.y) }); }
            else events.push({ e: 'hit', id, by: A.by, aid: A.id, x: r1(A.x), y: r1(A.y) });
            break;
          }
          if (!A.done && (A.y <= 0 || A.x > FIELD + 8 || A.x < -2)) { A.done = true; events.push({ e: 'miss', aid: A.id, x: r1(A.x), y: 0 }); }
        }
        if (A.t > ARROW_LIFE) A.done = true;
      }
      arrows = arrows.filter(A => !A.done);
      // goblins at the gate bash it
      for (const [id, st] of live) {
        const gb = goblins[id], K = KINDS[gb.k], at = goblinAt(gb, el, L);
        if (at.x <= GATE_X + K.w / 2 + 1e-6) { if (!st.atGate) { st.atGate = true; events.push({ e: 'bash', id }); } gate -= K.dps * L.dps * dt; }
      }
      if (gate <= 0) { gate = 0; success = false; phase = 'end'; left = END_S; events.push({ e: 'end', ok: false }); return; }
      if (next >= goblins.length && !live.size && el >= starts.at(-1)) { success = true; phase = 'end'; left = END_S; events.push({ e: 'end', ok: true }); return; }
      if (el >= PLAY_MAX) { success = gate > 0; phase = 'end'; left = END_S; events.push({ e: 'end', ok: success }); }
    },
    state() {
      const sc = {}; for (const p of pids) sc[p] = S[p].pts;
      const gb = []; for (const [id, st] of live) { const at = goblinAt(goblins[id], el, L); gb.push([id, r1(at.x), st.hp, st.shield ? 1 : 0, st.atGate ? 1 : 0]); }
      return { phase, left: phase === 'count' ? Math.max(0, Math.ceil(left)) : Math.max(0, Math.ceil(PLAY_MAX - el)), el: r2(el), sc, gate: Math.ceil(gate), w: waveOf(el), gb };
    },
    get over() { return over; },
    result() {
      const scores = Object.fromEntries(pids.map(p => [p, S[p].pts]));
      return { coop: { success }, order: [pids.slice()], scores, unit: meta.unit };
    },
    get _el() { return el; }, get _phase() { return phase; }, get _gate() { return gate; }, get _live() { return live; }, get _arrows() { return arrows; },
    _stats: S, _goblins: goblins, _winds: winds, _level: L, _posOf: posOf, _waveOf: waveOf, _placeOrder: () => placeOrder(pids, p => S[p].pts),
  };
}
/** A good aim at goblin `gb` (a bot's or a test's eye): tries angles, finds the power whose arrow meets the goblin. */
export function aimAt(gb, from, el, wind, L) {
  let best = null;
  for (let a = -0.25; a <= 1.2; a += 0.05) for (let p = 0.05; p <= 1.001; p += 0.025) {
    const A = launch(a, p, from); let miss = Infinity;
    for (let k = 0; k < 120 && A.y > -0.5; k++) {
      stepArrow(A, wind, 1 / 60); const at = goblinAt(gb, el + A.t, L), K = KINDS[gb.k];
      const dx = Math.abs(A.x - at.x), cy = at.y + K.h / 2, dy = Math.abs(A.y - cy);
      if (dx < 0.6) miss = Math.min(miss, dy + dx);
    }
    if (miss < 0.6 && (!best || a < best.a - 1e-9 && miss <= best.miss + 0.2)) best = { a: r2(a), p: r2(p), miss };
  }
  return best;
}
