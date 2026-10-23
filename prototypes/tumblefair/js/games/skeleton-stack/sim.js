// SKELETON STACK (Halloween) — a friendly moonlit graveyard with bones scattered on the grass. Everyone has their own
// grave plot (a mound in their seat colour with a headstone). Build a skeleton on it, bottom up, IN ORDER: feet,
// legs, ribs, arms, skull — the next piece you need is shown on your headstone and on your HUD. A picks up the bone
// at your feet (one at a time; carrying slows you a little) or drops the one you hold; walk into your plot holding
// the RIGHT piece and it clicks into place. Finish all five and your skeleton hops up and dances (+3 bonus), and a
// new one starts. B = bonk the player in front of you: they drop their bone and see stars. Most points wins (1 a
// piece, +3 a finished skeleton). Solo: the same graveyard with medal scores to beat.
import { makeBody, stepBody, separate, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'skeleton-stack', title: 'Skeleton Stack', blurb: 'Carry bones to your grave in the right order and build a dancing skeleton!',
  how: ['A picks up a bone (or drops it).', 'Bring the NEXT piece to your plot: feet, legs, ribs, arms, skull.', 'A full skeleton dances: +3 bonus!', 'B bonks someone: they drop their bone.'],
  kind: 'arena', min: 1, max: 4, seconds: 70, scoring: 'points', unit: 'pts', tags: ['action', 'holiday'], season: 'halloween',
  controls: { stick: true, a: 'Grab', b: 'Bonk' }, move: { speed: 5.6, accel: 26, carryMul: 0.78, stunDrag: 2.4 },
  arena: { shape: 'rect', hw: 9, hd: 6.5, wall: true }, pitch: 58, card: 'card-skeleton-stack', css: true,
};

export const PIECES = ['feet', 'legs', 'ribs', 'arms', 'skull'];
export const PLOTS = [[-6.6, -4.2], [6.6, -4.2], [-6.6, 4.2], [6.6, 4.2]];
export const RULES = {
  plotR: 1.45, grabR: 1.25, spare: { easy: 2, normal: 1, hard: 0 }, respawn: 1.4, minGap: 1.1, plotClear: 2.6,
  bonkCool: 1.2, bonkR: 1.55, bonkAim: 1.25, bonkStun: { easy: 0.5, normal: 0.7, hard: 0.85 }, bonkPush: 5, fling: 1.8,
  bonus: 3, medals: { easy: [16, 30, 44], normal: [15, 28, 42], hard: [12, 24, 36] },
};
const r2 = v => Math.round(v * 100) / 100;

export function create({ rng, players, difficulty = 'normal' }) {
  const D = RULES.bonkStun[difficulty] ? difficulty : 'normal';
  const n = players.length, solo = n === 1, bodies = new Map(), { hw, hd } = meta.arena;
  // plots: corners, or (alone) the middle of the back edge
  const plots = solo ? [[0, -4.2]] : PLOTS.slice(0, n);
  players.forEach((p, i) => { const [px, pz] = plots[i], x = px * 0.7, z = pz * 0.55; bodies.set(p.pid, makeBody(x, z, Math.atan2(-x, -z))); });
  const P = new Map(players.map((p, i) => [p.pid, { prevB: 0, plot: i, stage: 0, pieces: 0, skels: 0, carry: -1, cool: 0, stun: 0, wrongAt: -9 }]));
  let bones = [], bid = 0, time = meta.seconds, el = 0, over = false, refill = [];
  const events = [];
  const perKind = n + RULES.spare[D] + (solo ? 1 : 0);
  function spot() {
    for (let k = 0; k < 20; k++) {
      const x = rng.range(-hw + 0.8, hw - 0.8), z = rng.range(-hd + 0.8, hd - 0.8);
      if (plots.some(([px, pz]) => Math.hypot(px - x, pz - z) < RULES.plotClear)) continue;
      if (bones.some(b => Math.hypot(b.x - x, b.z - z) < RULES.minGap)) continue;
      return { x: r2(x), z: r2(z) };
    }
    return { x: r2(rng.range(-2, 2)), z: r2(rng.range(-1.5, 1.5)) };
  }
  const addBone = (kind, at = spot()) => { const b = { id: ++bid, kind, x: at.x, z: at.z, yaw: r2(rng.range(0, 6.28)) }; bones.push(b); return b; };
  for (let k = 0; k < PIECES.length; k++) for (let i = 0; i < perKind; i++) addBone(k);
  const score = s => s.pieces + s.skels * RULES.bonus;
  const clampIn = v => ({ x: r2(Math.max(-hw + 0.5, Math.min(hw - 0.5, v.x))), z: r2(Math.max(-hd + 0.5, Math.min(hd - 0.5, v.z))) });
  function drop(pid, x, z, why) {
    const s = P.get(pid); if (s.carry < 0) return;
    const at = clampIn({ x, z }), b = addBone(s.carry, at); s.carry = -1; bodies.get(pid).flags &= ~F.CARRY;
    events.push({ e: 'drop', pid, id: b.id, kind: b.kind, x: b.x, z: b.z, why });
  }
  return {
    bodies, events,
    init: () => ({ solo, plots, plotR: RULES.plotR, pieces: PIECES, medals: solo ? RULES.medals[D] : null, owners: Object.fromEntries(players.map((p, i) => [p.pid, i])), left: Math.ceil(time) }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(s.prevB & IN.A), pb = (bits & IN.B) && !(s.prevB & IN.B); s.prevB = bits;
      const free = !(b.flags & F.STUN);
      if (pa && free) {
        if (s.carry >= 0) drop(pid, b.x + Math.sin(b.yaw) * 0.7, b.z + Math.cos(b.yaw) * 0.7, 'drop');
        else {
          // the bone you need comes first if two are in reach, then the nearest
          let best = null, bd = 99;
          for (const bn of bones) { const d = Math.hypot(bn.x - b.x, bn.z - b.z) - (bn.kind === s.stage ? 0.35 : 0); if (d < RULES.grabR + (bn.kind === s.stage ? 0.35 : 0) && d < bd) { bd = d; best = bn; } }
          if (best) {
            bones = bones.filter(x => x !== best); s.carry = best.kind; b.flags |= F.CARRY;
            events.push({ e: 'grab', pid, id: best.id, kind: best.kind, right: best.kind === s.stage ? 1 : 0 });
          } else events.push({ e: 'nothing', pid, to: pid });
        }
      }
      if (pb && free && s.cool <= 0) {
        s.cool = RULES.bonkCool;
        let best = null, bd = 99;
        for (const [qid, c] of bodies) {
          if (qid === pid) continue;
          const dx = c.x - b.x, dz = c.z - b.z, d = Math.hypot(dx, dz); if (d > RULES.bonkR || d >= bd) continue;
          let da = Math.atan2(dx, dz) - b.yaw; da = Math.abs(Math.atan2(Math.sin(da), Math.cos(da)));
          if (da <= RULES.bonkAim) { best = qid; bd = d; }
        }
        if (best != null) {
          const c = bodies.get(best), q = P.get(best), dx = c.x - b.x, dz = c.z - b.z, d = Math.hypot(dx, dz) || 1;
          b.yaw = Math.atan2(dx, dz);
          c.vx = dx / d * RULES.bonkPush; c.vz = dz / d * RULES.bonkPush; c.flags |= F.STUN; q.stun = RULES.bonkStun[D];
          const had = q.carry;
          if (had >= 0) drop(best, c.x + dx / d * RULES.fling, c.z + dz / d * RULES.fling, 'bonk');
          events.push({ e: 'bonk', pid, to: best, had, x: r2(c.x), z: r2(c.z) });
        } else events.push({ e: 'swing', pid });
      }
      stepBody(b, inp, meta.move, meta.arena);
    },
    step(dt) {
      if (over) return;
      el += dt; time -= dt;
      separate(bodies.values());
      for (const [pid, b] of bodies) {
        const s = P.get(pid);
        if (s.cool > 0) s.cool -= dt;
        if (s.stun > 0) { s.stun -= dt; if (s.stun <= 0) b.flags &= ~F.STUN; }
        // deliver
        const [px, pz] = plots[s.plot];
        if (s.carry >= 0 && Math.hypot(b.x - px, b.z - pz) <= RULES.plotR) {
          if (s.carry === s.stage) {
            const kind = s.carry; s.carry = -1; b.flags &= ~F.CARRY; s.pieces++; s.stage++;
            refill.push({ kind, at: el + RULES.respawn });
            if (s.stage >= PIECES.length) { s.skels++; s.stage = 0; events.push({ e: 'done', pid, skels: s.skels, x: px, z: pz }); }
            else events.push({ e: 'place', pid, kind, stage: s.stage, x: px, z: pz });
          } else if (el - s.wrongAt > 1.5) { s.wrongAt = el; events.push({ e: 'wrong', pid, need: s.stage, has: s.carry, to: pid }); }
        }
      }
      // a placed bone comes back somewhere else on the grass
      for (const r of refill) if (r.at <= el) { const bn = addBone(r.kind); r.done = true; events.push({ e: 'rise', id: bn.id, kind: bn.kind, x: bn.x, z: bn.z }); }
      refill = refill.filter(r => !r.done);
      if (time <= 0) { time = 0; over = true; for (const b of bodies.values()) { b.flags |= F.FROZEN; b.vx = b.vz = 0; } }
    },
    state() {
      const sc = {}, st = {}, ca = {};
      for (const p of players) { const s = P.get(p.pid); sc[p.pid] = score(s); st[p.pid] = [s.stage, s.skels]; ca[p.pid] = s.carry; }
      return { sc, st, ca, b: bones.map(b => [b.id, b.kind, b.x, b.z, b.yaw]), left: Math.ceil(time) };
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) { const k = score(P.get(p.pid)); scores[p.pid] = k; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p.pid); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
    get bones() { return bones; }, plots, player: pid => P.get(pid),
  };
}
