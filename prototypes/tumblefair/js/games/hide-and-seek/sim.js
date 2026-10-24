// HIDE & PEEK — hide-and-seek in the fairground after dark. Each round one player is the SEEKER (the one who has
// sought least, then the one with the fewest points) and everyone else hides.
//   hide (6 s)    the seeker stands in the middle with their eyes shut. Hiders run to a barrel, crate, stall or hay
//                 stack and press A to climb in (one hider a spot; A again climbs out to move).
//   seek (17 s)   the seeker carries a lantern: anyone out in the open in its beam is spotted, and A at a spot looks
//                 inside it (an empty one wastes a moment). Touching a hider in the open finds them too.
//   peek          a hider in a spot presses B to peek out for a moment: +1 if the lantern does not catch you at it.
// Found = +2 to the seeker. Still hidden at the bell = +3. A round ends early when everyone is found.
// Rounds: 3 for 3-4 players, 2 for two. Solo: round 1 you hide from Lamplighter Lou, round 2 you find three Peekers.
import { makeBody, stepBody, separate, F, BODY_R } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

const HW = 9, HD = 7;
export const meta = {
  id: 'hide-and-seek', title: 'Hide & Peek', blurb: 'Climb into a barrel and stay hidden — or carry the lantern and find everyone!',
  how: ['Hiders: run to a barrel, crate or stall and press A to climb in.', 'B peeks out for +1 — if the lantern does not catch you.', 'Seeker: the lantern spots anyone out in the open. A looks inside a spot.', 'Found: +2 to the seeker. Hidden at the bell: +3.'],
  kind: 'arena', min: 1, max: 4, seconds: 86, scoring: 'points', unit: 'points', tags: ['action'], card: 'card-hide-and-seek', css: true,
  controls: { stick: true, a: 'Hide / Look', b: 'Peek' }, move: { speed: 5.4, accel: 30, stunDrag: 4 },
  arena: { shape: 'rect', hw: HW, hd: HD, wall: true }, pitch: 60,
};
export const RULES = {
  hide: 6, seek: 17, reveal: 2.6,
  enter: 1.15,                         // how close (to a spot's edge) you must be to climb in / look inside
  beam: { easy: [4.2, 0.45], normal: [5, 0.5], hard: [5.8, 0.56] },   // lantern length (m) and half-angle (rad)
  spot: 0.35, spotPeek: 0.2,           // seconds in the beam before you are spotted (in the open / peeking)
  touch: 0.95, look: 0.55, emptyStun: 1.0,
  peekT: 1.2, peekCool: 2.4,
  found: 2, survive: 3, peekPts: 1,
  cpuSpeed: { easy: 3.2, normal: 4.0, hard: 4.8 },
};
/** The kinds of hiding place: round ones are posts, the rest are boxes (both solid). */
export const SPOT_KINDS = [
  { id: 'barrel', r: 0.55 }, { id: 'crate', hw: 0.6, hd: 0.6 }, { id: 'stall', hw: 1.25, hd: 0.6 }, { id: 'hay', hw: 0.95, hd: 0.55 },
];
const MIX = [0, 0, 0, 1, 1, 2, 2, 3, 3, 0, 1, 0, 1, 3];
const r2 = v => Math.round(v * 100) / 100;
const ext = k => k.r || Math.max(k.hw, k.hd);
/** Distance from (x, z) to the edge of spot s (0 = touching it). */
export function edgeDist(s, x, z) {
  const k = SPOT_KINDS[s.k];
  if (k.r) return Math.max(0, Math.hypot(x - s.x, z - s.z) - k.r);
  const dx = Math.max(0, Math.abs(x - s.x) - k.hw), dz = Math.max(0, Math.abs(z - s.z) - k.hd); return Math.hypot(dx, dz);
}
/** The fairground: 14 hiding places from the seed, spread out, clear of the middle where the seeker counts. */
export function makeLayout(rng) {
  const spots = [];
  for (let t = 0; t < 800 && spots.length < MIX.length; t++) {
    const k = MIX[spots.length], K = SPOT_KINDS[k], x = r2(rng.range(-HW + 1.4, HW - 1.4)), z = r2(rng.range(-HD + 1.4, HD - 1.4));
    if (Math.hypot(x, z) < 3 || spots.some(s => Math.hypot(s.x - x, s.z - z) < ext(SPOT_KINDS[s.k]) + ext(K) + 1.5)) continue;
    spots.push({ i: spots.length, k, x, z });
  }
  const posts = [], blocks = [];
  for (const s of spots) { const K = SPOT_KINDS[s.k]; if (K.r) posts.push({ x: s.x, z: s.z, r: K.r }); else blocks.push({ x: s.x, z: s.z, hw: K.hw, hd: K.hd }); }
  return { spots, arena: { ...meta.arena, posts, blocks } };
}
/** Is (x, z) in a lantern beam from (sx, sz) facing yaw? */
export function inBeam(sx, sz, yaw, x, z, len, half) {
  const dx = x - sx, dz = z - sz, d = Math.hypot(dx, dz); if (d > len || d < 0.01) return d < 0.01;
  let a = Math.atan2(dx, dz) - yaw; a = Math.atan2(Math.sin(a), Math.cos(a)); return Math.abs(a) <= half;
}
/** Who seeks next: fewest turns seeking, then fewest points, then seat order. */
export const nextSeeker = (players, turns, pts) => [...players].sort((a, b) => (turns[a.pid] - turns[b.pid]) || (pts[a.pid] - pts[b.pid]) || (a.seat - b.seat))[0].pid;

export function create({ rng, players, difficulty = 'normal' }) {
  const D = RULES.beam[difficulty] ? difficulty : 'normal', [BEAM, HALF] = RULES.beam[D];
  const n = players.length, solo = n === 1, { spots, arena } = makeLayout(rng);
  const bodies = new Map(), events = [];
  players.forEach(p => bodies.set(p.pid, makeBody(0, 0, 0)));
  const P = new Map(players.map(p => [p.pid, { prevB: 0, pts: 0, turns: 0, role: 'hide', spot: -1, peek: 0, peekCool: 0, beamT: 0, found: false, stun: 0, lookCool: 0, peeks: 0, finds: 0, hidden: 0 }]));
  const rounds = solo ? 2 : n === 2 ? 2 : 3;
  // solo stand-ins: Lamplighter Lou seeks in round 1, three Peekers hide in round 2. Same shape as a player.
  let npcs = [];
  let round = 0, phase = 'hide', left = RULES.hide, seeker = null, over = false, el = 0, order = [];
  const occupied = i => [...P.values()].some(s => s.spot === i) || npcs.some(c => c.spot === i);
  const hiders = () => [...[...P.entries()].filter(([, s]) => s.role === 'hide').map(([pid, s]) => ({ pid, s, b: bodies.get(pid) })), ...npcs.filter(c => c.role === 'hide').map(c => ({ pid: null, s: c, b: c, npc: c }))];
  const seekerBody = () => (seeker != null ? bodies.get(seeker) : npcs.find(c => c.role === 'seek'));
  function startRound() {
    round++; phase = 'hide'; left = RULES.hide; npcs = [];
    const pts = Object.fromEntries([...P].map(([pid, s]) => [pid, s.pts])), turns = Object.fromEntries([...P].map(([pid, s]) => [pid, s.turns]));
    seeker = solo ? (round === 2 ? players[0].pid : null) : nextSeeker(players, turns, pts);
    if (seeker != null) P.get(seeker).turns++;
    const ring = players.filter(p => p.pid !== seeker);
    players.forEach(p => {
      const s = P.get(p.pid), b = bodies.get(p.pid);
      Object.assign(s, { role: p.pid === seeker ? 'seek' : 'hide', spot: -1, peek: 0, peekCool: 0, beamT: 0, found: false, stun: 0, lookCool: 0 });
      const k = ring.indexOf(p);
      if (p.pid === seeker) { b.x = 0; b.z = 0; b.yaw = 0; b.flags = F.FROZEN; }
      else { const a = Math.PI / 4 + k * Math.PI * 2 / Math.max(1, ring.length); b.x = r2(Math.sin(a) * 1.6); b.z = r2(Math.cos(a) * 1.6); b.yaw = Math.atan2(b.x, b.z); b.flags = 0; }
      b.vx = b.vz = 0; b.y = 0;
    });
    if (solo && round === 1) npcs.push({ id: 1, role: 'seek', x: 0, z: 0, y: 0, vx: 0, vz: 0, yaw: 0, flags: F.FROZEN, lookCool: 0, stun: 0, plan: rng.shuffle(spots.map(s => s.i)), looked: new Set() });
    if (solo && round === 2) {
      const free = rng.shuffle(spots.map(s => s.i)).slice(0, 3);
      free.forEach((i, k) => npcs.push({ id: 10 + k, role: 'hide', x: spots[i].x, z: spots[i].z, y: 0, vx: 0, vz: 0, yaw: 0, flags: F.FROZEN, spot: i, peek: 0, peekCool: 1 + k * 1.3, beamT: 0, found: false, hidden: 1, next: 2 + rng.range(0, 3) }));
    }
    events.push({ e: 'round', r: round, seeker, npc: seeker == null });
  }
  function climbIn(h, i) { const sp = spots[i]; h.s.spot = i; h.b.x = sp.x; h.b.z = sp.z; h.b.vx = h.b.vz = 0; h.b.flags |= F.FROZEN; h.s.peek = 0; events.push({ e: 'in', pid: h.pid, npc: h.npc?.id, i }); }
  function climbOut(h) {
    const sp = spots[h.s.spot], K = SPOT_KINDS[sp.k], away = Math.atan2(sp.x, sp.z) + Math.PI, d = ext(K) + BODY_R + 0.15;
    h.b.x = r2(Math.max(-HW + 0.5, Math.min(HW - 0.5, sp.x + Math.sin(away) * d))); h.b.z = r2(Math.max(-HD + 0.5, Math.min(HD - 0.5, sp.z + Math.cos(away) * d)));
    h.b.flags &= ~F.FROZEN; events.push({ e: 'out', pid: h.pid, npc: h.npc?.id, i: h.s.spot }); h.s.spot = -1; h.s.peek = 0;
  }
  function find(h, how) {
    if (h.s.found) return;
    if (h.s.spot >= 0) climbOut(h);
    h.s.found = true; h.s.peek = 0; h.b.flags = (h.b.flags & ~F.STUN) | F.FROZEN; h.b.vx = h.b.vz = 0;
    if (seeker != null) { const s = P.get(seeker); s.pts += RULES.found; s.finds++; }
    events.push({ e: 'found', pid: h.pid, npc: h.npc?.id, by: seeker, how, x: r2(h.b.x), z: r2(h.b.z) });
  }
  function look(sb, sState) {
    // the spot nearest the seeker's front within reach
    let best = null, bd = 99;
    for (const sp of spots) {
      const d = edgeDist(sp, sb.x, sb.z); if (d > RULES.enter) continue;
      let a = Math.atan2(sp.x - sb.x, sp.z - sb.z) - sb.yaw; a = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
      const score = d + a * 0.6; if (score < bd) { bd = score; best = sp; }
    }
    if (!best) { events.push({ e: 'look', by: seeker, i: -1 }); return; }
    sb.yaw = Math.atan2(best.x - sb.x, best.z - sb.z);
    const h = hiders().find(x => !x.s.found && x.s.spot === best.i);
    if (h) find(h, 'look');
    else { sState.stun = RULES.emptyStun; sb.flags |= F.STUN; sb.vx = sb.vz = 0; events.push({ e: 'look', by: seeker, i: best.i, empty: true }); }
  }
  startRound();
  const cpuMove = (c, tx, tz, sp, dt) => { const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz); if (d < 0.05) return d; const step = Math.min(d, sp * dt); c.x += dx / d * step; c.z += dz / d * step; c.yaw = Math.atan2(dx, dz); c.vx = dx / d * sp; c.vz = dz / d * sp; return d; };
  return {
    bodies, events,
    init: () => ({ solo, spots, kinds: SPOT_KINDS, arena, rounds, beam: [BEAM, HALF], hide: RULES.hide, seek: RULES.seek, peekT: RULES.peekT }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(s.prevB & IN.A), pb = (bits & IN.B) && !(s.prevB & IN.B); s.prevB = bits;
      if (phase === 'hide' || phase === 'seek') {
        if (s.role === 'hide' && !s.found) {
          const h = { pid, s, b };
          if (pa) {
            if (s.spot >= 0) climbOut(h);
            else {
              let best = null, bd = RULES.enter;
              for (const sp of spots) { const d = edgeDist(sp, b.x, b.z); if (d <= bd && !occupied(sp.i)) { bd = d; best = sp; } }
              if (best) climbIn(h, best.i); else events.push({ e: 'nospot', pid });
            }
          }
          if (pb && s.spot >= 0 && s.peek <= 0 && s.peekCool <= 0 && phase === 'seek') { s.peek = RULES.peekT; s.peekCool = RULES.peekCool; s.beamT = 0; events.push({ e: 'peek', pid, i: s.spot }); }
        } else if (s.role === 'seek' && phase === 'seek' && pa && s.lookCool <= 0 && !(b.flags & F.STUN)) { s.lookCool = RULES.look; look(b, s); }
      }
      stepBody(b, inp, meta.move, arena);
    },
    step(dt) {
      if (over) return;
      el += dt; left -= dt;
      separate([...bodies].filter(([pid]) => { const s = P.get(pid); return s.spot < 0 && !s.found; }).map(([, b]) => b));
      for (const [, s] of P) { if (s.peekCool > 0) s.peekCool -= dt; if (s.lookCool > 0) s.lookCool -= dt; }
      for (const [pid, s] of P) { const b = bodies.get(pid); if (s.stun > 0) { s.stun -= dt; if (s.stun <= 0) b.flags &= ~F.STUN; } }
      if (phase === 'hide') {
        if (left <= 0) {
          phase = 'seek'; left = RULES.seek;
          const sb = seekerBody(); if (sb) sb.flags &= ~F.FROZEN;
          events.push({ e: 'seek', seeker });
        }
      } else if (phase === 'seek') {
        const sb = seekerBody();
        // solo: Lamplighter Lou walks his rounds — straight for anyone he can see, otherwise the next spot on his list
        const lou = npcs.find(c => c.role === 'seek');
        if (lou) {
          if (lou.lookCool > 0) lou.lookCool -= dt;
          if (lou.stun > 0) lou.stun -= dt;
          else {
            const seen = hiders().find(h => !h.s.found && (h.s.spot < 0 || h.s.peek > 0) && Math.hypot(h.b.x - lou.x, h.b.z - lou.z) < BEAM + 1.5);
            let tx, tz, target = null;
            if (seen) { tx = seen.b.x; tz = seen.b.z; target = seen.s.spot >= 0 ? spots[seen.s.spot] : null; }
            else { const i = lou.plan.find(j => !lou.looked.has(j)); if (i == null) { lou.looked.clear(); } else { target = spots[i]; tx = target.x; tz = target.z; } }
            if (tx != null) {
              const before = { x: lou.x, z: lou.z };
              cpuMove(lou, tx, tz, RULES.cpuSpeed[D], dt); lou.flags = 0;
              const tmp = { ...lou }; for (const o of arena.posts) { const dx = tmp.x - o.x, dz = tmp.z - o.z, d = Math.hypot(dx, dz); if (d < o.r + BODY_R && d > 1e-6) { tmp.x = o.x + dx / d * (o.r + BODY_R); tmp.z = o.z + dz / d * (o.r + BODY_R); } }
              for (const o of arena.blocks) { const cx = Math.max(o.x - o.hw, Math.min(o.x + o.hw, tmp.x)), cz = Math.max(o.z - o.hd, Math.min(o.z + o.hd, tmp.z)), dx = tmp.x - cx, dz = tmp.z - cz, d = Math.hypot(dx, dz); if (d < BODY_R && d > 1e-6) { tmp.x = cx + dx / d * BODY_R; tmp.z = cz + dz / d * BODY_R; } }
              lou.x = r2(tmp.x); lou.z = r2(tmp.z); lou.yaw = Math.atan2(tx - before.x, tz - before.z);
              if (target && edgeDist(target, lou.x, lou.z) <= RULES.enter * 0.8 && lou.lookCool <= 0) {
                lou.lookCool = 0.6; lou.looked.add(target.i);
                const h = hiders().find(x => !x.s.found && x.s.spot === target.i);
                if (h) find(h, 'look'); else { lou.stun = RULES.emptyStun; events.push({ e: 'look', by: null, i: target.i, empty: true }); }
              }
            }
          }
        }
        // the Peekers (solo round 2) peek now and then
        for (const c of npcs) if (c.role === 'hide' && !c.found) {
          if (c.peekCool > 0) c.peekCool -= dt;
          c.next -= dt;
          if (c.next <= 0 && c.peek <= 0 && c.peekCool <= 0) { c.peek = RULES.peekT; c.peekCool = RULES.peekCool; c.beamT = 0; c.next = 2.5 + rng.range(0, 3.5); events.push({ e: 'peek', npc: c.id, i: c.spot }); }
        }
        // the lantern: anyone in the open (or peeking) in the beam is spotted; touching someone in the open finds them
        for (const h of hiders()) {
          if (h.s.found) continue;
          const open = h.s.spot < 0, peeking = h.s.spot >= 0 && h.s.peek > 0;
          if (sb && (open || peeking) && inBeam(sb.x, sb.z, sb.yaw, h.b.x, h.b.z, BEAM, HALF)) { h.s.beamT += dt; if (h.s.beamT >= (open ? RULES.spot : RULES.spotPeek)) { find(h, peeking ? 'peek' : 'beam'); continue; } }
          else h.s.beamT = Math.max(0, h.s.beamT - dt * 2);
          if (sb && open && Math.hypot(h.b.x - sb.x, h.b.z - sb.z) < RULES.touch) { find(h, 'touch'); continue; }
          if (h.s.peek > 0) { h.s.peek -= dt; if (h.s.peek <= 0) { h.s.peek = 0; if (h.pid != null) { h.s.pts += RULES.peekPts; h.s.peeks++; } events.push({ e: 'peeked', pid: h.pid, npc: h.npc?.id, i: h.s.spot }); } }
        }
        const still = hiders().filter(h => !h.s.found);
        if (left <= 0 || !still.length) {
          for (const h of still) { if (h.pid != null) { h.s.pts += RULES.survive; h.s.hidden++; } }
          events.push({ e: 'reveal', safe: still.map(h => h.pid ?? -h.npc.id), all: !still.length });
          for (const h of still) if (h.s.spot >= 0) climbOut(h);
          phase = 'reveal'; left = RULES.reveal;
          for (const b of bodies.values()) { b.flags = (b.flags & ~F.STUN) | F.FROZEN; b.vx = b.vz = 0; }
        }
      } else if (phase === 'reveal' && left <= 0) {
        if (round >= rounds) { over = true; events.push({ e: 'end' }); }
        else startRound();
      }
    },
    state() {
      const sc = {}, hd = {}, pk = [], fd = [];
      for (const [pid, s] of P) { sc[pid] = s.pts; if (s.spot >= 0) hd[pid] = s.spot; if (s.peek > 0) pk.push(pid); if (s.found) fd.push(pid); }
      const g = { sc, ph: phase, r: round, sk: seeker, hd, pk, fd, left: Math.max(0, Math.ceil(left)) };
      // a stand-in: [id, x, z, yaw, role (0 seek / 1 hide), spot (-1 = in the open), peeking, found]
      if (npcs.length) g.np = npcs.map(c => [c.id, r2(c.x), r2(c.z), r2(c.yaw), c.role === 'seek' ? 0 : 1, c.spot ?? -1, c.peek > 0 ? 1 : 0, c.found ? 1 : 0]);
      return g;
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) { const s = P.get(p.pid); scores[p.pid] = s.pts; if (!groups.has(s.pts)) groups.set(s.pts, []); groups.get(s.pts).push(p.pid); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
    get _phase() { return phase; }, get _round() { return round; }, get _seeker() { return seeker; }, _P: P, _spots: spots, get _npcs() { return npcs; }, _arena: arena,
  };
}

/** A sensible player for the tests: a hider runs to the nearest free spot (skill 1 = one far from the seeker) and
 *  climbs in, peeking when the seeker is far away and facing elsewhere; a seeker sweeps the spots nearest first and
 *  turns its lantern on anyone in the open. skill 0 = hides in the first spot it bumps into and peeks whenever. */
const MEM = new WeakMap();
export function hideBot(g, pid, skill = 1, tick = 0) {
  const b = g.bodies.get(pid), s = g._P.get(pid); if (!b) return { mx: 0, mz: 0, b: 0 };
  const mem = MEM.get(s) || { looked: new Set(), round: 0 }; MEM.set(s, mem);
  if (mem.round !== g._round) { mem.round = g._round; mem.looked = new Set(); mem.target = null; }
  const ph = g._phase, spots = g._spots;
  const go = (x, z, btn = 0) => { const dx = x - b.x, dz = z - b.z, d = Math.hypot(dx, dz) || 1; return { mx: dx / d, mz: dz / d, b: btn }; };
  if (s.role === 'hide') {
    if (s.found || ph === 'reveal') return { mx: 0, mz: 0, b: 0 };
    if (s.spot >= 0) {
      const sk = g._seeker != null ? g.bodies.get(g._seeker) : g._npcs.find(c => c.role === 'seek');
      const far = !sk || Math.hypot(sk.x - b.x, sk.z - b.z) > 7;
      const peek = ph === 'seek' && ((skill > 0.5 && far) || (skill <= 0.5 && tick % 30 === 0));
      return { mx: 0, mz: 0, b: peek && tick % 2 === 0 ? IN.B : 0 };
    }
    const taken = new Set([...g._P.values()].filter(x => x.spot >= 0).map(x => x.spot));
    if (mem.target == null || taken.has(mem.target)) {
      const free = spots.filter(sp => !taken.has(sp.i));
      const key = sp => (skill > 0.5 ? -Math.hypot(sp.x, sp.z) * 0.6 : 0) + Math.hypot(sp.x - b.x, sp.z - b.z) + ((pid * 7 + sp.i * 3) % 5) * 0.4;
      mem.target = free.sort((a, c) => key(a) - key(c))[0]?.i ?? null;
    }
    if (mem.target == null) return { mx: 0, mz: 0, b: 0 };
    const sp = spots[mem.target];
    return edgeDist(sp, b.x, b.z) < RULES.enter * 0.8 ? { mx: 0, mz: 0, b: tick % 2 === 0 ? IN.A : 0 } : go(sp.x, sp.z);
  }
  if (ph !== 'seek') return { mx: 0, mz: 0, b: 0 };
  // seeker: chase anyone visible, else sweep the spots
  for (const [q, o] of g._P) if (q !== pid && o.role === 'hide' && !o.found && (o.spot < 0 || (skill > 0.5 && o.peek > 0))) { const c = g.bodies.get(q); return go(c.x, c.z); }
  for (const c of g._npcs) if (c.role === 'hide' && !c.found && skill > 0.5 && c.peek > 0) return go(c.x, c.z);
  if (mem.target == null || mem.looked.has(mem.target)) {
    const left = spots.filter(sp => !mem.looked.has(sp.i));
    if (!left.length) mem.looked.clear();
    const order = (skill > 0.5 ? left : left.slice().sort((a, c) => a.i - c.i)).sort((a, c) => skill > 0.5 ? Math.hypot(a.x - b.x, a.z - b.z) - Math.hypot(c.x - b.x, c.z - b.z) : 0);
    mem.target = order[0]?.i ?? null;
  }
  if (mem.target == null) return { mx: 0, mz: 0, b: 0 };
  const sp = spots[mem.target];
  if (edgeDist(sp, b.x, b.z) < RULES.enter * 0.7) { if (tick % 2 === 0) { mem.looked.add(sp.i); const out = go(sp.x, sp.z, IN.A); out.mx *= 0.05; out.mz *= 0.05; return out; } return { mx: 0, mz: 0, b: 0 }; }
  return go(sp.x, sp.z);
}
