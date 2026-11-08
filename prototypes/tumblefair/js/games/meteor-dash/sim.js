// METEOR DASH — a floating island of hexagonal rock over lava. ONE idea: stay on the island. Every second you stand on
// it is a point. Meteors fall on it: a red ring shows for 1.3 s, then the rock lands, shoves anyone inside the ring and
// smashes the tiles under it. Walk into a hole (or off the edge) and you drop into the lava — you lose a few seconds and
// pop back up on a safe tile with a short shield (nobody is knocked out, everyone plays the whole minute). Holes crust
// over again after a while; from 15 s the edge crumbles inward to a small middle. Button A is a hop: in the air you float
// over holes and blasts cannot push you. Most seconds standing wins. Alone you race Cinder Sam, a computer fairgoer.
//
// Expansion 1 (M4) rework: it used to be last-one-standing with a blast that flung you 5 m (often into the hole it had
// just made) — even a bot that dodged every ring was out in ~5 s, and in a 2-player match the first fall ended the game
// for both (live average: 7 s of 60, "confusing").
import { makeBody, stepBody, separate, spawnRing, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'meteor-dash', title: 'Meteor Dash', blurb: 'Stay on the crumbling island while meteors fall — most seconds standing wins!',
  how: ['Stay on the island: every second standing is a point.', 'A red ring = a meteor lands there. Step out of it!', 'Fall in a hole and you pop back a few seconds later.', 'HOP floats you over holes and blasts.'],
  kind: 'arena', min: 1, max: 4, seconds: 60, scoring: 'points', unit: 'sec', tags: ['action'], rival: true,
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
  warn: 1.3,                 // seconds a ring shows before its meteor lands
  blast: 2.1,                // shove reach of an impact (m) — the ring drawn on the ground is this big
  smash: 1.05,               // tiles whose centre is this close are destroyed
  crack: 1.95,               // ... this close are cracked (a cracked tile hit again shakes and drops)
  push: 6.5, pushMin: 3,     // shove speed at the centre / at the edge of the blast (was 10 / 4: flung into the hole)
  stun: 0.4,
  hop: 0.6, hopH: 1.0, hopCool: 1.0,
  fling: 0.3, flingH: 0.5,   // a blast lifts you briefly: you clear the hole it just made
  respawn: 3,              // seconds in the lava before you pop back up (the seconds you lose)
  shield: 1.6,               // after popping back: blasts cannot push you
  heal: 10,                  // a smashed hole crusts over and is solid again after this long (if inside the rim)
  crumbleFrom: 15, crumbleRate: 0.08, crumbleMin: 4.3, crumbleWarn: 1.4,
  breakDelay: 0.9,           // a tile marked to go shakes this long first
  firstMeteor: 1.8, everyStart: 1.2, everyEnd: 0.7,
  cpu: { easy: { react: 0.7, speed: 0.8, sees: 0.55 }, normal: { react: 0.45, speed: 0.9, sees: 0.8 }, hard: { react: 0.2, speed: 1, sees: 1 } },   // Cinder Sam: how long a ring shows before he notices it, his pace, the share of rings he notices at all
};
export const CPU_NAME = 'Cinder Sam';
const r2 = v => Math.round(v * 100) / 100;

/** Is the floor solid at (x, z)? hp: tile hit points (0 gone), doom: > 0 shaking. Off the island = no. */
export const solidAt = (hp, doom, x, z) => { const i = tileAt(x, z); return i >= 0 && hp[i] > 0 && !(doom && doom[i] > 0); };

/**
 * A fairgoer's stick (the computer player, and the test bot): it scores standing still and 16 directions — how deep
 * inside a noticed ring the spot ~1 m ahead is, plus a pull toward the middle — and takes the best one whose path is
 * solid floor all the way (no hole, no shaking tile, not off the edge; samples cover the body's width).
 * meteors: [{x, z, left}]. react: seconds a ring must have shown before it is noticed (0 = at once). → { mx, mz, hop }.
 */
export function steer(b, meteors, hp, doom, rim, react = 0) {
  const seen = meteors.filter(m => RULES.warn - m.left >= react);
  const keep = Math.max(1.2, Math.min(rim, ISLAND_R) * 0.45);
  const cost = (x, z) => {
    let c = Math.max(0, Math.hypot(x, z) - keep) * 0.4;
    for (const m of seen) { const d = Math.hypot(x - m.x, z - m.z), r = RULES.blast + 0.6; if (d < r) c += (r - d) * (3 - m.left); }
    return c;
  };
  const here = tileAt(b.x, b.z), shaky = here < 0 || !(hp[here] > 0) || doom[here] > 0;
  let best = { mx: 0, mz: 0, c: cost(b.x, b.z) + (shaky ? 6 : 0) - 0.08 }, danger = seen.some(m => Math.hypot(b.x - m.x, b.z - m.z) < RULES.blast + 0.3);
  for (let k = 0; k < 16; k++) {
    const a = k * Math.PI / 8, ux = Math.sin(a), uz = Math.cos(a), px = -uz, pz = ux;
    let ok = true;
    for (const [f, l] of [[0.3, 0], [0.6, 0], [1.0, 0], [0.45, 0.32], [0.45, -0.32], [0.9, 0.3], [0.9, -0.3]]) if (!solidAt(hp, doom, b.x + ux * f + px * l, b.z + uz * f + pz * l)) { ok = false; break; }
    if (!ok) continue;
    const c = cost(b.x + ux, b.z + uz);
    if (c < best.c) best = { mx: ux, mz: uz, c };
  }
  return { mx: best.mx, mz: best.mz, hop: danger && best.mx === 0 && best.mz === 0 };
}

export function create({ rng, players, difficulty = 'normal', rivals = true }) {
  const n = players.length, bodies = new Map(), solo = n === 1, sam = solo && rivals !== false, spawns = spawnRing(sam ? 2 : n, 3.4);   // "Rival when alone" off: no Sam
  players.forEach((p, i) => bodies.set(p.pid, makeBody(spawns[i].x, spawns[i].z, spawns[i].yaw)));
  const hp = new Int8Array(TILES.length).fill(2);           // 2 whole, 1 cracked, 0 gone
  const doom = new Float32Array(TILES.length);              // > 0: seconds until this tile drops (it shakes meanwhile)
  const heal = new Float32Array(TILES.length);              // > 0: seconds until this hole crusts over
  const newState = () => ({ prevB: 0, hop: 0, hopDur: 1, hopH: 1, cool: 0, stun: 0, falling: false, vy: 0, back: 0, shield: 0, pts: 0, falls: 0 });
  // every runner on the island: the players, and Cinder Sam when you are alone
  const runners = players.map(p => ({ id: p.pid, body: bodies.get(p.pid), s: newState() }));
  const cpu = sam ? { id: 'cpu', body: makeBody(spawns[1].x, spawns[1].z, spawns[1].yaw), s: newState(), cpu: true, ...(RULES.cpu[difficulty] ?? RULES.cpu.normal) } : null;
  const cpuMove = cpu ? { ...meta.move, speed: meta.move.speed * cpu.speed } : null;
  if (cpu) runners.push(cpu);
  const byId = new Map(runners.map(r => [r.id, r]));
  let changed = [], meteors = [], mid = 0, nextMeteor = RULES.firstMeteor, time = meta.seconds, elapsed = 0, over = false, rim = ISLAND_R + 1;
  const events = [];
  const setHp = (i, v) => { if (hp[i] !== v) { hp[i] = v; changed.push(i, v); } };
  const markDoom = (i, t) => { if (hp[i] > 0 && !(doom[i] > 0)) { doom[i] = t; hp[i] = 1; changed.push(i, 3); } };   // 3 on the wire = "shaking"
  const standing = r => !r.s.falling;
  function fall(r) {
    const { s, body: b } = r;
    s.falling = true; s.vy = 1.5; s.back = RULES.respawn; s.falls++; b.flags = (b.flags | F.STUN) & ~F.AIR;
    events.push({ e: 'fall', pid: r.id, x: r2(b.x), z: r2(b.z) });
  }
  /** A whole tile near the middle, out of every ring: where you pop back up. */
  function safeTile() {
    const ok = [];
    for (let i = 0; i < TILES.length; i++) {
      const t = TILES[i]; if (hp[i] !== 2 || doom[i] > 0 || Math.hypot(t.x, t.z) > rim - 0.6) continue;
      if (meteors.some(m => Math.hypot(m.x - t.x, m.z - t.z) < RULES.blast + 0.4)) continue;
      if (runners.some(o => standing(o) && Math.hypot(o.body.x - t.x, o.body.z - t.z) < 0.9)) continue;
      ok.push(i);
    }
    if (!ok.length) { const i = tileAt(0, 0); doom[i] = 0; heal[i] = 0; setHp(i, 2); return i; }   // always somewhere to stand
    ok.sort((a, b) => Math.hypot(TILES[a].x, TILES[a].z) - Math.hypot(TILES[b].x, TILES[b].z));
    return ok[rng.int(0, Math.min(ok.length, 10) - 1)];
  }
  function popBack(r) {
    const { s, body: b } = r, t = TILES[safeTile()];
    s.falling = false; s.vy = 0; s.stun = 0; s.hop = 0; s.shield = RULES.shield;
    b.x = t.x; b.z = t.z; b.y = 0; b.vx = b.vz = 0; b.flags = 0;
    events.push({ e: 'back', pid: r.id, x: r2(t.x), z: r2(t.z) });
  }
  function impact(m) {
    for (let i = 0; i < TILES.length; i++) {
      if (!hp[i]) continue;
      const d = Math.hypot(TILES[i].x - m.x, TILES[i].z - m.z);
      if (d <= RULES.smash) { setHp(i, 0); doom[i] = 0; heal[i] = RULES.heal; } else if (d <= RULES.crack) { if (hp[i] === 1) markDoom(i, RULES.breakDelay); else setHp(i, 1); }
    }
    for (const r of runners) {
      const { s, body: b } = r; if (!standing(r) || (b.flags & F.AIR) || s.shield > 0) continue;
      const dx = b.x - m.x, dz = b.z - m.z, d = Math.hypot(dx, dz); if (d > RULES.blast) continue;
      const nx = d > 0.05 ? dx / d : Math.sin(b.yaw), nz = d > 0.05 ? dz / d : Math.cos(b.yaw);
      const v = RULES.pushMin + (RULES.push - RULES.pushMin) * (1 - d / RULES.blast);
      b.vx = nx * v; b.vz = nz * v; b.flags |= F.STUN | F.AIR; s.stun = RULES.stun;
      s.hop = s.hopDur = RULES.fling; s.hopH = RULES.flingH;
      events.push({ e: 'bonk', pid: r.id });
    }
    events.push({ e: 'boom', x: m.x, z: m.z });
  }
  function spawnMeteor() {
    const live = runners.filter(standing); let x, z;
    for (let tries = 0; tries < 8; tries++) {
      if (live.length && rng.chance(0.6)) { const b = rng.pick(live).body; x = b.x + rng.range(-1.2, 1.2); z = b.z + rng.range(-1.2, 1.2); }
      else { const t = TILES[rng.int(0, TILES.length - 1)]; x = t.x; z = t.z; }
      if (Math.hypot(x, z) < Math.min(rim, ISLAND_R) && !meteors.some(m => Math.hypot(m.x - x, m.z - z) < 1.6)) break;
    }
    meteors.push({ id: ++mid, x: r2(x), z: r2(z), left: RULES.warn, missed: cpu ? !rng.chance(cpu.sees) : false });
  }
  function hop(r) {
    const { s, body: b } = r;
    if (standing(r) && !(b.flags & (F.AIR | F.STUN)) && s.cool <= 0) { s.hop = s.hopDur = RULES.hop; s.hopH = RULES.hopH; s.cool = RULES.hopCool; b.flags |= F.AIR; events.push({ e: 'hop', pid: r.id }); }
  }
  const scoreOf = r => Math.floor(r.s.pts);
  return {
    bodies, events, get cpu() { return cpu; },
    init: () => ({ tiles: Array.from(hp, (v, i) => (doom[i] > 0 ? 3 : v)), left: Math.ceil(time), cpu: cpu ? CPU_NAME : null }),
    input(pid, inp) {
      const r = byId.get(pid); if (!r || over) return;
      const bits = inp?.b | 0, press = (bits & IN.A) && !(r.s.prevB & IN.A); r.s.prevB = bits;
      if (press) hop(r);
      stepBody(r.body, inp, meta.move, meta.arena);
    },
    step(dt) {
      if (over) return;
      elapsed += dt;
      if (cpu && standing(cpu)) {
        const c = steer(cpu.body, meteors.filter(m => !m.missed), hp, doom, rim, cpu.react);
        if (c.hop) hop(cpu);
        stepBody(cpu.body, c, cpuMove, meta.arena);
      }
      separate(runners.filter(standing).map(r => r.body));
      // meteors: count down, land
      for (const m of meteors) { m.left -= dt; if (m.left <= 0) impact(m); }
      meteors = meteors.filter(m => m.left > 0);
      nextMeteor -= dt;
      if (nextMeteor <= 0) {
        const k = Math.min(1, elapsed / meta.seconds), every = RULES.everyStart + (RULES.everyEnd - RULES.everyStart) * k;
        nextMeteor = every * (runners.length > 2 ? 0.85 : 1);
        spawnMeteor(); if (elapsed > 35 && rng.chance(0.25)) spawnMeteor();
      }
      // the edge crumbles inward (for good); holes inside the rim crust over again
      if (elapsed > RULES.crumbleFrom) {
        rim = Math.max(RULES.crumbleMin, ISLAND_R + 0.4 - (elapsed - RULES.crumbleFrom) * RULES.crumbleRate);
        for (let i = 0; i < TILES.length; i++) if (hp[i] && !(doom[i] > 0) && Math.hypot(TILES[i].x, TILES[i].z) > rim) markDoom(i, RULES.crumbleWarn);
      }
      for (let i = 0; i < TILES.length; i++) {
        if (doom[i] > 0) { doom[i] -= dt; if (doom[i] <= 0) { doom[i] = 0; setHp(i, 0); heal[i] = RULES.heal; } }
        else if (hp[i] === 0 && heal[i] > 0) { heal[i] -= dt; if (heal[i] <= 0) { heal[i] = 0; if (Math.hypot(TILES[i].x, TILES[i].z) < rim - 0.3 && !runners.some(r => r.s.falling && tileAt(r.body.x, r.body.z) === i)) setHp(i, 2); } }
      }
      // everyone: hops, stuns, what is under their feet, the lava
      for (const r of runners) {
        const { s, body: b } = r;
        if (s.cool > 0) s.cool -= dt;
        if (s.shield > 0) s.shield -= dt;
        if (s.falling) {
          if (!(b.flags & F.OUT)) { s.vy -= 26 * dt; b.y += s.vy * dt; if (b.y < -7) { b.flags = F.OUT; b.vx = b.vz = 0; } }
          s.back -= dt; if (s.back <= 0) popBack(r);
          continue;
        }
        if (s.stun > 0) { s.stun -= dt; if (s.stun <= 0) b.flags &= ~F.STUN; }
        if (s.hop > 0) {
          s.hop -= dt; const t = 1 - Math.max(0, s.hop) / s.hopDur; b.y = r2(4 * s.hopH * t * (1 - t));
          if (s.hop <= 0) { b.y = 0; b.flags &= ~F.AIR; }
        }
        if (!(b.flags & F.AIR)) { const i = tileAt(b.x, b.z); if (i < 0 || hp[i] === 0) { fall(r); continue; } }
        s.pts += dt;
      }
      time -= dt;
      if (time <= 0) {
        time = 0; over = true;
        for (const r of runners) { const b = r.body; if (!(b.flags & F.OUT)) { b.flags |= F.FROZEN; b.vx = b.vz = 0; } }
        const best = Math.max(...runners.map(scoreOf));
        for (const r of runners) if (scoreOf(r) === best && standing(r)) events.push({ e: 'win', pid: r.id });
        if (cpu) { const me = runners[0]; events.push({ e: 'vs', you: scoreOf(me), cpu: scoreOf(cpu), win: scoreOf(me) >= scoreOf(cpu) }); }
      }
    },
    state() {
      const d = changed; changed = [];
      const sc = {}; for (const p of players) sc[p.pid] = scoreOf(byId.get(p.pid));
      const g = { d, m: meteors.map(m => [m.id, m.x, m.z, r2(m.left)]), sc, out: runners.filter(r => !standing(r) && !r.cpu).map(r => r.id), sh: runners.filter(r => r.s.shield > 0 && !r.cpu).map(r => r.id), left: Math.ceil(time) };
      if (cpu) { const b = cpu.body; g.cpu = [r2(b.x), r2(b.z), r2(b.y), r2(b.yaw), b.flags, scoreOf(cpu), cpu.s.shield > 0 ? 1 : 0]; }
      return g;
    },
    get over() { return over; },
    result() {
      const scores = {}; for (const p of players) scores[p.pid] = scoreOf(byId.get(p.pid));
      const groups = new Map();
      for (const p of players) { const k = scores[p.pid]; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p.pid); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
  };
}
