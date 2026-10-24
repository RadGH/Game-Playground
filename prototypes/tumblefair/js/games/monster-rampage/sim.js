// MONSTER RAMPAGE — everyone is a giant monster in a toy town. Knock it down!
//   A   PUNCH the building in front of you (a little aim help turns you to the nearest one in reach): 1 hit, quick.
//   B   STOMP: a hop and a ground-shake. Every building close round you takes a hit (little houses two), and other
//       monsters close by are knocked dizzy. Slower to come back.
// Every hit is 1 point; knocking a building flat pays its bonus (house 2, shop 4, tower 6, the clock tower and the
// windmill 12). Toy tanks roll about firing foam shells and toy helicopters hover over a monster, a red ring on the
// ground warns where their bonk lands: a hit makes you dizzy and costs 2 points (never below 0). Punch a tank for +3
// (it flips and comes back later). A flattened building is rebuilt by the townsfolk after a while.
// Not built: grab-and-throw between monsters (stomp's dizzy push does that job more simply).
//
// Collision: standing buildings are solid boxes. init().arena.blocks holds the ones standing right now; the state's
// `bs` lists every building's hit points (0 = rubble), and the view writes the standing ones into ctx.arena.blocks so
// the phone predicts its own monster against exactly the boxes the server uses.
import { makeBody, stepBody, separate, F, BODY_R } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

const HW = 11, HD = 8;
export const meta = {
  id: 'monster-rampage', title: 'Monster Rampage', blurb: 'You are a giant monster in a toy town — smash the most buildings before time runs out!',
  how: ['A punches the building in front of you. B stomps everything round you.', 'Big landmarks are worth the most. Every hit scores!', 'Tanks and helicopters bonk you: dodge the red rings.'],
  kind: 'arena', min: 1, max: 4, seconds: 64, scoring: 'points', unit: 'points', tags: ['action'], card: 'card-monster-rampage', css: true,
  controls: { stick: true, a: 'Punch', b: 'Stomp' }, move: { speed: 5.0, accel: 24, stunDrag: 3 },
  arena: { shape: 'rect', hw: HW, hd: HD, wall: true }, pitch: 56,
};
/** Building kinds: footprint half-sizes, height (drawn), hit points (normal), bonus for flattening it. */
export const KINDS = [
  { id: 'house', hw: 0.6, hd: 0.55, h: 0.9, hp: 3, bonus: 2 },
  { id: 'shop', hw: 0.85, hd: 0.6, h: 1.1, hp: 4, bonus: 4 },
  { id: 'tower', hw: 0.55, hd: 0.55, h: 1.9, hp: 6, bonus: 6 },
  { id: 'clock', hw: 0.9, hd: 0.9, h: 2.8, hp: 10, bonus: 12, landmark: true },
  { id: 'windmill', hw: 0.8, hd: 0.8, h: 2.5, hp: 10, bonus: 12, landmark: true },
];
export const RULES = {
  hpMul: { easy: 0.8, normal: 1, hard: 1.2 },
  tanks: { easy: 1, normal: 2, hard: 3 }, helis: { easy: 1, normal: 1, hard: 2 },
  tankSpeed: { easy: 1.2, normal: 1.6, hard: 2.0 }, fireEvery: { easy: 4.2, normal: 3.2, hard: 2.6 }, shellV: 6, shellR: 0.6,
  heliEvery: { easy: 6, normal: 4.6, hard: 3.6 }, heliWarn: 1.3, heliR: 1.15, heliSpeed: 3.2,
  punchCool: 0.42, punchReach: 1.15, punchAim: 1.2,
  stompCool: 2.2, stompAir: 0.35, stompR: 1.6, stompStunR: 2.3, stompStun: 0.8, stompPush: 6,
  bonkStun: 0.9, bonkCost: 2, tankPts: 3, tankBack: 5,
  rebuild: 9, endAfter: 1.2, medals: [90, 160, 230],
};
const r2 = v => Math.round(v * 100) / 100;
/** Distance from (x, z) to the edge of a box. */
export const edge = (o, x, z) => Math.hypot(Math.max(0, Math.abs(x - o.x) - o.hw), Math.max(0, Math.abs(z - o.z) - o.hd));
/** The town from the seed: two landmarks, then towers, shops and houses on a loose grid of lots with streets between. */
export function makeTown(rng) {
  const out = [], lots = [];
  for (let gx = -4; gx <= 4; gx++) for (let gz = -3; gz <= 3; gz++) if (!(Math.abs(gx) <= 1 && Math.abs(gz) <= 0)) lots.push([gx * 2.35, gz * 2.2]);
  const order = rng.shuffle(lots);
  const plan = [3, 4, 2, 2, 2, 1, 1, 1, 1, 1, 1, ...Array(13).fill(0)];
  for (const k of plan) {
    for (let i = 0; i < order.length; i++) {
      const [lx, lz] = order[i], K = KINDS[k], x = r2(lx + rng.range(-0.3, 0.3)), z = r2(lz + rng.range(-0.3, 0.3));
      if (Math.abs(x) + K.hw > HW - 0.6 || Math.abs(z) + K.hd > HD - 0.6) continue;
      if (out.some(p => Math.abs(p.x - x) <= p.hw + K.hw + 0.4 && Math.abs(p.z - z) <= p.hd + K.hd + 0.4)) continue;
      if (K.landmark && out.some(o => KINDS[o.k].landmark && Math.hypot(o.x - x, o.z - z) < 9)) continue;
      order.splice(i, 1); out.push({ id: out.length, k, x, z, hw: K.hw, hd: K.hd }); break;
    }
  }
  return out;
}

export function create({ rng, players, difficulty = 'normal' }) {
  const D = RULES.hpMul[difficulty] ? difficulty : 'normal', n = players.length, solo = n === 1;
  const town = makeTown(rng), maxHp = town.map(o => Math.max(2, Math.round(KINDS[o.k].hp * RULES.hpMul[D])));
  const hp = maxHp.slice(), downAt = town.map(() => -1);
  const arena = { ...meta.arena, blocks: [] };
  const syncBlocks = () => { arena.blocks = town.filter((o, i) => hp[i] > 0).map(o => ({ x: o.x, z: o.z, hw: o.hw, hd: o.hd })); };
  syncBlocks();
  const bodies = new Map(), events = [];
  const starts = [[-1.2, -0.0], [1.2, 0.0], [-1.2, 0.0], [1.2, 0.0]];
  players.forEach((p, i) => bodies.set(p.pid, makeBody(n === 1 ? 0 : [-2.2, 2.2, -0.7, 0.7][i], i < 2 ? 0 : 0.01, Math.PI)));
  void starts;
  const P = new Map(players.map(p => [p.pid, { prevB: 0, pts: 0, punch: 0, stomp: 0, air: 0, stun: 0, hits: 0, flat: 0, bonked: 0 }]));
  // the toy army: tanks on the streets, helicopters in the air
  const edgeSpot = i => { const s = [[-HW + 0.8, -HD + 0.8], [HW - 0.8, HD - 0.8], [HW - 0.8, -HD + 0.8], [-HW + 0.8, HD - 0.8]][i % 4]; return { x: s[0], z: s[1] }; };
  const tanks = Array.from({ length: RULES.tanks[D] }, (_, i) => ({ id: i, ...edgeSpot(i), yaw: 0, fire: 2 + i * 1.3, st: 'go', t: 0, tgt: null }));
  const helis = Array.from({ length: RULES.helis[D] }, (_, i) => ({ id: i, x: 0, z: -HD - 2, t: 2.5 + i * 2, tgt: null, rx: 0, rz: 0, warn: -1 }));
  let shells = [], sid = 0;
  let el = 0, time = meta.seconds - 2, over = false, endIn = -1;
  const score = (pid, k) => { const s = P.get(pid); s.pts = Math.max(0, s.pts + k); };
  function hitBuilding(pid, i, dmg) {
    if (hp[i] <= 0) return;
    const d = Math.min(dmg, hp[i]); hp[i] -= d; const s = P.get(pid); s.hits += d; score(pid, d);
    if (hp[i] <= 0) { downAt[i] = el; const bonus = KINDS[town[i].k].bonus; score(pid, bonus); s.flat++; syncBlocks(); events.push({ e: 'flat', pid, id: i, bonus }); }
    else events.push({ e: 'hit', pid, id: i, hp: hp[i] });
  }
  function bonk(pid, by) {
    const b = bodies.get(pid), s = P.get(pid); if (!b || s.stun > 0.3) return;
    b.flags |= F.STUN; s.stun = RULES.bonkStun; s.bonked++; const before = s.pts; score(pid, -RULES.bonkCost);
    events.push({ e: 'bonk', pid, by, lost: before - s.pts, x: r2(b.x), z: r2(b.z) });
  }
  const monsters = () => [...bodies.entries()];
  return {
    bodies, events,
    init: () => ({ arena: { ...meta.arena, blocks: arena.blocks.slice() }, town, kinds: KINDS, maxHp, solo, medals: RULES.medals, stompR: RULES.stompR, heliR: RULES.heliR, left: Math.ceil(time) }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(s.prevB & IN.A), pb = (bits & IN.B) && !(s.prevB & IN.B); s.prevB = bits;
      const ready = !(b.flags & F.STUN) && endIn < 0 && s.air <= 0;
      if (pa && ready && s.punch <= 0) {
        s.punch = RULES.punchCool;
        // aim help: the nearest standing building (or tank) in reach, roughly in front
        let best = -1, bd = 99, tank = null;
        town.forEach((o, i) => { if (hp[i] <= 0) return; const d = edge(o, b.x, b.z); if (d > RULES.punchReach) return; let da = Math.atan2(o.x - b.x, o.z - b.z) - b.yaw; da = Math.abs(Math.atan2(Math.sin(da), Math.cos(da))); if (da <= RULES.punchAim + (d < 0.15 ? 1.5 : 0) && d < bd) { bd = d; best = i; } });
        for (const t of tanks) { if (t.st !== 'go') continue; const d = Math.hypot(t.x - b.x, t.z - b.z) - 0.5; if (d < RULES.punchReach && d < bd) { bd = d; best = -1; tank = t; } }
        if (tank) { b.yaw = Math.atan2(tank.x - b.x, tank.z - b.z); tank.st = 'flip'; tank.t = 0; score(pid, RULES.tankPts); events.push({ e: 'tank', pid, id: tank.id, x: r2(tank.x), z: r2(tank.z) }); }
        else if (best >= 0) { const o = town[best]; b.yaw = Math.atan2(o.x - b.x, o.z - b.z); hitBuilding(pid, best, 1); }
        events.push({ e: 'punch', pid, ok: !!tank || best >= 0 });
      }
      if (pb && ready && s.stomp <= 0) { s.stomp = RULES.stompCool; s.air = RULES.stompAir; b.flags |= F.AIR; events.push({ e: 'hop', pid }); }
      stepBody(b, inp, meta.move, arena);
    },
    step(dt) {
      if (over) return;
      if (endIn >= 0) { endIn -= dt; if (endIn <= 0) over = true; return; }
      el += dt; time -= dt;
      separate([...bodies.values()]);
      for (const [pid, b] of bodies) {
        const s = P.get(pid);
        if (s.punch > 0) s.punch -= dt; if (s.stomp > 0) s.stomp -= dt;
        if (s.stun > 0) { s.stun -= dt; if (s.stun <= 0) b.flags &= ~F.STUN; }
        if (s.air > 0) {
          s.air -= dt; const u = 1 - Math.max(0, s.air) / RULES.stompAir; b.y = r2(Math.sin(u * Math.PI) * 0.55);
          if (s.air <= 0) {
            b.y = 0; b.flags &= ~F.AIR;
            // the stomp lands: buildings round you, monsters near you
            const hit = [];
            town.forEach((o, i) => { if (hp[i] > 0 && edge(o, b.x, b.z) <= RULES.stompR) { hit.push(i); hitBuilding(pid, i, KINDS[o.k].id === 'house' ? 2 : 1); } });
            const dizzy = [];
            for (const [qid, c] of bodies) {
              if (qid === pid) continue; const dx = c.x - b.x, dz = c.z - b.z, d = Math.hypot(dx, dz);
              if (d > RULES.stompStunR) continue; c.vx = dx / (d || 1) * RULES.stompPush; c.vz = dz / (d || 1) * RULES.stompPush; c.flags |= F.STUN; P.get(qid).stun = RULES.stompStun; dizzy.push(qid);
            }
            for (const t of tanks) if (t.st === 'go' && Math.hypot(t.x - b.x, t.z - b.z) <= RULES.stompR + 0.4) { t.st = 'flip'; t.t = 0; score(pid, RULES.tankPts); events.push({ e: 'tank', pid, id: t.id, x: r2(t.x), z: r2(t.z) }); }
            events.push({ e: 'stomp', pid, x: r2(b.x), z: r2(b.z), hit, dizzy });
          }
        }
      }
      // tanks: roll toward the nearest monster, stop at range, fire a slow foam shell
      for (const t of tanks) {
        t.t += dt;
        if (t.st === 'flip') { if (t.t >= RULES.tankBack) { Object.assign(t, edgeSpot(t.id + Math.floor(el)), { st: 'go', t: 0, fire: 2 }); events.push({ e: 'tankback', id: t.id }); } continue; }
        let tgt = null, td = 99; for (const [, c] of monsters()) { const d = Math.hypot(c.x - t.x, c.z - t.z); if (d < td) { td = d; tgt = c; } }
        if (!tgt) continue;
        const want = Math.atan2(tgt.x - t.x, tgt.z - t.z); let dy = want - t.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); t.yaw += Math.max(-2 * dt, Math.min(2 * dt, dy));
        if (td > 4.5) {
          const nx = t.x + Math.sin(t.yaw) * RULES.tankSpeed[D] * dt, nz = t.z + Math.cos(t.yaw) * RULES.tankSpeed[D] * dt;
          const blocked = arena.blocks.some(o => edge(o, nx, nz) < 0.45);
          if (!blocked) { t.x = r2(Math.max(-HW + 0.5, Math.min(HW - 0.5, nx))); t.z = r2(Math.max(-HD + 0.5, Math.min(HD - 0.5, nz))); }
          else t.yaw += 1.2 * dt * (t.id % 2 ? 1 : -1);
        }
        t.fire -= dt;
        if (t.fire <= 0 && td < 7.5 && Math.abs(dy) < 0.5) { t.fire = RULES.fireEvery[D]; shells.push({ id: ++sid, x: t.x, z: t.z, vx: Math.sin(t.yaw) * RULES.shellV, vz: Math.cos(t.yaw) * RULES.shellV, life: 1.6 }); events.push({ e: 'fire', id: t.id }); }
      }
      for (const sh of shells) {
        sh.x += sh.vx * dt; sh.z += sh.vz * dt; sh.life -= dt;
        if (arena.blocks.some(o => edge(o, sh.x, sh.z) < 0.1)) { sh.life = 0; continue; }
        for (const [pid, c] of monsters()) if (c.y < 0.3 && Math.hypot(c.x - sh.x, c.z - sh.z) < RULES.shellR) { sh.life = 0; bonk(pid, 'tank'); break; }
      }
      shells = shells.filter(sh => sh.life > 0 && Math.abs(sh.x) < HW + 1 && Math.abs(sh.z) < HD + 1);
      // helicopters: pick a monster, fly over, mark a ring for heliWarn seconds, then bonk inside it
      for (const hl of helis) {
        hl.t -= dt;
        if (hl.warn >= 0) {
          hl.warn -= dt;
          if (hl.warn < 0) { for (const [pid, c] of monsters()) if (Math.hypot(c.x - hl.rx, c.z - hl.rz) <= RULES.heliR) bonk(pid, 'heli'); events.push({ e: 'drop', id: hl.id, x: r2(hl.rx), z: r2(hl.rz) }); hl.t = RULES.heliEvery[D]; hl.tgt = null; }
          continue;
        }
        if (hl.tgt == null && hl.t <= 1.5) { const list = players.map(p => p.pid); hl.tgt = list[(hl.id + Math.floor(el / 3)) % list.length]; }
        const c = hl.tgt != null ? bodies.get(hl.tgt) : null, tx = c ? c.x : Math.sin(el * 0.4 + hl.id * 2) * 6, tz = c ? c.z : -HD + 1 + Math.cos(el * 0.3 + hl.id) * 2;
        const dx = tx - hl.x, dz = tz - hl.z, d = Math.hypot(dx, dz), sp = RULES.heliSpeed * dt;
        if (d > sp) { hl.x = r2(hl.x + dx / d * sp); hl.z = r2(hl.z + dz / d * sp); } else { hl.x = r2(tx); hl.z = r2(tz); }
        if (c && hl.t <= 0 && d < 1.2) { hl.warn = RULES.heliWarn; hl.rx = r2(c.x); hl.rz = r2(c.z); events.push({ e: 'ring', id: hl.id, x: hl.rx, z: hl.rz, pid: hl.tgt }); }
      }
      // the townsfolk rebuild a flattened building when nobody is standing on its lot
      town.forEach((o, i) => {
        if (hp[i] > 0 || el - downAt[i] < RULES.rebuild) return;
        if ([...bodies.values()].some(c => edge(o, c.x, c.z) < BODY_R + 0.2) || tanks.some(t => edge(o, t.x, t.z) < 0.5)) return;
        hp[i] = maxHp[i]; syncBlocks(); events.push({ e: 'rebuilt', id: i });
      });
      if (time <= 0) {
        time = 0; endIn = RULES.endAfter;
        for (const b of bodies.values()) { b.flags = (b.flags & ~F.AIR) | F.FROZEN; b.vx = b.vz = 0; b.y = 0; }
        const best = Math.max(...players.map(p => P.get(p.pid).pts)), top = players.filter(p => P.get(p.pid).pts === best).map(p => p.pid);
        events.push({ e: 'end', win: top.length === 1 && !solo ? top[0] : null });
      }
    },
    state() {
      const sc = {}; for (const p of players) sc[p.pid] = P.get(p.pid).pts;
      return {
        sc, bs: hp.join(','),
        tk: tanks.map(t => [t.x, t.z, r2(t.yaw), t.st === 'go' ? 0 : 1]),
        sh: shells.map(s => [s.id, r2(s.x), r2(s.z)]),
        hl: helis.map(hh => [hh.x, hh.z, hh.warn >= 0 ? 1 : 0, hh.rx, hh.rz]),
        left: Math.ceil(Math.max(0, time)),
      };
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) { const s = P.get(p.pid); scores[p.pid] = s.pts; const k = s.pts * 1000 + Math.min(999, s.flat); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p.pid); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit, ...(solo ? { medal: RULES.medals.filter(m => scores[players[0].pid] >= m).length } : {}) };
    },
    get _el() { return el; }, _town: town, _hp: hp, _P: P, _tanks: tanks, _helis: helis, get _shells() { return shells; }, _arena: arena,
  };
}

/** A sensible monster, for the tests: walks to the best building (value for the walk; landmarks first), punches it,
 *  stomps when several are close, steps out of a helicopter's ring and punches tanks in reach. skill 0..1: low =
 *  wanders to the nearest building, punches slowly, never stomps or dodges. Returns { mx, mz, b }. */
const BOT = new WeakMap();
export function rampageBot(g, pid, skill = 1, tick = 0) {
  const b = g.bodies.get(pid), s = g._P.get(pid); if (!b) return { mx: 0, mz: 0, b: 0 };
  const mem = BOT.get(s) || {}; BOT.set(s, mem);
  const good = skill > 0.5;
  // dodge a ring
  if (good) for (const hl of g._helis) if (hl.warn >= 0 && Math.hypot(b.x - hl.rx, b.z - hl.rz) < 1.9) { const dx = b.x - hl.rx, dz = b.z - hl.rz, d = Math.hypot(dx, dz) || 1; return { mx: dx / d, mz: dz / d, b: 0 }; }
  const live = g._town.map((o, i) => [o, i]).filter(([, i]) => g._hp[i] > 0);
  if (!live.length) return { mx: 0, mz: 0, b: 0 };
  const near = live.filter(([o]) => edge(o, b.x, b.z) <= RULES.stompR).length;
  if (good && near >= 2 && s.stomp <= 0 && tick % 2 === 0) return { mx: 0, mz: 0, b: IN.B };
  const tank = g._tanks.find(t => t.st === 'go' && Math.hypot(t.x - b.x, t.z - b.z) < RULES.punchReach + 0.4);
  const val = ([o, i]) => (KINDS[o.k].bonus + g._hp[i]) / Math.max(1, g._hp[i]) - edge(o, b.x, b.z) * 0.25;
  let tgt = mem.tgt != null && g._hp[mem.tgt] > 0 ? live.find(([, i]) => i === mem.tgt) : null;
  if (!tgt) { tgt = good ? [...live].sort((a, c) => val(c) - val(a))[0] : [...live].sort((a, c) => edge(a[0], b.x, b.z) - edge(c[0], b.x, b.z))[(pid + tick / 200 | 0) % Math.min(2, live.length)]; mem.tgt = tgt[1]; }
  const [o] = tgt, d = edge(o, b.x, b.z), dx = o.x - b.x, dz = o.z - b.z, L = Math.hypot(dx, dz) || 1;
  const rate = good ? 2 : 12;
  if (good && tank && tick % 2 === 0) return { mx: 0, mz: 0, b: IN.A };
  if (d <= RULES.punchReach - 0.2) return { mx: dx / L * 0.2, mz: dz / L * 0.2, b: tick % rate === 0 ? IN.A : 0 };
  // walk to it; slide round others in the way
  return { mx: dx / L, mz: dz / L, b: 0 };
}
