// Knockabout — AI fighters (CPU players and wave goons). PURE: no DOM, no three.js.
//
// A bot produces the SAME held-button input a person would (mx, mz, jump, grabL/R, raiseL/R, duck), so
// everything it does goes through the same physics and rules. Its plan, re-thought every `think` seconds:
//   escape   someone is holding me -> mash the grab buttons (struggling) and punch
//   flee     I am standing somewhere dangerous (edge, pit, a hazard about to fire) -> walk to safe ground
//   finish   my target is knocked down -> grab them, drag them to the nearest edge / pit / hazard,
//            lift them (both arms up) and throw them off
//   brawl    otherwise walk up and punch; sometimes grab and drag a standing target too
// Levels (data/modes.json botLevels) change how often it thinks, punches, grabs, notices hazards and escapes.

import { wrapAngle } from './physics.js';

export function createBot(ctx, f, levelName = 'normal') {
  const L = ctx.botLevels[levelName] || ctx.botLevels.normal;
  const rng = ctx.rng;
  const b = {
    f, level: levelName, L,
    state: 'brawl', target: null, dump: null,
    thinkT: rng() * L.think, pauseT: 0, circle: 1, careless: false, tapT: [0, 0], tapHold: [0, 0], nextPunch: 0, liftT: 0, holdT: 0, mash: 0,
    move: [0, 0], wantGrab: false, wantRaise: false, duck: false, jump: false, stuckT: 0, lastPos: null,
  };

  function enemies() { return ctx.fighters.filter((o) => o !== f && o.alive && o.inWorld && ctx.isEnemy(f, o)); }
  const pos = () => f.torso.position;

  function pickTarget() {
    let best = null, bs = Infinity;
    for (const o of enemies()) {
      const d = Math.hypot(o.torso.position.x - pos().x, o.torso.position.z - pos().z);
      let s = d;
      if (o.down > 0) s -= 2.5;                 // a downed fighter is a chance
      if (o === b.target) s -= 1;               // stick with a target
      for (const [, ob] of ctx.botsMap || []) if (ob !== b && ob.target === o) s += 1.5; // spread out
      if (o.torso.position.y < (ctx.arena.def.outY + 3)) s += 50;
      if (s < bs) { bs = s; best = o; }
    }
    return best;
  }

  // Nearest place to throw someone: an edge point or a kill volume / deadly hazard.
  function nearestDump(from) {
    let best = null, bd = Infinity;
    for (const d of ctx.dumps) {
      const dist = Math.hypot(d.x - from.x, d.z - from.z);
      if (dist < bd) { bd = dist; best = d; }
    }
    return best;
  }

  function holdingFighter() {
    for (const h of f.hand) if (h.grip && h.grip.fighter) return h.grip.fighter;
    return null;
  }

  function think() {
    const p = pos();
    b.careless = rng() > L.hazardSense;
    if (b.pauseT > 0) return;
    if (b.state === 'brawl' && rng() < (L.pause || 0)) { b.pauseT = 0.6 + rng() * 1.0; b.circle = rng() < 0.5 ? 1 : -1; return; }
    b.target = pickTarget();
    const held = holdingFighter();
    const mySafe = ctx.arena.safeAt(p.x, p.z);
    if (f.gripsOnMe > 0 && rng() < L.escape) b.state = 'escape';
    else if (((b.state === 'flee' && b.fleeTo) || mySafe < 0.5) && rng() < L.hazardSense && !held) b.state = 'flee';
    else if (held) b.state = 'drag';
    else if (b.target && b.target.down > 0.35 && rng() < Math.max(0.5, L.grabChance + 0.3)) b.state = 'finish';
    else if (b.target && b.state !== 'grabUp' && rng() < L.grabChance * 0.25) b.state = 'grabUp';
    else if (b.state !== 'grabUp') b.state = 'brawl';
    if (b.state === 'grabUp' && (!b.target || b.holdT > 3)) { b.state = 'brawl'; b.holdT = 0; }
  }

  // Walk toward (x, z), steering around unsafe ground. Returns the distance left.
  function steer(tx, tz, allowEdge = false) {
    const p = pos();
    let dx = tx - p.x, dz = tz - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) { b.move = [0, 0]; return dist; }
    dx /= dist; dz /= dist;
    const look = 0.9;
    const tries = [0, 0.6, -0.6, 1.2, -1.2, 2.0, -2.0, Math.PI];
    let chosen = null;
    for (const a of tries) {
      const c = Math.cos(a), s = Math.sin(a);
      const rx = dx * c - dz * s, rz = dx * s + dz * c;
      const safe = ctx.arena.safeAt(p.x + rx * look, p.z + rz * look);
      if (safe > 0.6 || (allowEdge && a === 0 && safe > 0)) { chosen = [rx, rz]; break; }
      // a careless moment (decided per think): ignore hazards, but never walk into thin air
      if (b.careless && !ctx.arena.voidAt(p.x + rx * look, p.z + rz * look)) { chosen = [rx, rz]; break; }
    }
    if (!chosen) chosen = [dx, dz]; // nothing looks safe: just go
    // never take a step that ends over thin air, even a short one
    if (!allowEdge && ctx.arena.voidAt(p.x + chosen[0] * 0.45, p.z + chosen[1] * 0.45)) chosen = [0, 0];
    const speed = dist < 0.6 ? Math.max(0.35, dist / 0.6) : 1;
    b.move = [chosen[0] * speed, chosen[1] * speed];
    return dist;
  }

  function tap(i) { if (b.tapT[i] <= 0) { b.tapHold[i] = 3; b.tapT[i] = 1 / L.punchRate; } }

  function sweeperDodge() {
    // Jump the low bar / duck the high bar of a spinning arm when it is about to reach us.
    for (const h of ctx.arena.hazards.list) {
      if (h.kind !== 'sweeper') continue;
      const d = h.def, p = pos();
      const r = Math.hypot(p.x - d.p[0], p.z - d.p[2]);
      if (r > Math.max(...d.arms.map((a) => a.len)) + 0.5 || r < 0.8) continue;
      const beta = Math.atan2(-(p.z - d.p[2]), p.x - d.p[0]);
      for (const arm of d.arms) {
        let delta = wrapAngle(beta - (h.angle + (arm.angle || 0)));
        // bar through the hub: either end counts
        if (delta < 0) delta += Math.PI;
        if (delta > Math.PI) delta -= Math.PI;
        const w = h.w || 0.01;
        const tHit = w > 0 ? delta / w : (Math.PI - delta) / -w;
        if (tHit < 0.32 && tHit > 0) {
          if (rng() < L.jumpSense) { if (arm.y < 1) b.jump = true; else b.duck = true; }
        }
      }
    }
  }

  b.update = (dt) => {
    const inp = { mx: 0, mz: 0, jump: false, grabL: false, grabR: false, raiseL: false, raiseR: false, duck: false };
    if (!f.alive || !f.inWorld) return inp;
    b.thinkT -= dt;
    b.tapT[0] -= dt; b.tapT[1] -= dt;
    if (b.thinkT <= 0) { b.thinkT = L.think * (0.7 + rng() * 0.6); think(); }
    if (f.down > 0) return inp;
    b.jump = false; b.duck = false; b.move = [0, 0];
    let grab = false, raise = false;
    const p = pos();
    const t = b.target && b.target.alive && b.target.inWorld ? b.target : null;

    if (b.pauseT > 0 && b.state === 'brawl' && f.gripsOnMe === 0) {
      // circle the target at a respectful distance for a moment
      b.pauseT -= dt;
      if (t) {
        const tp = t.torso.position;
        const dx = p.x - tp.x, dz = p.z - tp.z, d = Math.hypot(dx, dz) || 1;
        const want = 2.2;
        const tx = tp.x + dx / d * want + (-dz / d) * b.circle * 1.2, tz = tp.z + dz / d * want + (dx / d) * b.circle * 1.2;
        steer(tx, tz);
        b.move = [b.move[0] * 0.6, b.move[1] * 0.6];
        f.wantFace = Math.atan2(tp.x - p.x, tp.z - p.z);
      }
      b.state = 'brawl';
    } else switch (b.state) {
      case 'escape': {
        b.mash = (b.mash + 1) % 4;
        if (b.mash === 0) tap(rng() < 0.5 ? 0 : 1);
        if (f.gripsOnMe === 0) b.state = 'brawl';
        break;
      }
      case 'flee': {
        // walk to the nearest safe spot (picked when we decided to flee, re-picked if it turns bad)
        if (!b.fleeTo || ctx.arena.safeAt(b.fleeTo[0], b.fleeTo[1]) < 0.6) b.fleeTo = ctx.safeSpot(p.x, p.z);
        const d = steer(b.fleeTo[0], b.fleeTo[1]);
        if (d < 0.4 || ctx.arena.safeAt(p.x, p.z) > 0.9) { b.state = 'brawl'; b.fleeTo = null; }
        break;
      }
      case 'finish':
      case 'grabUp': {
        if (!t) break;
        const tp = t.torso.position;
        const d = steer(tp.x, tp.z, true);
        f.wantFace = Math.atan2(tp.x - p.x, tp.z - p.z);
        if (d < 1.4) grab = true;
        if (b.state === 'grabUp') b.holdT += dt;
        if (holdingFighter()) { b.state = 'drag'; b.dump = nearestDump(p); b.liftT = 0; b.holdT = 0; }
        break;
      }
      case 'drag': {
        const held = holdingFighter();
        if (!held) { b.state = 'brawl'; break; }
        grab = true;
        b.holdT += dt;
        if (!b.dump) b.dump = nearestDump(p);
        const dp = b.dump;
        const d = Math.hypot(dp.x - p.x, dp.z - p.z);
        if (d > dp.stop) {
          steer(dp.x, dp.z, true);
          f.wantFace = Math.atan2(dp.x - p.x, dp.z - p.z);
          if (b.holdT > 7) b.dump = nearestDump(p); // re-plan if dragging forever
        } else {
          // at the edge: lift, step toward it, let go
          f.wantFace = Math.atan2(dp.x - p.x, dp.z - p.z);
          raise = true;
          b.liftT += dt;
          if (b.liftT > 0.55) { b.move = [(dp.x - p.x) / Math.max(d, 0.1), (dp.z - p.z) / Math.max(d, 0.1)]; }
          if (b.liftT > 0.85) { grab = false; b.state = 'brawl'; b.liftT = 0; b.holdT = 0; }
        }
        if (b.holdT > 10) { grab = false; b.state = 'brawl'; b.holdT = 0; }
        break;
      }
      default: { // brawl
        if (!t) {
          const c = ctx.safeSpot(p.x, p.z);
          steer(c[0], c[1]);
          break;
        }
        const tp = t.torso.position;
        const d = steer(tp.x, tp.z);
        f.wantFace = Math.atan2(tp.x - p.x, tp.z - p.z);
        // punch when in reach; a less accurate bot also swings from too far away and whiffs
        const reach = b.tapT[0] <= 0 && b.tapT[1] <= 0 && rng() > (L.accuracy ?? 0.8) * 0.97 ? 2.1 : 1.35;
        if (d < reach && rng() < L.aggro) tap(rng() < 0.5 ? 0 : 1);
        if (tp.y > p.y + 0.9 && d < 2 && rng() < 0.05) b.jump = true;
      }
    }

    sweeperDodge();

    // Edge sense (every few frames): if there is a drop right next to us, lean away from it.
    b.edgeT = (b.edgeT || 0) - dt;
    if (b.edgeT <= 0) {
      b.edgeT = 0.1;
      let ex = 0, ez = 0;
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a);
        if (ctx.arena.voidAt(p.x + cx * 0.75, p.z + cz * 0.75)) { ex -= cx; ez -= cz; }
      }
      b.edgePush = ex || ez ? [ex, ez] : null;
    }
    const dragging = b.state === 'drag' || b.state === 'finish';
    if (b.edgePush && !dragging && f.grounded) {
      const l = Math.hypot(b.edgePush[0], b.edgePush[1]) || 1;
      b.move = [b.move[0] * 0.4 + b.edgePush[0] / l * 0.8, b.move[1] * 0.4 + b.edgePush[1] / l * 0.8];
    }

    // Falling? grab whatever edge is in reach; hanging? climb back up after a moment.
    if (!f.grounded && f.torso.velocity.y < -1.5 && !holdingFighter()) grab = true;
    if (f.hanging && f.hanging()) {
      grab = true;
      b.hangT = (b.hangT || 0) + dt;
      if (b.hangT > 0.45 + rng() * 0.3) { b.jump = true; b.hangT = 0; }
      const c = ctx.safeSpot(p.x, p.z); const dx = c[0] - p.x, dz = c[1] - p.z, d = Math.hypot(dx, dz) || 1;
      b.move = [dx / d, dz / d];
    } else b.hangT = 0;

    // stuck detection: if we barely moved while trying to, hop
    if (b.lastPos) {
      const moved = Math.hypot(p.x - b.lastPos[0], p.z - b.lastPos[1]);
      if (Math.hypot(b.move[0], b.move[1]) > 0.5 && moved < 0.004) b.stuckT += dt; else b.stuckT = 0;
      if (b.stuckT > 0.8) { b.jump = true; b.stuckT = 0; }
    }
    b.lastPos = [p.x, p.z];

    inp.mx = b.move[0]; inp.mz = b.move[1];
    inp.jump = b.jump; inp.duck = b.duck && !grab;
    // a bot only holds on to a rope / rim when it is hanging from it — on its feet, an edge in hand is let go
    const edgeHand = (i) => f.grounded && f.hand[i].grip && f.hand[i].grip.ref === 'w';
    inp.grabL = (grab && !edgeHand(0)) || b.tapHold[0] > 0;
    inp.grabR = (grab && !edgeHand(1)) || b.tapHold[1] > 0;
    if (b.tapHold[0] > 0) b.tapHold[0]--;
    if (b.tapHold[1] > 0) b.tapHold[1]--;
    inp.raiseL = inp.raiseR = raise;
    return inp;
  };

  return b;
}

/**
 * Throw targets for an arena: walk out from the middle in 24 directions to the last bit of safe floor
 * (an edge), plus a point at the rim of each kill volume. `stop` = how close a dragger should get.
 */
export function findDumps(arena) {
  const def = arena.def;
  const dumps = [];
  const cx = def.cam && def.cam.look ? def.cam.look[0] : 0, cz = 0;
  const reach = Math.max(def.size[0], def.size[1]) * 0.75 + 2;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const dx = Math.cos(a), dz = Math.sin(a);
    let last = null;
    for (let r = 0.5; r < reach; r += 0.25) {
      const fl = arena.floorAt(cx + dx * r, cz + dz * r);
      if (!fl || fl.deadly || fl.y < -1.5) break;
      if (fl.body && fl.body.hazard && fl.body.hazard.kind === 'mover') break;
      last = r;
    }
    if (last != null && last > 1) dumps.push({ x: cx + dx * (last - 0.6), z: cz + dz * (last - 0.6), stop: 0.9, kind: 'edge' });
  }
  for (const k of def.kill || []) {
    // the closest floor point just outside the volume, from the middle
    const dx = k.p[0] - cx, dz = k.p[2] - cz;
    const d = Math.hypot(dx, dz);
    const ux = d > 0.01 ? dx / d : 1, uz = d > 0.01 ? dz / d : 0;
    const halfExt = Math.abs(ux) * k.size[0] / 2 + Math.abs(uz) * k.size[2] / 2;
    dumps.push({ x: k.p[0] - ux * (halfExt + 0.8), z: k.p[2] - uz * (halfExt + 0.8), stop: 0.6, kind: k.kind });
  }
  return dumps;
}
