// GOLF PUTT MATCH — the match flow Putt Party and Haunted Hole share (each game brings its own holes and, if it
// wants, a hook that moves its own hazards). Every player putts THEIR OWN ball on the same hole at the same time: no
// turns. Aim with the stick (your character turns round the ball), hold A to charge (the power rises and falls back),
// let go to putt. When your ball stops you can putt again. A hole ends when every ball is in (or picked up at par + 3
// strokes) or its clock runs out; an unfinished hole counts par + 3. Then the next hole. Fewest strokes wins; a tie on
// strokes goes first to whoever putted on more holes, then to whoever left their unfinished balls nearer the cup (so
// standing still never ties, let alone beats, someone trying).
import { makeBody, stepBody, F, DT } from '../shared/arena.js';
import { IN } from '../shared/protocol.js';
import { makeBall, stepBalls, charge, puttSpeed, assistYaw, BALL_R, speedOf } from './golf-kit.js';

/** Aim help, cup size and the power swing by difficulty. Views read this too (aim line length, charge period). */
export const PUTT_LEVELS = {
  easy:   { cupR: 0.27, cap: 2.7, help: 14, line: 3.6, period: 2.2, max: 9.5 },
  normal: { cupR: 0.22, cap: 2.25, help: 9, line: 2.6, period: 1.8, max: 9.5 },
  hard:   { cupR: 0.185, cap: 1.9, help: 5, line: 1.7, period: 1.45, max: 9.5 },
};
export const STANCE = 0.62;                       // your character stands this far behind the ball
export const PICKUP = 3;                          // par + 3 strokes and the ball is picked up
export const ST = { aim: 0, roll: 1, in: 2, out: 3 };
const r2 = v => Math.round(v * 100) / 100;
export const levelOf = d => PUTT_LEVELS[d] || PUTT_LEVELS.normal;
/** Where seat i's ball sits on a tee: side by side across the line to the cup. */
export function teeSpot(hole, i, n) {
  const yaw = Math.atan2(hole.cup.x - hole.tee.x, hole.cup.z - hole.tee.z), off = (i - (n - 1) / 2) * 0.7;
  return { x: r2(hole.tee.x + Math.cos(yaw) * off), z: r2(hole.tee.z - Math.sin(yaw) * off), yaw };
}
export const scoreName = (strokes, par) => strokes === 1 ? 'Hole in one!' : ({ '-3': 'Albatross!', '-2': 'Eagle!', '-1': 'Birdie!', 0: 'Par', 1: 'Bogey', 2: 'Double bogey' }[strokes - par] || `+${strokes - par}`);

/**
 * meta: the game's meta. holes: [{ name, par, tee: {x,z}, cup: {x,z}, course: {...golf-kit course, no cup} }].
 * hook (optional): { step(H, t, dt, balls, events) — move hazards, set H.course.dyn / H.cupOpen, teleport balls;
 *   state(H, t) — extra public state; init(holes) — extra init }
 */
export function createPuttMatch({ meta, rng, players, difficulty, holes, holeSeconds = 30, gap = 2.6, hook = {} }) {
  const L = levelOf(difficulty), n = players.length, bodies = new Map(), events = [];
  const P = new Map(players.map((p, i) => [p.pid, { i, seat: p.seat, ball: null, st: ST.aim, strokes: 0, cards: [], miss: 0, skipped: 0, held: 0, prevA: 0, yaw: 0, rollT: 0 }]));
  let hi = -1, H = null, phase = 'gap', phaseLeft = 0.6, holeLeft = 0, time = meta.seconds - 1, t = 0, over = false;
  players.forEach(p => bodies.set(p.pid, makeBody(0, 0, 0)));

  function startHole(k) {
    hi = k; H = holes[k]; t = 0; holeLeft = holeSeconds; phase = 'play';
    H.course.cup = { x: H.cup.x, z: H.cup.z, r: L.cupR, cap: L.cap };
    H.cupOpen = true;
    players.forEach((p, i) => {
      const s = P.get(p.pid), at = teeSpot(H, i, n);
      s.ball = makeBall(at.x, at.z); s.st = ST.aim; s.strokes = 0; s.held = 0; s.rollT = 0;
      const b = bodies.get(p.pid); b.yaw = at.yaw; place(b, s);
    });
    events.push({ e: 'hole', h: k, par: H.par, name: H.name });
  }
  function place(b, s) {
    b.x = r2(s.ball.x - Math.sin(b.yaw) * STANCE); b.z = r2(s.ball.z - Math.cos(b.yaw) * STANCE); b.vx = b.vz = 0;
  }
  function endHole() {
    for (const p of players) {
      const s = P.get(p.pid);
      if (s.st >= ST.in) continue;                         // in, or already picked up (carded then)
      s.cards.push(H.par + PICKUP);
      s.miss += Math.round(Math.hypot(s.ball.x - H.cup.x, s.ball.z - H.cup.z));          // whole metres: two players who both stood still tie
      if (!s.strokes) s.skipped++;                         // never putted on this hole
      if (s.st !== ST.out) events.push({ e: 'timeout', pid: p.pid });
      s.st = ST.out;
    }
    events.push({ e: 'holeEnd', h: hi, cards: Object.fromEntries(players.map(p => [p.pid, P.get(p.pid).cards[hi]])) });
    if (hi + 1 >= holes.length) finish(); else { phase = 'gap'; phaseLeft = gap; }
  }
  function finish() {
    over = true; phase = 'end';
    // holes never reached (the whole-game clock ran out) count par + 3 too
    for (const p of players) { const s = P.get(p.pid); while (s.cards.length < holes.length) { s.cards.push(holes[s.cards.length].par + PICKUP); s.miss += 99; s.skipped++; } }
    events.push({ e: 'end' });
  }
  const total = s => s.cards.reduce((a, b) => a + b, 0);
  function shoot(pid, s, b) {
    const p = charge(s.held, L.period); s.held = 0;
    if (p < 0.02) return;
    const yaw = assistYaw(H.course, s.ball.x, s.ball.z, b.yaw, [H.cup], L.help), v = puttSpeed(p, L.max);
    s.ball.vx = Math.sin(yaw) * v; s.ball.vz = Math.cos(yaw) * v; s.ball.still = false; s.st = ST.roll; s.rollT = 0;
    s.strokes++; b.yaw = yaw;
    events.push({ e: 'putt', pid, p: r2(p), x: r2(s.ball.x), z: r2(s.ball.z) });
  }
  const balls = () => players.map(p => P.get(p.pid).ball);
  return {
    bodies, events,
    init: () => ({ holes: holes.map(({ savedCup, cupOpen, course, ...h }) => ({ ...h, course: { ...course, cup: undefined, dyn: undefined } })), level: L, holeSeconds, ...(hook.init?.(holes) || {}) }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || !s) return;
      const bits = inp?.b | 0, a = bits & IN.A;
      const x0 = b.x, z0 = b.z;
      stepBody(b, inp, meta.move, meta.arena);                // turns you to the stick (the phone predicts the same); you never walk
      b.x = x0; b.z = z0; b.vx = b.vz = 0;
      if (phase === 'play' && s.st === ST.aim) {
        if (a) s.held += DT;
        else if (s.prevA && s.held > 0) shoot(pid, s, b);
        place(b, s);
      } else { s.held = 0; b.vx = b.vz = 0; }
      s.prevA = a;
    },
    step(dt) {
      if (over) return;
      time -= dt;
      if (phase === 'gap') { phaseLeft -= dt; if (phaseLeft <= 0) startHole(hi + 1); }
      else if (phase === 'play') {
        hook.step?.(H, t, dt, players.map(p => ({ pid: p.pid, s: P.get(p.pid) })), events);
        const ev = stepBalls(balls(), H.course, t, dt); t += dt;
        for (const e of ev) {
          const pid = players[e.i].pid, s = P.get(pid);
          if (e.e === 'cup') { s.st = ST.in; s.cards.push(s.strokes); events.push({ e: 'in', pid, strokes: s.strokes, par: H.par }); }
          else events.push({ e: e.e, pid, x: e.x, z: e.z });
        }
        for (const p of players) {
          const s = P.get(p.pid);
          if (s.st !== ST.roll) continue;
          s.rollT += dt;
          if (s.rollT > 14) { s.ball.vx = s.ball.vz = 0; s.ball.still = true; }          // never stuck rolling for ever
          if (s.ball.still && !s.ball.in) {
            if (s.strokes >= H.par + PICKUP) { s.st = ST.out; s.cards.push(H.par + PICKUP); s.miss += Math.round(Math.hypot(s.ball.x - H.cup.x, s.ball.z - H.cup.z)); s.ball.gone = true; events.push({ e: 'pickup', pid: p.pid }); }
            else { s.st = ST.aim; const b = bodies.get(p.pid); b.yaw = Math.atan2(H.cup.x - s.ball.x, H.cup.z - s.ball.z); place(b, s); events.push({ e: 'ready', pid: p.pid }); }
          }
        }
        holeLeft -= dt;
        if (players.every(p => P.get(p.pid).st >= ST.in) || holeLeft <= 0) endHole();
      }
      if (!over && time <= 0) { if (phase === 'play') endHole(); if (!over) finish(); }
    },
    state() {
      const b = players.map(p => { const s = P.get(p.pid); return [p.pid, r2(s.ball?.x ?? 0), r2(s.ball?.z ?? 0), s.st, s.strokes, s.st === ST.aim ? Math.round(charge(s.held, L.period) * 100) : 0]; });
      const sc = {}; for (const p of players) { const s = P.get(p.pid); sc[p.pid] = total(s) + (phase === 'play' && s.st < ST.in ? s.strokes : 0); }
      return { ph: phase, h: Math.max(0, hi), hl: Math.max(0, Math.ceil(holeLeft)), t: r2(t), b, sc, left: Math.max(0, Math.ceil(time)), ...(H && hook.state ? hook.state(H, t) : {}) };
    },
    get over() { return over; },
    result() {
      if (!over) { if (phase === 'play') endHole(); if (!over) finish(); }
      const rows = players.map(p => { const s = P.get(p.pid); return { pid: p.pid, tot: total(s), skip: s.skipped, miss: Math.round(s.miss * 10) / 10 }; });
      rows.sort((a, b) => a.tot - b.tot || a.skip - b.skip || a.miss - b.miss);
      const order = [];
      for (const r of rows) { const last = order[order.length - 1]; if (last && last.tot === r.tot && last.skip === r.skip && last.miss === r.miss) last.pids.push(r.pid); else order.push({ ...r, pids: [r.pid] }); }
      return { order: order.map(o => o.pids), scores: Object.fromEntries(rows.map(r => [r.pid, r.tot])), unit: meta.unit, cards: Object.fromEntries(players.map(p => [p.pid, P.get(p.pid).cards.slice()])), par: holes.reduce((a, h) => a + h.par, 0) };
    },
    /** Tests: the live hole, a player's private state. */
    _debug: { hole: () => H, player: pid => P.get(pid), t: () => t, phase: () => phase },
  };
}
export { BALL_R, speedOf, F };
