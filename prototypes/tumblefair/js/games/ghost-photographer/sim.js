// GHOST PHOTOGRAPHER — co-op. A haunted funhouse floor split into nine named rooms (Mirror Hall, Clown Stage…).
// Ghosts drift about in it, INVISIBLE on the shared screen. Each ghost has a clue on ONE player's phone (the clue
// holder), so the team has to talk:
//   ROOM      "A shimmer in the Puppet Nook" — which room it is in right now.
//   TRAIL     its footprints on a little map, where it was 1, 2½ and 4 seconds ago (never where it is now).
//   COLD SPOT a thermometer: how close it is to the holder's own character (Freezing / Cold / Chilly / Nothing).
// One player carries THE LANTERN (it passes on every 12 s). Ghosts inside its glow show up for everyone and slow
// down; B = a big flash that lights a much wider circle for a second (5 s to recharge). The lantern carrier's hands
// are full: everyone else SNAPS (A) a photo just in front of them and catches every ghost in the frame.
// A ghost that is not caught slips away after its time. Catch the goal (half of them alone, three quarters with four)
// by the bell.
// Scores: a catch is 2 for the photographer, +1 for the clue holder and +1 for the lantern carrier if it was lit
// (each only if they are someone else). Solo: you carry a smaller lantern AND the camera, and every clue is yours.
import { makeBody, stepBody, separate, spawnRing, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'ghost-photographer', title: 'Ghost Photographer', blurb: 'Read the clues, light the ghosts and snap their pictures!',
  how: ['Ghosts are invisible! Your phone has clues for some of them.', 'Call out your clues. The LANTERN shows ghosts near it (B = big flash).', 'Everyone else: walk up and SNAP a photo in front of you.', 'Catch enough ghosts before they slip away!'],
  kind: 'arena', min: 1, max: 4, seconds: 60, scoring: 'coop', unit: 'points', tags: ['coop', 'action', 'puzzle'],
  controls: { stick: true, a: 'Snap', b: 'Flash' }, move: { speed: 5.6, accel: 28, stunDrag: 3 },
  arena: { shape: 'rect', hw: 9, hd: 6, wall: true }, pitch: 56, card: 'card-ghost-photographer', css: true,
};

/** Nine rooms, 3 x 3, back row first. Each has a name AND a picture on its rug. */
export const ROOMS = [
  { name: 'Mirror Hall', icon: 'mirror', color: '#b9d8ff' }, { name: 'Clown Stage', icon: 'nose', color: '#ffb3c1' }, { name: 'Organ Loft', icon: 'pipes', color: '#d7c2ff' },
  { name: 'Puppet Nook', icon: 'puppet', color: '#ffe3a3' }, { name: 'Spinning Rug', icon: 'spiral', color: '#b8f0c2' }, { name: 'Cobweb Bend', icon: 'web', color: '#d9d9d9' },
  { name: 'Barrel Roll', icon: 'barrel', color: '#f0c9a0' }, { name: 'Ticket Booth', icon: 'ticket', color: '#ffd2a3' }, { name: 'Candle Row', icon: 'candle', color: '#fff3b0' },
];
export const KINDS = [
  { name: 'Wisp', color: '#9ff3ff' }, { name: 'Moaner', color: '#c9b6ff' }, { name: 'Giggler', color: '#b6ffcb' },
  { name: 'Sheet', color: '#ffffff' }, { name: 'Rattler', color: '#ffe08a' }, { name: 'Gloomy', color: '#ffb6d9' },
];
export const CLUES = ['room', 'trail', 'cold'];
export const COLD = ['Freezing', 'Cold', 'Chilly', 'Nothing'];
export const RULES = {
  first: 1.5, gap: [0, 6, 5, 4.2, 3.6], life: { easy: 16, normal: 14, hard: 12 }, lastSpawn: 46,
  speed: 1.15, litSpeed: 0.4,
  lantern: 2.7, soloLantern: 2.3, flashR: 5.2, flash: 1.0, flashCool: 5, pass: 12,
  snapAhead: 1.3, snapR: 1.6, snapCool: 0.9,
  trailAt: [1, 2.5, 4], cold: [2.5, 5, 8],
  goal: [0, 0.5, 0.55, 0.7, 0.75],     // share of the ghosts to catch, by team size (a big team covers more floor)
};
const r2 = v => Math.round(v * 100) / 100;
const half = v => Math.round(v * 2) / 2;
export const roomOf = (x, z) => { const c = Math.max(0, Math.min(2, Math.floor((x + 9) / 6))), r = Math.max(0, Math.min(2, Math.floor((z + 6) / 4))); return r * 3 + c; };
export const roomCentre = i => ({ x: -6 + (i % 3) * 6, z: -4 + Math.floor(i / 3) * 4 });
export const coldBand = d => RULES.cold.findIndex(c => d < c) < 0 ? 3 : RULES.cold.findIndex(c => d < c);
/** When ghosts appear for n players (fixed from the start so the goal is known). */
export function scheduleFor(n) { const out = []; for (let t = RULES.first; t <= RULES.lastSpawn; t += RULES.gap[n]) out.push(r2(t)); return out; }
export const goalFor = n => Math.ceil(scheduleFor(n).length * RULES.goal[n]);
/** Who carries the lantern `t` seconds in (everyone gets turns; solo always carries it). */
export const lanternAt = (pids, t) => pids[Math.floor(Math.max(0, t) / RULES.pass) % pids.length];

export function create({ rng, players, difficulty = 'normal' }) {
  const n = players.length, pids = players.map(p => p.pid), bodies = new Map(), A = meta.arena, solo = n === 1;
  const spawns = spawnRing(n, n === 1 ? 0 : 2.2, Math.PI / 4);
  players.forEach((p, i) => bodies.set(p.pid, makeBody(spawns[i].x, spawns[i].z, spawns[i].yaw)));
  const P = new Map(pids.map(pid => [pid, { prev: 0, snapCool: 0, flashCool: 0, pts: 0, snaps: 0, caught: 0 }]));
  const schedule = scheduleFor(n), goal = goalFor(n), life = RULES.life[difficulty] || RULES.life.normal;
  let ghosts = [], gid = 0, nextSpawn = 0, elapsed = 0, time = meta.seconds, caught = 0, escaped = 0, flash = 0, flashAt = null, over = false, holderTurn = 0;
  const events = [];
  let lantern = lanternAt(pids, 0);

  const pickWay = () => ({ x: rng.range(-A.hw + 1, A.hw - 1), z: rng.range(-A.hd + 1, A.hd - 1) });
  function spawn() {
    // somewhere not right on top of a player
    let p = pickWay();
    for (let k = 0; k < 10 && pids.some(pid => { const b = bodies.get(pid); return Math.hypot(b.x - p.x, b.z - p.z) < 3.5; }); k++) p = pickWay();
    const w = pickWay(), id = ++gid;
    const holder = pids[holderTurn++ % n];
    const clue = CLUES[(id - 1 + Math.floor(id / 3)) % 3];
    ghosts.push({ id, kind: (id - 1) % KINDS.length, x: p.x, z: p.z, tx: w.x, tz: w.z, life: Math.min(life, time - 0.5), holder, clue, hist: [], lit: false });
    events.push({ e: 'spawn', id, to: holder });
  }
  function lightR() { return solo ? RULES.soloLantern : RULES.lantern; }
  function isLit(g) {
    const L = bodies.get(lantern); if (!L) return false;
    if (Math.hypot(g.x - L.x, g.z - L.z) <= lightR()) return true;
    return flash > 0 && flashAt && Math.hypot(g.x - flashAt.x, g.z - flashAt.z) <= RULES.flashR;
  }
  function snap(pid) {
    const b = bodies.get(pid), s = P.get(pid);
    const cx = b.x + Math.sin(b.yaw) * RULES.snapAhead, cz = b.z + Math.cos(b.yaw) * RULES.snapAhead;
    s.snaps++;
    const got = ghosts.filter(g => Math.hypot(g.x - cx, g.z - cz) <= RULES.snapR);
    for (const g of got) {
      s.pts += 2; s.caught++; caught++;
      if (g.holder !== pid) P.get(g.holder).pts += 1;
      if (g.lit && lantern !== pid) P.get(lantern).pts += 1;
    }
    events.push({ e: 'snap', pid, x: r2(cx), z: r2(cz), got: got.map(g => [g.id, g.kind, r2(g.x), r2(g.z)]) });
    ghosts = ghosts.filter(g => !got.includes(g));
  }
  function finish() {
    over = true;
    for (const b of bodies.values()) { b.flags = (b.flags | F.FROZEN) & ~F.STUN; b.vx = b.vz = 0; }
    events.push({ e: 'end', ok: caught >= goal ? 1 : 0 });
  }
  return {
    bodies, events,
    init: () => ({ goal, total: schedule.length, solo, rooms: ROOMS.length }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(s.prev & IN.A), pb = (bits & IN.B) && !(s.prev & IN.B); s.prev = bits;
      if (pa && s.snapCool <= 0) {
        if (!solo && pid === lantern) events.push({ e: 'busy', to: pid });
        else { s.snapCool = RULES.snapCool; snap(pid); }
      }
      if (pb) {
        if (pid !== lantern) events.push({ e: 'nolamp', to: pid });
        else if (s.flashCool <= 0) { s.flashCool = RULES.flashCool; flash = RULES.flash; flashAt = { x: b.x, z: b.z }; events.push({ e: 'flash', pid, x: r2(b.x), z: r2(b.z), r: RULES.flashR }); }
      }
      stepBody(b, inp, meta.move, A);
    },
    step(dt) {
      if (over) return;
      elapsed += dt; time -= dt; flash = Math.max(0, flash - dt);
      separate(bodies.values());
      for (const s of P.values()) { s.snapCool = Math.max(0, s.snapCool - dt); s.flashCool = Math.max(0, s.flashCool - dt); }
      const L = lanternAt(pids, elapsed);
      if (L !== lantern) { lantern = L; events.push({ e: 'lantern', pid: L }); }
      while (nextSpawn < schedule.length && elapsed >= schedule[nextSpawn]) { nextSpawn++; spawn(); }
      for (const g of ghosts) {
        g.lit = isLit(g);
        const sp = (g.lit ? RULES.litSpeed : RULES.speed) * dt, dx = g.tx - g.x, dz = g.tz - g.z, d = Math.hypot(dx, dz);
        if (d < 0.3) { const w = pickWay(); g.tx = w.x; g.tz = w.z; }
        else { g.x += dx / d * Math.min(sp, d); g.z += dz / d * Math.min(sp, d); }
        // a footprint every half second, kept for the trail clue
        if (Math.round(elapsed * 20) % 10 === 0) { g.hist.push([r2(elapsed), half(g.x), half(g.z)]); if (g.hist.length > 12) g.hist.shift(); }
        g.life -= dt;
        if (g.life <= 0) { escaped++; events.push({ e: 'escape', id: g.id, kind: g.kind, x: r2(g.x), z: r2(g.z) }); }
      }
      ghosts = ghosts.filter(g => g.life > 0);
      if (time <= 0 || (nextSpawn >= schedule.length && !ghosts.length)) finish();
    },
    state() {
      const sc = {}; for (const pid of pids) sc[pid] = P.get(pid).pts;
      const g = { c: caught, x: escaped, n: ghosts.length, lt: lantern, sc, left: Math.max(0, Math.ceil(time)) };
      g.gh = ghosts.filter(x => x.lit).map(x => [x.id, x.kind, r2(x.x), r2(x.z)]);     // only the lit ones: the rest stay secret
      if (flash > 0) g.fl = [r2(flashAt.x), r2(flashAt.z)];
      return g;
    },
    /** This player's clues (solo: all of them), plus whether they carry the lantern and its recharge. */
    priv(pid) {
      const me = bodies.get(pid), s = P.get(pid), out = [];
      for (const g of ghosts) {
        if (!solo && g.holder !== pid) continue;
        const c = { id: g.id, k: g.kind, t: g.clue, life: Math.ceil(g.life) };
        if (g.clue === 'room') c.room = roomOf(g.x, g.z);
        else if (g.clue === 'trail') c.steps = RULES.trailAt.map(ago => { let best = null; for (const h of g.hist) if (h[0] <= elapsed - ago + 0.26) best = h; return best ? [best[1], best[2]] : null; }).filter(Boolean);
        else c.cold = coldBand(Math.hypot(g.x - me.x, g.z - me.z));
        out.push(c);
      }
      return { clues: out, lamp: pid === lantern ? 1 : 0, fc: Math.ceil(s.flashCool) };
    },
    get over() { return over; },
    result() {
      const scores = {}; for (const pid of pids) scores[pid] = P.get(pid).pts;
      return { coop: { success: caught >= goal }, order: [pids.slice()], scores, unit: meta.unit };
    },
  };
}
