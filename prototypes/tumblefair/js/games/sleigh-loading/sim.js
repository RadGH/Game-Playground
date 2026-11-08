// SLEIGH LOADING (Winter only) — wrapped presents tumble out of the sky all over a snowy yard (a shadow shows where
// each one will land, and one that lands on your head bonks you). Walk to a present, press A to pick it up, and carry
// it to YOUR sleigh (your colour, at the edge of the yard) to load it. Small presents are 1, big ones 2 (and slow you
// down), a golden one 3. B = TACKLE: a quick shove — hit someone carrying a present and they drop it (it bounces a
// metre or two away, up for grabs). You cannot tackle with your arms full. Most points loaded when the clock runs out wins.
// Alone: Twinkle the CPU elf loads her own sleigh. On easy and normal she is a bit slower than you; on hard she is
// quick and tackles you when you carry past her. Beat her score!
import { makeBody, stepBody, separate, clampToArena, collideObstacles, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

const HW = 7, HD = 7;
// four sleighs, one per seat, in the middle of each side: solid blocks you load from the yard side
export const SLEIGHS = [
  { x: -HW + 0.75, z: 0, hw: 0.75, hd: 1.3, mx: -HW + 2.0, mz: 0, yaw: Math.PI / 2 },
  { x: HW - 0.75, z: 0, hw: 0.75, hd: 1.3, mx: HW - 2.0, mz: 0, yaw: -Math.PI / 2 },
  { x: 0, z: -HD + 0.75, hw: 1.3, hd: 0.75, mx: 0, mz: -HD + 2.0, yaw: 0 },
  { x: 0, z: HD - 0.75, hw: 1.3, hd: 0.75, mx: 0, mz: HD - 2.0, yaw: Math.PI },
];
export const meta = {
  id: 'sleigh-loading', title: 'Sleigh Loading', blurb: 'Catch the presents falling from the sky and load them onto your sleigh!',
  how: ['Presents fall from the sky — watch for the shadows!', 'A = pick up. Carry it to YOUR sleigh to load it.', 'Small 1, big 2 (heavy!), gold 3.', 'B = tackle: make a carrier drop their present.'],
  kind: 'arena', min: 1, max: 4, seconds: 64, scoring: 'points', unit: 'pts', tags: ['action', 'holiday'], season: 'winter', rival: true,
  controls: { stick: true, a: 'Pick up', b: 'Tackle' },
  move: { speed: 5.4, accel: 22, carryMul: 0.85, slowMul: 0.72, stunDrag: 2.4 },
  arena: { shape: 'rect', hw: HW, hd: HD, wall: true, blocks: SLEIGHS.map(s => ({ x: s.x, z: s.z, hw: s.hw, hd: s.hd })) },
  pitch: 60, card: 'card-sleigh-loading', css: true,
};

export const RULES = {
  countdown: 3, play: 58, endPause: 1.6,
  fall: 1.2, every: [0.7, 1.2], maxOnGround: { 1: 5, 2: 5, 3: 6, 4: 7 }, area: 4.6,
  kinds: [{ k: 'small', pts: 1, w: 0.62 }, { k: 'big', pts: 2, w: 0.3 }, { k: 'gold', pts: 3, w: 0.08 }],
  grabR: 1.15, loadR: 1.5, bonkR: 0.75, bonkStun: 0.7,
  tackleCool: 1.3, tackleTime: 0.22, tackleSpeed: 10, tackleR: 1.05, tacklePush: 6.5, tackleStun: 0.6, dropFly: 0.55,
  elf: {
    name: 'Twinkle',
    speed: { easy: 0.62, normal: 0.74, hard: 1.0 },      // of meta.move.speed
    think: { easy: 0.9, normal: 0.6, hard: 0.35 },       // seconds she stands about after a grab / load
    tackles: { easy: false, normal: false, hard: true },
  },
};
const r2 = v => Math.round(v * 100) / 100;
const ELF = -1;

export function create({ rng, players, difficulty = 'normal', rivals }) {
  const n = players.length, solo = n === 1, bodies = new Map(), D = RULES.elf.speed[difficulty] ? difficulty : 'normal';
  const A = meta.arena;
  const C = new Map();       // id -> carrier { id, b, sleigh, carry: gift|null, pts, loaded, tackle, tackleCool, stun, prevB, cpu }
  // 2 players face each other across the yard; 3-4 take the sides then the ends
  const seatOf = i => (n === 2 || solo ? [0, 1][i] : i);
  players.forEach((p, i) => {
    const sl = SLEIGHS[seatOf(i)], b = makeBody(r2(sl.mx * 0.55), r2(sl.mz * 0.55), r2(Math.atan2(-sl.mx, -sl.mz)));
    b.flags = F.FROZEN; bodies.set(p.pid, b);
    C.set(p.pid, { id: p.pid, b, sleigh: seatOf(i), carry: null, pts: 0, loaded: 0, tackle: 0, tackleCool: 0, stun: 0, prevB: 0, hit: new Set(), cpu: false });
  });
  const elfOn = solo && rivals !== false;          // "Rival when alone" off: no Twinkle, just you and the presents
  if (elfOn) {
    const sl = SLEIGHS[1], b = makeBody(r2(sl.mx * 0.55), 0, -Math.PI / 2); b.flags = F.FROZEN;
    C.set(ELF, { id: ELF, b, sleigh: 1, carry: null, pts: 0, loaded: 0, tackle: 0, tackleCool: 0, stun: 0, prevB: 0, hit: new Set(), cpu: true, wait: 0, aim: null });
  }
  const elfMove = { ...meta.move, speed: meta.move.speed * RULES.elf.speed[D] };
  let gifts = [], gid = 0, nextDrop = 0.3, countdown = RULES.countdown, lastCount = 4, time = RULES.play, over = false, endIn = -1;
  const events = [];
  const live = () => countdown <= 0 && endIn < 0;
  const weightPick = () => { let r = rng(), acc = 0; for (const k of RULES.kinds) { acc += k.w; if (r < acc) return k; } return RULES.kinds[0]; };
  const carrierFlags = c => (c.carry ? (F.CARRY | (c.carry.kind === 'big' ? F.SLOW : 0)) : 0);
  function setCarry(c, gift) { c.carry = gift; c.b.flags = (c.b.flags & ~(F.CARRY | F.SLOW)) | carrierFlags(c); }

  function spot() {
    for (let k = 0; k < 20; k++) {
      const x = r2(rng.range(-RULES.area, RULES.area)), z = r2(rng.range(-RULES.area, RULES.area));
      if (gifts.some(g => Math.hypot(g.x - x, g.z - z) < 1.3)) continue;
      return [x, z];
    }
    return [r2(rng.range(-RULES.area, RULES.area)), r2(rng.range(-RULES.area, RULES.area))];
  }
  function drop() {
    const ground = gifts.filter(g => !g.held).length;
    if (ground >= RULES.maxOnGround[n]) return;
    const [x, z] = spot(), kind = weightPick();
    const g = { id: ++gid, x, z, kind: kind.k, pts: kind.pts, fall: RULES.fall, held: null };
    gifts.push(g); events.push({ e: 'drop', id: g.id, x, z, kind: g.kind });
  }
  function land(g) {
    g.fall = 0; events.push({ e: 'land', id: g.id, x: g.x, z: g.z });
    for (const c of C.values()) {
      if (Math.hypot(c.b.x - g.x, c.b.z - g.z) > RULES.bonkR) continue;
      c.stun = RULES.bonkStun; c.b.flags |= F.STUN; c.b.vx *= 0.2; c.b.vz *= 0.2;
      events.push({ e: 'bonk', id: c.id, x: g.x, z: g.z });
      if (c.carry) { const dx = c.b.x - g.x, dz = c.b.z - g.z, d = Math.hypot(dx, dz); dropCarried(c, d > 1e-3 ? dx / d : 1, d > 1e-3 ? dz / d : 0); }   // a bonk on the head: you drop what you hold
    }
  }
  function grab(c) {
    let best = null, bd = RULES.grabR;
    for (const g of gifts) { if (g.held || g.fall > 0) continue; const d = Math.hypot(g.x - c.b.x, g.z - c.b.z); if (d < bd) { bd = d; best = g; } }
    if (!best) { if (!c.cpu) events.push({ e: 'miss', id: c.id, to: c.id }); return false; }
    best.held = c.id; setCarry(c, best); events.push({ e: 'grab', id: c.id, gift: best.id, kind: best.kind });
    return true;
  }
  function dropCarried(c, ux, uz) {
    const g = c.carry; if (!g) return;
    setCarry(c, null); g.held = null;
    // it pops out a step the way the tackle pushed, clamped into the yard (never into a sleigh)
    let x = c.b.x + ux * 1.6, z = c.b.z + uz * 1.6;
    x = Math.max(-HW + 1, Math.min(HW - 1, x)); z = Math.max(-HD + 1, Math.min(HD - 1, z));
    for (const s of SLEIGHS) if (Math.abs(x - s.x) < s.hw + 0.5 && Math.abs(z - s.z) < s.hd + 0.5) { x = s.mx; z = s.mz; }
    g.x = r2(x); g.z = r2(z); g.fall = RULES.dropFly;
    events.push({ e: 'spill', id: c.id, gift: g.id, x: g.x, z: g.z });
  }
  function load(c) {
    const g = c.carry, sl = SLEIGHS[c.sleigh];
    if (!g || Math.hypot(c.b.x - sl.mx, c.b.z - sl.mz) > RULES.loadR) return;
    setCarry(c, null); gifts = gifts.filter(x => x !== g);
    c.pts += g.pts; c.loaded++;
    events.push({ e: 'load', id: c.id, sleigh: c.sleigh, kind: g.kind, pts: g.pts });
  }
  function tackle(c, mx, mz) {
    let dx = mx, dz = mz; const m = Math.hypot(dx, dz);
    if (m > 0.2) { dx /= m; dz /= m; } else { dx = Math.sin(c.b.yaw); dz = Math.cos(c.b.yaw); }
    c.tackle = RULES.tackleTime; c.tackleCool = RULES.tackleCool; c.hit.clear();
    c.b.vx = dx * RULES.tackleSpeed; c.b.vz = dz * RULES.tackleSpeed; c.b.yaw = Math.atan2(dx, dz);
    events.push({ e: 'tackle', id: c.id });
  }
  function elfThink(c, dt) {
    const b = c.b; if (b.flags & F.FROZEN) return;
    if (c.stun > 0) { stepBody(b, null, elfMove, A); return; }
    if (c.wait > 0) { c.wait -= dt; stepBody(b, null, elfMove, A); return; }
    let tx, tz;
    if (c.carry) { const sl = SLEIGHS[c.sleigh]; tx = sl.mx; tz = sl.mz; }
    else {
      // the nearest landed (or nearly landed) present, worth a bit more if it is gold
      let best = null, bs = 1e9;
      for (const g of gifts) { if (g.held || g.fall > 0.4) continue; const s = Math.hypot(g.x - b.x, g.z - b.z) / (0.7 + g.pts * 0.3); if (s < bs) { bs = s; best = g; } }
      if (!best) { tx = 0; tz = 0; } else { tx = best.x; tz = best.z; if (Math.hypot(tx - b.x, tz - b.z) < RULES.grabR - 0.2 && best.fall <= 0) { if (grab(c)) c.wait = RULES.elf.think[D] * 0.5; } }
    }
    // hard: shove a carrying player that comes close
    if (RULES.elf.tackles[D] && !c.carry && c.tackleCool <= 0) {
      for (const o of C.values()) { if (o === c || !o.carry) continue; const dx = o.b.x - b.x, dz = o.b.z - b.z, d = Math.hypot(dx, dz); if (d < 1.8) { tackle(c, dx / d, dz / d); return; } }
    }
    const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
    stepBody(b, d > 0.15 ? { mx: dx / d * Math.min(1, d), mz: dz / d * Math.min(1, d), b: 0 } : null, elfMove, A);
  }
  return {
    bodies, events,
    init: () => ({ solo, sleighs: SLEIGHS, seats: Object.fromEntries([...C.values()].map(c => [c.id, c.sleigh])), elf: elfOn ? { id: ELF, name: RULES.elf.name, sleigh: 1 } : null, left: Math.ceil(time) }),
    input(pid, inp) {
      const c = C.get(pid); if (!c || over) return;
      const b = c.b, bits = inp?.b | 0, pa = (bits & IN.A) && !(c.prevB & IN.A), pb = (bits & IN.B) && !(c.prevB & IN.B); c.prevB = bits;
      if (!live()) { stepBody(b, null, meta.move, A); return; }
      const free = !(b.flags & (F.STUN | F.FROZEN));
      if (pa && free && !c.carry) grab(c);
      if (pb && free && !c.carry && c.tackleCool <= 0) tackle(c, +inp?.mx || 0, +inp?.mz || 0);
      if (c.tackle > 0) stepBody(b, null, { ...meta.move, accel: 0 }, A); else stepBody(b, inp, meta.move, A);
    },
    step(dt) {
      if (over) return;
      if (endIn >= 0) { endIn -= dt; if (endIn <= 0) over = true; return; }
      if (countdown > 0) {
        countdown -= dt; const s = Math.ceil(countdown);
        if (s < lastCount && s > 0) { lastCount = s; events.push({ e: 'count', n: s }); }
        if (countdown <= 0) { for (const c of C.values()) c.b.flags &= ~F.FROZEN; events.push({ e: 'go' }); }
        return;
      }
      time -= dt;
      nextDrop -= dt; if (nextDrop <= 0) { nextDrop = rng.range(RULES.every[0], RULES.every[1]); drop(); }
      for (const g of gifts) if (!g.held && g.fall > 0) { g.fall -= dt; if (g.fall <= 0) land(g); }
      for (const c of C.values()) {
        if (c.tackleCool > 0) c.tackleCool -= dt;
        if (c.stun > 0) { c.stun -= dt; if (c.stun <= 0) c.b.flags &= ~F.STUN; }
        if (c.cpu) elfThink(c, dt);
        if (c.tackle > 0) {
          c.tackle -= dt;
          for (const o of C.values()) {
            if (o === c || c.hit.has(o.id)) continue;
            const dx = o.b.x - c.b.x, dz = o.b.z - c.b.z, d = Math.hypot(dx, dz); if (d > RULES.tackleR) continue;
            c.hit.add(o.id); const ux = dx / (d || 1), uz = dz / (d || 1);
            o.b.vx = ux * RULES.tacklePush; o.b.vz = uz * RULES.tacklePush; o.b.flags |= F.STUN; o.stun = RULES.tackleStun;
            c.b.vx *= 0.3; c.b.vz *= 0.3; c.tackle = 0;
            events.push({ e: 'shove', id: o.id, by: c.id, x: r2(o.b.x), z: r2(o.b.z), drop: o.carry ? 1 : 0 });
            if (o.carry) dropCarried(o, ux, uz);
            break;
          }
        }
        load(c);
      }
      const list = [...C.values()].map(c => c.b); separate(list);
      for (const b of list) { clampToArena(b, A); collideObstacles(b, A); }
      for (const g of gifts) if (g.held != null) { const c = C.get(g.held); g.x = r2(c.b.x); g.z = r2(c.b.z); }
      if (time <= 0) {
        time = 0; endIn = RULES.endPause;
        for (const c of C.values()) { c.b.flags = (c.b.flags & ~F.STUN) | F.FROZEN; c.b.vx = c.b.vz = 0; }
        const elf = C.get(ELF);
        events.push({ e: 'end', ...(elf ? { elf: elf.pts, beat: C.get(players[0].pid).pts > elf.pts ? 1 : 0 } : {}) });
      }
    },
    state() {
      const sc = {}; for (const p of players) sc[p.pid] = C.get(p.pid).pts;
      const g = { sc, gf: gifts.map(x => [x.id, x.x, x.z, RULES.kinds.findIndex(k => k.k === x.kind), x.held ?? 0, x.fall > 0 ? Math.round(x.fall * 100) / 100 : 0]), cd: countdown > 0 ? Math.ceil(countdown) : 0, left: Math.ceil(Math.max(0, time)) };
      const ld = {}; for (const c of C.values()) ld[c.id] = c.loaded; g.ld = ld;
      if (elfOn) { const e = C.get(ELF); g.elf = [r2(e.b.x), r2(e.b.z), r2(e.b.yaw), e.b.flags, e.pts]; }
      return g;
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) { const v = C.get(p.pid).pts; scores[p.pid] = v; if (!groups.has(v)) groups.set(v, []); groups.get(v).push(p.pid); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
    carrier: id => C.get(id), get gifts() { return gifts; }, get elfScore() { return C.get(ELF)?.pts ?? null; },
  };
}
