// NET GAINS — a sparkling lagoon, two teams of waders and one big net per team stretched between its two holders.
// Teams follow the lobby's colours: red + green against blue + pink (seats 0 + 2 against 1 + 3), each with a dock on
// its own side. A team of one gets a CPU deckhand (Finn on the red side, Marlo on the blue) who keeps the other end
// of the net level with you. Walk the net through the fish and every fish that touches the mesh between you is
// scooped up — but a net only works stretched: too close together and it bunches, too far apart and it pulls tight
// and nothing goes in. A full net is heavy (you wade slower) and holds 8 fish; nothing counts until you bring it home
// and touch your own dock. A splashes the water: nearby fish dart away from you — herd them into your net, or out of
// the other team's. Halfway through, Old Gilbert, the lagoon's giant, cruises in: only a net stretched WIDE can hold
// him (20 points). Most points banked wins. Solo: you and Finn against the clock, with medal scores.
import { makeBody, stepBody, separate, clampToArena, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';
import { pickSpecies, wander, groupBy } from '../fish-kit.js';
import { speciesIn, BY_ID } from '../fish-species.js';

export const meta = {
  id: 'net-gains', title: 'Net Gains', blurb: 'Stretch a net with your teammate and scoop up the most fish!',
  how: ['You and a teammate hold one net. Walk it through the fish!', 'Too close or too far apart and the net does not catch.', 'Touch your dock with a full net to bank the fish.', 'A splashes: fish dart away from you.'],
  kind: 'arena', min: 1, max: 4, seconds: 70, scoring: 'points', unit: 'pts', tags: ['action', 'coop'],
  controls: { stick: true, a: 'Splash' },
  move: { speed: 4.6, accel: 12, carryMul: 0.72, stunDrag: 1.6 },
  arena: { shape: 'rect', hw: 10.5, hd: 7, wall: true }, pitch: 56, card: 'card-net-gains', css: true,
};

export const NET = { min: 1.4, max: 5.6, wide: 3.6, reach: 0.42, cap: 8, heavy: 5 };
export const DOCK = { x: 9.3, hd: 2.4 };          // a team's dock: |x| beyond DOCK.x on its own side, |z| < hd
export const DECK = { gap: 3.4, speed: 4.9, names: ['Finn', 'Marlo'] };
export const LEVELS = {
  easy:   { fish: 3, flee: 0.7, fleeR: 1.7, splash: 3.6, big: 0.7, swim: 0.6 },
  normal: { fish: 1, flee: 1.3, fleeR: 2.1, splash: 3.2, big: 1, swim: 0.75 },
  hard:   { fish: 0, flee: 1.9, fleeR: 2.5, splash: 2.9, big: 1.25, swim: 0.9 },
};
export const MEDALS = [45, 90, 140];
export const SPLASH_S = 1.0, BIG_AT = 35;
const r2 = v => Math.round(v * 100) / 100;
const LAGOON = speciesIn('lagoon', { junk: false }).filter(s => s.id !== 'old-gilbert');
export const SPECIES_LIST = [...LAGOON.map(s => s.id), 'old-gilbert'];      // state rows send an index into this
/** Team of a seat: 0 = red + green (left dock), 1 = blue + pink (right dock). */
export const teamOf = seat => seat % 2;
/** Distance from point (x, z) to segment a-b, and how far along it (0..1). */
export function segDist(x, z, a, b) {
  const ex = b.x - a.x, ez = b.z - a.z, L = ex * ex + ez * ez || 1e-9, t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / L));
  return { d: Math.hypot(x - (a.x + ex * t), z - (a.z + ez * t)), t };
}
export const atDock = (b, team) => (team === 0 ? b.x <= -DOCK.x : b.x >= DOCK.x) && Math.abs(b.z) <= DOCK.hd;

export function create({ rng, players, difficulty = 'normal' }) {
  const D = LEVELS[difficulty] ? difficulty : 'normal', L = LEVELS[D], { hw, hd } = meta.arena;
  const n = players.length, solo = n === 1, bodies = new Map(), events = [];
  const teams = [0, 1].map(t => ({ t, pids: players.filter(p => teamOf(p.seat) === t).map(p => p.pid), score: 0, load: 0, count: 0, active: false, len: 0, deck: null, side: t ? 1 : -1, big: 0 }));
  // start: each team near its own dock, the pair side by side facing the middle
  for (const T of teams) {
    const sx = T.t ? 1 : -1;
    T.pids.forEach((pid, i) => bodies.set(pid, makeBody(sx * 7.2, (i ? 1 : -1) * 1.7, sx > 0 ? -Math.PI / 2 : Math.PI / 2)));
    if (T.pids.length === 1) { T.deck = makeBody(sx * 7.2, 1.7, sx > 0 ? -Math.PI / 2 : Math.PI / 2); T.deck.name = DECK.names[T.t]; }
  }
  const P = new Map(players.map(p => [p.pid, { prevB: 0, splash: 0, team: teamOf(p.seat), got: 0 }]));
  const ends = T => { if (!T.pids.length) return null; const a = bodies.get(T.pids[0]), b = T.deck || bodies.get(T.pids[1]); return [a, b]; };
  let fish = [], fid = 0, time = meta.seconds, over = false, bigDone = false;
  function addFish(sp, edge = false) {
    const x = rng.range(-hw + 2.2, hw - 2.2), z = edge ? (rng.chance(0.5) ? -hd + 0.4 : hd - 0.4) : rng.range(-hd + 0.8, hd - 0.8);
    const f = { id: ++fid, sp: sp.id, x: r2(x), z: r2(z), h: z > 0 ? Math.PI + rng.range(-0.8, 0.8) : rng.range(-0.8, 0.8), vx: 0, vz: 0 };
    fish.push(f); return f;
  }
  const want = 10 + n + L.fish;
  for (let i = 0; i < want; i++) addFish(pickSpecies(rng, LAGOON));
  // ---- the CPU deckhand: holds the far end of the net, level with its player and a net's width to the side
  function stepDeck(T, dt) {
    const d = T.deck, me = bodies.get(T.pids[0]); if (!d || !me) return;
    const fx = Math.sin(me.yaw), fz = Math.cos(me.yaw), rx = fz, rz = -fx;            // right of the way you face
    const cur = (d.x - me.x) * rx + (d.z - me.z) * rz; if (Math.abs(cur) > 0.6) T.side = Math.sign(cur);
    let tx = me.x + rx * T.side * DECK.gap - fx * 0.3, tz = me.z + rz * T.side * DECK.gap - fz * 0.3;
    if (Math.abs(tx) > hw - 0.5 || Math.abs(tz) > hd - 0.5) { T.side = -T.side; tx = me.x + rx * T.side * DECK.gap; tz = me.z + rz * T.side * DECK.gap; }
    const dx = tx - d.x, dz = tz - d.z, dist = Math.hypot(dx, dz), sp = DECK.speed * (T.count >= NET.heavy ? meta.move.carryMul : 1) * Math.min(1, dist / 0.8);
    const k = Math.min(1, 10 * dt), vx = dist > 0.05 ? dx / dist * sp : 0, vz = dist > 0.05 ? dz / dist * sp : 0;
    d.vx += (vx - d.vx) * k; d.vz += (vz - d.vz) * k; d.x += d.vx * dt; d.z += d.vz * dt;
    d.yaw = me.yaw; clampToArena(d, meta.arena);
  }
  function splash(pid, b) {
    let moved = 0;
    for (const f of fish) {
      const dx = f.x - b.x, dz = f.z - b.z, d = Math.hypot(dx, dz);
      if (d < L.splash && d > 1e-3) { const k = 5.2 * (1 - d / L.splash) + 1.2; f.vx += dx / d * k; f.vz += dz / d * k; f.h = Math.atan2(dx, dz); moved++; }
    }
    events.push({ e: 'splash', pid, x: r2(b.x), z: r2(b.z), n: moved });
  }
  return {
    bodies, events,
    init: () => ({ teams: teams.map(T => ({ t: T.t, pids: T.pids, deck: T.deck ? T.deck.name : null })), net: NET, dock: DOCK, species: SPECIES_LIST, solo, medals: solo ? MEDALS : null, left: Math.ceil(time) }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || !s || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(s.prevB & IN.A); s.prevB = bits;
      if (pa && s.splash <= 0) { s.splash = SPLASH_S; splash(pid, b); }
      stepBody(b, inp, meta.move, meta.arena);
    },
    step(dt) {
      if (over) return;
      time -= dt;
      separate(bodies.values());
      for (const s of P.values()) if (s.splash > 0) s.splash -= dt;
      for (const T of teams) if (T.deck) stepDeck(T, dt);
      // the big one
      if (!bigDone && time <= BIG_AT) { bigDone = true; const g = addFish(BY_ID['old-gilbert'], true); g.big = true; events.push({ e: 'big', x: g.x, z: g.z }); }
      // fish swim: wander, shy away from waders, coast on splash pushes
      for (const f of fish) {
        const sp = BY_ID[f.sp], base = sp.speed * (f.big ? 0.55 * L.big : L.swim);
        const fx = f.x, fz = f.z;
        wander(f, rng, { x0: -hw + 0.6, x1: hw - 0.6, z0: -hd + 0.6, z1: hd - 0.6 }, base, dt, 1.4);
        let ax = 0, az = 0;
        for (const b of bodies.values()) { const dx = f.x - b.x, dz = f.z - b.z, d = Math.hypot(dx, dz); if (d < L.fleeR && d > 1e-3) { const k = (1 - d / L.fleeR) * 2.2 * L.flee * (f.big ? 1.6 : 1); ax += dx / d * k; az += dz / d * k; } }
        f.vx += ax * dt * 4; f.vz += az * dt * 4;
        const damp = Math.exp(-2.4 * dt); f.vx *= damp; f.vz *= damp;
        f.x += f.vx * dt; f.z += f.vz * dt;
        f.x = Math.max(-hw + 0.5, Math.min(hw - 0.5, f.x)); f.z = Math.max(-hd + 0.5, Math.min(hd - 0.5, f.z));
        f.mx = f.x - fx; f.mz = f.z - fz;
      }
      // nets: catch what touches the mesh; carry; bank at the dock
      for (const T of teams) {
        const e = ends(T); if (!e) continue;
        const [a, b] = e; T.len = r2(Math.hypot(a.x - b.x, a.z - b.z)); T.active = T.len >= NET.min && T.len <= NET.max;
        if (T.active && T.count < NET.cap) {
          const keep = [];
          for (const f of fish) {
            const { d, t } = segDist(f.x, f.z, a, b), r = NET.reach + (f.big ? 0.35 : 0);
            if (d <= r && t > 0.04 && t < 0.96 && T.count < NET.cap && (!f.big || T.len >= NET.wide)) {
              const sp = BY_ID[f.sp]; T.load += sp.pts; T.count++; if (f.big) T.big++;
              const who = Math.hypot(f.x - a.x, f.z - a.z) < Math.hypot(f.x - b.x, f.z - b.z) ? T.pids[0] : (T.pids[1] ?? T.pids[0]); const ps = P.get(who); if (ps) ps.got++;
              events.push({ e: 'scoop', team: T.t, sp: f.sp, pts: sp.pts, x: r2(f.x), z: r2(f.z), full: T.count >= NET.cap ? 1 : 0 });
            } else { if (f.big && d <= r && t > 0.04 && t < 0.96 && T.len < NET.wide) { f.vx += (f.x - (a.x + b.x) / 2) * 0.6; f.vz += (f.z - (a.z + b.z) / 2) * 0.6; if (!f.warned) { f.warned = 1; events.push({ e: 'tooSmall', team: T.t }); } } keep.push(f); }
          }
          fish = keep;
        }
        const heavy = T.count >= NET.heavy;
        for (const pid of T.pids) { const bb = bodies.get(pid); if (heavy) bb.flags |= F.CARRY; else bb.flags &= ~F.CARRY; }
        if (T.count > 0 && (atDock(a, T.t) || atDock(b, T.t))) { T.score += T.load; events.push({ e: 'bank', team: T.t, pts: T.load, n: T.count, big: T.big }); T.load = 0; T.count = 0; T.big = 0; }
      }
      // keep the lagoon stocked (new fish swim in at the top or bottom edge)
      while (fish.filter(f => !f.big).length < want) addFish(pickSpecies(rng, LAGOON), true);
      if (time <= 0) { time = 0; over = true; for (const b of bodies.values()) { b.flags |= F.FROZEN; b.vx = b.vz = 0; } events.push({ e: 'end' }); }
    },
    state() {
      const sc = {}; for (const p of players) sc[p.pid] = teams[teamOf(p.seat)].score;
      return {
        sc, left: Math.ceil(time),
        t: teams.map(T => [T.score, T.load, T.count, T.active ? 1 : 0, T.len]),
        d: teams.filter(T => T.deck).map(T => [T.t, r2(T.deck.x), r2(T.deck.z), r2(T.deck.yaw), r2(Math.hypot(T.deck.vx, T.deck.vz))]),
        f: fish.map(f => [f.id, r2(f.x), r2(f.z), r2(Math.atan2(f.mx || Math.sin(f.h), f.mz || Math.cos(f.h))), SPECIES_LIST.indexOf(f.sp)]),
      };
    },
    get over() { return over; },
    result() {
      const scores = {}; for (const p of players) scores[p.pid] = teams[teamOf(p.seat)].score;
      const order = groupBy(players.map(p => ({ pid: p.pid, key: scores[p.pid] })));
      return { order, scores, unit: meta.unit, teams: teams.filter(T => T.pids.length).map(T => ({ team: T.t, pids: T.pids, score: T.score })), got: Object.fromEntries(players.map(p => [p.pid, P.get(p.pid).got])) };
    },
    _debug: { teams, fish: () => fish, ends },
  };
}
