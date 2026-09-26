// Player movement (docs/07 §2): a small state machine over the cell world. Pure: reads an Intent, moves
// the body with world/collide.js, reports events on the game bus. Numbers come from data/movement.json.
import { moveBox, grounded, overlapsSolid, depenetrate, sampleBox, wallTouchRows, extents, isSolidCell, headBlocked } from '../world/collide.js';
import { approach, clamp } from '../core/math.js';

const DT = 1 / 60;

export function createPlayerBody(x, y, cls = {}) {
  return {
    kind: 'player', id: 'player', x, y, px: x, py: y, w: 6, h: 12, vx: 0, vy: 0, facing: 1,
    state: 'idle', stateT: 0, grounded: true, coyote: 0, jumpBuf: 0, jumpHeld: 0, airMaxSpeed: 60,
    wallDir: 0, wallCoyote: 0, wallLock: 0, lastWallX: null, regrab: 0,
    fallStartY: y, landLag: 0, slideT: 0, slideCd: 0, crouched: false, ledge: null, climbT: 0,
    swimming: false, breath: 12, strokeCd: 0, strokeT: 0, knockT: 0, staggerT: 0, hurtT: 0,
    airJumps: 0, gliding: false, wallRunLeft: 0, onRope: null, ropeX: 0,
    traits: cls.movement || {}, // double jump, glide, wall run, sinks...
    anim: 'idle', animT: 0, dropT: 0,
  };
}

/**
 * @param game  { grid, data.movement, bus, flags: { swimming, act } }
 * @param p     player body
 * @param I     intent { left, right, up, down, jump, jumpPressed, run, ... }
 */
export function stepPlayerMovement(game, p, I) {
  const g = game.grid, M = game.data.movement, T = p.traits;
  p.px = p.x; p.py = p.y; p.stateT += DT; p.animT += DT;
  for (const k of ['coyote', 'jumpBuf', 'wallCoyote', 'wallLock', 'regrab', 'landLag', 'slideCd', 'strokeCd', 'strokeT', 'knockT', 'staggerT', 'hurtT', 'dropT']) if (p[k] > 0) p[k] = Math.max(0, p[k] - DT);
  if (I.jumpPressed) p.jumpBuf = M.jump.buffer;
  // dodge roll (docs/04 §2): 44 cells in 0.28 s, invulnerable for the first 0.18 s, 0.6 s before the next,
  // once per airtime; cancels melee recovery (after 60%) and a cast in progress
  const D = game.data.movesets?.shared?.dodge;
  if (p.dodgeCd > 0) p.dodgeCd -= DT;
  if (D && I.pressed?.dodge && p.dodgeCd <= 0 && !p.dodgeT && (p.grounded || !p.dodgeAirUsed) && p.state !== 'ledge' && p.state !== 'climb' && !p.swimming && (!p.melee?.move || p.meleeCancel)) {
    const dir = ((I.right ? 1 : 0) - (I.left ? 1 : 0)) || p.facing;
    p.dodgeT = D.time; p.dodgeDir = dir; p.facing = dir; p.invuln = Math.max(p.invuln || 0, D.iframes); p.dodgeCd = D.time + D.recovery;
    if (!p.grounded) p.dodgeAirUsed = true; if (p.melee) { p.melee.move = null; p.melee.phase = null; }
    if (p.cast?.casting) p.cast.casting = null; game.bus?.emit('player.dodge', { x: p.x, y: p.y, dir });
  }
  if (p.grounded) p.dodgeAirUsed = false;
  if (p.dodgeT > 0) {
    p.dodgeT = Math.max(0, p.dodgeT - DT); p.vx = p.dodgeDir * (D.dist / D.time); if (!p.grounded) p.vy = Math.min(p.vy, 30);
    setCrouch(game.grid, p, true); move(game, p, M, p.grounded); p.anim = 'slide'; p.grounded = grounded(game.grid, p);
    if (p.dodgeT === 0) { p.dodgeT = 0; p.vx *= 0.4; setCrouch(game.grid, p, false); }
    return;
  }
  const dir = (I.right ? 1 : 0) - (I.left ? 1 : 0);
  const control = p.knockT > 0 ? M.knock.control : 1;
  if (p.staggerT > 0) { applyGravity(p, M, 1); move(game, p, M, false); return; }

  // environment sample
  const env = sampleBox(g, p);
  const wasGrounded = p.grounded;
  p.grounded = grounded(g, p);
  const underMat = floorMat(g, p);
  const surf = surfaceMods(M, underMat, g, p);
  const inWeb = env.web > 0.1, webSlow = inWeb ? 0.35 : 1;
  p.inLiquid = env.liquid; p.headUnder = env.head;
  if (env.steam >= 0.2) { p.vy -= 1400 * env.steam * DT; if (p.vy < -90) p.vy = -90; p.fallStartY = p.y; }

  // ----- ropes / ladders (rope cells are climbable) -----
  const climbCell = touchingClimbable(g, p);
  if (p.state === 'climb') {
    if (!climbCell || I.jumpPressed) {
      p.state = 'fall'; p.coyote = M.jump.coyote;
      if (I.jumpPressed) { p.vy = -M.climb.offVy; p.vx = dir * M.climb.offVx; p.jumpBuf = 0; p.state = 'jump'; game.bus?.emit('player.jump', {}); }
    } else {
      p.vx = 0; const fast = I.down && I.run;
      p.vy = I.up ? -M.climb.ropeUp : I.down ? (fast ? M.climb.ropeFast : M.climb.ropeDown) : 0;
      if (dir) p.facing = dir;
      p.x = approach(p.x, climbCell.x + 0.5, 60 * DT);
      move(game, p, M, false); p.fallStartY = p.y; p.anim = p.vy ? 'climb' : 'climb_idle'; return;
    }
  } else if (climbCell && (I.up || (!p.grounded && (I.up || p.vy > 0) && p.stateT > 0.15 && (I.up)))) {
    p.state = 'climb'; p.stateT = 0; p.vx = 0; p.vy = 0; p.airJumps = 0; return;
  }

  // ----- swimming -----
  const canSwim = game.flags?.swimming || !!game.hero?.unlocked?.mechanics?.includes('swimming'); // the a3_n01 gift, or ?swim on the dev page
  if (env.liquid >= 0.55) {
    if (!p.swimming) { p.swimming = true; game.bus?.emit('player.splash', { x: p.x, y: p.y, v: p.vy }); if (p.vy > 160) p.vy = 160; }
    p.state = 'swim'; p.fallStartY = p.y; p.airJumps = 0;
    const sinks = T.sinks; const speed = (canSwim ? M.swim.speed : M.swim.paddle) * (T.swimMult || 1);
    const vdir = (I.down ? 1 : 0) - (I.up ? 1 : 0);
    let tvx = dir * speed, tvy = canSwim ? vdir * speed : 0;
    if (canSwim && I.down) tvy = M.swim.dive;
    const k = 1 - Math.exp(-M.swim.drag * DT);
    p.vx += (tvx - p.vx) * k; p.vy += (tvy - p.vy) * k;
    // buoyancy toward the surface unless diving / sinking
    if (!(canSwim && I.down)) p.vy -= (sinks ? -60 : (canSwim ? M.swim.buoyancy : 400)) * DT;
    if (canSwim && I.jumpPressed && p.strokeCd <= 0 && env.head) { p.strokeT = M.swim.strokeTime; p.strokeCd = M.swim.strokeCd; const d = Math.hypot(dir, vdir) || 1; p.vx = dir / d * M.swim.strokeV; p.vy = (vdir || -1) / d * M.swim.strokeV; p.jumpBuf = 0; }
    // jump out at the surface
    if (!env.head && p.jumpBuf > 0) { p.vy = -(p.strokeT > 0 ? M.swim.strokeJump : (canSwim ? M.swim.surfaceJump : 180)); p.jumpBuf = 0; p.swimming = false; p.state = 'jump'; game.bus?.emit('player.jump', {}); }
    // breath
    if (env.head && !T.noBreath) { p.breath = Math.max(0, p.breath - DT); if (p.breath <= 0) game.hurtPlayer?.(M.swim.drown * DT * (p.maxHp || 100), { kind: 'drown' }); }
    else p.breath = Math.min(M.swim.breath * (T.breathMult || 1), p.breath + M.swim.breathRefill * DT);
    if (dir) p.facing = dir;
    move(game, p, M, false); p.anim = env.head ? 'swim_under' : 'swim'; return;
  }
  if (p.swimming) { p.swimming = false; game.bus?.emit('player.splash', { x: p.x, y: p.y, v: p.vy, out: true }); }
  p.breath = Math.min(M.swim.breath * (T.breathMult || 1), p.breath + M.swim.breathRefill * DT);

  // ----- ledge hang -----
  if (p.state === 'ledge') {
    p.vx = 0; p.vy = 0;
    if (p.climbT > 0) { p.climbT -= DT; if (p.climbT <= 0) { p.x = p.ledge.x + p.ledge.dir * 4; p.y = p.ledge.y; p.state = 'idle'; p.grounded = true; p.ledge = null; } return; }
    if (I.up || I.jumpPressed && dir !== -p.ledge.dir) { if (I.jumpPressed && dir === -p.ledge.dir) {} else { p.climbT = M.ledge.climb; p.jumpBuf = 0; p.anim = 'ledge_climb'; return; } }
    if (I.jumpPressed && dir === -p.ledge.dir) { p.vx = dir * M.ledge.hopVx; p.vy = -M.ledge.hopVy; p.state = 'jump'; p.ledge = null; p.jumpBuf = 0; return; }
    if (I.down) { p.state = 'fall'; p.ledge = null; p.regrab = 0.25; p.fallStartY = p.y; return; }
    p.anim = 'ledge_hang'; return;
  }

  // ----- ground movement -----
  const maxBase = (I.run ? M.run.run * (T.runMult || 1) : M.run.walk) * surf.max * webSlow * (p.carry ? 0.8 : 1);
  if (p.grounded) {
    if (!wasGrounded) land(game, p, M, I);
    p.coyote = M.jump.coyote; p.airJumps = 0; p.gliding = false; p.wallRunLeft = T.wallRun ? 60 : 0;
    // crouch / crawl / slide
    const wantCrouch = I.down;
    if (p.slideT > 0) { p.slideT -= DT; p.vx = p.facing * Math.max(M.crouch.slideEnd, Math.abs(p.vx) - (M.crouch.slideV - M.crouch.slideEnd) / M.crouch.slideTime * DT); if (p.slideT <= 0) p.slideCd = M.crouch.slideCd; }
    else if (wantCrouch && Math.abs(p.vx) >= M.crouch.slideMinSpeed && p.slideCd <= 0 && I.run) { p.slideT = M.crouch.slideTime; p.vx = p.facing * M.crouch.slideV; setCrouch(g, p, true); game.bus?.emit('player.slide', {}); }
    else {
      if (wantCrouch) setCrouch(g, p, true); else setCrouch(g, p, false);
      const max = p.crouched ? M.crouch.crawl : maxBase;
      const target = dir * max * control;
      if (dir && Math.sign(p.vx) === -dir && p.vx !== 0) p.vx = approach(p.vx, target, M.run.turn * surf.decel * DT);
      else if (dir) p.vx = approach(p.vx, target, (Math.abs(p.vx) > M.run.walk ? M.run.runAccel : M.run.accel) * surf.accel * DT);
      else p.vx = approach(p.vx, 0, M.run.decel * surf.decel * DT);
      if (dir) p.facing = dir;
    }
    p.airMaxSpeed = Math.max(M.run.walk, Math.min(M.run.run * (T.runMult || 1), Math.abs(p.vx)));
    p.fallStartY = p.y;
    // wall-run (Chimneysweep)
    if (T.wallRun && I.run && dir && Math.abs(p.vx) >= 85 && wallTouchRows(g, p, dir) >= 8) { p.state = 'wallrun'; p.vy = -90; }
  } else {
    // air control
    if (p.wallLock <= 0 || Math.sign(dir) !== p.wallDir) {
      const max = Math.max(p.airMaxSpeed, M.run.walk) * webSlow;
      if (dir) { p.vx = approach(p.vx, dir * max * control, M.run.airAccel * DT); p.facing = dir; }
      else p.vx = approach(p.vx, 0, M.run.airDecel * DT);
    }
    if (p.crouched) setCrouch(g, p, false);
  }

  // ----- jump -----
  if (p.jumpBuf > 0 && p.landLag <= 0) {
    if (p.grounded || p.coyote > 0) {
      p.vy = -M.jump.v * surf.jump * (inWeb ? 0.5 : 1); p.grounded = false; p.coyote = 0; p.jumpBuf = 0; p.jumpHeld = 0; p.state = 'jump'; p.stateT = 0; setCrouch(g, p, false);
      if (p.slideT > 0) p.slideT = 0; game.bus?.emit('player.jump', {});
    } else if (p.wallCoyote > 0 && p.wallDir) {
      p.vx = -p.wallDir * M.wall.jumpVx; p.vy = -M.wall.jumpVy; p.wallLock = M.wall.lock; p.jumpBuf = 0; p.jumpHeld = 0; p.state = 'jump'; p.stateT = 0; p.facing = -p.wallDir; p.wallCoyote = 0; p.regrab = M.wall.regrab; p.lastWallX = Math.round(p.x);
      game.bus?.emit('player.walljump', {});
    } else if (T.doubleJump && p.airJumps < 1) {
      p.vy = -210; p.airJumps++; p.jumpBuf = 0; p.jumpHeld = 0; p.state = 'jump'; game.bus?.emit('player.jump', { double: true });
    }
  }
  if (p.state === 'jump') { p.jumpHeld++; if (!I.jump && p.jumpHeld >= M.jump.minHoldFrames && p.vy < 0) { p.vy *= M.jump.cut; p.state = 'fall'; } }

  // ----- wall slide -----
  p.wallDir = 0;
  if (!p.grounded && p.state !== 'wallrun') {
    const touch = dir ? wallTouchRows(g, p, dir) : 0;
    if (dir && touch >= M.wall.rowsNeeded && p.vy > 0 && p.regrab <= 0 && grippable(g, p, dir)) {
      p.wallDir = dir; p.wallCoyote = M.wall.coyote; p.state = 'wall';
      p.vy = Math.min(p.vy, M.wall.slide); p.fallStartY = p.y; p.airJumps = 0;
    } else if (p.state === 'wall') p.state = 'fall';
    // ledge grab: hand box near the head touches the top edge of a solid with free space above
    if (dir && p.vy >= M.ledge.minVy && p.regrab <= 0 && !p.carry) {
      const L = findLedge(g, p, dir, M);
      if (L) { p.state = 'ledge'; p.ledge = L; p.x = L.hangX; p.y = L.hangY; p.vx = 0; p.vy = 0; p.fallStartY = p.y; p.airJumps = 0; game.bus?.emit('player.ledge', {}); return; }
    }
  }
  if (p.state === 'wallrun') {
    p.vy = -90; p.wallRunLeft -= 90 * DT;
    if (p.wallRunLeft <= 0 || !dir || wallTouchRows(g, p, dir) < 6 || headBlocked(g, p)) p.state = 'fall';
  }

  // ----- gravity -----
  if (!p.grounded && p.state !== 'wallrun') {
    let grav = p.vy > 0 ? M.jump.fallGravity : M.jump.gravity, term = M.jump.terminal;
    if (I.jump && Math.abs(p.vy) < M.jump.apexHangVy) grav *= M.jump.apexHangScale;
    if (I.down && p.vy > 0) { grav = M.jump.fastFallGravity; term = M.jump.fastFallTerminal; }
    if (T.glide && I.jump && p.vy > 0) { term = 90; p.gliding = true; p.fallStartY = p.y; } else p.gliding = false;
    if (p.state === 'wall') term = M.wall.slide;
    p.vy = Math.min(term, p.vy + grav * DT);
    if (p.vy > 0 && p.state === 'jump') p.state = 'fall';
  }
  move(game, p, M, wasGrounded && p.vy >= 0);
  // animation state
  if (p.grounded) p.anim = p.slideT > 0 ? 'slide' : p.crouched ? (Math.abs(p.vx) > 2 ? 'crawl' : 'crouch') : Math.abs(p.vx) < 4 ? 'idle' : Math.abs(p.vx) > 70 ? 'run' : 'walk';
  else p.anim = p.state === 'wall' ? 'wall' : p.gliding ? 'glide' : p.vy < 0 ? 'jump' : 'fall';
  if (p.grounded && (p.state === 'fall' || p.state === 'jump' || p.state === 'wall')) p.state = 'idle';
}

function applyGravity(p, M, s) { p.vy = Math.min(M.jump.terminal, p.vy + M.jump.fallGravity * s * DT); }

function move(game, p, M, glue) {
  const g = game.grid;
  if (depenetrate(g, p) < 0) game.hurtPlayer?.(5 / 60 * 60 * DT * 60, { kind: 'crush' });
  const running = Math.abs(p.vx) > M.run.walk + 5;
  const res = moveBox(g, p, p.vx * DT, p.vy * DT, { stepUp: p.grounded ? (running ? M.body.stepUpRun : M.body.stepUp) : (p.vy < 0 ? M.body.stepUpAir : M.body.stepUp), stepDown: glue ? M.body.stepDown : 0, wasGrounded: glue });
  if (res.hitX) { if (Math.abs(p.vx) > 200 && p.knockT > 0) p.staggerT = M.knock.staggerTime; p.vx = 0; }
  if (res.bonk) { // corner correction: nudge sideways up to 3 cells if a head clips a corner
    let fixed = false;
    for (let d = 1; d <= M.body.cornerFix && !fixed; d++) for (const s of [-1, 1]) { const c = { ...p, x: p.x + s * d, y: p.y - 1 }; if (!overlapsSolid(g, c)) { p.x += s * d; fixed = true; break; } }
    if (!fixed) p.vy = 0;
  }
  if (res.landed) { if (p.vy > 0) p.vy = 0; p.grounded = true; }
  else if (res.hitY) p.vy = 0;
}

function land(game, p, M, I) {
  const fall = p.y - p.fallStartY;
  game.bus?.emit('player.land', { fall, x: p.x, y: p.y });
  if (fall > M.land.lagAbove) p.landLag = M.land.lag;
  if (fall > M.land.safeFall && !p.gliding) {
    const env = sampleBox(game.grid, { ...p, y: p.y + 2 });
    let frac = Math.min(M.land.dmgCap, Math.floor((fall - M.land.safeFall) / 20) * M.land.dmgPer20);
    const under = floorMat(game.grid, p); if (under === 19 || under === 17 || under === 15) frac *= 0.5; // soft landings
    if (I.down) frac *= 0.5; // tuck
    if (frac > 0) game.hurtPlayer?.(frac * (p.maxHp || 100), { kind: 'fall', noKill: true });
  }
  p.fallStartY = p.y;
}

function setCrouch(g, p, on) {
  if (on && !p.crouched) { p.crouched = true; p.h = 7; }
  else if (!on && p.crouched) { const tall = { ...p, h: 12 }; if (!overlapsSolid(g, tall)) { p.crouched = false; p.h = 12; } }
}

function floorMat(g, p) { const e = extents(p); const x = Math.round(p.x), y = e.bot + 1; return (x >= 0 && y >= 0 && x < g.W && y < g.H) ? g.mat[y * g.W + x] : 1; }
function surfaceMods(M, mat, g, p) {
  const key = g.mats.list[mat]?.key; const s = M.surfaces?.[key];
  if (s) return { accel: s.accel ?? 1, decel: s.decel ?? 1, max: s.max ?? 1, jump: s.jump ?? 1 };
  const e = extents(p), i = (e.bot + 1) * g.W + Math.round(p.x);
  if (i >= 0 && i < g.n && (g.flags[i] & 2)) { const w = M.surfaces.wet; return { accel: w.accel, decel: w.decel, max: 1, jump: 1 }; }
  return { accel: 1, decel: 1, max: 1, jump: 1 };
}
function grippable(g, p, dir) {
  const e = extents(p), x = dir > 0 ? e.r + 1 : e.l - 1, y = e.top + 4; if (x < 0 || x >= g.W || y < 0) return true;
  const m = g.mat[y * g.W + x]; return !(m === 9 || m === 5 || m === 23);
}
function touchingClimbable(g, p) {
  const e = extents(p);
  for (let y = e.top; y <= e.bot - 2; y++) for (let x = e.l + 1; x <= e.r - 1; x++) {
    if (x < 0 || y < 0 || x >= g.W || y >= g.H) continue; const m = g.mat[y * g.W + x]; if (g.mats.climbable[m]) return { x, y };
  }
  return null;
}
function findLedge(g, p, dir, M) {
  const e = extents(p), hx = dir > 0 ? e.r + 1 : e.l - 1;
  for (let row = 0; row < M.ledge.handRows; row++) {
    const y = e.top + row;
    if (!isSolidCell(g, hx, y) || isSolidCell(g, hx, y - 1)) continue;
    // top edge found at y; need free space above (freeAbove tall, freeWide wide) over the ledge
    let free = true;
    for (let yy = y - M.ledge.freeAbove; yy < y && free; yy++) for (let k = 0; k < M.ledge.freeWide; k++) if (isSolidCell(g, hx + dir * k, yy)) { free = false; break; }
    if (!free) continue;
    const hangY = y + p.h - 2; // hands at the ledge top, body hanging
    const hangX = dir > 0 ? hx - p.w / 2 : hx + 1 + p.w / 2;
    if (overlapsSolid(g, { ...p, x: hangX, y: hangY })) continue;
    return { dir, x: hx, y, hangX, hangY, standX: hx + dir * 3 };
  }
  return null;
}
