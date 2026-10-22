// TIPTOE TIGER — a long strip of grass with a start line near the camera and a big cardboard tiger at the far end,
// sitting on a little stage with a golden bell on a post in front of it. While the tiger SINGS it has its back to
// you: creep forward. Then its tail twitches and a "!" pops up (the TELL, 0.45 s, with a sound): stop! Usually it
// spins round and LOOKS for a while; anyone still moving after a short grace is roared all the way back to the start
// line. Sometimes it only half-turns (a fake-out) and goes straight back to singing. First to touch the bell wins
// (the game ends there); otherwise, when the clock runs out, whoever got furthest wins. Hold A to freeze stock-still
// (a statue). Alone: the same race against the clock, scored by distance and how fast you rang it.
import { makeBody, stepBody, separate, clampToArena, collideObstacles, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'tiptoe-tiger', title: 'Tiptoe Tiger', blurb: 'Creep up while the tiger sings — freeze when it turns, and ring its bell first!',
  how: ['Walk forward while the tiger has its back to you.', 'Its tail twitches and FREEZE! pops up — let go of the stick!', 'Moving while it looks = ROAR, back to the start.', 'Hold A to stand like a statue. Ring the bell to win!'],
  kind: 'arena', min: 1, max: 4, seconds: 75, scoring: 'points', unit: 'm', tags: ['action'],
  controls: { stick: true, a: 'Statue' }, move: { speed: 2.7, accel: 22, stunDrag: 3 },
  arena: { shape: 'rect', hw: 5.5, hd: 10.5, wall: true, blocks: [{ x: 0, z: -9.25, hw: 5.5, hd: 1.25 }] }, pitch: 52, card: 'card-tiptoe-tiger', css: true,
};

export const RULES = {
  startZ: 9.2, bellX: 0, bellZ: -7.25, bellR: 1.15, tigerZ: -9.3, stageTop: 0.45,    // reach within bellR of the bell post to ring it
  ready: 2.2,                                           // "Get ready…" before the first song
  sing: [1.3, 3.4], tell: 0.45, look: [1.5, 2.6], fake: 0.8, fakeChance: 0.28,
  grace: 0.35,                                          // after the tiger turns: this long to stop before it counts
  still: 0.55,                                          // m/s: anything faster than this while watched is moving
  flyTime: 0.9, flyH: 3.2,                              // the roar throws you back to the start line in an arc
  endPause: 2.2,
};
const SING = 0, TELL = 1, LOOK = 2, FAKE = 3, READY = 4, DONE = 5;
export const PHASES = ['sing', 'tell', 'look', 'fake', 'ready', 'done'];
const r2 = v => Math.round(v * 100) / 100;

export function create({ rng, players }) {
  const n = players.length, solo = n === 1, bodies = new Map();
  const lane = i => (n === 1 ? 0 : -3.3 + 6.6 * i / (n - 1));
  players.forEach((p, i) => { const b = makeBody(r2(lane(i)), RULES.startZ, Math.PI); b.flags = F.FROZEN; bodies.set(p.pid, b); });
  const P = new Map(players.map((p, i) => [p.pid, { i, prevB: 0, best: 0, caught: 0, fly: null, statue: false, safe: false }]));
  let phase = READY, pt = RULES.ready, nextFake = false, time = meta.seconds, elapsed = 0, over = false, endIn = -1, winner = null, wonAt = 0, songs = 0;
  const events = [];
  const progress = b => Math.max(0, RULES.startZ - b.z);
  const watching = () => phase === LOOK && pt <= (lookLen - RULES.grace);
  let lookLen = 0;
  function enter(ph) {
    phase = ph;
    if (ph === SING) { pt = rng.range(RULES.sing[0], RULES.sing[1]) * (songs === 0 ? 1.2 : 1); songs++; for (const s of P.values()) s.safe = false; }
    else if (ph === TELL) { pt = RULES.tell; nextFake = songs > 1 && rng.chance(RULES.fakeChance); }
    else if (ph === LOOK) { pt = lookLen = rng.range(RULES.look[0], RULES.look[1]); }
    else if (ph === FAKE) pt = RULES.fake;
    events.push({ e: 'phase', ph: PHASES[ph] });
  }
  function catchBody(pid) {
    const b = bodies.get(pid), s = P.get(pid);
    s.caught++; s.fly = { t: 0, x0: b.x, z0: b.z, x1: r2(lane(s.i)), z1: RULES.startZ };
    b.flags |= F.FROZEN | F.AIR; b.vx = b.vz = 0;
    events.push({ e: 'roar', pid, x: r2(b.x), z: r2(b.z) });
  }
  function finish(pid) {
    winner = pid; wonAt = elapsed; endIn = RULES.endPause; phase = DONE;
    for (const b of bodies.values()) { b.flags |= F.FROZEN; b.vx = b.vz = 0; }
    events.push({ e: 'bell', pid, t: r2(elapsed) });
  }
  return {
    bodies, events,
    init: () => ({ solo, startZ: RULES.startZ, bell: [RULES.bellX, RULES.bellZ], lanes: players.map((p, i) => [p.pid, r2(lane(i))]), left: Math.ceil(time) }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0; s.prevB = bits;
      if (s.fly || phase === DONE || phase === READY) return;
      s.statue = !!(bits & IN.A);
      if (s.statue) { b.flags |= F.FROZEN; b.vx = b.vz = 0; return; }
      b.flags &= ~F.FROZEN;
      stepBody(b, inp, meta.move, meta.arena);
    },
    step(dt) {
      if (over) return;
      elapsed += dt;
      if (endIn >= 0) { endIn -= dt; if (endIn <= 0) over = true; return; }
      time -= dt;
      { const list = [...bodies].filter(([pid]) => !P.get(pid).fly).map(([, b]) => b); separate(list); for (const b of list) { clampToArena(b, meta.arena); collideObstacles(b, meta.arena); } }
      // the tiger
      pt -= dt;
      if (pt <= 0) {
        if (phase === READY) for (const [pid, b] of bodies) if (!P.get(pid).statue) b.flags &= ~F.FROZEN;
        if (phase === READY || phase === LOOK || phase === FAKE) enter(SING);
        else if (phase === SING) enter(TELL);
        else if (phase === TELL) enter(nextFake ? FAKE : LOOK);
      }
      // roared players fly home
      for (const [pid, b] of bodies) {
        const s = P.get(pid);
        if (s.fly) {
          const f = s.fly; f.t += dt; const k = Math.min(1, f.t / RULES.flyTime), e = k * k * (3 - 2 * k);
          b.x = r2(f.x0 + (f.x1 - f.x0) * e); b.z = r2(f.z0 + (f.z1 - f.z0) * e); b.y = r2(Math.sin(k * Math.PI) * RULES.flyH); b.yaw = Math.PI;
          if (k >= 1) { s.fly = null; s.safe = true; b.y = 0; b.flags &= ~(F.FROZEN | F.AIR); }     // safe until the next song: never caught twice in one look
          continue;
        }
        s.best = Math.max(s.best, progress(b));
        if (watching() && !s.statue && !s.safe && Math.hypot(b.vx, b.vz) > RULES.still) catchBody(pid);
        else if (Math.hypot(b.x - RULES.bellX, b.z - RULES.bellZ) < RULES.bellR + 0.45 && phase !== DONE) { finish(pid); break; }
      }
      if (phase !== DONE && time <= 0) { time = 0; phase = DONE; endIn = 0.05; for (const b of bodies.values()) { b.flags |= F.FROZEN; b.vx = b.vz = 0; } events.push({ e: 'time' }); }
    },
    state() {
      const sc = {}, cg = {};
      for (const p of players) { const b = bodies.get(p.pid), s = P.get(p.pid); sc[p.pid] = winner === p.pid ? Math.round(RULES.startZ - RULES.bellZ) : Math.floor(progress(b)); cg[p.pid] = s.caught; }
      const watch = phase === LOOK ? (pt <= lookLen - RULES.grace ? 2 : 1) : 0;    // 1 = turning (grace), 2 = watching
      return { ph: PHASES[phase], w: watch, sc, cg, win: winner, left: Math.ceil(Math.max(0, time)) };
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) {
        const b = bodies.get(p.pid), d = winner === p.pid ? 999 : Math.floor(progress(b) * 2) / 2;    // half-metre steps: a near-tie is a tie
        scores[p.pid] = winner === p.pid ? Math.round(RULES.startZ - RULES.bellZ) : Math.floor(progress(b));
        if (!groups.has(d)) groups.set(d, []); groups.get(d).push(p.pid);
      }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
    get winner() { return winner; }, get wonAt() { return wonAt; }, get phase() { return PHASES[phase]; },
  };
}
