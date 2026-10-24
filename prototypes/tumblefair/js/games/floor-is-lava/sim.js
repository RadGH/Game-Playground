// FLOOR IS LAVA — a toy-room floor dotted with things to stand on: squashy cushions, footstools, toy boxes and flat
// rocks. The floor is safe to walk on… until it glows (the WARNING), then it turns to bubbling lava for a few seconds.
// Be up on something when it does! Anyone with a foot on the lava hops off with a hot-foot and is out.
//   A        jump. TAP = a short hop; keep A held = a LONG jump (further and higher) for the bigger gaps.
//   B        shove whoever is in front of you (a stumbling player can slide right off their cushion).
//   crumble  a thing you stand on while the floor is hot wears out (cracks, then it sinks), so keep hopping.
// Between waves the floor cools: climb down, find a better spot; a fresh rock or cushion may pop up. Every wave is
// longer, and from wave 6 the lava stays. Last one on their feet wins (scores are seconds survived). Solo: last as
// long as you can (bronze 30 s, silver 45 s, gold 60 s).
import { makeBody, stepBody, separate, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

const HW = 8.5, HD = 6.5;
export const meta = {
  id: 'floor-is-lava', title: 'Floor Is Lava', blurb: 'The floor turns to lava in waves — jump between the cushions and rocks and be the last one standing!',
  how: ['When the floor GLOWS, get up on something: lava is coming!', 'Press A to hop. Keep A held to jump FAR. B shoves.', 'Things you stand on crumble while it is hot: keep hopping.', 'Touch the lava and you are out. Last one standing wins!'],
  kind: 'arena', min: 1, max: 4, seconds: 72, scoring: 'survival', unit: 's', tags: ['action'], card: 'card-floor-is-lava', css: true,
  controls: { stick: true, a: 'Jump', b: 'Shove' }, move: { speed: 5.2, accel: 26, stunDrag: 2.6, boostMul: 1.6 },
  arena: { shape: 'rect', hw: HW, hd: HD, wall: true }, pitch: 58,
};
/** What you can stand on. r = radius (round) or hw/hd (boxes); h = how high its top is; life = seconds of being stood
 *  on while the floor is hot before it sinks. */
export const KINDS = [
  { id: 'cushion', r: 1.05, h: 0.42, life: 3.2 },
  { id: 'stool', r: 0.78, h: 0.62, life: 2.4 },
  { id: 'box', hw: 0.95, hd: 0.75, h: 0.72, life: 4.2 },
  { id: 'rock', r: 0.92, h: 0.5, life: 6.5 },
];
export const RULES = {
  first: 3.5, warn: 1.8,                                  // the first warning starts this long after GO; each warning lasts `warn`
  lava: { easy: [3.5, 4.5, 5.5, 6.5, 7.5], normal: [4, 5, 6, 7, 8], hard: [4.5, 5.5, 6.5, 7.5, 8.5] },
  cool: { easy: [3.5, 3.2, 3, 2.8], normal: [3, 2.8, 2.5, 2.3], hard: [2.6, 2.4, 2.1, 1.9] },
  wear: { easy: 0.75, normal: 1, hard: 1.25 },            // how fast a stood-on thing wears out
  decay: 0.12,                                            // once the lava stays, everything wears out slowly on its own
  crowd: 0.5,                                             // each extra person on the same thing wears it this much faster
  sinkT: 0.8, riseT: 1.0, onEdge: 0.12,
  hop: { t: 0.42, h: 0.7 }, long: { t: 0.72, h: 1.05, hold: 0.12 },
  shoveCool: 1.2, shoveR: 1.35, shoveAim: 1.6, shoveCone: 1.2, shovePush: 7.2, shoveStun: 0.38,
  burnUp: 3.2, sinkV: 7, outY: -2.6, endAfter: 1.1,
  medals: [30, 45, 60],
};
const r2 = v => Math.round(v * 100) / 100;
const inside = (p, x, z, m = 0) => p.k.r ? Math.hypot(x - p.x, z - p.z) <= p.k.r + m : Math.abs(x - p.x) <= p.k.hw + m && Math.abs(z - p.z) <= p.k.hd + m;
const reach = k => k.r || Math.max(k.hw, k.hd);
/** The floor plan from the seed: `count` things, never touching, every one within a long jump of another. */
export function makeLayout(rng, count) {
  const out = [];
  const fits = (x, z, k) => Math.abs(x) + reach(k) < HW - 0.4 && Math.abs(z) + reach(k) < HD - 0.4 && out.every(o => Math.hypot(o.x - x, o.z - z) > reach(o.k) + reach(k) + 1.0);
  const near = (x, z, k) => !out.length || out.some(o => Math.hypot(o.x - x, o.z - z) - reach(o.k) - reach(k) < 2.8);
  for (let tries = 0; tries < 600 && out.length < count; tries++) {
    const ki = out.length < 2 ? 3 : rng.int(0, KINDS.length - 1), k = KINDS[ki];
    const x = r2(rng.range(-HW + 1.2, HW - 1.2)), z = r2(rng.range(-HD + 1.2, HD - 1.2));
    if (fits(x, z, k) && near(x, z, k)) out.push({ ki, k, x, z });
  }
  return out;
}
/** Where a fresh thing may pop up: clear of the others and of everyone standing about. */
function freeSpot(rng, plats, bodies) {
  for (let t = 0; t < 40; t++) {
    const ki = rng.chance(0.4) ? 3 : rng.int(0, 2), k = KINDS[ki];
    const x = r2(rng.range(-HW + 1.4, HW - 1.4)), z = r2(rng.range(-HD + 1.4, HD - 1.4));
    if (plats.every(o => Math.hypot(o.x - x, o.z - z) > reach(o.k) + reach(k) + 0.8) && [...bodies].every(b => Math.hypot(b.x - x, b.z - z) > reach(k) + 0.8)) return { ki, k, x, z };
  }
  return null;
}

export function create({ rng, players, difficulty = 'normal' }) {
  const D = RULES.lava[difficulty] ? difficulty : 'normal', n = players.length, solo = n === 1;
  const plats = makeLayout(rng, 8 + n).map((p, i) => ({ id: i + 1, ...p, life: p.k.life, y: 0, st: 'up', t: 0 }));
  let pid0 = plats.length;
  const bodies = new Map(), events = [];
  // everyone starts on the floor in a row across the middle (it is not hot yet)
  players.forEach((p, i) => bodies.set(p.pid, makeBody(r2(n === 1 ? 0 : -3 + i * 6 / (n - 1)), 0.4, Math.PI)));
  const P = new Map(players.map(p => [p.pid, { prevB: 0, air: 0, airMax: 0, airH: 0, y0: 0, long: false, heldA: 0, cool: 0, stun: 0, out: false, outAt: -1, vy: 0, on: 0 }]));
  // the waves: a list of [phase, start, end] — warn / lava / cool, then a final warn and lava that never ends
  const LV = RULES.lava[D], CL = RULES.cool[D], sched = [];
  let t0 = RULES.first;
  for (let w = 0; w < LV.length; w++) {
    sched.push(['warn', t0, t0 + RULES.warn, w]); t0 += RULES.warn;
    sched.push(['lava', t0, t0 + LV[w], w]); t0 += LV[w];
    if (w < CL.length) { sched.push(['cool', t0, t0 + CL[w], w]); t0 += CL[w]; }
  }
  const stays = t0;                                        // from here on the lava stays
  sched.push(['lava', stays, 1e9, LV.length]);
  let el = 0, time = meta.seconds - 2, over = false, endIn = -1, lastPhase = 'calm', lastWave = -1;
  const phaseAt = t => { if (t < RULES.first) return ['calm', 0, RULES.first, -1]; for (const s of sched) if (t >= s[1] && t < s[2]) return s; return sched[sched.length - 1]; };
  const hot = () => { const p = phaseAt(el)[0]; return p === 'lava'; };
  const live = pid => !P.get(pid).out;
  const standable = p => p.st === 'up';
  function supportOf(b) {
    let best = null;
    for (const p of plats) if (standable(p) && inside(p, b.x, b.z, RULES.onEdge) && (!best || p.k.h > best.k.h)) best = p;
    return best;
  }
  function burn(pid) {
    const s = P.get(pid), b = bodies.get(pid);
    s.out = true; s.outAt = el; s.vy = RULES.burnUp; s.air = 0; b.flags = (b.flags & ~(F.AIR | F.BOOST)) | F.STUN; b.vx *= 0.3; b.vz *= 0.3;
    events.push({ e: 'burn', pid, x: r2(b.x), z: r2(b.z) });
  }
  const standing = () => players.filter(p => live(p.pid));
  const secs = pid => { const s = P.get(pid); return Math.floor((s.out ? s.outAt : el) + 1e-6); };
  return {
    bodies, events,
    init: () => ({ solo, kinds: KINDS, sched: sched.map(s => [s[0], r2(s[1]), s[2] > 1e8 ? -1 : r2(s[2])]), stays: r2(stays), medals: RULES.medals, left: Math.ceil(time) }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(s.prevB & IN.A), pb = (bits & IN.B) && !(s.prevB & IN.B); s.prevB = bits;
      s.heldA = bits & IN.A ? s.heldA + 0.05 : 0;
      const ready = !s.out && !(b.flags & F.STUN) && endIn < 0;
      if (pa && ready && s.air <= 0) {
        const sp = supportOf(b);
        s.air = 0.0001; s.airMax = RULES.hop.t; s.airH = RULES.hop.h; s.y0 = sp ? sp.k.h : 0; s.long = false; b.flags |= F.AIR;
        events.push({ e: 'jump', pid });
      }
      // still holding A a moment into a hop = it becomes a long jump
      if (s.air > 0 && !s.long && (bits & IN.A) && s.heldA >= RULES.long.hold && s.air < RULES.long.hold + 0.1) { s.long = true; s.airMax = RULES.long.t; s.airH = RULES.long.h; b.flags |= F.BOOST; events.push({ e: 'long', pid }); }
      if (pb && ready && s.cool <= 0) {
        s.cool = RULES.shoveCool;
        let near = null, nd = 99;
        for (const [qid, c] of bodies) { if (qid === pid || !live(qid)) continue; const d = Math.hypot(c.x - b.x, c.z - b.z); let da = Math.atan2(c.x - b.x, c.z - b.z) - b.yaw; da = Math.abs(Math.atan2(Math.sin(da), Math.cos(da))); if (d <= RULES.shoveR + 0.3 && da <= RULES.shoveAim && d < nd) { nd = d; near = c; } }
        if (near) b.yaw = Math.atan2(near.x - b.x, near.z - b.z);
        const hit = [];
        for (const [qid, c] of bodies) {
          if (qid === pid || !live(qid)) continue;
          const dx = c.x - b.x, dz = c.z - b.z, d = Math.hypot(dx, dz); let da = Math.atan2(dx, dz) - b.yaw; da = Math.abs(Math.atan2(Math.sin(da), Math.cos(da)));
          if (d > RULES.shoveR || da > RULES.shoveCone) continue;
          const q = P.get(qid); c.vx = dx / (d || 1) * RULES.shovePush; c.vz = dz / (d || 1) * RULES.shovePush; c.flags |= F.STUN; q.stun = RULES.shoveStun; hit.push(qid);
        }
        events.push({ e: 'shove', pid, hit });
      }
      stepBody(b, s.out ? null : inp, meta.move, meta.arena);
    },
    step(dt) {
      if (over) return;
      const sinkOut = () => { for (const [pid, b] of bodies) { const s = P.get(pid); if (s.out && !(b.flags & F.OUT)) { s.vy -= RULES.sinkV * dt; b.y = r2(b.y + s.vy * dt); if (b.y < RULES.outY) { b.flags = F.OUT; b.vx = b.vz = 0; } } } };
      if (endIn >= 0) { endIn -= dt; sinkOut(); if (endIn <= 0) over = true; return; }
      el += dt; time -= dt;
      const ph = phaseAt(el);
      if (ph[0] !== lastPhase || ph[3] !== lastWave) { lastPhase = ph[0]; lastWave = ph[3]; events.push({ e: 'phase', p: ph[0], w: ph[3], stays: ph[0] === 'lava' && ph[2] > 1e8 }); }
      const isHot = ph[0] === 'lava', worn = isHot;
      separate([...bodies].filter(([pid]) => live(pid)).map(([, b]) => b));
      const load = new Map();
      for (const [pid, b] of bodies) {
        const s = P.get(pid);
        if (s.cool > 0) s.cool -= dt;
        if (s.stun > 0) { s.stun -= dt; if (s.stun <= 0) b.flags &= ~F.STUN; }
        if (s.out) continue;
        if (s.air > 0) {
          s.air += dt; const u = Math.min(1, s.air / s.airMax);
          b.y = r2(s.y0 * (1 - u) + 4 * s.airH * u * (1 - u));
          if (u < 1) continue;
          s.air = 0; b.flags &= ~(F.AIR | F.BOOST); s.long = false; events.push({ e: 'land', pid });
        }
        const sp = supportOf(b);
        b.y = sp ? sp.k.h : 0; s.on = sp ? sp.id : 0;
        if (!sp && isHot) { burn(pid); continue; }
        if (sp && worn) load.set(sp.id, (load.get(sp.id) || 0) + 1);
      }
      sinkOut();
      // things wear out under feet while it is hot; sinking ones go; rising ones come up
      const stayed = el >= stays;
      for (const p of plats) {
        if (p.st === 'up') {
          const k = load.get(p.id) || 0, rate = (k ? RULES.wear[D] * (1 + RULES.crowd * (k - 1)) : 0) + (stayed ? RULES.decay : 0);
          if (rate) { p.life -= rate * dt; if (p.life <= 0) { p.life = 0; p.st = 'sink'; p.t = 0; events.push({ e: 'sink', id: p.id }); } }
        } else if (p.st === 'sink') { p.t += dt; p.y = -p.k.h * Math.min(1, p.t / RULES.sinkT) - 0.05; if (p.t >= RULES.sinkT) p.st = 'gone'; }
        else if (p.st === 'rise') { p.t += dt; p.y = -p.k.h * (1 - Math.min(1, p.t / RULES.riseT)); if (p.t >= RULES.riseT) { p.st = 'up'; p.y = 0; } }
      }
      for (let i = plats.length - 1; i >= 0; i--) if (plats[i].st === 'gone') plats.splice(i, 1);
      // while the floor is cool (and once it stays, now and then) a fresh thing pops up if the floor is getting bare
      const want = n + 4, up = plats.filter(p => p.st !== 'sink').length;
      if (up < want && (ph[0] === 'cool' || (stayed && Math.floor(el / 3.5) !== Math.floor((el - dt) / 3.5)))) {
        const at = freeSpot(rng, plats, [...bodies.values()].filter((_, i) => live(players[i].pid)));
        if (at && (ph[0] !== 'cool' || Math.floor(el * 2) !== Math.floor((el - dt) * 2))) { const p = { id: ++pid0, ...at, life: at.k.life, y: -at.k.h, st: 'rise', t: 0 }; plats.push(p); events.push({ e: 'rise', id: p.id }); }
      }
      const left = standing().length, sinking = players.some(p => P.get(p.pid).out && !(bodies.get(p.pid).flags & F.OUT));
      if (((!solo && left <= 1) || left === 0 || time <= 0) && !(sinking && time > 0)) {
        time = Math.max(0, time); endIn = RULES.endAfter;
        for (const [pid, b] of bodies) if (live(pid)) { b.flags = (b.flags & ~(F.AIR | F.BOOST)) | F.FROZEN; b.vx = b.vz = 0; }
        events.push({ e: 'end', win: !solo && left === 1 ? standing()[0].pid : null, all: left > 1 });
      }
    },
    state() {
      const sc = {}; for (const p of players) sc[p.pid] = secs(p.pid);
      const ph = phaseAt(el);
      // a thing: [id, kind, x, z, wear 0..9 (9 = fresh), y]
      return { sc, lv: ph[0], w: ph[3], nx: ph[2] > 1e8 ? -1 : Math.max(0, Math.ceil(ph[2] - el)), pl: plats.map(p => [p.id, p.ki, p.x, p.z, Math.ceil(p.life / p.k.life * 9), r2(p.y)]), o: players.filter(p => P.get(p.pid).out).map(p => p.pid), left: Math.ceil(Math.max(0, time)) };
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) {
        const s = P.get(p.pid); scores[p.pid] = secs(p.pid);
        const k = s.out ? Math.round(s.outAt * 20) : 1e6;           // still standing first, then who lasted longer
        if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p.pid);
      }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit, ...(solo ? { medal: RULES.medals.filter(m => scores[players[0].pid] >= m).length } : {}) };
    },
    get _el() { return el; }, _plats: plats, _P: P, _phaseAt: phaseAt, get _hot() { return hot(); }, _stays: stays,
  };
}

/** A sensible player, for the tests (and anyone who wants one): get up on the healthiest free thing before the lava,
 *  hop on before what you stand on gives way. skill 0..1: 1 = moves at the warning and long-jumps, 0 = waits for the
 *  lava itself and only hops. Returns { mx, mz, b }. */
const BOT = new WeakMap();
export function lavaBot(g, pid, skill = 1, tick = 0) {
  const b = g.bodies.get(pid), s = g._P.get(pid); if (!b || s.out) return { mx: 0, mz: 0, b: 0 };
  const mem = BOT.get(s) || {}; BOT.set(s, mem);
  const ph = g._phaseAt(g._el)[0], danger = ph === 'lava' || (skill > 0.5 && ph === 'warn');
  const on = g._plats.find(p => p.id === s.on);
  const others = [...g.bodies.entries()].filter(([q]) => q !== pid).map(([, c]) => c);
  const score = p => p.life / p.k.life * 3 - Math.hypot(p.x - b.x, p.z - b.z) * 0.35 - (others.some(c => inside(p, c.x, c.z, 0.2)) ? 1.5 : 0);
  const pick = g._plats.filter(p => p.st === 'up' && p.id !== s.on && p.life > 0.8 && (!s.on || Math.hypot(p.x - b.x, p.z - b.z) - reach(p.k) < (skill > 0.5 ? 4.6 : 1.8))).sort((a, c) => score(c) - score(a))[0];
  if (!danger) { if (!pick) return { mx: 0, mz: 0, b: 0 }; const dx = pick.x - b.x, dz = pick.z - b.z, d = Math.hypot(dx, dz) || 1; return d < 0.3 ? { mx: 0, mz: 0, b: 0 } : { mx: dx / d, mz: dz / d, b: 0 }; }
  if (s.air > 0) {
    // steer for the middle of where we are going, and stop over it
    const hold = mem.long ? IN.A : 0, tgt = (mem.aim && g._plats.find(p => p.id === mem.aim && p.st === 'up')) || pick || on; if (!tgt) return { mx: 0, mz: 0, b: hold };
    const dx = tgt.x - b.x, dz = tgt.z - b.z, d = Math.hypot(dx, dz) || 1;
    return d < 0.3 ? { mx: 0, mz: 0, b: hold } : { mx: dx / d, mz: dz / d, b: hold };
  }
  if (on && (on.life > on.k.life * (skill > 0.5 ? 0.35 : 0.1) || !pick)) {
    // stay put, in the middle
    const dx = on.x - b.x, dz = on.z - b.z, d = Math.hypot(dx, dz);
    return d > 0.25 ? { mx: dx / d * 0.6, mz: dz / d * 0.6, b: 0 } : { mx: 0, mz: 0, b: 0 };
  }
  if (!pick) return { mx: 0, mz: 0, b: 0 };
  const dx = pick.x - b.x, dz = pick.z - b.z, d = Math.hypot(dx, dz) || 1, far = d - reach(pick.k), ux = dx / d, uz = dz / d;
  if (!on) return { mx: ux, mz: uz, b: 0 };
  // walk to the edge facing it, then jump (a long one for a big gap, if we know how)
  const atEdge = !inside(on, b.x + ux * 0.55, b.z + uz * 0.55, 0);
  const long = skill > 0.5 && far > 1.7;
  if (!atEdge && far > 0.6) return { mx: ux, mz: uz, b: 0 };
  mem.aim = pick.id; mem.long = long;
  return { mx: ux, mz: uz, b: (long || tick % 2 === 0) ? IN.A : 0 };
}
