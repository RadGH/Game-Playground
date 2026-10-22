// FLING RING — a top-down brawl on a deck with no railing. Hold A next to someone to pick them up over your head
// (you walk slower with them); let go of A to throw them the way you face — the longer you held, the further they
// fly. B is a shove that knocks people back and makes a carrier drop what they hold. If you are the one being
// carried, mash A or B to wriggle free. Off the edge (or down a gap) costs a life; three lives each; whoever threw or
// shoved you in the last three seconds gets the knock-out. Last one standing wins, ties go to knock-outs.
// The deck is picked from the seed (levels.js): a raft that shrinks, a carousel that turns with a sweeper bar, or a
// pier with gaps and rolling barrels. Alone, straw-stuffed Bumbles wander on to be thrown off for points.
import { makeBody, stepBody, spawnRing, F, BODY_R } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';
import { DECKS } from './levels.js';

export const meta = {
  id: 'fling-ring', title: 'Fling Ring', blurb: 'Grab, lift and fling everyone else off the deck — last one standing wins!',
  how: ['HOLD Grab near someone to lift them; LET GO to throw.', 'SHOVE knocks people back and makes a carrier drop them.', 'Picked up? Mash the buttons to wriggle free!', 'Fall in and you lose a life. Three lives each.'],
  kind: 'arena', min: 1, max: 4, seconds: 70, scoring: 'survival', unit: 'KOs', tags: ['action'],
  controls: { stick: true, a: 'Grab', b: 'Shove' }, move: { speed: 5.6, accel: 9, carryMul: 0.7, stunDrag: 1.6 },
  arena: { shape: 'circle', r: 8, wall: false }, pitch: 50, card: 'card-fling-ring', css: true,
};

export const RULES = {
  lives: 3, grabR: 1.4, minHold: 0.2, fullHold: 0.8, maxHold: 2.2, throwMin: 6, throwMax: 15, throwVy: 4.5,
  carryY: 1.35, escape: 5, dummyEscape: 2.4, grav: 22, landStun: 0.45, bowlR: 0.95,
  shoveR: 1.5, shoveCool: 0.8, shovePush: 8.5, shoveStun: 0.45,
  respawn: 2.0, ghost: 1.5, credit: 3.0, hazardCool: 0.6,
  dummies: 3, dummyEvery: 2.2, dummySpeed: 1.7, dummyShove: 5.5,
};
const DUMMY_MOVE = { speed: RULES.dummySpeed, accel: 6, stunDrag: 1.6 };
const r2 = v => Math.round(v * 100) / 100;

export function create({ seed, rng, players }) {
  const n = players.length, solo = n === 1;
  const deck = DECKS[Math.abs((seed | 0) + 1) % DECKS.length];
  const arena = deck.shape === 'circle' ? { shape: 'circle', r: deck.r, wall: false } : { shape: 'rect', hw: deck.hw, hd: deck.hd, wall: false };
  if (deck.holes) arena.holes = deck.holes;
  const bodies = new Map(), ents = new Map(), events = [];
  const mkState = (pid, dummy) => ({ pid, dummy, prevB: 0, stun: 0, carriedBy: null, carrying: null, holdT: 0, release: false, esc: 0, falling: false, vy: 0, air: false, bowled: new Set(), back: 0, lives: dummy ? 1 : RULES.lives, kos: 0, by: null, byAt: -99, outAt: -1, ghost: 0, shoveCool: 0, hazard: 0, think: 0, wind: 0, mx: 0, mz: 0 });
  const spawns = spawnRing(n, solo ? 0 : (deck.shape === 'circle' ? deck.r * 0.55 : 4.2), deck.shape === 'rect' ? Math.PI / 4 : Math.PI / 4);
  players.forEach((p, i) => {
    let { x, z, yaw } = spawns[i];
    if (deck.holes) for (const h of deck.holes) if (Math.abs(x - h.x) < h.hw + 0.8 && Math.abs(z - h.z) < h.hd + 0.8) { x *= 0.5; z *= 0.5; }
    const b = makeBody(r2(x), r2(z), yaw); bodies.set(p.pid, b);
    ents.set('p' + p.pid, { key: 'p' + p.pid, b, s: mkState(p.pid, false) });
  });
  let time = meta.seconds, elapsed = 0, over = false, did = 0, nextDummy = 0.6, R = deck.r || 0, angle = 0, sweep = 0;
  const barrels = (deck.barrels || []).map((br, i) => ({ x: (i % 2 ? 1 : -1) * deck.hw * 0.5, z: br.z, v: br.speed, r: br.r }));

  const radius = () => { const s = deck.shrink; if (!s) return deck.r; const k = Math.max(0, Math.min(1, (elapsed - s.start) / (s.end - s.start))); return s.from + (s.to - s.from) * k; };
  const inHole = (x, z) => (deck.holes || []).some(h => Math.abs(x - h.x) < h.hw && Math.abs(z - h.z) < h.hd);
  const onDeck = (x, z) => !inHole(x, z) && (deck.shape === 'circle' ? Math.hypot(x, z) <= R + 0.1 : Math.abs(x) <= deck.hw + 0.1 && Math.abs(z) <= deck.hd + 0.1);
  const playerOf = key => (key && key[0] === 'p' ? +key.slice(1) : null);
  const live = e => !e.s.falling && !(e.b.flags & F.OUT);
  const grounded = e => live(e) && !e.s.air && !e.s.carriedBy;
  const touchable = e => grounded(e) && !(e.b.flags & F.GHOST);
  function knock(e, by, nx, nz, push, stun) {
    if (e.s.carrying) drop(e, false);
    e.b.vx = nx * push; e.b.vz = nz * push; e.b.flags |= F.STUN; e.s.stun = Math.max(e.s.stun, stun);
    if (by && by !== e.key) { e.s.by = by; e.s.byAt = elapsed; }
  }
  function frontOf(e, range, minDot, carriers = false) {
    const fx = Math.sin(e.b.yaw), fz = Math.cos(e.b.yaw); let best = null, bestScore = 1e9;
    for (const t of ents.values()) {
      if (t === e || !touchable(t) || (t.s.carrying && !carriers)) continue;
      const dx = t.b.x - e.b.x, dz = t.b.z - e.b.z, d = Math.hypot(dx, dz); if (d > range) continue;
      const dot = d > 1e-6 ? (dx * fx + dz * fz) / d : 1; if (dot < minDot && d > 0.85) continue;
      const sc = d - dot * 0.5; if (sc < bestScore) { bestScore = sc; best = t; }
    }
    return best;
  }
  function grab(e) {
    const t = frontOf(e, RULES.grabR, -0.1);
    if (!t) { events.push({ e: 'whiff', k: e.key }); return; }
    e.s.carrying = t.key; e.s.holdT = 0; e.s.release = false; e.b.flags |= F.CARRY;
    t.s.carriedBy = e.key; t.s.esc = 0; t.s.stun = 0; t.b.flags = (t.b.flags & ~F.STUN) | F.FROZEN; t.b.vx = t.b.vz = 0;
    t.s.by = e.key; t.s.byAt = elapsed;
    events.push({ e: 'grab', k: e.key, t: t.key });
  }
  function release(t, x, z) { t.s.carriedBy = null; t.b.flags &= ~F.FROZEN; t.b.x = x; t.b.z = z; }
  function fling(e) {
    const t = ents.get(e.s.carrying); e.s.carrying = null; e.b.flags &= ~F.CARRY; if (!t) return;
    const p = Math.max(0.3, Math.min(1, e.s.holdT / RULES.fullHold)), fx = Math.sin(e.b.yaw), fz = Math.cos(e.b.yaw), sp = RULES.throwMin + (RULES.throwMax - RULES.throwMin) * p;
    release(t, e.b.x + fx * 0.5, e.b.z + fz * 0.5);
    t.b.y = RULES.carryY; t.s.air = true; t.s.vy = RULES.throwVy * (0.7 + 0.5 * p); t.s.bowled.clear();
    t.b.vx = fx * sp + e.b.vx * 0.3; t.b.vz = fz * sp + e.b.vz * 0.3; t.b.flags |= F.STUN | F.AIR; t.s.stun = RULES.landStun;
    t.s.by = e.key; t.s.byAt = elapsed;
    events.push({ e: 'throw', k: e.key, t: t.key, p: r2(p) });
  }
  /** The carrier lets go without a throw: shoved, wriggled out of, or falling. */
  function drop(e, wriggled) {
    const t = ents.get(e.s.carrying); e.s.carrying = null; e.b.flags &= ~F.CARRY; if (!t) return;
    const fx = Math.sin(e.b.yaw), fz = Math.cos(e.b.yaw);
    release(t, e.b.x + fx * 0.7, e.b.z + fz * 0.7); t.b.y = 0;
    t.b.vx = fx * 3; t.b.vz = fz * 3; t.b.flags |= F.STUN; t.s.stun = 0.25;
    if (wriggled) { e.b.flags |= F.STUN; e.s.stun = 0.55; e.b.vx = -fx * 2; e.b.vz = -fz * 2; t.s.ghost = 0.4; t.b.flags |= F.GHOST; }
    events.push({ e: wriggled ? 'escape' : 'drop', k: e.key, t: t.key });
  }
  function shove(e) {
    e.s.shoveCool = RULES.shoveCool;
    const fx = Math.sin(e.b.yaw), fz = Math.cos(e.b.yaw), t = frontOf(e, RULES.shoveR, 0.3, true);
    e.b.vx += fx * 3; e.b.vz += fz * 3;
    if (!t) { events.push({ e: 'shove', k: e.key }); return; }
    const dx = t.b.x - e.b.x, dz = t.b.z - e.b.z, d = Math.hypot(dx, dz) || 1;
    knock(t, e.key, dx / d, dz / d, RULES.shovePush, RULES.shoveStun);
    events.push({ e: 'shove', k: e.key, t: t.key, x: r2(t.b.x), z: r2(t.b.z) });
  }
  function startFall(e) {
    const s = e.s, b = e.b;
    if (s.carrying) drop(e, false);
    s.falling = true; s.vy = 0.5; s.back = RULES.respawn; s.air = false; b.flags = (b.flags & ~(F.CARRY | F.FROZEN | F.AIR)) | F.STUN;
    s.lives--;
    let credit = s.by && s.by !== e.key && elapsed - s.byAt <= RULES.credit ? playerOf(s.by) : null;
    if (s.dummy && solo) credit = players[0].pid;          // alone, every Bumble in the water counts
    if (credit != null) ents.get('p' + credit).s.kos++;
    if (!s.dummy && s.lives <= 0) s.outAt = elapsed;
    events.push({ e: 'fall', k: e.key, by: credit, lives: s.lives, x: r2(b.x), z: r2(b.z) });
  }
  function safeSpot() {
    let best = { x: 0, z: 0 }, bestD = -1;
    for (let k = 0; k < 14; k++) {
      const a = rng.range(0, Math.PI * 2), rr = rng.range(0, deck.shape === 'circle' ? R * 0.55 : 3.5), x = Math.sin(a) * rr, z = Math.cos(a) * rr * (deck.shape === 'circle' ? 1 : 0.8);
      if (inHole(x, z) || inHole(x + 0.8, z) || inHole(x - 0.8, z) || inHole(x, z + 0.8) || inHole(x, z - 0.8)) continue;
      let d = 99; for (const t of ents.values()) if (live(t) && !t.s.dummy) d = Math.min(d, Math.hypot(t.b.x - x, t.b.z - z));
      for (const br of barrels) d = Math.min(d, Math.abs(br.z - z) * 2);
      if (d > bestD) { bestD = d; best = { x, z }; }
    }
    return best;
  }
  function spawnDummy() {
    const at = safeSpot(), b = makeBody(r2(at.x), r2(at.z), rng.range(-3, 3)), key = 'd' + (++did);
    b.flags = F.GHOST; const s = mkState(null, true); s.ghost = 0.6;
    ents.set(key, { key, b, s, id: did });
    events.push({ e: 'pop', k: key });
  }
  function hazards(dt) {
    if (deck.spin) {
      const a = deck.spin * dt, c = Math.cos(a), sn = Math.sin(a);
      angle += a;
      for (const e of ents.values()) if (grounded(e)) { const { x, z } = e.b; e.b.x = x * c + z * sn; e.b.z = -x * sn + z * c; }
    }
    if (deck.sweeper) {
      const sw = deck.sweeper; sweep += sw.speed * dt;
      const ex = Math.sin(sweep) * sw.len, ez = Math.cos(sweep) * sw.len, tx = Math.cos(sweep), tz = -Math.sin(sweep);    // (tx, tz): the way the bar is moving
      for (const e of ents.values()) {
        if (!touchable(e) || e.s.hazard > 0) continue;
        const L = sw.len * sw.len, t = Math.max(0, Math.min(1, (e.b.x * ex + e.b.z * ez) / L)), dx = e.b.x - ex * t, dz = e.b.z - ez * t;
        if (Math.hypot(dx, dz) > 0.35 + BODY_R || t < 0.12) continue;
        const ox = ex / sw.len, oz = ez / sw.len;
        e.s.hazard = RULES.hazardCool; knock(e, null, tx * 0.85 + ox * 0.5, tz * 0.85 + oz * 0.5, sw.push * (0.5 + 0.5 * t), 0.45);
        events.push({ e: 'bonk', k: e.key, x: r2(e.b.x), z: r2(e.b.z) });
      }
    }
    for (const br of barrels) {
      br.x += br.v * dt; const lim = deck.hw - br.r * 0.5; if (br.x > lim) { br.x = lim; br.v = -Math.abs(br.v); } else if (br.x < -lim) { br.x = -lim; br.v = Math.abs(br.v); }
      for (const e of ents.values()) {
        if (!touchable(e) || e.s.hazard > 0 || Math.hypot(e.b.x - br.x, e.b.z - br.z) > br.r + BODY_R) continue;
        e.s.hazard = RULES.hazardCool; const side = Math.sign(e.b.z - br.z) || 1;
        knock(e, null, Math.sign(br.v) * 0.8, side * 0.6, 9, 0.5);
        events.push({ e: 'bonk', k: e.key, x: r2(e.b.x), z: r2(e.b.z) });
      }
    }
  }
  function dummyBrain(e, dt) {
    const s = e.s; if (s.carriedBy || s.falling) return null;
    const me = ents.get('p' + players[0].pid);
    s.think -= dt;
    if (s.wind > 0) { s.wind -= dt; if (s.wind <= 0 && touchable(me) && Math.hypot(me.b.x - e.b.x, me.b.z - e.b.z) < 1.6) { const dx = me.b.x - e.b.x, dz = me.b.z - e.b.z, d = Math.hypot(dx, dz) || 1; knock(me, e.key, dx / d, dz / d, RULES.dummyShove, 0.4); events.push({ e: 'shove', k: e.key, t: me.key, x: r2(me.b.x), z: r2(me.b.z) }); } return { mx: 0, mz: 0, b: 0 }; }
    if (s.think <= 0) {
      s.think = rng.range(0.6, 1.4);
      const toMe = live(me) && rng.chance(0.6); let tx, tz;
      if (toMe) { tx = me.b.x; tz = me.b.z; } else { const a = rng.range(0, 6.283), rr = rng.range(0, deck.shape === 'circle' ? R * 0.5 : 3); tx = Math.sin(a) * rr; tz = Math.cos(a) * rr; }
      const dx = tx - e.b.x, dz = tz - e.b.z, d = Math.hypot(dx, dz) || 1; s.mx = dx / d; s.mz = dz / d;
    }
    if (touchable(me) && !(e.b.flags & F.STUN) && Math.hypot(me.b.x - e.b.x, me.b.z - e.b.z) < 1.2 && rng.chance(dt * 0.9)) { s.wind = 0.6; e.b.yaw = Math.atan2(me.b.x - e.b.x, me.b.z - e.b.z); events.push({ e: 'tell', k: e.key }); return { mx: 0, mz: 0, b: 0 }; }
    // a Bumble steps back from the edge unless it is being pushed
    const nx = e.b.x + s.mx * 1.2, nz = e.b.z + s.mz * 1.2; if (!onDeck(nx, nz)) { s.mx = -s.mx; s.mz = -s.mz; }
    return { mx: s.mx * 0.9, mz: s.mz * 0.9, b: 0 };
  }

  return {
    bodies, events,
    init: () => ({ deck: { id: deck.id, name: deck.name, theme: deck.theme, shrink: deck.shrink || null, sweeper: deck.sweeper || null, spin: deck.spin || 0 }, arena, barrelZ: barrels.map(b => b.z), solo, lives: RULES.lives, left: Math.ceil(time) }),
    input(pid, inp) {
      const e = ents.get('p' + pid); if (!e || over) return;
      const s = e.s, b = e.b, bits = inp?.b | 0, pa = (bits & IN.A) && !(s.prevB & IN.A), pb = (bits & IN.B) && !(s.prevB & IN.B); s.prevB = bits;
      if (s.carriedBy) { if (pa || pb) { s.esc++; events.push({ e: 'wiggle', k: e.key, n: s.esc }); if (s.esc >= RULES.escape) { const c = ents.get(s.carriedBy); if (c) drop(c, true); } } return; }
      const free = live(e) && !s.air && !(b.flags & (F.STUN | F.GHOST));
      if (s.carrying) { if (!(bits & IN.A)) s.release = true; }
      else if (pa && free) grab(e);
      if (pb && free && !s.carrying && s.shoveCool <= 0) shove(e);
      stepBody(b, inp, meta.move, arena);
    },
    step(dt) {
      if (over) return;
      elapsed += dt; time -= dt;
      if (deck.shrink) R = radius();
      // Bumbles (alone only) think and walk
      if (solo) {
        nextDummy -= dt;
        if (nextDummy <= 0 && [...ents.values()].filter(e => e.s.dummy && live(e)).length < RULES.dummies) { nextDummy = RULES.dummyEvery; spawnDummy(); }
        for (const e of ents.values()) if (e.s.dummy) { const inp = dummyBrain(e, dt); if (inp && !e.s.falling) stepBody(e.b, inp, DUMMY_MOVE, arena); else if (!e.s.carriedBy && !e.s.falling) stepBody(e.b, null, DUMMY_MOVE, arena); }
      }
      hazards(dt);
      for (const e of ents.values()) {
        const s = e.s, b = e.b;
        if (s.shoveCool > 0) s.shoveCool -= dt; if (s.hazard > 0) s.hazard -= dt;
        if (s.ghost > 0) { s.ghost -= dt; if (s.ghost <= 0) b.flags &= ~F.GHOST; }
        // carrying: hold to wind up, let go to throw (never sooner than minHold, never longer than maxHold)
        if (s.carrying) {
          s.holdT += dt;
          if (s.dummy) s.release = false;
          if ((s.release && s.holdT >= RULES.minHold) || s.holdT >= RULES.maxHold) fling(e);
        }
        if (s.carriedBy) {
          const c = ents.get(s.carriedBy);
          if (s.dummy) { s.esc += dt; if (s.esc >= RULES.dummyEscape) { drop(c, true); continue; } }
          b.x = c.b.x + Math.sin(c.b.yaw) * 0.25; b.z = c.b.z + Math.cos(c.b.yaw) * 0.25; b.y = RULES.carryY; b.yaw = c.b.yaw;
          continue;
        }
        if (s.falling) {
          if (!(b.flags & F.OUT)) { s.vy -= 24 * dt; b.y += s.vy * dt; if (b.y < -6.5) { b.flags = F.OUT; b.vx = b.vz = 0; } }
          s.back -= dt;
          if (s.back <= 0 && s.lives > 0) {
            const at = safeSpot(); s.falling = false; s.stun = 0; s.by = null; s.ghost = RULES.ghost; s.air = false;
            b.x = r2(at.x); b.z = r2(at.z); b.y = 0; b.vx = b.vz = 0; b.yaw = Math.atan2(-b.x, -b.z); b.flags = F.GHOST;
            events.push({ e: 'back', k: e.key });
          }
          continue;
        }
        if (s.air) {
          s.vy -= RULES.grav * dt; b.y += s.vy * dt;
          for (const t of ents.values()) {         // a flung body bowls over whoever it flies into
            if (t === e || s.bowled.has(t.key) || !touchable(t) || t.key === s.by || Math.hypot(t.b.x - b.x, t.b.z - b.z) > RULES.bowlR) continue;
            s.bowled.add(t.key); const sp = Math.hypot(b.vx, b.vz) || 1;
            knock(t, s.by, b.vx / sp, b.vz / sp, sp * 0.65, 0.5);
            events.push({ e: 'bowl', k: t.key, by: s.by, x: r2(t.b.x), z: r2(t.b.z) });
          }
          if (b.y <= 0 && s.vy < 0) { b.y = 0; s.air = false; b.flags &= ~F.AIR; events.push({ e: 'land', k: e.key, x: r2(b.x), z: r2(b.z) }); }
        } else if (s.stun > 0) { s.stun -= dt; if (s.stun <= 0) b.flags &= ~F.STUN; }
        if (!s.air && !onDeck(b.x, b.z)) startFall(e);
      }
      // keep standing bodies apart
      const list = [...ents.values()].filter(e => grounded(e) && !(e.b.flags & F.GHOST));
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i].b, c = list[j].b, dx = c.x - a.x, dz = c.z - a.z, d = Math.hypot(dx, dz), min = BODY_R * 2;
        if (d >= min || d < 1e-6) continue; const push = (min - d) / 2, nx = dx / d, nz = dz / d; a.x -= nx * push; a.z -= nz * push; c.x += nx * push; c.z += nz * push;
      }
      for (const [k, e] of ents) if (e.s.dummy && e.b.flags & F.OUT) ents.delete(k);
      const standing = players.filter(p => ents.get('p' + p.pid).s.lives > 0).length;
      const dropping = players.some(p => { const e = ents.get('p' + p.pid); return e.s.falling && !(e.b.flags & F.OUT); });
      if ((((!solo && standing <= 1) || standing === 0) && !dropping) || time <= 0) {
        over = true; time = Math.max(0, time);
        for (const b of bodies.values()) { b.flags |= F.FROZEN; b.vx = b.vz = 0; }
      }
    },
    state() {
      const lv = {}, sc = {}, es = {};
      for (const p of players) { const s = ents.get('p' + p.pid).s; lv[p.pid] = s.lives; sc[p.pid] = s.kos; if (s.carriedBy && s.esc) es[p.pid] = s.esc; }
      const c = []; for (const e of ents.values()) if (e.s.carrying) c.push([e.key, e.s.carrying]);
      const g = { lv, sc, left: Math.ceil(Math.max(0, time)), c };
      if (Object.keys(es).length) g.es = es;
      if (deck.shrink) g.r = r2(R);
      if (deck.spin) g.a = r2(angle);
      if (deck.sweeper) g.sw = r2(sweep);
      if (barrels.length) g.br = barrels.map(br => r2(br.x));
      if (solo) g.d = [...ents.values()].filter(e => e.s.dummy).map(e => [e.id, r2(e.b.x), r2(e.b.z), r2(e.b.y), r2(e.b.yaw), e.b.flags, e.s.wind > 0 ? 1 : 0]);
      return g;
    },
    get over() { return over; },
    get debug() { return { deck: deck.id, ents, R, barrels }; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) {
        const s = ents.get('p' + p.pid).s; scores[p.pid] = s.kos;
        const k = (s.lives > 0 ? 1e6 : 0) + s.kos * 1e4 + Math.max(0, s.lives) * 100 + (s.lives > 0 ? 99 : Math.min(98, Math.floor(s.outAt)));
        if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p.pid);
      }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
  };
}
