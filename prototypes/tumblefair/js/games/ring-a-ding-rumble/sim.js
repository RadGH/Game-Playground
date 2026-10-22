// RING-A-DING RUMBLE — boxing in a roped ring, everybody in at once (2 = a bout, 3-4 = a free-for-all).
//   A tap        a quick jab (lands 0.1 s later, short reach)
//   A hold       wind up a big swing: it goes when you let go (after HAY_MIN s) or by itself at full power
//   B hold       block: punches from the front do (almost) nothing, but a big swing into your guard costs a lot of puff;
//                run out of puff while blocking and your guard breaks (stunned)
//   B + stick    a quick dodge that way (a moment where nothing can hit you)
// Every punch and dodge costs PUFF (stamina) that comes back over time — slower while you block — so mashing runs you
// dry. A punch aims itself at the nearest opponent roughly in front of you. Health to zero = knocked down (2.2 s on the
// mat, then up with less health); the third knockdown and you are out. Points: clean jab 1, clean big swing 2,
// knockdown 2 more. Order: still standing first (by points), then the knocked-out, last out first. A fighter knocked
// into the ropes bounces back off them. Solo: a CPU sparring partner, "Bolster", who fights back.
import { makeBody, stepBody, separate, spawnRing, F, BODY_R } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'ring-a-ding-rumble', title: 'Ring-a-Ding Rumble', blurb: 'Box everyone in the ring — knock them down and be the last one standing!',
  how: ['TAP A to jab. HOLD A and let go for a big swing.', 'HOLD B to block. B with the stick: dodge.', 'Punches cost puff — mash and you run dry!', 'Knocked down three times and you are out.'],
  kind: 'arena', min: 1, max: 4, seconds: 70, scoring: 'points', unit: 'points', tags: ['action'],
  controls: { stick: true, a: 'Punch', b: 'Block' },
  move: { speed: 4.6, accel: 24, stunDrag: 3.2, slowMul: 0.45, boostMul: 2.3 },
  arena: { shape: 'rect', hw: 4, hd: 4, wall: true }, pitch: 56, card: 'card-ring-a-ding-rumble', css: true,
};

export const RULES = {
  hp: 100, upHp: [70, 50], downs: 3, downTime: 2.2, upGhost: 1.0,
  puff: 100, regen: 18, regenBlock: 7,
  jab: { cost: 16, wind: 0.1, reach: 1.4, cos: 0.5, dmg: 9, push: 3.4, stun: 0.2, rec: 0.3, pts: 1 },
  hay: { cost: 26, wind: 0.13, reach: 1.65, cos: 0.45, dmg: 16, dmgFull: 30, push: 5, pushFull: 8.5, stun: 0.45, stunFull: 0.75, rec: 0.5, pts: 2 },
  hayMin: 0.35, hayFull: 0.85,                  // hold A this long to start winding up / for full power (it goes by itself)
  blockCos: 0.25, blockJabPuff: 6, blockHayPuff: 24, blockHayDmg: 0.25, breakStun: 0.9,
  dodgeCost: 18, dodgeTime: 0.18, dodgeInv: 0.28, dodgeCool: 0.6,
  downPts: 2, aimR: 2.6, aimCos: 0.0, ropeBounce: 0.75, endPause: 1.6,
  cpuPower: { easy: 0.55, normal: 0.8, hard: 1.0 }, cpuThink: { easy: 0.5, normal: 0.32, hard: 0.2 },
};
export const MODE = { IDLE: 0, BLOCK: 1, CHARGE: 2, DOWN: 3, OUT: 4, SWING: 5, DODGE: 6 };
const r2 = v => Math.round(v * 100) / 100;

export function create({ rng, players, difficulty = 'normal' }) {
  const solo = players.length === 1, A = meta.arena;
  const ids = players.map(p => p.pid); if (solo) ids.push(-1);
  const spots = ids.length === 2 ? [{ x: -1.8, z: 0, yaw: Math.PI / 2 }, { x: 1.8, z: 0, yaw: -Math.PI / 2 }] : spawnRing(ids.length, 2.5);
  const bodies = new Map(), Fs = new Map();
  ids.forEach((id, i) => {
    const s = spots[i], b = makeBody(r2(s.x), r2(s.z), r2(s.yaw));
    if (id >= 0) bodies.set(id, b);
    Fs.set(id, { id, cpu: id < 0, b, hp: RULES.hp, puff: RULES.puff, downs: 0, out: false, outAt: 0, pts: 0, prevB: 0, held: 0, punch: null, rec: 0, queue: 0, block: false, dodge: 0, dodgeCool: 0, inv: 0, stun: 0, down: 0, mx: 0, mz: 0,
      ai: { t: 0, hold: 0, bits: 0, strafe: rng.chance(0.5) ? 1 : -1 } });
  });
  const power = id => id < 0 ? (RULES.cpuPower[difficulty] ?? RULES.cpuPower.normal) : 1;
  let time = meta.seconds, elapsed = 0, over = false, endIn = -1;
  const events = [];
  const standing = () => [...Fs.values()].filter(f => !f.out);
  const canAct = f => !f.out && f.down <= 0 && f.stun <= 0;

  function setFlags(f) {
    const b = f.b; let fl = b.flags & F.FROZEN;
    if (f.out) fl |= F.OUT;
    if (f.down > 0 || f.stun > 0) fl |= F.STUN;
    if (f.inv > 0 && f.down <= 0 && !f.out) fl |= F.GHOST;
    if ((f.block || (f.held >= RULES.hayMin && !f.punch)) && f.dodge <= 0) fl |= F.SLOW;
    if (f.dodge > 0) fl |= F.BOOST;
    b.flags = fl;
  }
  /** Turn toward the nearest opponent in front-ish and in reach, so a phone player does not have to aim exactly. */
  function aim(f) {
    const b = f.b, fx = Math.sin(b.yaw), fz = Math.cos(b.yaw); let best = null, bd = RULES.aimR;
    for (const g of Fs.values()) {
      if (g === f || g.out || g.down > 0) continue;
      const dx = g.b.x - b.x, dz = g.b.z - b.z, d = Math.hypot(dx, dz);
      if (d < bd && (dx * fx + dz * fz) / (d || 1) >= RULES.aimCos) { bd = d; best = g; }
    }
    if (best) b.yaw = r2(Math.atan2(best.b.x - b.x, best.b.z - b.z));
  }
  function startPunch(f, kind, charge = 0) {
    const P = RULES[kind];
    if (f.puff < P.cost) { events.push({ e: 'puff', to: f.id, id: f.id }); return false; }
    f.puff -= P.cost; aim(f);
    f.punch = { kind, t: P.wind, charge }; f.rec = P.rec + P.wind;
    events.push({ e: kind, id: f.id });
    return true;
  }
  function land(f) {
    const { kind, charge } = f.punch, P = RULES[kind], b = f.b, fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    f.punch = null;
    let hit = false;
    for (const g of Fs.values()) {
      if (g === f || g.out || g.down > 0 || g.inv > 0) continue;
      const dx = g.b.x - b.x, dz = g.b.z - b.z, d = Math.hypot(dx, dz) || 1e-3;
      if (d > P.reach + BODY_R * 0.5 || (dx * fx + dz * fz) / d < P.cos) continue;
      hit = true;
      const nx = dx / d, nz = dz / d, x = r2(b.x + dx * 0.6), z = r2(b.z + dz * 0.6);
      const gfx = Math.sin(g.b.yaw), gfz = Math.cos(g.b.yaw), facing = -(nx * gfx + nz * gfz) >= RULES.blockCos;
      const mul = power(f.id), dmg = (kind === 'hay' ? P.dmg + (P.dmgFull - P.dmg) * charge : P.dmg) * mul;
      const push = kind === 'hay' ? P.push + (P.pushFull - P.push) * charge : P.push, stun = kind === 'hay' ? P.stun + (P.stunFull - P.stun) * charge : P.stun;
      if (g.block && facing && canAct(g)) {
        if (kind === 'jab') { g.puff = Math.max(0, g.puff - RULES.blockJabPuff); knock(g, nx, nz, 1.2, 0); events.push({ e: 'block', id: g.id, by: f.id, x, z }); continue; }
        g.puff -= RULES.blockHayPuff; hurt(g, f, dmg * RULES.blockHayDmg);
        if (g.puff <= 0) { g.puff = 0; g.block = false; knock(g, nx, nz, push * 0.7, RULES.breakStun); events.push({ e: 'break', id: g.id, by: f.id, x, z }); }
        else { knock(g, nx, nz, push * 0.4, 0); events.push({ e: 'block', id: g.id, by: f.id, x, z, big: 1 }); }
        continue;
      }
      g.block = false; g.held = 0; g.punch = null;
      f.pts += P.pts;
      knock(g, nx, nz, push, stun);
      events.push({ e: 'hit', id: g.id, by: f.id, k: kind, x, z, dmg: Math.round(dmg) });
      hurt(g, f, dmg);
    }
    if (!hit) events.push({ e: 'whiff', id: f.id });
  }
  function knock(g, nx, nz, push, stun) {
    g.b.vx = nx * push; g.b.vz = nz * push;
    if (stun > 0) { g.stun = Math.max(g.stun, stun); g.held = 0; g.punch = null; g.block = false; }
    setFlags(g);
  }
  function hurt(g, by, dmg) {
    g.hp = Math.max(0, g.hp - dmg);
    if (g.hp > 0 || g.down > 0) return;
    g.downs++; by.pts += RULES.downPts; g.down = RULES.downTime; g.stun = 0; g.held = 0; g.punch = null; g.block = false;
    if (g.downs >= RULES.downs) { g.out = true; g.outAt = Math.round(elapsed * 20); events.push({ e: 'out', id: g.id, by: by.id, x: r2(g.b.x), z: r2(g.b.z) }); }
    else events.push({ e: 'down', id: g.id, by: by.id, n: g.downs, x: r2(g.b.x), z: r2(g.b.z) });
    setFlags(g);
  }
  /** Buttons for one fighter this step (edge + hold logic), then its movement. */
  function drive(f, inp) {
    const bits = inp?.b | 0, pa = (bits & IN.A) && !(f.prevB & IN.A), pb = (bits & IN.B) && !(f.prevB & IN.B), relA = !(bits & IN.A) && (f.prevB & IN.A);
    f.prevB = bits;
    const mx = +inp?.mx || 0, mz = +inp?.mz || 0, m = Math.hypot(mx, mz);
    if (canAct(f) && !over) {
      // A: jab on the press; keep holding to wind up the big swing
      if (pa) f.queue = 0.25;                                          // a press during the last punch is kept a moment
      if (f.queue > 0 && !f.punch && f.rec <= 0) { f.queue = 0; startPunch(f, 'jab'); }
      if (bits & IN.A) f.held += 0.05;
      const charge = Math.max(0, Math.min(1, (f.held - RULES.hayMin) / (RULES.hayFull - RULES.hayMin)));
      if (f.held >= RULES.hayMin && !f.punch && f.rec <= 0.15 && (relA || f.held >= RULES.hayFull)) { f.rec = 0; startPunch(f, 'hay', charge); f.held = 0; }
      if (!(bits & IN.A)) f.held = 0;
      // B: a dodge with the stick, else block while held
      if (pb && m >= 0.5 && f.dodgeCool <= 0 && f.puff >= RULES.dodgeCost) { f.puff -= RULES.dodgeCost; f.dodge = RULES.dodgeTime; f.inv = Math.max(f.inv, RULES.dodgeInv); f.dodgeCool = RULES.dodgeCool; f.block = false; events.push({ e: 'dodge', id: f.id }); }
      f.block = !!(bits & IN.B) && f.dodge <= 0 && !f.punch && f.held < RULES.hayMin;
    } else { f.block = false; if (!(bits & IN.A)) f.held = 0; }
    setFlags(f);
    const vx = f.b.vx, vz = f.b.vz;
    stepBody(f.b, f.down > 0 || over ? null : inp, meta.move, A);
    // knocked into the ropes: bounce back off them
    if (f.stun > 0 && !f.out) {
      const lim = A.hw - BODY_R - 0.01;
      if (Math.abs(f.b.x) >= lim && vx * Math.sign(f.b.x) > 1) { f.b.vx = -vx * RULES.ropeBounce; events.push({ e: 'rope', id: f.id, side: f.b.x > 0 ? 'e' : 'w' }); }
      if (Math.abs(f.b.z) >= lim && vz * Math.sign(f.b.z) > 1) { f.b.vz = -vz * RULES.ropeBounce; events.push({ e: 'rope', id: f.id, side: f.b.z > 0 ? 's' : 'n' }); }
    }
  }
  /** Bolster, the CPU sparring partner: closes in, circles, jabs when near, sometimes winds up, blocks a wind-up. */
  function cpuInput(f) {
    const b = f.b, ai = f.ai, foe = standing().filter(g => g !== f).sort((p, q) => Math.hypot(p.b.x - b.x, p.b.z - b.z) - Math.hypot(q.b.x - b.x, q.b.z - b.z))[0];
    if (!foe) return { mx: 0, mz: 0, b: 0 };
    const dx = foe.b.x - b.x, dz = foe.b.z - b.z, d = Math.hypot(dx, dz) || 1, nx = dx / d, nz = dz / d;
    ai.t -= 0.05;
    if (ai.hold > 0) { ai.hold -= 0.05; return { mx: nx * 0.3, mz: nz * 0.3, b: ai.bits }; }
    let mx = nx, mz = nz, bits = 0;
    if (d < 1.6) { mx = -nz * ai.strafe * 0.6 + nx * (d - 1.15); mz = nx * ai.strafe * 0.6 + nz * (d - 1.15); }
    if (f.puff < 25) { mx = -nx; mz = -nz; }                                    // out of puff: back off
    if (ai.t <= 0) {
      ai.t = (RULES.cpuThink[difficulty] ?? 0.32) * rng.range(0.7, 1.6);
      if (rng.chance(0.25)) ai.strafe *= -1;
      const threat = foe.held >= RULES.hayMin || !!foe.punch;
      if (threat && d < 2.2 && rng.chance(difficulty === 'easy' ? 0.25 : difficulty === 'hard' ? 0.7 : 0.5)) { ai.hold = rng.range(0.3, 0.6); ai.bits = IN.B; return { mx: 0, mz: 0, b: IN.B }; }
      if (d < 1.7 && f.puff > 30) {
        if (rng.chance(0.15)) { ai.hold = RULES.hayFull + 0.05; ai.bits = IN.A; return { mx: nx * 0.2, mz: nz * 0.2, b: IN.A }; }
        bits = IN.A;
      }
    }
    return { mx, mz, b: bits };
  }

  return {
    bodies, events,
    init: () => ({ solo, cpu: solo ? { id: -1, name: 'Bolster' } : null, downs: RULES.downs, left: Math.ceil(time) }),
    input(pid, inp) { const f = Fs.get(pid); if (f) drive(f, f.out ? null : inp); },
    step(dt) {
      if (over) return;
      elapsed += dt; time -= dt;
      for (const f of Fs.values()) if (f.cpu) drive(f, f.out ? null : cpuInput(f));
      separate([...Fs.values()].filter(f => !f.out && f.down <= 0).map(f => f.b));
      for (const f of Fs.values()) {
        if (f.out) { setFlags(f); continue; }
        if (f.punch) { f.punch.t -= dt; if (f.punch.t <= 0) land(f); }
        if (f.rec > 0) f.rec -= dt;
        if (f.queue > 0) f.queue -= dt;
        if (f.stun > 0) f.stun -= dt;
        if (f.dodge > 0) f.dodge -= dt;
        if (f.dodgeCool > 0) f.dodgeCool -= dt;
        if (f.inv > 0) f.inv -= dt;
        if (f.down > 0) { f.down -= dt; if (f.down <= 0) { f.hp = RULES.upHp[f.downs - 1] ?? RULES.upHp[RULES.upHp.length - 1]; f.puff = RULES.puff; f.inv = RULES.upGhost; events.push({ e: 'up', id: f.id }); } }
        else f.puff = Math.min(RULES.puff, f.puff + (f.block ? RULES.regenBlock : RULES.regen) * dt);
        setFlags(f);
      }
      const left = standing().length;                                  // solo: you and Bolster — either one out ends it
      if (endIn < 0 && left < 2) endIn = RULES.endPause;
      if (endIn > 0) endIn = Math.max(0, endIn - dt);
      if (endIn === 0 || time <= 0) {
        over = true; time = Math.max(0, time);
        for (const f of Fs.values()) { f.b.flags |= F.FROZEN; f.b.vx = f.b.vz = 0; }
      }
    },
    state() {
      const f = {};
      for (const x of Fs.values()) {
        const mode = x.out ? MODE.OUT : x.down > 0 ? MODE.DOWN : x.dodge > 0 ? MODE.DODGE : x.punch || x.rec > 0.2 ? MODE.SWING : x.block ? MODE.BLOCK : x.held >= RULES.hayMin ? MODE.CHARGE : MODE.IDLE;
        f[x.id] = [Math.ceil(x.hp), Math.floor(x.puff), x.downs, mode, x.pts];
      }
      const g = { f, left: Math.ceil(time) };
      if (solo) { const c = Fs.get(-1).b; g.cpu = [r2(c.x), r2(c.z), r2(c.yaw), c.flags, r2(Math.hypot(c.vx, c.vz))]; }
      return g;
    },
    get over() { return over; },
    fighters: Fs,
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) {
        const f = Fs.get(p.pid); scores[p.pid] = f.pts;
        const key = f.out ? f.outAt * 1000 + f.pts : 1e8 + f.pts;
        if (!groups.has(key)) groups.set(key, []); groups.get(key).push(p.pid);
      }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
  };
}
