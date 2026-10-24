// NIGHT OF THE SHAMBLERS — the fair after closing, and the Shamblers are out: slow, goofy, green-faced party-goers in
// paper hats who want a hug very, very badly. Hold out together until sunrise.
//   A        swing your foam bat at whatever is in front of you (it turns you to the nearest Shambler): BONK, it
//            stumbles back. Two bonks and a Shambler flops over (a Big Shambler takes four).
//   B        plant a fence (a barricade) in front of you (you carry 3; one more every 15 s): Shamblers chew through it.
//   hugged   a Shambler that reaches you starts a big hug (you are slowed); half a second of it and you are DOWN. Stand next to a downed friend for
//            2 seconds to pick them up (+3). Everyone down at once = the night is lost.
// Survive until sunrise (the clock) = the team wins. Your own score: 1 a bonk, +1 a flop (+2 a Big one), +3 a revive.
// Solo: you have three hugs to spare (you get back up by yourself after a moment, a little slower each time).
import { makeBody, stepBody, separate, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

const HW = 9, HD = 7;
export const meta = {
  id: 'zombie-survival', title: 'Night of the Shamblers', blurb: 'Bonk the goofy Shamblers, pick your friends back up and last until sunrise together!',
  how: ['Shamblers want a hug: a hug knocks you DOWN.', 'A swings your foam bat (two bonks flop one). B plants a fence.', 'Stand by a downed friend to pick them up. Last until sunrise!'],
  kind: 'arena', min: 1, max: 4, seconds: 74, scoring: 'coop', unit: 'points', tags: ['coop', 'action'], card: 'card-zombie-survival', css: true,
  controls: { stick: true, a: 'Bonk', b: 'Fence' }, move: { speed: 5, accel: 30, stunDrag: 3, slowMul: 0.55 },
  arena: { shape: 'rect', hw: HW, hd: HD, wall: true }, pitch: 60,
};
export const KINDS = [
  { id: 'walker', hp: 2, r: 0.42, speed: 1, flop: 1 },
  { id: 'big', hp: 4, r: 0.62, speed: 0.75, flop: 2 },
];
export const RULES = {
  play: 66,                                                                   // seconds until sunrise
  speed: { easy: 1.05, normal: 1.3, hard: 1.45 },                             // a walker's pace, m/s (ramps up to +35%)
  every: { easy: 2.2, normal: 1.7, hard: 1.5 },                              // seconds between Shamblers at the start (shrinks by half)
  crowd: { easy: 0.6, normal: 0.75, hard: 0.9 },                              // per extra player, as a share of one more stream
  cap: { easy: 5, normal: 7, hard: 8 },                                       // at most this many + 2 a player on the field
  big: 0.12, waves: [20, 40, 56], waveSize: 3,                               // a Big one now and then; a burst at each wave
  hugR: 0.85, hugT: 0.5, swingCool: 0.42, swingR: 1.9, swingCone: 1.05, aimR: 2.4, aimCone: 1.6, push: 6, stagger: 0.55,
  flopT: 1.4, barricades: 3, refill: 15, barHp: 5, chew: 1, barR: 0.85, barAhead: 1.15, barMax: 6,
  revive: 2, reviveR: 1.4, safe: 1.6, soloLives: 3, soloUp: [2.5, 3.5, 4.5],
  pts: { bonk: 1, revive: 3 },
};
const r2 = v => Math.round(v * 100) / 100;
const ang = a => Math.atan2(Math.sin(a), Math.cos(a));

export function create({ rng, players, difficulty = 'normal' }) {
  const D = RULES.speed[difficulty] ? difficulty : 'normal', n = players.length, solo = n === 1;
  const bodies = new Map(), events = [];
  players.forEach((p, i) => bodies.set(p.pid, makeBody(r2(n === 1 ? 0 : -1.5 + i * 3 / (n - 1)), 0.5, Math.PI)));
  const P = new Map(players.map(p => [p.pid, { prevB: 0, cool: 0, down: false, downAt: 0, prog: 0, safe: 0, bars: RULES.barricades, refill: RULES.refill, pts: 0, bonks: 0, flops: 0, revives: 0, hugs: 0, hug: 0, lives: RULES.soloLives, upIn: 0 }]));
  const zs = [], bars = [];
  let zid = 0, bid = 0, el = 0, over = false, endIn = -1, success = false, spawnT = 2.4, wave = 0;
  const live = pid => !P.get(pid).down;
  const standing = () => players.filter(p => live(p.pid));
  const rate = () => RULES.every[D] * (1 - 0.5 * Math.min(1, el / RULES.play)) / (1 + RULES.crowd[D] * (n - 1));
  const cap = () => RULES.cap[D] + 2 * (n - 1);
  function spawn(kind) {
    // from a random edge, just inside the fence, not right next to anyone
    for (let tries = 0; tries < 12; tries++) {
      const side = rng.int(0, 3), u = rng.range(-1, 1);
      const x = r2(side < 2 ? (side ? HW - 0.6 : -HW + 0.6) : u * (HW - 1)), z = r2(side >= 2 ? (side === 3 ? HD - 0.6 : -HD + 0.6) : u * (HD - 1));
      if ([...bodies.values()].some(b => Math.hypot(b.x - x, b.z - z) < 3)) continue;
      const K = KINDS[kind];
      zs.push({ id: ++zid, k: kind, x, z, vx: 0, vz: 0, yaw: Math.atan2(-x, -z), hp: K.hp, st: 'walk', t: 0, sp: rng.range(0.85, 1.15), wob: rng.range(0, 6.28) });
      return true;
    }
    return false;
  }
  function down(pid, z) {
    const s = P.get(pid), b = bodies.get(pid);
    s.down = true; s.downAt = el; s.prog = 0; s.hug = 0; s.hugs++; b.flags = (b.flags | F.FROZEN) & ~(F.STUN | F.SLOW); b.vx = b.vz = 0;
    if (solo) { s.lives--; s.upIn = RULES.soloUp[Math.min(RULES.soloUp.length - 1, s.hugs - 1)]; }
    // the hugger is so pleased it wanders off a little
    if (z) { z.st = 'stun'; z.t = 0.9; const dx = z.x - b.x, dz = z.z - b.z, d = Math.hypot(dx, dz) || 1; z.vx = dx / d * 2.5; z.vz = dz / d * 2.5; }
    events.push({ e: 'down', pid, x: r2(b.x), z: r2(b.z) });
  }
  function up(pid, by) {
    const s = P.get(pid), b = bodies.get(pid);
    s.down = false; s.prog = 0; s.safe = RULES.safe; b.flags &= ~F.FROZEN;
    if (by != null) { const q = P.get(by); q.pts += RULES.pts.revive; q.revives++; }
    // everything close by gets shooed back a step
    for (const z of zs) { const dx = z.x - b.x, dz = z.z - b.z, d = Math.hypot(dx, dz); if (d < 2.2 && z.st !== 'flop') { z.st = 'stun'; z.t = 0.6; z.vx = dx / (d || 1) * 4; z.vz = dz / (d || 1) * 4; } }
    events.push({ e: 'up', pid, by: by ?? null });
  }
  function swing(pid) {
    const b = bodies.get(pid), s = P.get(pid);
    s.cool = RULES.swingCool;
    let near = null, nd = 99;
    for (const z of zs) { if (z.st === 'flop') continue; const d = Math.hypot(z.x - b.x, z.z - b.z), da = Math.abs(ang(Math.atan2(z.x - b.x, z.z - b.z) - b.yaw)); if (d <= RULES.aimR && da <= RULES.aimCone && d < nd) { nd = d; near = z; } }
    if (near) b.yaw = Math.atan2(near.x - b.x, near.z - b.z);
    const hit = [];
    for (const z of zs) {
      if (z.st === 'flop') continue;
      const dx = z.x - b.x, dz = z.z - b.z, d = Math.hypot(dx, dz), da = Math.abs(ang(Math.atan2(dx, dz) - b.yaw)), K = KINDS[z.k];
      if (d > RULES.swingR + K.r - 0.4 || da > RULES.swingCone) continue;
      z.hp--; s.pts += RULES.pts.bonk; s.bonks++; hit.push(z.id);
      const push = RULES.push * (z.k ? 0.55 : 1);
      z.vx = dx / (d || 1) * push; z.vz = dz / (d || 1) * push;
      if (z.hp <= 0) { z.st = 'flop'; z.t = RULES.flopT; s.pts += K.flop; s.flops++; events.push({ e: 'flop', id: z.id, pid, x: r2(z.x), z: r2(z.z), big: !!z.k }); }
      else { z.st = 'stun'; z.t = RULES.stagger; }
    }
    events.push({ e: 'swing', pid, hit });
  }
  function plant(pid) {
    const b = bodies.get(pid), s = P.get(pid);
    if (s.bars <= 0 || bars.length >= RULES.barMax + n) { events.push({ e: 'nobar', to: pid }); return; }
    const x = r2(Math.max(-HW + 0.8, Math.min(HW - 0.8, b.x + Math.sin(b.yaw) * RULES.barAhead))), z = r2(Math.max(-HD + 0.8, Math.min(HD - 0.8, b.z + Math.cos(b.yaw) * RULES.barAhead)));
    if (bars.some(o => Math.hypot(o.x - x, o.z - z) < RULES.barR * 1.6)) { events.push({ e: 'nobar', to: pid }); return; }
    s.bars--; bars.push({ id: ++bid, x, z, yaw: r2(b.yaw), hp: RULES.barHp, by: pid });
    // a Shambler standing right on the spot is shoved off it
    for (const zz of zs) { const dx = zz.x - x, dz = zz.z - z, d = Math.hypot(dx, dz); if (d < RULES.barR + KINDS[zz.k].r) { zz.x = r2(x + dx / (d || 1) * (RULES.barR + KINDS[zz.k].r + 0.05)); zz.z = r2(z + dz / (d || 1) * (RULES.barR + KINDS[zz.k].r + 0.05)); } }
    events.push({ e: 'bar', pid, id: bid });
  }
  function finish(won) {
    success = won; endIn = 1.4;
    for (const [pid, b] of bodies) if (live(pid)) { b.flags |= F.FROZEN; b.vx = b.vz = 0; }
    events.push({ e: 'end', success: won });
  }
  return {
    bodies, events,
    init: () => ({ solo, play: RULES.play, kinds: KINDS, waves: RULES.waves, lives: RULES.soloLives, revive: RULES.revive, barR: RULES.barR, left: RULES.play }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(s.prevB & IN.A), pb = (bits & IN.B) && !(s.prevB & IN.B); s.prevB = bits;
      const ready = !s.down && endIn < 0;
      if (pa && ready && s.cool <= 0) swing(pid);
      if (pb && ready) plant(pid);
      stepBody(b, s.down ? null : inp, meta.move, meta.arena);
    },
    step(dt) {
      if (over) return;
      if (endIn >= 0) { endIn -= dt; if (endIn <= 0) over = true; return; }
      el += dt;
      // Shamblers arrive: a steady stream, plus a burst at each wave
      spawnT -= dt;
      if (spawnT <= 0) { spawnT += rate(); if (zs.filter(z => z.st !== 'flop').length < cap()) spawn(rng() < RULES.big * Math.min(1, el / 20) ? 1 : 0); }
      if (wave < RULES.waves.length && el >= RULES.waves[wave]) {
        wave++; events.push({ e: 'wave', w: wave });
        for (let i = 0; i < RULES.waveSize + Math.floor(n / 2) + (D === 'hard' ? 1 : 0); i++) spawn(i === 0 && wave >= 2 ? 1 : 0);
      }
      separate([...bodies].filter(([pid]) => live(pid)).map(([, b]) => b));
      const ramp = 1 + 0.35 * Math.min(1, el / RULES.play), base = RULES.speed[D] * ramp;
      // move the Shamblers
      for (let i = zs.length - 1; i >= 0; i--) {
        const z = zs[i], K = KINDS[z.k];
        if (z.st === 'flop') { z.t -= dt; z.vx *= 0.8; z.vz *= 0.8; z.x += z.vx * dt; z.z += z.vz * dt; if (z.t <= 0) zs.splice(i, 1); continue; }
        if (z.st === 'stun') { z.t -= dt; const k = Math.max(0, 1 - 5 * dt); z.vx *= k; z.vz *= k; if (z.t <= 0) z.st = 'walk'; }
        else {
          let tgt = null, td = 1e9;
          for (const p of standing()) { const b = bodies.get(p.pid), d = Math.hypot(b.x - z.x, b.z - z.z); if (d < td) { td = d; tgt = b; } }
          if (!tgt) { z.vx *= 0.8; z.vz *= 0.8; }
          else {
            const dx = tgt.x - z.x, dz = tgt.z - z.z, d = Math.hypot(dx, dz) || 1, sp = base * K.speed * z.sp;
            const wob = Math.sin(el * 2.3 + z.wob) * 0.35;                                            // the shamble
            const ux = dx / d, uz = dz / d, wx = ux * Math.cos(wob) + uz * Math.sin(wob), wz = uz * Math.cos(wob) - ux * Math.sin(wob);
            z.vx += (wx * sp - z.vx) * Math.min(1, 4 * dt); z.vz += (wz * sp - z.vz) * Math.min(1, 4 * dt); z.yaw = Math.atan2(ux, uz);
          }
          z.st = 'walk';
        }
        z.x += z.vx * dt; z.z += z.vz * dt;
        // barricades: a Shambler that walks into one stops and chews on it
        for (const o of bars) {
          const dx = z.x - o.x, dz = z.z - o.z, d = Math.hypot(dx, dz), min = RULES.barR + K.r;
          if (d < min) { z.x = o.x + dx / (d || 1) * min; z.z = o.z + dz / (d || 1) * min; if (z.st === 'walk') { z.st = 'chew'; o.hp -= RULES.chew * dt * (z.k ? 2 : 1); } }
        }
        z.x = Math.max(-HW + K.r, Math.min(HW - K.r, z.x)); z.z = Math.max(-HD + K.r, Math.min(HD - K.r, z.z));
      }
      for (let i = bars.length - 1; i >= 0; i--) if (bars[i].hp <= 0) { events.push({ e: 'barbreak', id: bars[i].id, x: r2(bars[i].x), z: r2(bars[i].z) }); bars.splice(i, 1); }
      // Shamblers push each other apart a bit (they are not solid to players: a hug is how they touch you)
      for (let i = 0; i < zs.length; i++) for (let j = i + 1; j < zs.length; j++) {
        const a = zs[i], c = zs[j]; if (a.st === 'flop' || c.st === 'flop') continue;
        const dx = c.x - a.x, dz = c.z - a.z, d = Math.hypot(dx, dz), min = KINDS[a.k].r + KINDS[c.k].r;
        if (d < min && d > 1e-6) { const p = (min - d) / 2; a.x -= dx / d * p; a.z -= dz / d * p; c.x += dx / d * p; c.z += dz / d * p; }
      }
      // players: cool-downs, barricade refill, hugs, revives
      for (const [pid, b] of bodies) {
        const s = P.get(pid);
        if (s.cool > 0) s.cool -= dt;
        if (s.safe > 0) s.safe -= dt;
        if (s.bars < RULES.barricades) { s.refill -= dt; if (s.refill <= 0) { s.bars++; s.refill = RULES.refill; } } else s.refill = RULES.refill;
        if (s.down) {
          if (solo) { if (s.lives > 0) { s.upIn -= dt; if (s.upIn <= 0) up(pid, null); } continue; }
          const helper = players.find(q => q.pid !== pid && live(q.pid) && Math.hypot(bodies.get(q.pid).x - b.x, bodies.get(q.pid).z - b.z) <= RULES.reviveR);
          s.prog = helper ? s.prog + dt : Math.max(0, s.prog - dt * 0.5);
          if (helper && s.prog >= RULES.revive) up(pid, helper.pid);
          continue;
        }
        if (s.safe > 0) { s.hug = 0; b.flags &= ~F.SLOW; continue; }
        // a Shambler in reach starts a hug (you are slowed); keep it up for hugT and you are down — bonk it or step away
        const hugger = zs.find(z => z.st !== 'flop' && z.st !== 'stun' && Math.hypot(z.x - b.x, z.z - b.z) < RULES.hugR + KINDS[z.k].r - 0.42);
        if (hugger) { if (!s.hug) events.push({ e: 'hug', pid }); s.hug += dt; b.flags |= F.SLOW; if (s.hug >= RULES.hugT) { s.hug = 0; b.flags &= ~F.SLOW; down(pid, hugger); } }
        else { s.hug = Math.max(0, s.hug - dt * 2); if (!s.hug) b.flags &= ~F.SLOW; }
      }
      for (const z of zs) { z.x = r2(z.x); z.z = r2(z.z); }
      if (!standing().length && (!solo || P.get(players[0].pid).lives <= 0)) finish(false);
      else if (el >= RULES.play) finish(true);
    },
    state() {
      const sc = {}; for (const p of players) sc[p.pid] = P.get(p.pid).pts;
      const st = { walk: 0, stun: 1, chew: 2, flop: 3 };
      return {
        sc, w: wave,
        // a Shambler: [id, kind, x, z, yaw, state 0 walk 1 stunned 2 chewing 3 flopped]
        z: zs.map(z => [z.id, z.k, z.x, z.z, Math.round(z.yaw * 10) / 10, st[z.st]]),
        br: bars.map(o => [o.id, o.x, o.z, o.yaw, Math.ceil(o.hp / RULES.barHp * 9)]),
        dn: players.filter(p => P.get(p.pid).down).map(p => [p.pid, Math.round(P.get(p.pid).prog / RULES.revive * 9)]),
        bc: Object.fromEntries(players.map(p => [p.pid, P.get(p.pid).bars])),
        ...(solo ? { lv: P.get(players[0].pid).lives } : {}),
        left: Math.ceil(Math.max(0, RULES.play - el)),
      };
    },
    get over() { return over; },
    result() {
      const scores = {}; for (const p of players) scores[p.pid] = P.get(p.pid).pts;
      return { coop: { success }, order: [players.map(p => p.pid)], scores, unit: meta.unit };
    },
    get _el() { return el; }, _zs: zs, _bars: bars, _P: P, get _success() { return success; }, _down: down,
  };
}

/** A sensible player for the tests: skill 1 = picks friends up, bonks whatever comes close, backs off while the bat
 *  is cooling, plants a barricade when a crowd is coming, keeps to the open middle; skill 0 = wanders and flails.
 *  Returns { mx, mz, b }. */
export function shamblerBot(g, pid, skill = 1, tick = 0) {
  const b = g.bodies.get(pid), s = g._P.get(pid); if (!b || s.down) return { mx: 0, mz: 0, b: 0 };
  const zs = g._zs.filter(z => z.st !== 'flop');
  const dist = z => Math.hypot(z.x - b.x, z.z - b.z);
  const near = zs.slice().sort((a, c) => dist(a) - dist(c))[0], nd = near ? dist(near) : 99;
  if (skill < 0.5) {
    const a = tick * 0.031 + pid * 1.7;
    return { mx: Math.sin(a), mz: Math.cos(a * 0.8), b: tick % 11 === 0 ? IN.A : 0 };
  }
  const press = tick % 2 === 0;
  // a downed friend close enough to reach before anything grabs us: go and stand by them
  const friend = [...g._P.entries()].filter(([q, t]) => q !== pid && t.down).map(([q]) => g.bodies.get(q)).sort((a, c) => Math.hypot(a.x - b.x, a.z - b.z) - Math.hypot(c.x - b.x, c.z - b.z))[0];
  if (friend && nd > 1.6) {
    const dx = friend.x - b.x, dz = friend.z - b.z, d = Math.hypot(dx, dz);
    if (d > 0.9) return { mx: dx / d, mz: dz / d, b: 0 };
    return { mx: 0, mz: 0, b: near && nd < 2.3 && s.cool <= 0 && press ? IN.A : 0 };
  }
  if (!near) { const d = Math.hypot(b.x, b.z); return d > 1 ? { mx: -b.x / d * 0.5, mz: -b.z / d * 0.5, b: 0 } : { mx: 0, mz: 0, b: 0 }; }
  const ux = (near.x - b.x) / (nd || 1), uz = (near.z - b.z) / (nd || 1);
  const crowd = zs.filter(z => dist(z) < 3.2).length;
  if (crowd >= 3 && s.bars > 0 && nd > 1.4 && press) { b.yaw = Math.atan2(ux, uz); return { mx: ux * 0.2, mz: uz * 0.2, b: IN.B }; }
  if (s.cool <= 0 && nd < 2.1) return { mx: ux * 0.3, mz: uz * 0.3, b: press ? IN.A : 0 };
  // bat cooling or nothing in reach: back away from the nearest, drifting toward the middle
  if (nd < 2.4) { let mx = -ux + -b.x * 0.06, mz = -uz + -b.z * 0.06; const m = Math.hypot(mx, mz) || 1; return { mx: mx / m, mz: mz / m, b: 0 }; }
  // step in to meet it
  return { mx: ux * 0.6, mz: uz * 0.6, b: 0 };
}
