// METEOR DASH — a floating island of hexagonal rock over lava. Meteors fall on it: a warning ring grows on the ground
// for 1.2 s, then the rock lands, knocks everyone nearby away and cracks or smashes the tiles under it. A smashed tile
// is a hole; walk onto a hole (or off the edge) and you fall into the lava and are out. The meteors come faster as the
// clock runs, and from 12 s on the edge of the island crumbles inward. Button A is a short hop: in the air you float
// over holes and the blast cannot push you. Last one standing wins; alone, survive as long as you can.
import { makeBody, stepBody, separate, spawnRing, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'meteor-dash', title: 'Meteor Dash', blurb: 'Dodge the falling meteors and be the last one standing!',
  how: ['A red ring means a meteor is about to land there. Get out!', 'Blasts knock you back and smash the floor. Holes drop you in the lava.', 'Press HOP to jump over cracks and blasts.'],
  kind: 'arena', min: 1, max: 4, seconds: 60, scoring: 'survival', unit: 'sec', tags: ['action'],
  controls: { stick: true, a: 'Hop' }, move: { speed: 6, accel: 24, stunDrag: 2.2 },
  arena: { shape: 'circle', r: 8, wall: false }, pitch: 56, card: 'card-meteor-dash',
};

// ---- the island: pointy-top hexes in axial coordinates (q, r); centre x = S*sqrt3*(q + r/2), z = S*1.5*r
export const HEX = 0.9;                       // centre to corner, metres
export const ISLAND_R = 7.8;                  // keep every tile whose centre is inside this
const SQ3 = Math.sqrt(3);
export const hexCentre = (q, r) => ({ x: HEX * SQ3 * (q + r / 2), z: HEX * 1.5 * r });
/** Every tile of the island, in a fixed order (the server and every browser build the same list). */
export function islandTiles() {
  const out = [], n = Math.ceil(ISLAND_R / HEX) + 1;
  for (let r = -n; r <= n; r++) for (let q = -n * 2; q <= n * 2; q++) { const c = hexCentre(q, r); if (Math.hypot(c.x, c.z) <= ISLAND_R) out.push({ q, r, x: c.x, z: c.z }); }
  return out;
}
export const TILES = islandTiles();
const INDEX = new Map(TILES.map((t, i) => [t.q + ',' + t.r, i]));
/** The tile under a point, or -1 (off the island). Standard axial rounding. */
export function tileAt(x, z) {
  const fr = z / (HEX * 1.5), fq = x / (HEX * SQ3) - fr / 2, fs = -fq - fr;
  let q = Math.round(fq), r = Math.round(fr); const s = Math.round(fs);
  const dq = Math.abs(q - fq), dr = Math.abs(r - fr), ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s; else if (dr > ds) r = -q - s;
  return INDEX.get(q + ',' + r) ?? -1;
}

export const RULES = {
  warn: 1.2,                 // seconds a ring shows before its meteor lands
  blast: 2.3,                // knock-back reach of an impact (m)
  smash: 1.05,               // tiles whose centre is this close are destroyed
  crack: 1.95,               // ... this close are cracked (a cracked tile hit again is destroyed)
  push: 10, pushMin: 4,      // knock-back speed at the centre / at the edge of the blast
  stun: 0.55,
  hop: 0.6, hopH: 1.0, hopCool: 1.1,
  fling: 0.42, flingH: 0.8,  // a blast throws you through the air: you fly over the hole it just made
  crumbleFrom: 12, crumbleRate: 0.11, crumbleMin: 2.6, crumbleWarn: 1.4,
  breakDelay: 0.9,           // a tile marked to go shakes this long first
  firstMeteor: 1.6, everyStart: 1.25, everyEnd: 0.38,
};
const r2 = v => Math.round(v * 100) / 100;

export function create({ rng, players }) {
  const n = players.length, bodies = new Map(), spawns = spawnRing(n, n === 1 ? 0 : 3.6);
  players.forEach((p, i) => bodies.set(p.pid, makeBody(spawns[i].x, spawns[i].z, spawns[i].yaw)));
  const hp = new Int8Array(TILES.length).fill(2);           // 2 whole, 1 cracked, 0 gone
  const doom = new Float32Array(TILES.length);              // > 0: seconds until this tile drops (it shakes meanwhile)
  const P = new Map(players.map(p => [p.pid, { prevB: 0, hop: 0, hopDur: 1, hopH: 1, cool: 0, stun: 0, falling: false, vy: 0, outStep: -1, alive: 0 }]));
  let changed = [], meteors = [], mid = 0, nextMeteor = RULES.firstMeteor, time = meta.seconds, elapsed = 0, stepNo = 0, over = false, rim = ISLAND_R + 1;
  const events = [];
  const setHp = (i, v) => { if (hp[i] !== v) { hp[i] = v; changed.push(i, v); } };
  const markDoom = (i, t) => { if (hp[i] > 0 && !(doom[i] > 0)) { doom[i] = t; setHp(i, 1); changed.push(i, 3); } };   // 3 on the wire = "shaking"
  const standing = pid => { const s = P.get(pid), b = bodies.get(pid); return !s.falling && !(b.flags & F.OUT); };
  const living = () => players.filter(p => standing(p.pid));
  function fall(pid) {
    const s = P.get(pid), b = bodies.get(pid);
    s.falling = true; s.vy = 1.5; s.outStep = stepNo; b.flags = (b.flags | F.STUN) & ~F.AIR;
    events.push({ e: 'fall', pid, x: r2(b.x), z: r2(b.z) });
  }
  function impact(m) {
    for (let i = 0; i < TILES.length; i++) {
      if (!hp[i]) continue;
      const d = Math.hypot(TILES[i].x - m.x, TILES[i].z - m.z);
      if (d <= RULES.smash) { setHp(i, 0); doom[i] = 0; } else if (d <= RULES.crack) { if (hp[i] === 1) markDoom(i, RULES.breakDelay * 0.5); else setHp(i, 1); }
    }
    for (const [pid, b] of bodies) {
      const s = P.get(pid); if (!standing(pid) || (b.flags & F.AIR)) continue;
      const dx = b.x - m.x, dz = b.z - m.z, d = Math.hypot(dx, dz); if (d > RULES.blast) continue;
      const nx = d > 0.05 ? dx / d : Math.sin(b.yaw), nz = d > 0.05 ? dz / d : Math.cos(b.yaw);
      const v = RULES.pushMin + (RULES.push - RULES.pushMin) * (1 - d / RULES.blast);
      b.vx = nx * v; b.vz = nz * v; b.flags |= F.STUN | F.AIR; s.stun = RULES.stun;
      s.hop = s.hopDur = RULES.fling; s.hopH = RULES.flingH;
      events.push({ e: 'bonk', pid });
    }
    events.push({ e: 'boom', x: m.x, z: m.z });
  }
  function spawnMeteor() {
    const live = living(); let x, z;
    for (let tries = 0; tries < 8; tries++) {
      if (live.length && rng.chance(0.55)) { const b = bodies.get(rng.pick(live).pid); x = b.x + rng.range(-1.6, 1.6); z = b.z + rng.range(-1.6, 1.6); }
      else { const t = TILES[rng.int(0, TILES.length - 1)]; x = t.x; z = t.z; }
      if (Math.hypot(x, z) < Math.min(rim, ISLAND_R) && !meteors.some(m => Math.hypot(m.x - x, m.z - z) < 1.6)) break;
    }
    meteors.push({ id: ++mid, x: r2(x), z: r2(z), left: RULES.warn });
  }
  return {
    bodies, events,
    init: () => ({ tiles: Array.from(hp, (v, i) => (doom[i] > 0 ? 3 : v)), left: Math.ceil(time) }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, press = (bits & IN.A) && !(s.prevB & IN.A); s.prevB = bits;
      if (press && standing(pid) && !(b.flags & (F.AIR | F.STUN)) && s.cool <= 0) { s.hop = s.hopDur = RULES.hop; s.hopH = RULES.hopH; s.cool = RULES.hopCool; b.flags |= F.AIR; events.push({ e: 'hop', pid }); }
      stepBody(b, inp, meta.move, meta.arena);
    },
    step(dt) {
      if (over) return;
      stepNo++; elapsed += dt;
      separate([...bodies].filter(([pid]) => standing(pid)).map(([, b]) => b));
      // meteors: count down, land
      for (const m of meteors) { m.left -= dt; if (m.left <= 0) impact(m); }
      meteors = meteors.filter(m => m.left > 0);
      nextMeteor -= dt;
      if (nextMeteor <= 0) {
        const k = Math.min(1, elapsed / meta.seconds), every = RULES.everyStart + (RULES.everyEnd - RULES.everyStart) * k;
        nextMeteor = every * (n > 2 ? 0.85 : 1);
        spawnMeteor(); if (elapsed > 30 && rng.chance(0.35)) spawnMeteor();
      }
      // the edge crumbles inward
      if (elapsed > RULES.crumbleFrom) {
        rim = Math.max(RULES.crumbleMin, ISLAND_R + 0.4 - (elapsed - RULES.crumbleFrom) * RULES.crumbleRate);
        for (let i = 0; i < TILES.length; i++) if (hp[i] && !(doom[i] > 0) && Math.hypot(TILES[i].x, TILES[i].z) > rim) markDoom(i, RULES.crumbleWarn);
      }
      for (let i = 0; i < TILES.length; i++) if (doom[i] > 0) { doom[i] -= dt; if (doom[i] <= 0) { doom[i] = 0; setHp(i, 0); } }
      // players: hops, stuns, what is under their feet
      for (const p of players) {
        const pid = p.pid, b = bodies.get(pid), s = P.get(pid);
        if (s.cool > 0) s.cool -= dt;
        if (s.falling) {
          if (!(b.flags & F.OUT)) { s.vy -= 26 * dt; b.y += s.vy * dt; if (b.y < -7) { b.flags = F.OUT; b.vx = b.vz = 0; } }
          continue;
        }
        if (s.stun > 0) { s.stun -= dt; if (s.stun <= 0) b.flags &= ~F.STUN; }
        if (s.hop > 0) {
          s.hop -= dt; const t = 1 - Math.max(0, s.hop) / s.hopDur; b.y = r2(4 * s.hopH * t * (1 - t));
          if (s.hop <= 0) { b.y = 0; b.flags &= ~F.AIR; }
        }
        if (!(b.flags & F.AIR)) { const i = tileAt(b.x, b.z); if (i < 0 || hp[i] === 0) fall(pid); }
        if (!s.falling) s.alive = elapsed;
      }
      time -= dt;
      const left = living().length, dropping = players.some(p => P.get(p.pid).falling && !(bodies.get(p.pid).flags & F.OUT));
      if (((n > 1 && left <= 1) || left === 0) && !dropping || time <= 0) {      // let a fall play out before the end
        time = Math.max(0, time); over = true;
        for (const b of bodies.values()) if (!(b.flags & F.OUT)) { b.flags |= F.FROZEN; b.vx = b.vz = 0; }
        for (const p of living()) events.push({ e: 'win', pid: p.pid });
      }
    },
    state() {
      const d = changed; changed = [];
      const sc = {}; for (const p of players) sc[p.pid] = Math.floor(P.get(p.pid).alive);
      return { d, m: meteors.map(m => [m.id, m.x, m.z, r2(m.left)]), sc, out: players.filter(p => !standing(p.pid)).map(p => p.pid), left: Math.ceil(time) };
    },
    get over() { return over; },
    result() {
      const scores = {}; for (const p of players) scores[p.pid] = Math.floor(P.get(p.pid).alive);
      // standing players share first; the fallen are ranked by when they fell (later = better), same step = tie
      const groups = new Map();
      for (const p of players) { const s = P.get(p.pid), k = s.falling ? s.outStep : Infinity; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p.pid); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
  };
}
