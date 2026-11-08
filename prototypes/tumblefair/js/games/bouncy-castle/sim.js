// BOUNCY CASTLE — a big striped bouncy castle with turrets at the corners and NO walls on its sides. Everyone bobs
// about on the squishy floor. A = BIG BOUNCE: you fly up, and where you land the floor heaves — everyone standing near
// is flung away (the closer, the further). B = a belly bump: a short shove in front of you. Fly off the edge and you
// flop onto the grass, then bounce back on after a moment. Knock someone off = +3 (the last person to fling or bump
// them gets it); falling off = -1 (never below 0). Being IN THE AIR when someone lands keeps you safe, so a good hop
// is also a dodge. The last 15 seconds are MEGA BOUNCE: bigger landings.
// Alone (or two players): bop-bag clowns wobble about the castle to be bounced off too (+3 each, they come back).
import { makeBody, stepBody, separate, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'bouncy-castle', title: 'Bouncy Castle', blurb: 'Bounce, land next to your friends and fling them off the castle!',
  how: ['Fling everyone else off the bouncy castle.', 'A = BIG BOUNCE (land near someone to fling them). B = belly bump.', 'Hop when someone lands next to you — in the air you are safe.', 'Off the edge = -1, flinging someone off = +3.'],
  kind: 'arena', min: 1, max: 4, seconds: 68, scoring: 'points', unit: 'pts', tags: ['action'],
  controls: { stick: true, a: 'Bounce', b: 'Bump' },
  move: { speed: 5.6, accel: 9, stunDrag: 0.9 },
  arena: { shape: 'rect', hw: 6.5, hd: 5, wall: false }, pitch: 56, card: 'card-bouncy-castle', css: true,
};

export const RULES = {
  countdown: 3, play: 60, endPause: 1.8, mega: 15,
  jump: 0.85, jumpH: 2.2, jumpCool: 1.25,
  waveR: 2.7, waveMin: 4, waveMax: 11, megaMul: 1.3, waveStun: 0.55, waveHop: 0.45,
  bump: { reach: 1.5, cone: 0.9, power: 7.5, stun: 0.45, cool: 0.7 },
  edge: 0.2,                // how far past the edge you go before you fall
  outFor: 1.8, ghost: 1.0, credit: 3,
  pts: { off: 3, fall: -1 },
  ground: -0.9,             // where a fallen body sits (the grass is below the castle floor)
  bags: { names: ['Wobbly Bob', 'Bonzo', 'Puffles'], speed: 1.6 },
};
const r2 = v => Math.round(v * 100) / 100;
const STARTS = [[-3.6, 2.6], [3.6, -2.6], [3.6, 2.6], [-3.6, -2.6]];
const BAG_STARTS = [[0, 0], [-3, -2.6], [3, 2.6]];

export function create({ rng, players, difficulty = 'normal' }) {
  const A = meta.arena, n = players.length, pids = players.map(p => p.pid), bodies = new Map();
  const S = new Map();          // id -> state (players by pid, bags by negative id)
  players.forEach((p, i) => { const [x, z] = STARTS[i], b = makeBody(x, z, Math.atan2(-x, -z)); b.flags = F.FROZEN; bodies.set(p.pid, b); S.set(p.pid, { id: p.pid, b, bag: false, pts: 0, air: 0, jcool: 0, bcool: 0, stun: 0, out: 0, ghost: 0, hitBy: null, hitAt: -99, prevA: 0, prevB: 0, falls: 0, offs: 0 }); });
  const nBags = n === 1 ? 3 : n === 2 ? 1 : 0;
  const bagMove = { speed: RULES.bags.speed, accel: 6, stunDrag: 0.9 };
  for (let j = 0; j < nBags; j++) { const [x, z] = n === 1 ? BAG_STARTS[j] : BAG_STARTS[0]; const b = makeBody(x, z, 0); b.flags = F.FROZEN; S.set(-1 - j, { id: -1 - j, b, bag: true, name: RULES.bags.names[j], pts: 0, air: 0, stun: 0, out: 0, ghost: 0, hitBy: null, hitAt: -99, aim: null, think: 0 }); }
  const all = () => [...S.values()];
  const stunMul = difficulty === 'easy' ? 0.85 : difficulty === 'hard' ? 1.1 : 1;
  let countdown = RULES.countdown, lastCount = 4, time = RULES.play, clock = 0, endIn = -1, over = false, megaOn = false;
  const events = [];
  const live = () => countdown <= 0 && endIn < 0;

  function fling(s, fx, fz, power, by, hop = 0) {
    const b = s.b; let dx = b.x - fx, dz = b.z - fz, d = Math.hypot(dx, dz);
    if (d < 1e-3) { dx = rng.range(-1, 1); dz = rng.range(-1, 1); d = Math.hypot(dx, dz) || 1; }
    b.vx = dx / d * power; b.vz = dz / d * power; b.flags |= F.STUN; s.stun = Math.max(s.stun, RULES.waveStun * stunMul);
    if (hop && s.air <= 0) { s.air = hop; s.airT = hop; s.airH = 0.9; b.flags |= F.AIR; }
    if (by != null && by !== s.id) { s.hitBy = by; s.hitAt = clock; }
  }
  function land(s) {
    const mul = megaOn ? RULES.megaMul : 1, R = RULES.waveR * mul;
    events.push({ e: 'land', id: s.id, x: r2(s.b.x), z: r2(s.b.z), r: r2(R), mega: megaOn ? 1 : 0 });
    for (const o of all()) {
      if (o === s || o.out > 0 || o.ghost > 0 || o.air > 0) continue;
      const d = Math.hypot(o.b.x - s.b.x, o.b.z - s.b.z); if (d > R) continue;
      const power = (RULES.waveMin + (RULES.waveMax - RULES.waveMin) * (1 - d / R)) * mul;
      fling(o, s.b.x, s.b.z, power, s.bag ? null : s.id, RULES.waveHop);
      events.push({ e: 'flung', id: o.id, by: s.id });
    }
  }
  function bump(s) {
    const b = s.b, B = RULES.bump; let hit = null, bd = B.reach;
    for (const o of all()) {
      if (o === s || o.out > 0 || o.ghost > 0) continue;
      const dx = o.b.x - b.x, dz = o.b.z - b.z, d = Math.hypot(dx, dz); if (d > bd) continue;
      let a = Math.atan2(dx, dz) - b.yaw; a = Math.atan2(Math.sin(a), Math.cos(a)); if (Math.abs(a) > B.cone) continue;
      hit = o; bd = d;
    }
    events.push({ e: 'bump', id: s.id, hit: hit ? hit.id : null });
    if (!hit) return;
    fling(hit, b.x - Math.sin(b.yaw) * 0.3, b.z - Math.cos(b.yaw) * 0.3, B.power, s.id);
    hit.stun = B.stun * stunMul;
  }
  function fallOff(s) {
    const b = s.b, credit = s.hitBy != null && clock - s.hitAt <= RULES.credit ? s.hitBy : null;
    s.out = RULES.outFor; s.air = 0; b.flags = (b.flags | F.OUT) & ~(F.STUN | F.AIR); b.vx = b.vz = 0;
    // flop onto the grass just past the edge
    const ox = Math.sign(b.x) * Math.max(0, Math.abs(b.x) - A.hw), oz = Math.sign(b.z) * Math.max(0, Math.abs(b.z) - A.hd), ol = Math.hypot(ox, oz) || 1;
    b.x = r2(b.x + ox / ol * 0.9); b.z = r2(b.z + oz / ol * 0.9); b.y = RULES.ground;
    if (!s.bag) { s.pts = Math.max(0, s.pts + RULES.pts.fall); s.falls++; }
    if (credit != null) { const c = S.get(credit); if (c) { c.pts += RULES.pts.off; c.offs++; } }
    s.hitBy = null;
    events.push({ e: 'off', id: s.id, by: credit, x: b.x, z: b.z });
  }
  function respawn(s) {
    const b = s.b; let best = null, bd = -1;
    for (let k = 0; k < 10; k++) {
      const x = rng.range(-A.hw * 0.55, A.hw * 0.55), z = rng.range(-A.hd * 0.55, A.hd * 0.55);
      const d = Math.min(9, ...all().filter(o => o !== s && o.out <= 0).map(o => Math.hypot(o.b.x - x, o.b.z - z)));
      if (d > bd) { bd = d; best = [x, z]; }
    }
    b.x = r2(best[0]); b.z = r2(best[1]); b.y = 0; b.vx = b.vz = 0; b.flags &= ~(F.OUT | F.STUN);
    s.out = 0; s.ghost = RULES.ghost; s.stun = 0;
    events.push({ e: 'back', id: s.id, x: b.x, z: b.z });
  }
  function bagThink(s, dt) {
    const b = s.b;
    if (s.out > 0 || (b.flags & F.STUN)) { stepBody(b, null, bagMove, A); return; }
    s.think -= dt;
    if (!s.aim || s.think <= 0) { s.think = rng.range(1.5, 3); s.aim = [rng.range(-A.hw * 0.6, A.hw * 0.6), rng.range(-A.hd * 0.6, A.hd * 0.6)]; }
    const dx = s.aim[0] - b.x, dz = s.aim[1] - b.z, d = Math.hypot(dx, dz);
    stepBody(b, d < 0.4 ? null : { mx: dx / d, mz: dz / d, b: 0 }, bagMove, A);
  }

  return {
    bodies, events,
    init: () => ({ solo: n === 1, bags: all().filter(s => s.bag).map(s => ({ id: s.id, name: s.name })), left: RULES.play }),
    input(pid, inp) {
      const s = S.get(pid); if (!s || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !s.prevA, pb = (bits & IN.B) && !s.prevB;
      s.prevA = bits & IN.A; s.prevB = bits & IN.B;
      if (live() && s.out <= 0 && !(s.b.flags & F.STUN)) {
        if (pa && s.air <= 0 && s.jcool <= 0) { s.air = s.airT = RULES.jump; s.airH = RULES.jumpH; s.jcool = RULES.jumpCool; s.b.flags |= F.AIR; s.big = true; events.push({ e: 'jump', id: pid }); }
        else if (pb && s.air <= 0 && s.bcool <= 0) { s.bcool = RULES.bump.cool; bump(s); }
      }
      stepBody(s.b, live() ? inp : null, meta.move, A);
    },
    step(dt) {
      if (over) return;
      if (endIn >= 0) { endIn -= dt; if (endIn <= 0) over = true; return; }
      if (countdown > 0) {
        countdown -= dt; const c = Math.ceil(countdown);
        if (c < lastCount && c > 0) { lastCount = c; events.push({ e: 'count', n: c }); }
        if (countdown <= 0) { for (const s of all()) s.b.flags &= ~F.FROZEN; events.push({ e: 'go' }); }
        return;
      }
      time -= dt; clock += dt;
      if (!megaOn && time <= RULES.mega) { megaOn = true; events.push({ e: 'mega' }); }
      for (const s of all()) {
        const b = s.b;
        if (s.bag) bagThink(s, dt);
        s.jcool = Math.max(0, (s.jcool || 0) - dt); s.bcool = Math.max(0, (s.bcool || 0) - dt); s.ghost = Math.max(0, s.ghost - dt);
        if (s.stun > 0) { s.stun -= dt; if (s.stun <= 0) b.flags &= ~F.STUN; }
        if (s.out > 0) { s.out -= dt; if (s.out <= 0) respawn(s); continue; }
        if (s.air > 0) {
          s.air -= dt; const t = 1 - Math.max(0, s.air) / s.airT; b.y = r2(4 * s.airH * t * (1 - t));
          if (s.air <= 0) { b.y = 0; b.flags &= ~F.AIR; if (s.big) { s.big = false; land(s); } }
        } else b.y = 0;
      }
      separate(all().filter(s => s.out <= 0 && s.air <= 0).map(s => s.b));
      for (const s of all()) if (s.out <= 0 && s.air <= 0 && (Math.abs(s.b.x) > A.hw + RULES.edge || Math.abs(s.b.z) > A.hd + RULES.edge)) fallOff(s);
      if (time <= 0) {
        time = 0; endIn = RULES.endPause;
        for (const s of all()) { s.b.flags = (s.b.flags & ~(F.STUN | F.AIR)) | F.FROZEN; s.b.vx = s.b.vz = 0; if (s.out <= 0) s.b.y = 0; }
        events.push({ e: 'end' });
      }
    },
    state() {
      const sc = {}; for (const pid of pids) sc[pid] = S.get(pid).pts;
      const g = { sc, cd: countdown > 0 ? Math.ceil(countdown) : 0, left: Math.ceil(Math.max(0, time)), mega: megaOn ? 1 : 0 };
      if (nBags) g.tg = all().filter(s => s.bag).map(s => [s.id, r2(s.b.x), r2(s.b.z), r2(s.b.y), s.b.flags]);
      return g;
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const pid of pids) { const v = S.get(pid).pts; scores[pid] = v; if (!groups.has(v)) groups.set(v, []); groups.get(v).push(pid); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
    who: id => S.get(id),
  };
}
