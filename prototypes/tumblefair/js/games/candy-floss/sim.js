// CANDY FLOSS FRENZY — a candy floss machine in the middle of a round stall spins out fluffy puffs that drift about.
// Walk into a puff and it sticks to your stick: your cloud of floss GROWS (and past 6 you waddle slower under it).
// A = BONK the one in front with your stick: half their floss flies off as puffs anyone can grab. Walk back to your
// own striped tub at the edge to BANK your floss (banked floss is safe). Score = banked + still on your stick when the
// bell goes. Golden puffs are worth 3. The last 15 seconds are a SUGAR RUSH: the machine spins out twice as much.
// Works alone the same way (no bonks, just grab and bank).
import { makeBody, stepBody, separate, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'candy-floss', title: 'Candy Floss Frenzy', blurb: 'Grab the floating candy floss, grow a giant cloud and bank it before someone bonks it off!',
  how: ['Walk into floss puffs to grow your cloud. Gold = 3.', 'A = bonk the one in front: half their floss flies off.', 'Bring it to your own tub at the edge to bank it safe.', 'Big clouds are slow — bank often!'],
  kind: 'arena', min: 1, max: 4, seconds: 62, scoring: 'points', unit: 'floss', tags: ['action'],
  controls: { stick: true, a: 'Bonk' },
  move: { speed: 6, accel: 26, carryMul: 0.72, stunDrag: 2.5 },
  arena: { shape: 'circle', r: 7, wall: true, posts: [{ x: 0, z: 0, r: 0.95 }] }, pitch: 58, card: 'card-candy-floss', css: true,
};

export const RULES = {
  countdown: 3, play: 55, endPause: 1.8, rush: 15,
  spawnEvery: 0.55, rushEvery: 0.27, maxPuffs: 14, gold: 0.08, rushGold: 0.15, goldValue: 3,
  puffSpeed: [1.6, 3.2], drag: 0.55, drift: 0.35, pickR: 0.85,
  heavyAt: 6, tubR: 1.3, tubDist: 6.1,
  bonk: { reach: 1.45, perFloss: 0.04, cone: 1.0, cool: 0.9, stun: 0.35, knock: 4.5, share: 0.5 },
};
const r2 = v => Math.round(v * 100) / 100;
/** Where seat-slot i's tub stands (four slots round the edge). */
export const tubAt = i => { const a = Math.PI / 4 + i * Math.PI / 2; return { x: r2(Math.sin(a) * RULES.tubDist), z: r2(Math.cos(a) * RULES.tubDist) }; };

export function create({ rng, players }) {
  const AR = meta.arena, n = players.length, pids = players.map(p => p.pid), bodies = new Map(), S = new Map();
  players.forEach((p, i) => {
    const t = tubAt(i), b = makeBody(r2(t.x * 0.62), r2(t.z * 0.62), Math.atan2(-t.x, -t.z)); b.flags = F.FROZEN; bodies.set(p.pid, b);
    S.set(p.pid, { pid: p.pid, slot: i, b, held: 0, bank: 0, cool: 0, stun: 0, prevA: 0, bonks: 0 });
  });
  let countdown = RULES.countdown, lastCount = 4, time = RULES.play, endIn = -1, over = false, rush = false;
  let puffs = [], pid0 = 0, spawnIn = 0.4;
  const events = [];
  const live = () => countdown <= 0 && endIn < 0;

  function addPuff(x, z, vx, vz, v = 1) { puffs.push({ id: ++pid0, x, z, vx, vz, v }); }
  function spit() {
    const a = rng.range(0, Math.PI * 2), sp = rng.range(RULES.puffSpeed[0], RULES.puffSpeed[1]);
    const gold = rng.chance(rush ? RULES.rushGold : RULES.gold);
    addPuff(r2(Math.sin(a) * 1.1), r2(Math.cos(a) * 1.1), Math.sin(a) * sp, Math.cos(a) * sp, gold ? RULES.goldValue : 1);
  }
  function bonk(s) {
    const b = s.b, B = RULES.bonk; let hit = null, bd = Infinity;
    for (const o of S.values()) {
      if (o === s) continue;
      const dx = o.b.x - b.x, dz = o.b.z - b.z, d = Math.hypot(dx, dz), reach = B.reach + o.held * B.perFloss;
      if (d > reach || d >= bd) continue;
      let a = Math.atan2(dx, dz) - b.yaw; a = Math.atan2(Math.sin(a), Math.cos(a)); if (Math.abs(a) > B.cone) continue;
      hit = o; bd = d;
    }
    if (!hit) { events.push({ e: 'swish', pid: s.pid }); return; }
    const lose = Math.ceil(hit.held * RULES.bonk.share), hb = hit.b;
    hit.held -= lose; s.bonks++;
    const dx = hb.x - b.x, dz = hb.z - b.z, d = Math.hypot(dx, dz) || 1;
    hb.vx = dx / d * B.knock; hb.vz = dz / d * B.knock; hb.flags |= F.STUN; hit.stun = B.stun;
    if (hit.held < RULES.heavyAt) hb.flags &= ~F.CARRY;
    // the lost floss flies off as puffs (several units share a puff when there are many)
    const k = Math.min(lose, 6);
    for (let i = 0; i < k; i++) {
      const v = Math.floor(lose / k) + (i < lose % k ? 1 : 0), a = rng.range(0, Math.PI * 2), sp = rng.range(2, 4);
      addPuff(r2(hb.x), r2(hb.z), Math.sin(a) * sp, Math.cos(a) * sp, v);
    }
    events.push({ e: 'bonk', pid: s.pid, hit: hit.pid, lost: lose, x: r2(hb.x), z: r2(hb.z) });
  }

  return {
    bodies, events,
    init: () => ({ solo: n === 1, tubs: players.map((p, i) => ({ pid: p.pid, ...tubAt(i) })), left: RULES.play }),
    input(pid, inp) {
      const s = S.get(pid); if (!s || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !s.prevA; s.prevA = bits & IN.A;
      if (pa && live() && s.cool <= 0 && !(s.b.flags & F.STUN)) { s.cool = RULES.bonk.cool; bonk(s); }
      stepBody(s.b, live() ? inp : null, meta.move, AR);
    },
    step(dt) {
      if (over) return;
      if (endIn >= 0) { endIn -= dt; if (endIn <= 0) over = true; return; }
      if (countdown > 0) {
        countdown -= dt; const c = Math.ceil(countdown);
        if (c < lastCount && c > 0) { lastCount = c; events.push({ e: 'count', n: c }); }
        if (countdown <= 0) { for (const s of S.values()) s.b.flags &= ~F.FROZEN; events.push({ e: 'go' }); }
        return;
      }
      time -= dt;
      if (!rush && time <= RULES.rush) { rush = true; events.push({ e: 'rush' }); }
      spawnIn -= dt;
      if (spawnIn <= 0) { spawnIn = rush ? RULES.rushEvery : RULES.spawnEvery; if (puffs.length < RULES.maxPuffs) spit(); }
      // puffs drift, slow down to a lazy wander and bounce off the rim and the machine
      for (const P of puffs) {
        const k = Math.max(0, 1 - RULES.drag * dt); P.vx = P.vx * k + rng.range(-1, 1) * RULES.drift * dt * 4; P.vz = P.vz * k + rng.range(-1, 1) * RULES.drift * dt * 4;
        P.x += P.vx * dt; P.z += P.vz * dt;
        const d = Math.hypot(P.x, P.z), lim = AR.r - 0.6;
        if (d > lim) { const nx = P.x / d, nz = P.z / d, dot = P.vx * nx + P.vz * nz; P.x = nx * lim; P.z = nz * lim; if (dot > 0) { P.vx -= 2 * dot * nx; P.vz -= 2 * dot * nz; } }
        if (d < 1.4 && d > 1e-6) { const nx = P.x / d, nz = P.z / d; P.x = nx * 1.4; P.z = nz * 1.4; P.vx += nx * 0.5; P.vz += nz * 0.5; }
        P.x = r2(P.x); P.z = r2(P.z);
      }
      for (const s of S.values()) {
        const b = s.b; s.cool = Math.max(0, s.cool - dt);
        if (s.stun > 0) { s.stun -= dt; if (s.stun <= 0) b.flags &= ~F.STUN; }
        if (!(b.flags & F.STUN)) for (let i = puffs.length - 1; i >= 0; i--) {
          const P = puffs[i]; if (Math.hypot(P.x - b.x, P.z - b.z) > RULES.pickR) continue;
          s.held += P.v; puffs.splice(i, 1); events.push({ e: 'grab', pid: s.pid, v: P.v, x: P.x, z: P.z });
        }
        const t = tubAt(s.slot);
        if (s.held > 0 && Math.hypot(t.x - b.x, t.z - b.z) <= RULES.tubR) { s.bank += s.held; events.push({ e: 'bank', pid: s.pid, v: s.held, x: t.x, z: t.z }); s.held = 0; }
        if (s.held >= RULES.heavyAt) b.flags |= F.CARRY; else b.flags &= ~F.CARRY;
      }
      separate([...S.values()].map(s => s.b));
      if (time <= 0) {
        time = 0; endIn = RULES.endPause;
        for (const s of S.values()) { s.b.flags = (s.b.flags & ~F.STUN) | F.FROZEN; s.b.vx = s.b.vz = 0; }
        events.push({ e: 'end' });
      }
    },
    state() {
      const sc = {}, fl = {}; for (const pid of pids) { const s = S.get(pid); sc[pid] = s.bank + s.held; fl[pid] = s.held; }
      return { sc, fl, pf: puffs.map(P => [P.id, P.x, P.z, P.v]), cd: countdown > 0 ? Math.ceil(countdown) : 0, left: Math.ceil(Math.max(0, time)), rush: rush ? 1 : 0 };
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const pid of pids) { const s = S.get(pid), v = s.bank + s.held; scores[pid] = v; if (!groups.has(v)) groups.set(v, []); groups.get(v).push(pid); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
    who: pid => S.get(pid), get puffs() { return puffs; },
  };
}
