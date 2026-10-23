// WITCH'S TOWER — co-op boss fight, Halloween only (round 8). The team stands on the round flat top of a crooked
// stone tower at night; a giggly little witch on a broom loops a figure-eight overhead, dropping potion bottles.
//   DROP: a shadow appears where a bottle will land and grows as it falls (1.7 s; 2.0 easy, 1.45 hard).
//   CATCH: stand in the shadow and press A in the last moment of its fall (when the shadow glows "NOW") — you hold it.
//     Pressing early does nothing, so you can try again.
//   THROW: press A again to throw it back up at her. Aim help: if she is within ~35 degrees of where you face — or
//     right above you — the bottle flies straight to her. Purple bottle = 1 damage, gold bottle = 2. A hit makes her
//     dizzy for a moment (no drops).
//   MISSED bottles burst on the floor and leave a gloopy PUDDLE for 7 s that slows anyone wading in it; a bottle that
//     lands right on you splashes you (a short stumble). A throw that misses her makes a puddle where it lands.
// Beat her before the bell. Scores: 1 a catch, 2 a hit (3 with a gold bottle). Solo: slower drops, smaller health bar.
import { makeBody, stepBody, separate, spawnRing, F } from '../../shared/arena.js';
import { r2, clamp, byDiff, aimHelp, knock, presses, coopResult } from '../boss-kit.js';

const R = 6.8;
export const meta = {
  id: 'witchs-tower', title: "Witch's Tower", blurb: 'Catch the witch’s falling potions and throw them right back at her!',
  how: ['A shadow on the floor = a potion is falling there.', 'Stand in it and press A as it glows NOW to catch it.', 'Press A again to throw it back up at the witch (gold = double!).', 'Missed potions leave sticky puddles. Beat her before the bell!'],
  kind: 'arena', min: 1, max: 4, seconds: 70, scoring: 'coop', unit: 'pts', tags: ['coop', 'action', 'holiday'], season: 'halloween',
  controls: { stick: true, a: 'Catch / Throw' }, move: { speed: 6, accel: 30, stunDrag: 2.6, carryMul: 0.85, slowMul: 0.5 },
  arena: { shape: 'circle', r: R, wall: true }, pitch: 60, card: 'card-witchs-tower', css: false,
};
export const RULES = {
  start: 2.2, high: 5.2, spin: { easy: 0.3, normal: 0.38, hard: 0.46 },
  hp: { easy: 10, normal: 14, hard: 21 }, hpPer: 0.45,
  every: { easy: 2.0, normal: 1.7, hard: 1.4 }, fall: { easy: 2.0, normal: 1.7, hard: 1.45 },
  catchR: 1.0, catchWin: 0.9, splashR: 0.7, goldEvery: 6,
  cone: 0.62, overhead: 2.6, flight: 0.6, missDist: 5, dizzy: 1.0,
  puddleR: 1.15, puddleLife: 7, maxPuddles: 7, splashStun: 0.45, knock: 3,
};
export const hpFor = (n, d) => Math.round(byDiff(d, RULES.hp) * (1 + RULES.hpPer * (n - 1)));
/** Where the witch flies at time t: a figure-eight over the tower top. */
export const witchAt = (t, w, ph) => ({ x: 4.0 * Math.sin(w * t), z: 2.8 * Math.sin(2 * w * t + ph) - 0.4 });

export function create({ rng, players, difficulty = 'normal' }) {
  const n = players.length, pids = players.map(p => p.pid), bodies = new Map(), A = meta.arena;
  const spawns = spawnRing(n, n === 1 ? 0 : 2, Math.PI / 4);
  players.forEach((p, i) => { const s = spawns[i]; bodies.set(p.pid, makeBody(s.x, s.z + 1.5, Math.PI)); });
  const P = new Map(pids.map(pid => [pid, { stun: 0, hold: 0, dmg: 0, catches: 0 }]));       // hold: 0 none, 1 purple, 2 gold
  const hpMax = hpFor(n, difficulty), w = byDiff(difficulty, RULES.spin), phi = rng.range(0, Math.PI * 2);
  const every = byDiff(difficulty, RULES.every) / (0.7 + 0.3 * n), fall = byDiff(difficulty, RULES.fall);
  let hp = hpMax, time = meta.seconds, flyT = 0, over = false, success = false, dropT = RULES.start, dizzy = 0, made = 0, id = 0;
  let W = witchAt(0, w, phi), bottles = [], flying = [], puddles = [];
  const events = [];

  function addPuddle(x, z) {
    puddles.push({ id: ++id, x: r2(clamp(x, -R, R)), z: r2(clamp(z, -R, R)), left: RULES.puddleLife });
    if (puddles.length > RULES.maxPuddles) puddles.shift();
  }
  function drop(x, z) {
    const d = Math.hypot(x, z), lim = R - 0.7; if (d > lim) { x *= lim / d; z *= lim / d; }
    made++; bottles.push({ id: ++id, x: r2(x), z: r2(z), left: fall, total: fall, gold: made % RULES.goldEvery === 0 ? 1 : 0 });
  }
  function dropSome() {
    const triple = time < 25 && made % 3 === 2;
    const aim = rng.chance(0.6) ? bodies.get(rng.pick(pids)) : null;
    const x = aim ? aim.x + rng.range(-1.3, 1.3) : W.x + rng.range(-1.5, 1.5), z = aim ? aim.z + rng.range(-1.3, 1.3) : W.z + rng.range(-1.5, 1.5);
    drop(x, z);
    if (triple) { const a = rng.range(0, Math.PI); drop(x + Math.cos(a) * 2.4, z + Math.sin(a) * 2.4); drop(x - Math.cos(a) * 2.4, z - Math.sin(a) * 2.4); }
    events.push({ e: 'drop', k: triple ? 3 : 1 });
  }
  function act(pid) {
    const b = bodies.get(pid), s = P.get(pid);
    if (s.hold) {                                       // throw it up at her
      const aim = Math.hypot(W.x - b.x, W.z - b.z) <= RULES.overhead ? { target: W } : aimHelp(b.x, b.z, b.yaw, [W], RULES.cone);
      const tx = aim.target ? W.x : b.x + Math.sin(b.yaw) * RULES.missDist, tz = aim.target ? W.z : b.z + Math.cos(b.yaw) * RULES.missDist;
      flying.push({ id: ++id, pid, gold: s.hold === 2 ? 1 : 0, x0: b.x, z0: b.z, x1: tx, z1: tz, t: 0, aimed: aim.target ? 1 : 0 });
      s.hold = 0; b.flags &= ~F.CARRY;
      events.push({ e: 'throw', pid, aimed: aim.target ? 1 : 0 });
      return;
    }
    // catch the falling bottle under you that is low enough
    let best = null, bd = RULES.catchR;
    for (const bt of bottles) { if (bt.left > RULES.catchWin) continue; const d = Math.hypot(b.x - bt.x, b.z - bt.z); if (d <= bd) { bd = d; best = bt; } }
    if (best) { best.caught = true; s.hold = best.gold ? 2 : 1; s.catches++; s.dmg++; b.flags |= F.CARRY; events.push({ e: 'catch', pid, id: best.id, gold: best.gold }); return; }
    const early = bottles.some(bt => Math.hypot(b.x - bt.x, b.z - bt.z) <= RULES.catchR);
    events.push({ e: early ? 'early' : 'swing', pid });
  }
  function finish(ok) {
    over = true; success = ok; bottles = []; flying = [];
    for (const b of bodies.values()) { b.flags = (b.flags | F.FROZEN) & ~(F.STUN | F.SLOW); b.vx = b.vz = 0; }
    events.push({ e: 'end', ok: ok ? 1 : 0 });
  }
  return {
    bodies, events,
    init: () => ({ hpMax, w, phi, solo: n === 1 }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const pr = presses(s, inp);
      if (pr.a && !(b.flags & F.STUN)) act(pid);
      stepBody(b, inp, meta.move, A);
    },
    step(dt) {
      if (over) return;
      time -= dt;
      separate(bodies.values());
      // puddles slow whoever wades in them
      for (const pd of puddles) pd.left -= dt;
      puddles = puddles.filter(pd => pd.left > 0);
      for (const [pid, b] of bodies) {
        const s = P.get(pid);
        if (s.stun > 0) { s.stun -= dt; if (s.stun <= 0) b.flags &= ~F.STUN; }
        if (puddles.some(pd => Math.hypot(b.x - pd.x, b.z - pd.z) <= RULES.puddleR)) b.flags |= F.SLOW; else b.flags &= ~F.SLOW;
      }
      if (time > meta.seconds - RULES.start) return;
      // the witch
      if (dizzy > 0) dizzy -= dt; else flyT += dt;
      W = witchAt(flyT, w, phi);
      dropT -= dt;
      if (dropT <= 0 && dizzy <= 0) { dropSome(); dropT = every * (time < 25 ? 0.85 : 1); }
      // falling bottles
      for (const bt of bottles) {
        if (bt.caught) continue;
        bt.left -= dt;
        if (bt.left <= 0) {
          bt.caught = true; addPuddle(bt.x, bt.z); events.push({ e: 'smash', x: bt.x, z: bt.z, gold: bt.gold });
          for (const [pid, b] of bodies) if (Math.hypot(b.x - bt.x, b.z - bt.z) <= RULES.splashR) { const s = P.get(pid); s.stun = RULES.splashStun; knock(b, bt.x, bt.z, RULES.knock); events.push({ e: 'splashed', pid }); }
        }
      }
      bottles = bottles.filter(bt => !bt.caught);
      // thrown bottles
      for (const f of flying) {
        f.t += dt; const k = Math.min(1, f.t / RULES.flight);
        if (f.aimed) { f.x1 = W.x; f.z1 = W.z; }        // they fly straight to her
        if (k >= 1) {
          f.done = true;
          if (f.aimed) {
            const dmg = Math.min(hp, f.gold ? 2 : 1); hp -= dmg; P.get(f.pid).dmg += dmg + 1; dizzy = RULES.dizzy;
            events.push({ e: 'hit', pid: f.pid, dmg, hp, x: r2(W.x), z: r2(W.z) });
            if (hp <= 0) return finish(true);
          } else { addPuddle(f.x1, f.z1); events.push({ e: 'smash', x: r2(f.x1), z: r2(f.z1), gold: f.gold }); }
        }
      }
      flying = flying.filter(f => !f.done);
      if (time <= 0) finish(hp <= 0);
    },
    state() {
      const sc = {}, ho = []; for (const pid of pids) { const s = P.get(pid); sc[pid] = s.dmg; if (s.hold) ho.push([pid, s.hold]); }
      return { hp, sc, left: Math.max(0, Math.ceil(time)), end: over ? (success ? 1 : 2) : 0, wt: [r2(W.x), r2(W.z), dizzy > 0 ? 1 : 0, r2(flyT)],
        bt: bottles.map(b => [b.id, b.x, b.z, r2(b.left), r2(b.total), b.gold]), ho,
        fl: flying.map(f => [f.id, r2(f.x0), r2(f.z0), r2(f.x1), r2(f.z1), r2(Math.min(1, f.t / RULES.flight)), f.aimed, f.gold]),
        pd: puddles.map(p => [p.id, p.x, p.z, r2(p.left)]) };
    },
    get over() { return over; },
    result() {
      const scores = {}; for (const pid of pids) scores[pid] = P.get(pid).dmg;
      return coopResult(pids, scores, over ? success : hp <= 0, meta.unit);
    },
  };
}
