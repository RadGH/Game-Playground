// BALLOON STAMPEDE — a walled toy playroom full of drifting balloons in the colours of the seated players (each
// colour also has its own balloon SHAPE: round, cube, cone, diamond, matching the seat shapes), plus a few shiny
// golden ones. Run into a balloon to pop it: your own colour +1, golden +3, someone else's colour -1 for you and +1
// for its owner. A is a DASH: a short burst that barges into anyone in the way and sends them sliding — straight into
// balloons that may not be theirs. Alone, grey balloons drift about too and cost a point. Most points at the bell wins.
import { makeBody, stepBody, separate, spawnRing, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'balloon-stampede', title: 'Balloon Stampede', blurb: 'Pop the balloons in your colour, but not anyone else\'s!',
  how: ['Run into balloons of YOUR colour and shape to pop them: +1.', 'Golden balloons are +3. Someone else\'s colour: -1 for you, +1 for them!', 'DASH to barge rivals into the wrong balloons.'],
  kind: 'arena', min: 1, max: 4, seconds: 45, scoring: 'points', unit: 'pops', tags: ['action'],
  controls: { stick: true, a: 'Dash' }, move: { speed: 6.2, accel: 26, stunDrag: 2.4 },
  arena: { shape: 'rect', hw: 8, hd: 6.5, wall: true }, pitch: 58, card: 'card-balloon-stampede',
};

export const GOLD = 4, GREY = 5;
export const RULES = {
  touch: 0.85,                              // body centre to balloon centre (floor distance) that pops it
  perField: 8, perPlayer: 3,                // balloons kept in the room: 8 + 3 per player
  spawnEvery: 0.12, clearOfPlayers: 2.4,     // a new one inflates at least this far from everyone
  gold: 0.07, grey: 0.35,                   // golden share; grey (solo only) share
  drift: [0.6, 1.5], goldDrift: 2.3, wobble: 1.2,
  pts: { own: 1, gold: 3, grey: -1, other: -1, gift: 1 },
  dashCool: 1.5, dash: 0.24, dashSpeed: 13, barge: 1.05, bargePush: 9, bargeStun: 0.55,
  edge: 0.55,
};
const r1 = v => Math.round(v * 10) / 10;

export function create({ rng, players }) {
  const n = players.length, solo = n === 1, bodies = new Map(), spawns = spawnRing(n, solo ? 0 : 3.8), A = meta.arena;
  players.forEach((p, i) => bodies.set(p.pid, makeBody(spawns[i].x, spawns[i].z, spawns[i].yaw)));
  const P = new Map(players.map(p => [p.pid, { prevB: 0, seat: p.seat, pts: 0, pops: 0, cool: 0, dash: 0, stun: 0, hit: new Set() }]));
  const ownerOf = new Map(players.map(p => [p.seat, p.pid]));
  let balloons = [], bid = 0, next = 0, time = meta.seconds, over = false;
  const events = [], target = RULES.perField + RULES.perPlayer * n, lx = A.hw - RULES.edge, lz = A.hd - RULES.edge;

  function colour() {
    if (rng.chance(RULES.gold)) return GOLD;
    if (solo) return rng.chance(RULES.grey) ? GREY : players[0].seat;
    const count = new Map(players.map(p => [p.seat, 0])); for (const b of balloons) if (count.has(b.c)) count.set(b.c, count.get(b.c) + 1);
    const least = Math.min(...count.values());
    return rng.pick([...count].filter(([, k]) => k === least).map(([s]) => s));     // keep the colours even
  }
  function spawn() {
    let x = 0, z = 0;
    for (let k = 0; k < 12; k++) {
      x = rng.range(-lx, lx); z = rng.range(-lz, lz);
      if ([...bodies.values()].every(b => Math.hypot(b.x - x, b.z - z) >= RULES.clearOfPlayers) && balloons.every(o => Math.hypot(o.x - x, o.z - z) > 0.9)) break;
    }
    const c = colour(), a = rng.range(0, Math.PI * 2), sp = c === GOLD ? RULES.goldDrift : rng.range(RULES.drift[0], RULES.drift[1]);
    balloons.push({ id: ++bid, x, z, vx: Math.sin(a) * sp, vz: Math.cos(a) * sp, sp, c });
  }
  function pop(pid, b) {
    const s = P.get(pid), owner = b.c < 4 ? ownerOf.get(b.c) : null;
    let d = 0, gift = null;
    if (b.c === GOLD) d = RULES.pts.gold;
    else if (b.c === GREY) d = RULES.pts.grey;
    else if (b.c === s.seat) d = RULES.pts.own;
    else { d = RULES.pts.other; if (owner != null) { P.get(owner).pts += RULES.pts.gift; gift = owner; } }
    s.pts += d; s.pops++;
    events.push({ e: 'pop', pid, c: b.c, d, gift, x: r1(b.x), z: r1(b.z) });
  }
  return {
    bodies, events,
    init: () => ({ seats: players.map(p => [p.pid, p.seat]), solo, left: Math.ceil(time) }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(s.prevB & IN.A); s.prevB = bits;
      if (pa && s.cool <= 0 && !(b.flags & F.STUN)) {
        let mx = +inp?.mx || 0, mz = +inp?.mz || 0; const m = Math.hypot(mx, mz);
        const yaw = m > 0.2 ? Math.atan2(mx, mz) : b.yaw; b.yaw = yaw;
        s.cool = RULES.dashCool; s.dash = RULES.dash; s.hit.clear();
        b.vx = Math.sin(yaw) * RULES.dashSpeed; b.vz = Math.cos(yaw) * RULES.dashSpeed; b.flags |= F.STUN | F.AIR;   // STUN: no steering mid-dash; AIR marks it as a dash
        events.push({ e: 'dash', pid });
      }
      stepBody(b, inp, meta.move, meta.arena);
    },
    step(dt) {
      if (over) return;
      separate(bodies.values());
      // dashes barge whoever they reach
      for (const [pid, b] of bodies) {
        const s = P.get(pid);
        if (s.cool > 0) s.cool -= dt;
        if (s.dash > 0) {
          s.dash -= dt;
          for (const [qid, c] of bodies) {
            if (qid === pid || s.hit.has(qid)) continue;
            const dx = c.x - b.x, dz = c.z - b.z, d = Math.hypot(dx, dz); if (d > RULES.barge) continue;
            s.hit.add(qid); const q = P.get(qid), nx = d > 1e-3 ? dx / d : Math.sin(b.yaw), nz = d > 1e-3 ? dz / d : Math.cos(b.yaw);
            c.vx = nx * RULES.bargePush; c.vz = nz * RULES.bargePush; c.flags = (c.flags | F.STUN) & ~F.AIR; q.stun = RULES.bargeStun; q.dash = 0;
            b.vx *= 0.35; b.vz *= 0.35;
            events.push({ e: 'barge', pid: qid, by: pid });
          }
          if (s.dash <= 0) b.flags &= ~(F.STUN | F.AIR);
        }
        if (s.stun > 0) { s.stun -= dt; if (s.stun <= 0) b.flags &= ~F.STUN; }
      }
      // balloons drift, wobble and bounce off the walls; anyone touching one pops it (nearest player gets it)
      for (const bl of balloons) {
        const turn = rng.range(-RULES.wobble, RULES.wobble) * dt, c = Math.cos(turn), sn = Math.sin(turn);
        const vx = bl.vx * c - bl.vz * sn, vz = bl.vx * sn + bl.vz * c; bl.vx = vx; bl.vz = vz;
        bl.x += bl.vx * dt; bl.z += bl.vz * dt;
        if (Math.abs(bl.x) > lx) { bl.x = Math.sign(bl.x) * lx; bl.vx = -bl.vx; }
        if (Math.abs(bl.z) > lz) { bl.z = Math.sign(bl.z) * lz; bl.vz = -bl.vz; }
        let who = null, best = RULES.touch;
        for (const [pid, b] of bodies) { const d = Math.hypot(b.x - bl.x, b.z - bl.z); if (d < best) { best = d; who = pid; } }
        if (who != null) { pop(who, bl); bl.gone = true; }
      }
      balloons = balloons.filter(b => !b.gone);
      next -= dt;
      if (next <= 0 && balloons.length < target) { next = RULES.spawnEvery; spawn(); }
      time -= dt;
      if (time <= 0) { time = 0; over = true; for (const b of bodies.values()) { b.flags = (b.flags | F.FROZEN) & ~(F.STUN | F.AIR); b.vx = b.vz = 0; } }
    },
    state() {
      const sc = {}; for (const p of players) sc[p.pid] = P.get(p.pid).pts;
      // a balloon: [id, x, z, colour (seat 0-3, 4 gold, 5 grey)] — positions to 10 cm; the view glides between updates
      return { bl: balloons.map(b => [b.id, r1(b.x), r1(b.z), b.c]), sc, left: Math.ceil(time) };
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) { const k = P.get(p.pid).pts; scores[p.pid] = k; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p.pid); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
  };
}
