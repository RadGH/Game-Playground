// GLIMMER ICE — a frozen pond at night under the northern lights, a scatter of round fishing holes, and fish under
// the ice that you can only see now and then: each one GLIMMERS for a moment every few seconds and is dark again
// (only glimmering fish are even sent to the phones, so nobody can peek). Walk (it is slippery) to an open hole and
// press A to drop your line; a fish that swims near a dropped line may come and nibble — when it BITES, press A again
// to pull it up. A with no bite pulls your line back up. Every hole slowly FREEZES OVER — a sealed hole cannot be
// fished, and one that seals with your line in it freezes your line in (you lose that wait). B chips the ice of the
// hole you are standing at (three good chips open a sealed one). So the game is: watch where the glimmers are, pick a
// hole near them, keep it open. Most points wins. Solo: medal scores.
import { makeBody, stepBody, separate, spawnRing, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';
import { pickSpecies, rollWeight, wander, steerTo, groupBy } from '../fish-kit.js';
import { speciesIn, BY_ID } from '../fish-species.js';

export const meta = {
  id: 'glimmer-ice', title: 'Glimmer Ice', blurb: 'Fish through the ice for glowing fish before the holes freeze over!',
  how: ['Stand at an open hole and press A to drop your line.', 'Fish only glimmer now and then: watch where they are!', 'Bite? Press A to pull it up!', 'Holes freeze over: B chips the ice open again.'],
  kind: 'arena', min: 1, max: 4, seconds: 70, scoring: 'points', unit: 'pts', tags: ['action'],
  controls: { stick: true, a: 'Line', b: 'Chip' },
  move: { speed: 4.3, accel: 6, stunDrag: 0.8 },
  arena: { shape: 'circle', r: 8.2, wall: true }, pitch: 58, card: 'card-glimmer-ice', css: true,
};

export const HOLE = { r: 0.55, near: 1.15, fishable: 0.7, chip: 0.36, chipCool: 0.3 };
export const LEVELS = {
  easy:   { freeze: 1 / 24, glow: 1.25, per: [2.6, 4.0], window: 1.05, lure: 2.1, fish: 2, nib: [0.3, 0.9] },
  normal: { freeze: 1 / 17, glow: 0.9, per: [3.0, 4.8], window: 0.8, lure: 1.8, fish: 1, nib: [0.4, 1.2] },
  hard:   { freeze: 1 / 12, glow: 0.65, per: [3.6, 5.8], window: 0.58, lure: 1.5, fish: 0, nib: [0.5, 1.5] },
};
export const MEDALS = [8, 16, 26];
const SHOW_S = 0.9, r2 = v => Math.round(v * 100) / 100;
const ICE = speciesIn('ice');
export const SPECIES_LIST = ICE.map(s => s.id);
/** Is fish f glimmering at game time el? (A fixed schedule from its own phase + period; Aurora Chars glow longer.) */
export const glowing = (f, el, L) => ((el + f.ph) % f.per) < L.glow * (f.sp === 'aurora-char' ? 1.5 : 1);
/** The holes, from the seed: n + 7 (max 11), at least 2.5 m apart, not on a spawn point. */
export function makeHoles(rng, n, R = meta.arena.r) {
  const spawns = spawnRing(n, n === 1 ? 0 : 3.2), out = [], want = Math.min(11, n + 7);
  for (let k = 0; k < 800 && out.length < want; k++) {
    const a = rng.range(0, Math.PI * 2), d = Math.sqrt(rng()) * (R - 1.4), x = r2(Math.sin(a) * d), z = r2(Math.cos(a) * d);
    if (out.some(h => Math.hypot(h.x - x, h.z - z) < 2.5) || spawns.some(s => Math.hypot(s.x - x, s.z - z) < 1.4)) continue;
    out.push({ x, z });
  }
  return out;
}

export function create({ rng, players, difficulty = 'normal' }) {
  const D = LEVELS[difficulty] ? difficulty : 'normal', L = LEVELS[D], n = players.length, R = meta.arena.r;
  const spots = makeHoles(rng, n), holes = spots.map((p, i) => ({ ...p, ice: r2(i % 3 === 0 ? 0.55 : rng.range(0, 0.35)), user: null }));
  const spawns = spawnRing(n, n === 1 ? 0 : 3.2), bodies = new Map(), events = [];
  players.forEach((p, i) => bodies.set(p.pid, makeBody(spawns[i].x, spawns[i].z, spawns[i].yaw)));
  const P = new Map(players.map(p => [p.pid, { st: 0, hole: -1, prevB: 0, chip: 0, bite: 0, fish: null, show: 0, pts: 0, n: 0, kg: 0 }]));
  // st: 0 free to walk, 1 line in (frozen in place), 2 BITE (press A), 3 pulling a fish up
  let fish = [], fid = 0, time = meta.seconds, el = 0, over = false;
  const box = { x0: -R + 1, x1: R - 1, z0: -R + 1, z1: R - 1 };
  function addFish() {
    const sp = pickSpecies(rng, ICE), a = rng.range(0, Math.PI * 2), d = rng.range(1, R - 1.2);
    fish.push({ id: ++fid, sp: sp.id, x: r2(Math.sin(a) * d), z: r2(Math.cos(a) * d), h: rng.range(0, 6.28), ph: r2(rng.range(0, 6)), per: r2(rng.range(L.per[0], L.per[1])), st: 0, who: null, t: 0, shy: 0 });
  }
  const want = 5 + n + L.fish;
  for (let i = 0; i < want; i++) addFish();
  const nearHole = b => { let best = -1, bd = HOLE.near; holes.forEach((h, i) => { const d = Math.hypot(h.x - b.x, h.z - b.z); if (d <= bd) { bd = d; best = i; } }); return best; };
  function lineUp(pid, s, b) { if (s.hole >= 0 && holes[s.hole].user === pid) holes[s.hole].user = null; if (s.fish) { s.fish.st = 0; s.fish.who = null; s.fish.shy = 1.5; s.fish = null; } s.st = 0; s.hole = -1; b.flags &= ~F.FROZEN; }
  return {
    bodies, events,
    init: () => ({ holes: holes.map(h => ({ x: h.x, z: h.z })), hole: HOLE, species: SPECIES_LIST, medals: n === 1 ? MEDALS : null, d: D, left: Math.ceil(time) }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || !s || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(s.prevB & IN.A), pb = (bits & IN.B) && !(s.prevB & IN.B); s.prevB = bits;
      if (pa) {
        if (s.st === 0) {
          const i = nearHole(b);
          if (i >= 0 && holes[i].user == null && holes[i].ice < HOLE.fishable) { s.st = 1; s.hole = i; holes[i].user = pid; b.flags |= F.FROZEN; b.vx = b.vz = 0; b.yaw = r2(Math.atan2(holes[i].x - b.x, holes[i].z - b.z)); events.push({ e: 'drop', pid, hole: i }); }
          else if (i >= 0) events.push({ e: 'nope', pid, to: pid, why: holes[i].user != null ? 'taken' : 'ice' });
        } else if (s.st === 1) { events.push({ e: 'pull', pid, hole: s.hole }); lineUp(pid, s, b); }
        else if (s.st === 2) {
          const f = s.fish, sp = BY_ID[f.sp], kg = rollWeight(rng, sp);
          s.pts += sp.pts; s.n++; s.kg = r2(s.kg + kg); fish = fish.filter(x => x !== f); s.fish = null;
          events.push({ e: 'catch', pid, sp: sp.id, pts: sp.pts, kg, hole: s.hole }); s.st = 3; s.show = SHOW_S;
        }
      }
      if (pb && s.chip <= 0 && s.st !== 3) {
        const i = s.st === 0 ? nearHole(b) : s.hole;
        if (i >= 0) { s.chip = HOLE.chipCool; holes[i].ice = r2(Math.max(0, holes[i].ice - HOLE.chip)); events.push({ e: 'chip', pid, hole: i, ice: holes[i].ice }); }
      }
      stepBody(b, inp, meta.move, meta.arena);
    },
    step(dt) {
      if (over) return;
      time -= dt; el += dt;
      separate(bodies.values());
      for (const [pid, s] of P) {
        const b = bodies.get(pid);
        if (s.chip > 0) s.chip -= dt;
        if (s.st === 2) { s.bite -= dt; if (s.bite <= 0) { events.push({ e: 'miss', pid, to: pid }); if (s.fish) { s.fish.st = 0; s.fish.who = null; s.fish.shy = 2; s.fish = null; } s.st = 1; } }
        if (s.st === 3) { s.show -= dt; if (s.show <= 0) lineUp(pid, s, b); }
      }
      // the ice creeps back over every hole; a hole that seals freezes in any line
      holes.forEach((h, i) => {
        const was = h.ice; h.ice = Math.min(1, h.ice + L.freeze * dt);
        if (h.ice >= 1 && was < 1) {
          events.push({ e: 'seal', hole: i });
          if (h.user != null) { const pid = h.user, s = P.get(pid); if (s && (s.st === 1 || s.st === 2)) { events.push({ e: 'frozenIn', pid, hole: i }); lineUp(pid, s, bodies.get(pid)); } }
        }
      });
      // fish: wander under the ice; one near a dropped line may come and nibble, then bite
      for (const f of fish) {
        const sp = BY_ID[f.sp];
        if (f.shy > 0) f.shy -= dt;
        if (f.st === 0) {
          wander(f, rng, box, sp.speed * 0.5, dt, 1.2);
          const d0 = Math.hypot(f.x, f.z); if (d0 > R - 1) { f.x *= (R - 1) / d0; f.z *= (R - 1) / d0; f.h = Math.atan2(-f.x, -f.z); }
          if (f.shy <= 0) for (const [pid, s] of P) {
            if (s.st !== 1 || s.fish) continue; const h = holes[s.hole];
            if (Math.hypot(f.x - h.x, f.z - h.z) <= L.lure && rng.chance(0.9 * dt * 2)) { f.st = 1; f.who = pid; s.fish = f; break; }
          }
        } else {
          const s = P.get(f.who);
          if (!s || s.st === 0 || s.fish !== f) { f.st = 0; f.who = null; continue; }
          const h = holes[s.hole];
          if (f.st === 1 && steerTo(f, h.x, h.z, sp.speed * 0.55, dt, 0.25)) { f.st = 2; f.t = rng.range(L.nib[0], L.nib[1]); events.push({ e: 'nib', pid: f.who, hole: s.hole }); }
          else if (f.st === 2 && s.st === 1) { f.t -= dt; if (f.t <= 0) { s.st = 2; s.bite = L.window; events.push({ e: 'bite', pid: f.who, hole: s.hole }); } }
        }
      }
      while (fish.length < want) addFish();
      if (time <= 0) { time = 0; over = true; for (const b of bodies.values()) { b.flags |= F.FROZEN; b.vx = b.vz = 0; } events.push({ e: 'end' }); }
    },
    state() {
      const sc = {}; for (const p of players) sc[p.pid] = P.get(p.pid).pts;
      return {
        sc, left: Math.ceil(time),
        h: holes.map(h => Math.round(h.ice * 100)),
        p: players.map(p => { const s = P.get(p.pid); return [p.pid, s.st, s.hole]; }),
        // only glimmering fish (and one nibbling at a line, which shows as a glow in that hole) are sent at all
        f: fish.filter(f => f.st >= 2 || glowing(f, el, L)).map(f => [f.id, r2(f.x), r2(f.z), r2(f.h), SPECIES_LIST.indexOf(f.sp), f.st >= 2 ? 1 : 0]),
      };
    },
    get over() { return over; },
    result() {
      const rows = players.map(p => { const s = P.get(p.pid); return { pid: p.pid, key: s.pts * 1e4 + s.n * 100 + Math.min(99, Math.round(s.kg)) }; });
      return { order: groupBy(rows), scores: Object.fromEntries(players.map(p => [p.pid, P.get(p.pid).pts])), unit: meta.unit };
    },
    _debug: { player: pid => P.get(pid), holes, fish: () => fish, get el() { return el; }, L },
  };
}
