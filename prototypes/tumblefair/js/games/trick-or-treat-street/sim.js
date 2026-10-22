// TRICK-OR-TREAT STREET (Halloween only) — a little night street: a row of cute houses along the back and two down
// each side, every one with a front door on the pavement. A LIT door (warm glow, a jack-o'-lantern grinning on the
// step) can be knocked: walk up to it and press A. You stand on the step while the door creaks open (0.5 s), then
// it is a TREAT (+1, +2 or +3 candy, now and then a BIG BAR +5) or a harmless TRICK: a cartoon ghost pops out
// (BOO! — spooked, no control for a moment, nudged off the step) or a bucket of slime tips on you (slowed for a few
// seconds). A knocked door goes dark for a while, then lights again somewhere along the street (never more lit at
// once than there are players + 2, so you race for them). B = BUMP: a short barge; bump someone holding candy and
// one piece spills on the road for anyone to grab. In the last 12 s every door lights up faster (the Candy Rush).
// Most candy at the bell wins. Alone: the same street as a score attack with bronze / silver / gold targets.
import { makeBody, stepBody, separate, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

const HW = 9.5, HD = 5.6;
// door points sit just inside the pavement edge; `face` = which way the door looks (the yaw a knocker faces is the opposite)
export const DOORS = [
  ...[-7.6, -3.8, 0, 3.8, 7.6].map(x => ({ x, z: -HD + 0.55, face: 0 })),             // back row, doors toward the camera
  ...[-1.6, 2.4].map(z => ({ x: -HW + 0.55, z, face: Math.PI / 2 })),                // left side, doors facing right
  ...[-1.6, 2.4].map(z => ({ x: HW - 0.55, z, face: -Math.PI / 2 })),                // right side, doors facing left
];

export const meta = {
  id: 'trick-or-treat-street', title: 'Trick-or-Treat Street', blurb: 'Knock on the glowing doors for candy — but watch out for tricks!',
  how: ['Walk up to a GLOWING door and press A to knock.', 'Treats: candy +1 to +3, or a BIG BAR +5!', 'Tricks: a ghost says BOO (spooked!) or slime slows you down.', 'B = bump someone to make them spill a candy. Most candy wins!'],
  kind: 'arena', min: 1, max: 4, seconds: 60, scoring: 'points', unit: 'candy', tags: ['action', 'holiday'], season: 'halloween',
  controls: { stick: true, a: 'Knock', b: 'Bump' }, move: { speed: 5.4, accel: 28, stunDrag: 4, slowMul: 0.45 },
  arena: { shape: 'rect', hw: HW, hd: HD, wall: true, posts: [{ x: -4.6, z: 1.6, r: 0.28 }, { x: 4.6, z: 1.6, r: 0.28 }, { x: 0, z: 2.6, r: 0.62 }] },
  pitch: 56, card: 'card-trick-or-treat-street', css: true,
};

export const RULES = {
  reach: 1.35,                       // knock from this close to a door point
  open: 0.5,                         // the door creaks open; you wait on the step
  // what is behind a door (weights): candy 1/2/3, big bar 5, BOO ghost, slime
  odds: [['c1', 26], ['c2', 24], ['c3', 15], ['big', 8], ['boo', 15], ['slime', 12]],
  booStun: 1.1, booPush: 5.5, slime: 3.0,
  dark: [5, 8], rushDark: [1.8, 3], rushAt: 12,  // a knocked door stays dark this long (seconds); the Candy Rush in the last 12 s
  extraLit: 2,                       // lit doors at once = players + this (solo: 3)
  bumpCool: 1.6, bumpSpeed: 10, bumpTime: 0.22, bumpR: 1.05, bumpStun: 0.55, bumpPush: 7, bumpSafe: 1.4,
  dropLife: 8, dropGrab: 0.75, dropWait: 0.4,
  medals: [20, 35, 50],              // solo: bronze / silver / gold (a perfect bot scores ~40-80)
};
const r2 = v => Math.round(v * 100) / 100;
const KIND_N = { c1: 1, c2: 2, c3: 3, big: 5, boo: 0, slime: 0 };

export function create({ rng, players }) {
  const n = players.length, solo = n === 1, bodies = new Map();
  const starts = n === 1 ? [0] : Array.from({ length: n }, (_, i) => -3 + 6 * i / (n - 1));
  players.forEach((p, i) => bodies.set(p.pid, makeBody(r2(starts[i]), 4.4, Math.PI)));
  const P = new Map(players.map(p => [p.pid, { prevB: 0, candy: 0, knock: null, stun: 0, slow: 0, bumpCool: 0, bump: 0, bumpHit: new Set(), safe: 0, treats: 0, tricks: 0 }]));
  const doors = DOORS.map((d, i) => ({ i, ...d, st: 0, t: 0 }));         // st: 0 dark, 1 lit, 2 opening
  let drops = [], did = 0, time = meta.seconds, elapsed = 0, over = false, rush = false;
  const events = [];
  const maxLit = () => (rush ? doors.length : Math.min(doors.length, solo ? 3 : n + RULES.extraLit));
  const lit = () => doors.filter(d => d.st === 1).length;
  // light the first doors (spread out: every other door along the street)
  for (const d of rng.shuffle(doors).slice(0, maxLit())) d.st = 1;
  for (const d of doors) if (d.st === 0) d.t = rng.range(0.5, 3);
  function roll() {
    const tot = RULES.odds.reduce((s, o) => s + o[1], 0); let k = rng() * tot;
    for (const [id, w] of RULES.odds) { k -= w; if (k < 0) return id; }
    return 'c1';
  }
  function spill(pid) {
    const s = P.get(pid), b = bodies.get(pid); if (s.candy <= 0) return;
    s.candy--;
    const a = rng.range(0, Math.PI * 2), x = Math.max(-HW + 0.6, Math.min(HW - 0.6, b.x + Math.sin(a) * 1.4)), z = Math.max(-HD + 1.2, Math.min(HD - 0.6, b.z + Math.cos(a) * 1.4));
    drops.push({ id: ++did, x: r2(x), z: r2(z), life: RULES.dropLife, wait: RULES.dropWait, from: pid });
    events.push({ e: 'spill', pid, id: did, x: r2(x), z: r2(z), fx: r2(b.x), fz: r2(b.z) });
  }
  function resolve(pid) {
    const s = P.get(pid), b = bodies.get(pid), d = doors[s.knock.door], kind = s.knock.kind;
    s.knock = null; b.flags &= ~F.FROZEN;
    d.st = 0; d.t = rush ? rng.range(...RULES.rushDark) : rng.range(...RULES.dark);
    const got = KIND_N[kind];
    if (got) { s.candy += got; s.treats++; }
    else {
      s.tricks++;
      if (kind === 'boo') { s.stun = RULES.booStun; b.flags |= F.STUN; const fx = Math.sin(d.face), fz = Math.cos(d.face); b.vx = fx * RULES.booPush; b.vz = fz * RULES.booPush; }
      else { s.slow = RULES.slime; b.flags |= F.SLOW; }
    }
    events.push({ e: 'open', pid, door: d.i, kind, n: got });
  }
  return {
    bodies, events,
    init: () => ({ solo, doors: doors.map(d => [d.x, d.z, r2(d.face)]), medals: solo ? RULES.medals : null, left: Math.ceil(time) }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(s.prevB & IN.A), pb = (bits & IN.B) && !(s.prevB & IN.B); s.prevB = bits;
      const free = !s.knock && !(b.flags & F.STUN);
      if (pa && free) {
        let best = null, bd = RULES.reach;
        for (const d of doors) { if (d.st !== 1) continue; const dd = Math.hypot(b.x - d.x, b.z - d.z); if (dd < bd) { bd = dd; best = d; } }
        if (best) {
          best.st = 2; s.knock = { door: best.i, t: RULES.open, kind: roll() };
          b.flags |= F.FROZEN; b.vx = b.vz = 0; b.yaw = r2(best.face + Math.PI);
          events.push({ e: 'knock', pid, door: best.i });
        } else events.push({ e: 'nope', to: pid, pid });
      }
      if (pb && free && s.bumpCool <= 0) {
        s.bumpCool = RULES.bumpCool; s.bump = RULES.bumpTime; s.bumpHit.clear();
        b.vx = Math.sin(b.yaw) * RULES.bumpSpeed; b.vz = Math.cos(b.yaw) * RULES.bumpSpeed;
        events.push({ e: 'bump', pid });
      }
      stepBody(b, inp, meta.move, meta.arena);
    },
    step(dt) {
      if (over) return;
      elapsed += dt; time -= dt;
      if (!rush && time <= RULES.rushAt) { rush = true; for (const d of doors) if (d.st === 0) d.t = Math.min(d.t, rng.range(0.2, 1.2)); events.push({ e: 'rush' }); }
      separate([...bodies].filter(([pid]) => !P.get(pid).knock).map(([, b]) => b));
      for (const [pid, b] of bodies) {
        const s = P.get(pid);
        if (s.knock) { s.knock.t -= dt; if (s.knock.t <= 0) resolve(pid); }
        if (s.stun > 0) { s.stun -= dt; if (s.stun <= 0) b.flags &= ~F.STUN; }
        if (s.slow > 0) { s.slow -= dt; if (s.slow <= 0) b.flags &= ~F.SLOW; }
        if (s.bumpCool > 0) s.bumpCool -= dt;
        if (s.safe > 0) s.safe -= dt;
        if (s.bump > 0) {
          s.bump -= dt;
          for (const [qid, c] of bodies) {
            const q = P.get(qid);
            if (qid === pid || s.bumpHit.has(qid) || q.knock || q.safe > 0 || Math.hypot(c.x - b.x, c.z - b.z) > RULES.bumpR) continue;
            s.bumpHit.add(qid); q.safe = RULES.bumpSafe;
            const dx = c.x - b.x, dz = c.z - b.z, d = Math.hypot(dx, dz) || 1;
            c.vx = dx / d * RULES.bumpPush; c.vz = dz / d * RULES.bumpPush; c.flags |= F.STUN; q.stun = Math.max(q.stun, RULES.bumpStun);
            b.vx *= 0.3; b.vz *= 0.3; s.bump = 0;
            events.push({ e: 'bumped', pid: qid, by: pid, x: r2(c.x), z: r2(c.z) });
            spill(qid);
          }
        }
        // grab spilled candy
        for (const dr of drops) if (dr.life > 0 && dr.wait <= 0 && !s.knock && Math.hypot(dr.x - b.x, dr.z - b.z) < RULES.dropGrab) {
          dr.life = 0; s.candy++; events.push({ e: 'grab', pid, id: dr.id, x: dr.x, z: dr.z });
        }
      }
      for (const dr of drops) { dr.life -= dt; if (dr.wait > 0) dr.wait -= dt; }
      drops = drops.filter(d => d.life > 0);
      // doors relight (one at a time, while there is room)
      for (const d of doors) if (d.st === 0 && d.t > 0) d.t -= dt;
      const ready = doors.filter(d => d.st === 0 && d.t <= 0);
      if (ready.length && lit() + doors.filter(d => d.st === 2).length < maxLit()) { const d = rng.pick(ready); d.st = 1; events.push({ e: 'lit', door: d.i }); }
      if (time <= 0) {
        time = 0;
        for (const [pid] of bodies) if (P.get(pid).knock) resolve(pid);      // a door already opening still pays out
        over = true;
        for (const b of bodies.values()) { b.flags = (b.flags | F.FROZEN) & ~(F.STUN | F.SLOW); b.vx = b.vz = 0; }
      }
    },
    state() {
      const sc = {}; for (const p of players) sc[p.pid] = P.get(p.pid).candy;
      return { sc, d: doors.map(d => d.st).join(''), dr: drops.map(d => [d.id, d.x, d.z]), rush: rush ? 1 : 0, left: Math.ceil(Math.max(0, time)) };
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) { const c = P.get(p.pid).candy; scores[p.pid] = c; if (!groups.has(c)) groups.set(c, []); groups.get(c).push(p.pid); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
    stats: pid => ({ ...P.get(pid), knock: P.get(pid).knock && { ...P.get(pid).knock } }),
    doors: () => doors,
  };
}
