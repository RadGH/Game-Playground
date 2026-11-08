// TIPTOE TIGER — a long strip of grass with a start line near the camera and a big cardboard tiger at the far end,
// sitting on a little stage with a golden bell on a post in front of it. While the tiger SINGS it has its back to
// you: creep forward. Then its tail twitches and a "!" pops up (the TELL, 0.45 s, with a sound): stop! Usually it
// spins round and LOOKS for a while; anyone still moving after a short grace is roared all the way back to the start
// line. Sometimes it only half-turns (a fake-out) and goes straight back to singing. Hold A to freeze stock-still.
// Expansion 1 / M4 (2026-11-07, "buggy", avg 21 s of a 75 s clock): the FIRST bell ended the whole game, which a
// careful player rang in ~20 s — so most games were over a quarter of the way in and felt broken. Now a bell is ONE
// point: everyone walks back to the start, the tiger gets a little quicker and trickier, and the first to RING 3 BELLS
// (or most bells when the clock runs out, furthest up the field breaking a tie) wins. A roared player also stays put
// until the tiger sings again (they used to land and walk on freely while it was still looking). Alone you race
// Pip, a computer fairgoer who creeps along beside you and is sometimes too slow to stop.
import { makeBody, stepBody, separate, clampToArena, collideObstacles, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'tiptoe-tiger', title: 'Tiptoe Tiger', blurb: 'Creep up while the tiger sings, freeze when it turns — first to ring its bell 3 times wins!',
  how: ['Walk up the field while the tiger has its back to you.', 'FREEZE! pops up: let go of the stick (or hold A).', 'Moving while it looks = ROAR, back to the start.', 'Ring the bell = 1 point. First to 3 bells wins!'],
  kind: 'arena', min: 1, max: 4, seconds: 75, scoring: 'points', unit: 'bells', tags: ['action'], rival: true,
  controls: { stick: true, a: 'Statue' }, move: { speed: 2.7, accel: 22, stunDrag: 3 },
  arena: { shape: 'rect', hw: 5.5, hd: 10.5, wall: true, blocks: [{ x: 0, z: -9.25, hw: 5.5, hd: 1.25 }] }, pitch: 52, card: 'card-tiptoe-tiger', css: true,
};

export const RULES = {
  startZ: 9.2, bellX: 0, bellZ: -7.25, bellR: 1.15, tigerZ: -9.3, stageTop: 0.45,    // reach within bellR of the bell post to ring it
  ready: 2.2, again: 1.4,                              // "Get ready…" before the first song / after each bell
  sing: [1.3, 3.4], tell: 0.45, look: [1.5, 2.6], fake: 0.8, fakeChance: 0.28,
  quicker: 0.12, fakeMore: 0.07,                       // every bell: songs this much shorter (share), fake-outs this much likelier
  grace: 0.35,                                         // after the tiger turns: this long to stop before it counts
  still: 0.55,                                         // m/s: anything faster than this while watched is moving
  flyTime: 0.9, flyH: 3.2,                             // the roar throws you back to the start line in an arc
  bells: 3,                                            // first to this many bells wins
  ringPause: 1.8, endPause: 2.2,
  // Pip, the computer fairgoer (alone only): walks at this share of full speed while the tiger sings, stops this long
  // after the tell, and on this share of real looks is too slow and gets roared
  cpu: { pace: { easy: 0.9, normal: 0.97, hard: 1 }, react: [0.1, 0.4], slip: { easy: 0.25, normal: 0.2, hard: 0.12 } },
};
export const CPU_NAME = 'Pip';
const SING = 0, TELL = 1, LOOK = 2, FAKE = 3, READY = 4, DONE = 5, RING = 6;
export const PHASES = ['sing', 'tell', 'look', 'fake', 'ready', 'done', 'ring'];
const r2 = v => Math.round(v * 100) / 100;

export function create({ rng, players, difficulty = 'normal', rivals = true }) {
  const D = RULES.cpu.pace[difficulty] ? difficulty : 'normal';
  const n = players.length, solo = n === 1, bodies = new Map();
  const withPip = solo && rivals !== false;            // "Rival when alone" off: a solo player creeps up alone
  const lanes = withPip ? 2 : n;
  const lane = i => (lanes === 1 ? 0 : -3.3 + 6.6 * i / (lanes - 1));
  // every racer (players, and Pip when alone) is { id, i, body, … }; only players' bodies go in `bodies` (the room sends those)
  const racers = players.map((p, i) => ({ id: p.pid, i, cpu: false }));
  if (withPip) racers.push({ id: 'cpu', i: 1, cpu: true });
  for (const r of racers) {
    Object.assign(r, { body: makeBody(r2(lane(r.i)), RULES.startZ, Math.PI), prevB: 0, best: 0, caught: 0, fly: null, statue: false, hold: false, bells: 0, stopIn: -1, slip: false });
    r.body.flags = F.FROZEN;
    if (!r.cpu) bodies.set(r.id, r.body);
  }
  const R = new Map(racers.map(r => [r.id, r]));
  const cpu = R.get('cpu') || null;
  let phase = READY, pt = RULES.ready, nextFake = false, time = meta.seconds, elapsed = 0, over = false, endIn = -1, winner = null, wonAt = 0, songs = 0, rounds = 0;
  const events = [];
  const progress = b => Math.max(0, RULES.startZ - b.z);
  let lookLen = 0;
  const watching = () => phase === LOOK && pt <= (lookLen - RULES.grace);
  const freezeAll = () => { for (const r of racers) { r.body.flags |= F.FROZEN; r.body.vx = r.body.vz = 0; } };
  function enter(ph) {
    phase = ph;
    if (ph === SING) {
      pt = rng.range(RULES.sing[0], RULES.sing[1]) * (songs === 0 ? 1.2 : 1) * Math.max(0.55, 1 - RULES.quicker * rounds); songs++;
      for (const r of racers) { r.hold = false; if (!r.fly && !r.statue) r.body.flags &= ~F.FROZEN; }
    } else if (ph === TELL) {
      pt = RULES.tell; nextFake = songs > 1 && rng.chance(Math.min(0.5, RULES.fakeChance + RULES.fakeMore * rounds));
      if (cpu) { cpu.stopIn = rng.range(RULES.cpu.react[0], RULES.cpu.react[1]); cpu.slip = !nextFake && rng.chance(RULES.cpu.slip[D]); }
    } else if (ph === LOOK) { pt = lookLen = rng.range(RULES.look[0], RULES.look[1]); }
    else if (ph === FAKE) pt = RULES.fake;
    events.push({ e: 'phase', ph: PHASES[ph] });
  }
  function catchRacer(r) {
    const b = r.body;
    r.caught++; r.fly = { t: 0, x0: b.x, z0: b.z, x1: r2(lane(r.i)), z1: RULES.startZ };
    b.flags |= F.FROZEN | F.AIR; b.vx = b.vz = 0;
    events.push({ e: 'roar', pid: r.id, x: r2(b.x), z: r2(b.z) });
  }
  function ring(r) {
    r.bells++; rounds++;
    events.push({ e: 'bell', pid: r.id, n: r.bells, t: r2(elapsed) });
    freezeAll();
    if (r.bells >= RULES.bells) { winner = r.id; wonAt = elapsed; endIn = RULES.endPause; phase = DONE; events.push({ e: 'win', pid: r.id }); return; }
    phase = RING; pt = RULES.ringPause;
  }
  function backToStart() {
    for (const r of racers) { const b = r.body; b.x = r2(lane(r.i)); b.z = RULES.startZ; b.y = 0; b.vx = b.vz = 0; b.yaw = Math.PI; b.flags = F.FROZEN; r.fly = null; r.hold = false; }
    phase = READY; pt = RULES.again; events.push({ e: 'phase', ph: 'ready', again: 1 });
  }
  // Pip: creep toward the bell while the tiger sings, stop a beat after the tell (unless it slips up this time)
  function cpuInput() {
    if (!cpu || cpu.fly) return null;
    const b = cpu.body, dx = RULES.bellX - b.x, dz = RULES.bellZ - b.z, d = Math.hypot(dx, dz) || 1, k = RULES.cpu.pace[D];
    const go = { mx: dx / d * k, mz: dz / d * k, b: 0 };
    if (phase === SING) return go;
    if (phase === TELL) return cpu.stopIn > 0 ? go : null;
    if (phase === LOOK) return cpu.slip && pt > lookLen - RULES.grace - 0.4 ? go : null;
    return null;
  }
  function move(r, inp) {
    const b = r.body, bits = inp?.b | 0; r.prevB = bits;
    if (r.fly || phase === DONE || phase === READY || phase === RING) return;
    r.statue = !!(bits & IN.A);
    if (r.statue || r.hold) { b.flags |= F.FROZEN; b.vx = b.vz = 0; return; }
    b.flags &= ~F.FROZEN;
    stepBody(b, inp, meta.move, meta.arena);
  }
  return {
    bodies, events,
    init: () => ({ solo, startZ: RULES.startZ, bell: [RULES.bellX, RULES.bellZ], bells: RULES.bells, lanes: racers.map(r => [r.id, r2(lane(r.i))]), cpu: cpu ? CPU_NAME : null, left: Math.ceil(time) }),
    input(pid, inp) { const r = R.get(pid); if (!r || r.cpu || over) return; move(r, inp); },
    step(dt) {
      if (over) return;
      elapsed += dt;
      if (endIn >= 0) { endIn -= dt; if (endIn <= 0) over = true; return; }
      time -= dt;
      if (cpu) { if (cpu.stopIn > 0) cpu.stopIn -= dt; move(cpu, cpuInput()); }
      { const list = racers.filter(r => !r.fly).map(r => r.body); separate(list); for (const b of list) { clampToArena(b, meta.arena); collideObstacles(b, meta.arena); } }
      // the tiger
      pt -= dt;
      if (pt <= 0) {
        if (phase === RING) backToStart();
        else if (phase === READY || phase === LOOK || phase === FAKE) enter(SING);
        else if (phase === SING) enter(TELL);
        else if (phase === TELL) enter(nextFake ? FAKE : LOOK);
      }
      // roared racers fly home, and wait there (frozen) for the next song
      for (const r of racers) {
        const b = r.body;
        if (r.fly) {
          const f = r.fly; f.t += dt; const k = Math.min(1, f.t / RULES.flyTime), e = k * k * (3 - 2 * k);
          b.x = r2(f.x0 + (f.x1 - f.x0) * e); b.z = r2(f.z0 + (f.z1 - f.z0) * e); b.y = r2(Math.sin(k * Math.PI) * RULES.flyH); b.yaw = Math.PI;
          if (k >= 1) { r.fly = null; b.y = 0; b.flags &= ~F.AIR; r.hold = phase !== SING; if (!r.hold) b.flags &= ~F.FROZEN; }
          continue;
        }
        if (phase === DONE || phase === RING || phase === READY) continue;
        r.best = Math.max(r.best, progress(b));
        if (watching() && !r.statue && !r.hold && Math.hypot(b.vx, b.vz) > RULES.still) catchRacer(r);
        else if (Math.hypot(b.x - RULES.bellX, b.z - RULES.bellZ) < RULES.bellR + 0.45) { ring(r); break; }
      }
      if (phase !== DONE && time <= 0) {
        time = 0; phase = DONE; endIn = 0.05; freezeAll();
        // most bells; a tie goes to whoever is furthest up the field
        const top = [...racers].sort((a, b) => b.bells - a.bells || progress(b.body) - progress(a.body))[0];
        if (top && top.bells > 0) winner = top.id;
        events.push({ e: 'time' });
      }
    },
    state() {
      const sc = {}, cg = {}, m = {};
      for (const r of racers) if (!r.cpu) { sc[r.id] = r.bells; cg[r.id] = r.caught; m[r.id] = Math.floor(progress(r.body)); }
      const watch = phase === LOOK ? (pt <= lookLen - RULES.grace ? 2 : 1) : 0;    // 1 = turning (grace), 2 = watching
      const g = { ph: PHASES[phase], w: watch, sc, cg, m, win: winner, left: Math.ceil(Math.max(0, time)) };
      if (cpu) { const b = cpu.body; g.cpu = [r2(b.x), r2(b.z), r2(b.y), r2(b.yaw), cpu.bells, Math.hypot(b.vx, b.vz) > 0.3 ? 1 : 0, cpu.fly ? 1 : 0]; }
      return g;
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const r of racers) {
        if (r.cpu) continue;
        const d = r.bells * 1000 + (winner === r.id ? 999 : Math.floor(progress(r.body) * 2) / 2);    // half-metre steps: a near-tie is a tie
        scores[r.id] = r.bells;
        if (!groups.has(d)) groups.set(d, []); groups.get(d).push(r.id);
      }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
    get winner() { return winner; }, get wonAt() { return wonAt; }, get phase() { return PHASES[phase]; },
    get cpu() { return cpu; }, bellsOf: id => R.get(id)?.bells ?? 0,
  };
}
