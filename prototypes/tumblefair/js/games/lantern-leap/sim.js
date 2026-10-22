// LANTERN LEAP — a lily pond between a wooden dock (near side) and a reedy far bank. Big lily pads, each carrying a
// little paper lantern, drift across the pond in four lanes (each lane its own way and speed), and new ones keep
// floating in from the side. Coins (+1) and glowing fireflies (+3) sit on pads.
//   standing on a pad   starts its timer: after a moment it WOBBLES (the tell), then it sinks. Keep moving!
//   A = leap            a jump that carries you further than walking — clears the gap to the next pad
//   the water           step (or get sunk) into it and you splash back to the dock: your STREAK is lost
//   streak              every pickup in a row without a splash; at 4+ each pickup is worth 1 more, at 8+ 2 more
// You ride along on the pad you stand on. Most points at the bell wins. Solo: the same pond as a score attack.
import { makeBody, stepBody, spawnRing, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'lantern-leap', title: 'Lantern Leap', blurb: 'Hop across the sinking lily pads and grab the coins!',
  how: ['Walk and LEAP from pad to pad to grab coins and fireflies.', 'A pad WOBBLES after you step on it — then it sinks!', 'Fall in and you splash back to the dock and lose your streak.', 'A long streak makes every pickup worth more. Most points wins!'],
  kind: 'arena', min: 1, max: 4, seconds: 60, scoring: 'points', unit: 'points', tags: ['action'],
  controls: { stick: true, a: 'LEAP' }, move: { speed: 5.2, accel: 28, stunDrag: 4, boostMul: 1.45 },
  arena: { shape: 'rect', hw: 9, hd: 7, wall: true }, pitch: 58, card: 'card-lantern-leap', css: true,
};

export const RULES = {
  dock: 4.45, bank: -5.45,                             // z >= dock: the dock (safe); z <= bank: the far bank (safe)
  lanes: [{ z: 3.3, v: 0.75 }, { z: 0.8, v: -0.95 }, { z: -1.7, v: 0.85 }, { z: -4.25, v: -0.65 }],
  rMin: 0.95, rMax: 1.3, gapMin: 0.25, gapMax: 1.5, onPad: 0.2, refill: 1.2,
  wobble: 1.1, sink: 2.7, sinkV: 1.4, drown: -0.12,     // seconds after first stepped on: starts wobbling, starts sinking
  pace: { easy: [0.8, 1.35], normal: [1, 1], hard: [1.15, 0.85] },   // [drift speed, pad timers]
  jumpT: 0.5, jumpH: 0.85,
  splashT: 1.1, ghostT: 1.0,
  coinR: 0.85, coins: [4, 4, 5, 6, 7], firefly: 0.16, every: 0.7,
  streakStep: 4, streakMax: 2,
};
const r2 = v => Math.round(v * 100) / 100;
export const bonusFor = streak => Math.min(RULES.streakMax, Math.floor(streak / RULES.streakStep));

export function create({ rng, players, difficulty = 'normal' }) {
  const n = players.length, solo = n === 1, S = RULES, { hw } = meta.arena, [drift, timer] = S.pace[difficulty] ?? S.pace.normal;
  const bodies = new Map(), events = [];
  const dockX = i => (n === 1 ? 0 : -4.5 + i * 9 / (n - 1));
  players.forEach((p, i) => bodies.set(p.pid, makeBody(dockX(i), 5.7, Math.PI)));
  const P = new Map(players.map((p, i) => [p.pid, { i, prevB: 0, air: 0, fall: 0, ghost: 0, streak: 0, best: 0, score: 0, splashes: 0, pad: -1 }]));
  const pads = [], coins = [];
  let pid_ = 0, cid = 0, time = meta.seconds, over = false, coinT = 0.3;
  const lanes = S.lanes.map(l => ({ z: l.z, v: l.v * drift }));
  function newPad(li, x, r = r2(rng.range(S.rMin, S.rMax))) {
    const L = lanes[li], edge = li === 0 || li === lanes.length - 1;     // the lanes by the dock and the bank stay in line, so you can always step on
    const p = { id: ++pid_, lane: li, x, z: edge ? L.z : r2(L.z + rng.range(-0.2, 0.2)), r, vx: L.v, t: -1, y: 0 };
    pads.push(p); return p;
  }
  // fill every lane across the pond, then keep feeding them from the upstream side
  lanes.forEach((L, li) => {
    const dir = Math.sign(L.v), start = -dir * (hw + 2);
    let prev = null;
    for (let k = 0; k < 40; k++) {
      const r = r2(rng.range(S.rMin, S.rMax)), x = prev ? prev.x + dir * (prev.r + r + rng.range(S.gapMin, S.gapMax)) : start + dir * rng.range(0, 1.5);
      if (Math.abs(x) > hw + 2.5 && prev) break;
      prev = newPad(li, x, r);
    }
    L.next = rng.range(S.gapMin, S.gapMax);
  });
  function feedLanes() {
    lanes.forEach((L, li) => {
      const dir = Math.sign(L.v), entry = -dir * (hw + 2.5);
      let last = null; for (const p of pads) if (p.lane === li && (!last || dir * p.x < dir * last.x)) last = p;
      const r = r2(rng.range(S.rMin, S.rMax)), x = last ? last.x - dir * (last.r + r + L.next) : entry;
      if (dir * x >= dir * entry) { newPad(li, x, r); L.next = rng.range(S.gapMin, S.gapMax); }
      // a big hole left by sunken pads: a fresh pad bobs up in the middle of it
      const row = pads.filter(p => p.lane === li && (p.rise || p.y > S.drown)).sort((a, b) => a.x - b.x);
      for (let k = 0; k + 1 < row.length; k++) {
        const a = row[k], b = row[k + 1], gap = b.x - b.r - (a.x + a.r), mid = (a.x + a.r + b.x - b.r) / 2;
        if (gap > S.rMax * 2 + S.refill && Math.abs(mid) < hw - 1.5) { const p = newPad(li, r2(mid), r2(Math.min(S.rMax, gap / 2 - 0.4))); p.y = -0.7; p.rise = true; break; }
      }
    });
  }
  const live = p => p.y > S.drown;
  function support(b) {
    if (b.z >= S.dock - 0.05) return 'dock';
    if (b.z <= S.bank + 0.05) return 'bank';
    let best = null, bd = 1e9;
    for (const p of pads) { if (!live(p)) continue; const d = Math.hypot(b.x - p.x, b.z - p.z); if (d < p.r + S.onPad && d < bd) { bd = d; best = p; } }
    return best;
  }
  function splash(pid) {
    const b = bodies.get(pid), s = P.get(pid);
    s.fall = S.splashT; s.splashes++; s.air = 0; const lost = s.streak; s.streak = 0; s.pad = -1;
    b.flags = (b.flags & ~(F.AIR | F.BOOST)) | F.STUN; b.vx *= 0.2; b.vz *= 0.2;
    events.push({ e: 'splash', pid, x: r2(b.x), z: r2(b.z), lost });
  }
  function pickUp(pid, c) {
    const s = P.get(pid), base = c.k ? 3 : 1, d = base + bonusFor(s.streak);
    s.score += d; s.streak++; s.best = Math.max(s.best, s.streak);
    events.push({ e: 'get', pid, id: c.id, k: c.k, d, streak: s.streak, x: r2(c.x), z: r2(c.z) });
  }
  return {
    bodies, events,
    init: () => ({ solo, dock: S.dock, bank: S.bank, lanes: lanes.map(l => [l.z, r2(l.v)]), left: Math.ceil(time) }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(s.prevB & IN.A); s.prevB = bits;
      if (pa && s.fall <= 0 && s.air <= 0) { s.air = S.jumpT; b.flags |= F.AIR | F.BOOST; events.push({ e: 'leap', pid }); }
      stepBody(b, s.fall > 0 ? null : inp, meta.move, meta.arena);
    },
    step(dt) {
      if (over) return;
      // pads drift, wobble, sink; ones that have floated off (or sunk) go
      for (const p of pads) {
        p.x += p.vx * dt;
        if (p.rise) { p.y = Math.min(0, p.y + 1.1 * dt); if (p.y >= 0) p.rise = false; }
        if (p.t >= 0) { p.t += dt; if (p.t > S.sink * timer) p.y -= S.sinkV * dt; }
      }
      for (let i = pads.length - 1; i >= 0; i--) { const p = pads[i]; if ((p.y < -1.3 && !p.rise) || Math.abs(p.x) > hw + 3.5) pads.splice(i, 1); }
      feedLanes();
      // people: ride your pad, leap, land, splash, come back
      for (const [pid, b] of bodies) {
        const s = P.get(pid);
        if (s.ghost > 0) { s.ghost -= dt; if (s.ghost <= 0) b.flags &= ~F.GHOST; }
        if (s.fall > 0) {
          s.fall -= dt; b.y = Math.max(-1.1, b.y - 2.4 * dt);
          if (s.fall <= 0) { b.x = r2(dockX(s.i)); b.z = 5.7; b.y = 0; b.vx = b.vz = 0; b.yaw = Math.PI; b.flags = F.GHOST; s.ghost = S.ghostT; events.push({ e: 'back', pid }); }
          continue;
        }
        if (s.air > 0) {
          s.air -= dt; const u = 1 - Math.max(0, s.air) / S.jumpT; b.y = r2(4 * S.jumpH * u * (1 - u));
          if (s.air <= 0) { s.air = 0; b.y = 0; b.flags &= ~(F.AIR | F.BOOST); events.push({ e: 'land', pid }); }
        }
        if (s.air <= 0) {
          const sp = support(b);
          if (!sp) { splash(pid); continue; }
          if (typeof sp === 'object') {
            b.x += sp.vx * dt;
            if (Math.abs(b.x) > hw - 0.45) b.x = Math.sign(b.x) * (hw - 0.45);
            if (sp.t < 0) { sp.t = 0; events.push({ e: 'step', id: sp.id }); }
            s.pad = sp.id;
          } else s.pad = -1;
        }
        for (let i = coins.length - 1; i >= 0; i--) {
          const c = coins[i]; if (Math.hypot(c.x - b.x, c.z - b.z) > S.coinR || b.y > 1.2) continue;
          pickUp(pid, c); coins.splice(i, 1);
        }
      }
      // coins ride their pads; a coin whose pad sinks or floats away is lost
      for (let i = coins.length - 1; i >= 0; i--) {
        const c = coins[i], p = pads.find(q => q.id === c.pad);
        if (!p || !live(p) || Math.abs(p.x) > hw - 0.3) { coins.splice(i, 1); if (p && !live(p)) events.push({ e: 'lost', id: c.id, x: r2(c.x), z: r2(c.z) }); continue; }
        c.x = p.x + c.ox; c.z = p.z + c.oz;
      }
      coinT -= dt;
      if (coinT <= 0) {
        coinT = S.every;
        if (coins.length < S.coins[n]) {
          const has = new Set(coins.map(c => c.pad));
          const ok = pads.filter(p => p.t < 0 && !has.has(p.id) && Math.abs(p.x) < hw - 2.2 && Math.sign(p.vx) * p.x < hw - 4);
          if (ok.length) { const p = rng.pick(ok), a = rng.range(0, Math.PI * 2), rr = rng.range(0, p.r * 0.45); coins.push({ id: ++cid, pad: p.id, ox: Math.sin(a) * rr, oz: Math.cos(a) * rr, x: p.x, z: p.z, k: rng.chance(S.firefly) ? 1 : 0 }); }
        }
      }
      time -= dt;
      if (time <= 0) { time = 0; over = true; for (const b of bodies.values()) { b.flags = (b.flags & ~(F.AIR | F.BOOST | F.GHOST)) | F.FROZEN; b.vx = b.vz = 0; } }
    },
    state() {
      const sc = {}, st = {}; for (const p of players) { const s = P.get(p.pid); sc[p.pid] = s.score; st[p.pid] = s.streak; }
      // a pad: [id, x, z, r, wobble 0..1 (0 = untouched), y]; a coin: [id, x, z, kind]
      const pd = pads.map(p => [p.id, r2(p.x), p.z, p.r, p.t < 0 ? 0 : r2(Math.min(1, Math.max(0.05, (p.t - S.wobble * timer) / ((S.sink - S.wobble) * timer)))), r2(p.y)]);
      return { sc, st, pd, cn: coins.map(c => [c.id, r2(c.x), r2(c.z), c.k]), left: Math.ceil(time) };
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) { const v = P.get(p.pid).score; scores[p.pid] = v; if (!groups.has(v)) groups.set(v, []); groups.get(v).push(p.pid); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
    _pads: pads, _coins: coins, _P: P,
  };
}
