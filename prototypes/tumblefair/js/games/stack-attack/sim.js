// STACK ATTACK — a square toy platform with a coloured pad in each corner, one per player. Blocks drop in the middle.
// A picks up the nearest block (you walk slower carrying it) and A again puts it down: on your own pad it goes on top
// of your tower, anywhere else it just sits on the floor. With empty hands, A on someone else's pad takes the top block
// off THEIR tower. B is a shove: a quick lunge that knocks over whoever is in front of you, and makes them drop what
// they carry. Gold blocks count double. Tallest tower when the clock runs out wins.
import { makeBody, stepBody, separate, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'stack-attack', title: 'Stack Attack', blurb: 'Grab, carry, and stack blocks to build the tallest tower!',
  how: ['GRAB a block in the middle, carry it to your pad, press GRAB again to stack it.', 'Gold blocks count double.', 'SHOVE a carrier to make them drop it. Grab from a rival pad to steal their top block!'],
  kind: 'arena', min: 1, max: 4, seconds: 60, scoring: 'points', unit: 'blocks', tags: ['action'],
  controls: { stick: true, a: 'Grab', b: 'Shove' }, move: { speed: 6.3, accel: 28, carryMul: 0.72, stunDrag: 3 },
  arena: { shape: 'rect', hw: 8, hd: 8, wall: true }, pitch: 58, card: 'card-stack-attack',
};

/** Pad centre per seat (seat 0 back-left, 1 back-right, 2 front-left, 3 front-right; +z is toward the camera). */
export const PADS = [{ x: -5.9, z: -5.9 }, { x: 5.9, z: -5.9 }, { x: -5.9, z: 5.9 }, { x: 5.9, z: 5.9 }];
export const RULES = {
  padHalf: 1.45,             // a pad is a 2.9 m square
  reach: 1.35,               // grab distance to a block's centre
  spawnEvery: 0.8, spawnBox: 2.6, gold: 0.15,
  shoveCool: 1.4, shoveLunge: 9, shoveR: 1.5, shoveCone: 0.35, shovePush: 8, shoveStun: 0.55,
  keepFree: 2,               // free blocks kept in play: players + this
};
const r2 = v => Math.round(v * 100) / 100;
export const onPad = (x, z, seat, pad = PADS[seat]) => Math.abs(x - pad.x) <= RULES.padHalf && Math.abs(z - pad.z) <= RULES.padHalf;

export function create({ rng, players }) {
  const bodies = new Map(), seatOf = new Map(), padOf = new Map();
  players.forEach(p => { const pad = PADS[p.seat]; seatOf.set(p.pid, p.seat); padOf.set(p.pid, pad); bodies.set(p.pid, makeBody(pad.x * 0.62, pad.z * 0.62, Math.atan2(-pad.x, -pad.z))); });
  const P = new Map(players.map(p => [p.pid, { prevB: 0, carry: null, shoveCool: 0, stun: 0, tower: [] }]));
  let blocks = [], bid = 0, nextSpawn = 0.2, time = meta.seconds, over = false, towersDirty = true;
  const events = [];
  const score = pid => P.get(pid).tower.reduce((a, v) => a + v, 0);
  const freeBlocks = () => blocks.filter(b => b.by < 0);
  function dropCarried(pid, nx = 0, nz = 0) {
    const s = P.get(pid), b = bodies.get(pid), blk = s.carry; if (!blk) return null;
    s.carry = null; b.flags &= ~F.CARRY; blk.by = -1;
    const lim = meta.arena.hw - 0.6;
    blk.x = r2(Math.max(-lim, Math.min(lim, b.x + nx))); blk.z = r2(Math.max(-lim, Math.min(lim, b.z + nz)));
    return blk;
  }
  function spawnBlock() {
    const B = RULES.spawnBox; let x = 0, z = 0;
    for (let k = 0; k < 8; k++) { x = rng.range(-B, B); z = rng.range(-B, B); if (!freeBlocks().some(o => Math.hypot(o.x - x, o.z - z) < 1)) break; }
    blocks.push({ id: ++bid, x: r2(x), z: r2(z), gold: rng.chance(RULES.gold) ? 1 : 0, by: -1 });
  }
  function grab(pid) {
    const s = P.get(pid), b = bodies.get(pid);
    if (s.carry) {                                                   // put it down
      if (onPad(b.x, b.z, 0, padOf.get(pid))) {
        const blk = s.carry; s.carry = null; b.flags &= ~F.CARRY;
        blocks = blocks.filter(o => o !== blk); s.tower.push(blk.gold ? 2 : 1); towersDirty = true;
        events.push({ e: 'stack', pid, gold: blk.gold, h: s.tower.length });
      } else { dropCarried(pid, Math.sin(b.yaw) * 0.8, Math.cos(b.yaw) * 0.8); events.push({ e: 'drop', pid }); }
      return;
    }
    let best = null, bd = RULES.reach;                               // pick up the nearest free block
    for (const blk of freeBlocks()) { const d = Math.hypot(blk.x - b.x, blk.z - b.z); if (d <= bd) { bd = d; best = blk; } }
    if (best) { best.by = pid; s.carry = best; b.flags |= F.CARRY; events.push({ e: 'pick', pid, gold: best.gold }); return; }
    for (const q of players) {                                       // or steal the top of a rival's tower
      if (q.pid === pid) continue; const t = P.get(q.pid).tower;
      if (t.length && onPad(b.x, b.z, 0, padOf.get(q.pid))) {
        const v = t.pop(); towersDirty = true;
        const blk = { id: ++bid, x: r2(b.x), z: r2(b.z), gold: v === 2 ? 1 : 0, by: pid }; blocks.push(blk);
        s.carry = blk; b.flags |= F.CARRY; events.push({ e: 'steal', pid, from: q.pid, gold: blk.gold });
        return;
      }
    }
  }
  function shove(pid) {
    const s = P.get(pid), b = bodies.get(pid), fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    s.shoveCool = RULES.shoveCool; b.vx = fx * RULES.shoveLunge; b.vz = fz * RULES.shoveLunge;
    events.push({ e: 'shove', pid });
    for (const [qid, c] of bodies) {
      if (qid === pid) continue;
      const dx = c.x - b.x, dz = c.z - b.z, d = Math.hypot(dx, dz); if (d > RULES.shoveR || d < 1e-3) continue;
      if ((dx * fx + dz * fz) / d < RULES.shoveCone) continue;       // only in front of you
      const q = P.get(qid); c.vx = dx / d * RULES.shovePush; c.vz = dz / d * RULES.shovePush; c.flags |= F.STUN; q.stun = RULES.shoveStun;
      const lost = dropCarried(qid, dx / d * 1.1, dz / d * 1.1);
      events.push({ e: 'bump', pid: qid, by: pid, lost: lost ? 1 : 0 });
    }
  }
  return {
    bodies, events,
    init: () => ({ pads: players.map(p => [p.pid, p.seat]), tw: Object.fromEntries(players.map(p => [p.pid, P.get(p.pid).tower.join('')])), left: Math.ceil(time) }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(s.prevB & IN.A), pb = (bits & IN.B) && !(s.prevB & IN.B); s.prevB = bits;
      const free = !(b.flags & F.STUN);
      if (pa && free) grab(pid);
      if (pb && free && s.shoveCool <= 0) shove(pid);
      stepBody(b, inp, meta.move, meta.arena);
    },
    step(dt) {
      if (over) return;
      separate(bodies.values());
      for (const [pid, b] of bodies) {
        const s = P.get(pid);
        if (s.shoveCool > 0) s.shoveCool -= dt;
        if (s.stun > 0) { s.stun -= dt; if (s.stun <= 0) b.flags &= ~F.STUN; }
        if (s.carry) { s.carry.x = r2(b.x); s.carry.z = r2(b.z); }
      }
      nextSpawn -= dt;
      if (nextSpawn <= 0) { nextSpawn = RULES.spawnEvery; if (freeBlocks().length < players.length + RULES.keepFree) spawnBlock(); }
      time -= dt;
      if (time <= 0) { time = 0; over = true; for (const b of bodies.values()) { b.flags |= F.FROZEN; b.vx = b.vz = 0; } }
    },
    state() {
      const g = { k: blocks.map(b => [b.id, b.x, b.z, b.gold, b.by]), sc: {}, left: Math.ceil(time) };
      for (const p of players) g.sc[p.pid] = score(p.pid);
      if (towersDirty) { towersDirty = false; g.tw = {}; for (const p of players) g.tw[p.pid] = P.get(p.pid).tower.join(''); }
      return g;
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) { const k = score(p.pid); scores[p.pid] = k; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p.pid); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
  };
}
