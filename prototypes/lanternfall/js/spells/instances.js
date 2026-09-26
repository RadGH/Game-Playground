// Live spell instances (docs/03 §5): one handler per shape, charm hooks, knots, combos. Pure.
import { compileWick } from './wick.js';
import { applyElement, explode, HARDNESS } from '../world/elements.js';
import { dealDamage, heal } from '../rpg/damage.js';
import { applyStatus } from '../rpg/status.js';
import { CLS } from '../world/materials.js';
import { isSolidCell } from '../world/collide.js';
import { hexToRgb01 } from '../core/math.js';
import { spawnVoidZone } from '../rpg/voidzones.js';

const DT = 1 / 60;
let NEXT = 1;

/** Targets an instance can hit: enemies for the player, the player (and allies) for enemies. */
function targetsFor(game, inst) {
  if (inst.team === 'player') return game.entities.filter(e => (e.kind === 'enemy' || e.kind === 'boss' || e.kind === 'dummy') && !e.dead && !e.intangible);
  if (inst.team === 'trap') return [game.player, ...game.entities.filter(e => (e.kind === 'enemy' || e.kind === 'ally') && !e.dead)].filter(Boolean); // traps hit anything
  return [game.player, ...game.entities.filter(e => e.kind === 'ally' && !e.dead)].filter(Boolean);
}
function boxOf(e) { return { x: e.x - e.w / 2, y: e.y - e.h, w: e.w, h: e.h }; }
function pointIn(e, x, y, pad = 0) { const b = boxOf(e); return x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad; }
function circleHits(e, x, y, r) { const b = boxOf(e); const cx = Math.max(b.x, Math.min(x, b.x + b.w)), cy = Math.max(b.y, Math.min(y, b.y + b.h)); return (cx - x) ** 2 + (cy - y) ** 2 <= r * r; }

/** Spawn every instance for one cast of a compiled plan. */
export function castPlan(game, caster, plan, aim, meta = {}) {
  const inst = [];
  const base = { team: caster === game.player || caster.team === 'player' ? 'player' : caster.team === 'trap' ? 'trap' : 'enemy', caster, plan, wickId: meta.wickId, wickName: meta.wickName, depth: meta.depth || 0, children: 0, knot: meta.knot || null, power: meta.power ?? 1 };
  const ox = aim.ox, oy = aim.oy, ang = Math.atan2(aim.y - oy, aim.x - ox);
  const n = plan.count;
  for (let k = 0; k < n; k++) {
    const a = ang + (n > 1 ? (k - (n - 1) / 2) * plan.spread * Math.PI / 180 : 0);
    const I = { ...base, id: NEXT++, shape: plan.shape, x: ox, y: oy, px: ox, py: oy, vx: Math.cos(a) * plan.speed, vy: Math.sin(a) * plan.speed, ang: a, t: 0, life: plan.lifetime, hit: new Set(), bounces: plan.bounces, pierce: plan.pierce, retarget: 1, timerT: 0, alive: true };
    switch (plan.shape) {
      case 'arc': I.life = Math.max(0.15, plan.lifetime); I.x = caster.x; I.y = caster.y - 7; break;
      case 'ring': I.x = caster.x; I.y = caster.y - 6; I.radius = 0; I.maxR = plan.size; I.life = plan.lifetime; break;
      case 'beam': I.life = plan.lifetime; I.tickT = 0; I.holding = true; break;
      case 'rune': { const hit = firstSurface(game, ox, oy, a, plan.range || 80); if (!hit) { game.bus?.emit('cast.fizzle', { caster }); return []; } I.x = hit.x; I.y = hit.y; I.normal = hit.normal; I.armT = plan.armTime; I.vx = I.vy = 0; limitOut(game, caster, 'rune', plan.maxOut || 3); break; }
      case 'wave': I.y = caster.y - 1; I.x = caster.x + Math.sign(Math.cos(a) || caster.facing) * 4; I.dir = Math.sign(Math.cos(a)) || caster.facing || 1; I.vx = I.dir * plan.speed; I.vy = 0; I.grounded = false; break;
      case 'tether': { const A = firstSurface(game, ox, oy, a, plan.range || 120); if (!A) { game.bus?.emit('cast.fizzle', { caster, refund: plan.oil }); return []; } const B = nearestSolid(game, caster.x, caster.y - 2, 8) || { x: caster.x, y: caster.y - 1 }; I.ax = A.x; I.ay = A.y; I.bx = B.x; I.by = B.y; I.x = (A.x + B.x) / 2; I.y = (A.y + B.y) / 2; I.vx = I.vy = 0; I.tickT = 0; limitOut(game, caster, 'tether', plan.maxOut || 2); game.climbLines = game.climbLines || []; I.line = { ax: A.x, ay: A.y, bx: B.x, by: B.y, inst: I }; game.climbLines.push(I.line); break; }
    }
    inst.push(I);
  }
  game.spells.push(...inst);
  if (plan.shape === 'ring') applyElement(game, caster.x, caster.y - 6, 10, plan.flame, { fromPlayer: base.team === 'player' });
  if (plan.echo && !meta.isEcho) game.pending.push({ at: game.time + plan.echo.delay, fn: () => castPlan(game, caster, plan, aim, { ...meta, isEcho: true, power: (meta.power ?? 1) * plan.echo.power }) });
  return inst;
}
function limitOut(game, caster, shape, max) { const mine = game.spells.filter(s => s.shape === shape && s.caster === caster && s.alive); while (mine.length >= max) { const old = mine.shift(); endInstance(game, old, false); } }

/** Step all live instances. */
export function stepSpells(game) {
  for (const I of game.spells) if (I.alive) { I.t += DT; stepOne(game, I); }
  game.spells = game.spells.filter(I => I.alive);
  if (game.climbLines) game.climbLines = game.climbLines.filter(l => l.inst.alive);
  // pending echoes / delayed casts
  if (game.pending.length) { const now = game.time; const due = game.pending.filter(p => p.at <= now); game.pending = game.pending.filter(p => p.at > now); for (const p of due) p.fn(); }
}

function stepOne(game, I) {
  const P = I.plan, g = game.grid;
  switch (I.shape) {
    case 'bolt': case 'lob': {
      if (P.seek && I.team === 'player') steer(game, I, P.seek);
      if (I.shape === 'lob') I.vy += (P.gravity || 600) * DT;
      I.px = I.x; I.py = I.y;
      const inLiquid = g.liquidAt(I.x | 0, I.y | 0);
      const sp = inLiquid && P.flame !== 'tide' && P.flame !== 'rime' ? 0.4 : 1;
      const nx = I.x + I.vx * DT * sp, ny = I.y + I.vy * DT * sp;
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(nx - I.x), Math.abs(ny - I.y))));
      for (let s = 1; s <= steps && I.alive; s++) {
        const x = I.x + (nx - I.x) * s / steps, y = I.y + (ny - I.y) * s / steps;
        // enemies
        for (const e of targetsFor(game, I)) {
          if (I.hit.has(e.id) || !pointIn(e, x, y, P.size * 0.5)) continue;
          I.hit.add(e.id); hitTarget(game, I, e, 1);
          if (I.shape === 'lob') { burst(game, I, x, y); return; }
          if (I.pierce > 0) { I.pierce--; I.powerMult = (I.powerMult || 1) * 0.9; continue; }
          if (I.bounces > 0) { I.bounces--; I.powerMult = (I.powerMult || 1) * 0.85; retargetBounce(game, I, e); return; }
          endInstance(game, I, true, x, y); return;
        }
        // cells
        const cx = x | 0, cy = y | 0;
        if (cx < 0 || cy < 0 || cx >= g.W || cy >= g.H) { I.alive = false; return; }
        const m = g.mat[cy * g.W + cx], c = g.mats.cls[m];
        if (c === CLS.LIQUID && I.shape === 'lob') { if (!I.sinking) { I.sinking = true; I.vx *= 0.2; I.vy = 40; I.life = Math.min(I.life, I.t + 1.0); } }
        if (c === CLS.STATIC || c === CLS.POWDER) {
          const hard = HARDNESS[m] ?? 3;
          if (hard === 0 && I.shape === 'bolt') { g.set(cx, cy, 0); continue; } // punch through sand/ash
          if (I.bounces > 0) { I.bounces--; I.powerMult = (I.powerMult || 1) * 0.85; bounceOff(g, I, cx, cy); game.bus?.emit('spell.bounce', { x, y }); return; }
          if (I.shape === 'lob') { burst(game, I, I.x + (nx - I.x) * (s - 1) / steps, I.y + (ny - I.y) * (s - 1) / steps); return; }
          cellImpact(game, I, x - Math.cos(I.ang), y - Math.sin(I.ang), 2);
          endInstance(game, I, true, x - Math.cos(I.ang), y - Math.sin(I.ang)); return;
        }
      }
      I.x = nx; I.y = ny; I.ang = Math.atan2(I.vy, I.vx);
      knotTimer(game, I);
      if (I.t >= I.life) { if (I.shape === 'lob') burst(game, I, I.x, I.y); else endInstance(game, I, true, I.x, I.y); }
      break;
    }
    case 'arc': {
      const c = I.caster; I.x = c.x; I.y = c.y - 7; const r = P.size, half = (P.sweep || 150) / 2 * Math.PI / 180;
      for (const e of targetsFor(game, I)) {
        if (I.hit.has(e.id)) continue; const dx = e.x - I.x, dy = e.y - e.h / 2 - I.y, d = Math.hypot(dx, dy);
        if (d > r + e.w / 2) continue; let da = Math.atan2(dy, dx) - I.ang; da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) > half && d > 6) continue;
        I.hit.add(e.id); hitTarget(game, I, e, 1);
      }
      // reflect enemy projectiles
      for (const o of game.spells) if (o.team !== I.team && (o.shape === 'bolt' || o.shape === 'lob') && Math.hypot(o.x - I.x, o.y - I.y) < r) { o.vx = -o.vx; o.vy = -o.vy; o.team = I.team; o.caster = I.caster; o.hit.clear(); }
      if (!I.cellsDone) { I.cellsDone = true; for (let k = -2; k <= 2; k++) { const a = I.ang + k * half / 2; cellImpact(game, I, I.x + Math.cos(a) * r * 0.8, I.y + Math.sin(a) * r * 0.8, 3); } }
      if (I.t >= I.life) endInstance(game, I, false);
      break;
    }
    case 'ring': {
      const prev = I.radius; I.radius = Math.min(I.maxR, I.maxR * I.t / Math.max(0.05, I.life));
      for (const e of targetsFor(game, I)) {
        if (I.hit.has(e.id)) continue; const d = Math.hypot(e.x - I.x, e.y - e.h / 2 - I.y);
        if (d <= I.radius + e.w / 2) { I.hit.add(e.id); const push = P.flame === 'tide' ? 200 : 80; hitTarget(game, I, e, 1, { x: (e.x - I.x) / (d || 1) * push, y: -60 }); }
      }
      for (const o of game.spells) if (o.team !== I.team && (o.shape === 'bolt' || o.shape === 'lob') && Math.hypot(o.x - I.x, o.y - I.y) < I.radius) o.alive = false;
      if (((game.tick) & 3) === 0) pushLoose(game, I.x, I.y, prev, I.radius, P.flame);
      if (I.t >= I.life) endInstance(game, I, false);
      break;
    }
    case 'beam': {
      const c = I.caster, aim = I.aimFn ? I.aimFn() : null;
      if (!I.holding || I.t >= I.life) { endInstance(game, I, false); break; }
      const tip = c.lantern || { x: c.x + c.facing * 6, y: c.y - 16 };
      I.x = tip.x; I.y = tip.y;
      if (aim) { const ta = Math.atan2(aim.y - I.y, aim.x - I.x); let da = Math.atan2(Math.sin(ta - I.ang), Math.cos(ta - I.ang)); I.ang += Math.max(-0.2, Math.min(0.2, da)); }
      const warm = I.t < (P.castTime || 0.15);
      // raycast
      let ex = I.x, ey = I.y, len = P.length || 140;
      for (let s = 1; s <= len; s++) { const x = I.x + Math.cos(I.ang) * s, y = I.y + Math.sin(I.ang) * s; const cx = x | 0, cy = y | 0; if (!g.inside(cx, cy)) break; const m = g.mat[cy * g.W + cx]; const cl = g.mats.cls[m];
        if (cl === CLS.STATIC || cl === CLS.POWDER) { const hard = HARDNESS[m] ?? 3; if (hard >= 2 && m !== 5) { ex = x; ey = y; break; } if (!warm && (game.tick % 12 === 0)) cellImpact(game, I, x, y, 1); } ex = x; ey = y; }
      I.ex = ex; I.ey = ey;
      if (!warm) {
        I.tickT += DT; const every = 1 / (P.tickRate || 10);
        if (I.tickT >= every) { I.tickT -= every;
          for (const e of targetsFor(game, I)) if (segHits(e, I.x, I.y, ex, ey, (P.size || 3) / 2)) hitTarget(game, I, e, 1, null, { dot: false });
          if (game.tick % 6 === 0) cellImpact(game, I, ex, ey, 2);
        }
        // oil per second
        if (I.team === 'player') { const cost = P.oil * DT; if (c.oil < cost) { endInstance(game, I, false); break; } c.oil -= cost; I.oilSpent = (I.oilSpent || 0) + cost; }
      }
      break;
    }
    case 'rune': {
      if (I.armT > 0) { I.armT -= DT; break; }
      if (!isSolidCell(g, I.x - (I.normal?.x || 0), I.y - (I.normal?.y || 0))) { burst(game, I, I.x, I.y); break; }
      const w = 6 + (P.charms.includes('seek') ? 10 : 0);
      for (const e of targetsFor(game, I)) if (Math.abs(e.x - I.x) < w + e.w / 2 && Math.abs((e.y - e.h / 2) - I.y) < 6 + e.h / 2) { burst(game, I, I.x, I.y); break; }
      knotTimer(game, I, 1.0);
      if (I.t >= I.life) endInstance(game, I, false);
      break;
    }
    case 'wave': {
      // fall until grounded, then run along the ground climbing up to 3 cells
      if (!isSolidCell(g, Math.round(I.x), Math.round(I.y) + 1)) { I.y += Math.min(400 * DT, 6); }
      else {
        const step = I.vx * DT; const nx = I.x + step; let ny = I.y; let ok = false;
        for (let up = 0; up <= 3; up++) { if (!isSolidCell(g, Math.round(nx), Math.round(I.y) - up)) { ny = I.y - up; ok = true; break; } }
        if (!ok) { if (I.bounces > 0) { I.bounces--; I.dir = -I.dir; I.vx = -I.vx; I.hit.clear(); } else { endInstance(game, I, true, I.x, I.y - 4); break; } }
        else { let drop = 0; while (drop < 12 && !isSolidCell(g, Math.round(nx), Math.round(ny) + 1)) { ny++; drop++; } if (drop >= 12) { endInstance(game, I, true, nx, ny); break; } I.x = nx; I.y = ny; }
      }
      const h = P.size || 12;
      for (const e of targetsFor(game, I)) { if (I.hit.has(e.id)) continue; if (Math.abs(e.x - I.x) < 4 + e.w / 2 && e.y > I.y - h && e.y - e.h < I.y + 1) { I.hit.add(e.id); hitTarget(game, I, e, 1, { x: I.dir * 60, y: -40 }); } }
      if (game.tick % 4 === 0) cellImpact(game, I, I.x, I.y - 2, 2);
      if (I.t >= I.life) endInstance(game, I, true, I.x, I.y - 4);
      break;
    }
    case 'tether': {
      I.tickT += DT; const every = 1 / (P.tickRate || 5);
      if (I.team === 'player') { I.caster.oil -= (P.upkeep ?? 1) * DT; if (I.caster.oil <= 0) { I.caster.oil = 0; endInstance(game, I, false); break; } } // tether upkeep (docs/03)
      if (!isSolidCell(g, I.ax, I.ay)) { endInstance(game, I, false); break; }
      if (I.tickT >= every) { I.tickT -= every; for (const e of targetsFor(game, I)) if (segHits(e, I.ax, I.ay, I.bx, I.by, 1)) hitTarget(game, I, e, 1); }
      if (I.t >= I.life) endInstance(game, I, false);
      break;
    }
  }
}

function segHits(e, x0, y0, x1, y1, w) {
  const b = boxOf(e); const cx = b.x + b.w / 2, cy = b.y + b.h / 2; const dx = x1 - x0, dy = y1 - y0; const l2 = dx * dx + dy * dy || 1;
  let t = ((cx - x0) * dx + (cy - y0) * dy) / l2; t = Math.max(0, Math.min(1, t)); const px = x0 + dx * t, py = y0 + dy * t;
  return Math.abs(px - cx) <= b.w / 2 + w && Math.abs(py - cy) <= b.h / 2 + w;
}
function steer(game, I, rate) {
  let best = null, bd = 90;
  for (const e of targetsFor(game, I)) { if (I.hit.has(e.id)) continue; const dx = e.x - I.x, dy = e.y - e.h / 2 - I.y, d = Math.hypot(dx, dy); if (d > bd) continue; let da = Math.atan2(dy, dx) - I.ang; da = Math.atan2(Math.sin(da), Math.cos(da)); if (Math.abs(da) > Math.PI / 4 && d > 30) continue; best = { dx, dy, da }; bd = d; }
  if (!best) return; const turn = rate * Math.PI / 180 * DT; const da = Math.max(-turn, Math.min(turn, best.da)); I.ang += da;
  const sp = Math.hypot(I.vx, I.vy); I.vx = Math.cos(I.ang) * sp; I.vy = Math.sin(I.ang) * sp;
}
function retargetBounce(game, I, from) {
  let best = null, bd = 60; for (const e of targetsFor(game, I)) { if (e === from || I.hit.has(e.id)) continue; const d = Math.hypot(e.x - I.x, e.y - I.y); if (d < bd) { bd = d; best = e; } }
  const sp = Math.hypot(I.vx, I.vy);
  if (best) { const a = Math.atan2(best.y - best.h / 2 - I.y, best.x - I.x); I.vx = Math.cos(a) * sp; I.vy = Math.sin(a) * sp; } else { I.vx = -I.vx; I.vy = -I.vy; }
}
function bounceOff(g, I, cx, cy) {
  const hitX = isSolidCell(g, (I.px + I.vx * DT) | 0, I.py | 0), hitY = isSolidCell(g, I.px | 0, (I.py + I.vy * DT) | 0);
  if (hitX || !hitY) I.vx = -I.vx; if (hitY || !hitX) I.vy = -I.vy; I.x = I.px; I.y = I.py; I.hit.clear();
}
function firstSurface(game, ox, oy, a, range) {
  const g = game.grid; let px = ox, py = oy;
  for (let s = 1; s <= range; s++) { const x = ox + Math.cos(a) * s, y = oy + Math.sin(a) * s; if (isSolidCell(g, x | 0, y | 0)) { return { x: px, y: py, normal: { x: Math.sign(px - (x | 0)) || 0, y: Math.sign(py - (y | 0)) || -1 }, cx: x | 0, cy: y | 0 }; } px = x; py = y; }
  return null;
}
function nearestSolid(game, x, y, r) { const g = game.grid; for (let d = 0; d <= r; d++) for (let k = -d; k <= d; k++) for (const [dx, dy] of [[k, d], [k, -d], [d, k], [-d, k]]) if (isSolidCell(g, (x + dx) | 0, (y + dy) | 0)) return { x: x + dx, y: y + dy }; return null; }
function pushLoose(game, cx, cy, r0, r1, flame) {
  const g = game.grid, cls = g.mats.cls;
  for (let k = 0; k < 64; k++) { const a = k / 64 * Math.PI * 2; for (let rr = Math.floor(r0); rr <= r1; rr += 2) { const x = Math.round(cx + Math.cos(a) * rr), y = Math.round(cy + Math.sin(a) * rr); if (!g.inside(x, y)) continue; const m = g.mat[y * g.W + x], c = cls[m]; if (c === CLS.POWDER || c === CLS.LIQUID || c === CLS.GAS) { const tx = Math.round(x + Math.cos(a) * 3), ty = Math.round(y + Math.sin(a) * 3); if (g.get(tx, ty) === 0) g.swap(y * g.W + x, ty * g.W + tx, x, y, tx, ty); } } }
}

function cellImpact(game, I, x, y, r) {
  const P = I.plan;
  const res = applyElement(game, x, y, r + (P.charms.includes('vast') ? 2 : 0), P.flame, { dig: P.dig, fromPlayer: I.team === 'player', water: 6 });
  combosFromCells(game, I, x, y, res);
  return res;
}
function combosFromCells(game, I, x, y, res) {
  // steam burst: ember boiled >= 20 cells in 0.5 s from one cast
  if (res.boiled) { I.boiled = (I.boiled || 0) + res.boiled; if (I.boiled >= 20 && !I.steamBurst) { I.steamBurst = true; steamBurst(game, I, x, y); } }
  if (res.shockedWater) electrifiedWater(game, I, x, y);
}
function steamBurst(game, I, x, y) {
  game.bus?.emit('combo', { id: 'steam_burst', x, y });
  const dmg = I.plan.damage * 2 * (I.power || 1);
  for (const e of targetsFor(game, I)) if (circleHits(e, x, y, 20)) { const d = Math.hypot(e.x - x, e.y - y) || 1; dealDamage(game, { source: I.caster, target: e, amount: dmg, flame: 'ember', via: 'combo:steam_burst', viaName: 'Steam Burst', knock: { x: (e.x - x) / d * 220, y: -160 } }); }
  explode(game, Math.round(x), Math.round(y), 10, 12, { source: I.caster });
}
function electrifiedWater(game, I, x, y) {
  if (game.shockZones.some(z => Math.hypot(z.x - x, z.y - y) < 40 && z.t > 1.5)) return;
  game.shockZones.push({ x, y, t: 2.0, tickT: 0, dmg: I.plan.damage * 0.6 * (I.power || 1), caster: I.caster, wickId: I.wickId });
  game.bus?.emit('combo', { id: 'electrified', x, y });
}

/** Burst (lob, rune, volatile end): damage in radius, full inside half. */
function burst(game, I, x, y, radiusOverride, mult = 1) {
  const P = I.plan; const r = radiusOverride || Math.max(P.size, P.shape === 'rune' ? 16 : 14) * (P.charms.includes('vast') ? 1.6 : 1);
  for (const e of targetsFor(game, I)) { if (!circleHits(e, x, y, r)) continue; const d = Math.hypot(e.x - x, e.y - e.h / 2 - y); const f = d <= r / 2 ? 1 : 0.6; hitTarget(game, I, e, f * mult, { x: (e.x - x) / (d || 1) * 120 * P.knock, y: -90 }); }
  const res = I.team === 'player' ? applyElement(game, x, y, Math.round(r * 0.7), P.flame, { dig: Math.max(1, P.dig), fromPlayer: true, water: 40 }) : {};
  combosFromCells(game, I, x, y, res);
  game.flashes.push({ x, y, r: r * 3, color: hexToRgb01(P.color), i: 1.5, t: 0.25, max: 0.25 });
  if (P.enemyOnLand?.voidZone) spawnVoidZone(game, P.enemyOnLand.voidZone, x, y, { source: I.caster });
  if (I.team === 'player') game.things?.spellHit(x, y, P.flame, P.shape);
  game.bus?.emit('spell.burst', { x, y, flame: P.flame, r });
  if (P.shape === 'rune' || P.shape === 'lob') game.shake?.(0.12);
  endInstance(game, I, true, x, y, true);
}

/** Damage + status + siphon + knots for one instance hitting one target. */
function hitTarget(game, I, e, mult = 1, knock = null, opts = {}) {
  const P = I.plan; let amount = P.damage * mult * (I.power || 1) * (I.powerMult || 1);
  if (P.flame === 'gleam' && e.team === 'player' && e !== I.caster) { heal(game, I.caster, e, amount * 0.6, I.wickId, I.wickName); return; }
  // shatter frozen
  if (e.statuses?.frozen && P.flame !== 'rime') { amount *= P.charms.includes('heavy') ? 2 : 1.5; delete e.statuses.frozen; e.statuses.thawing = { stacks: 1, t: 4 }; game.bus?.emit('combo', { id: 'shatter', x: e.x, y: e.y - e.h / 2 }); }
  let crit = false; if (P.flame === 'spark' && e.statuses?.chill?.stacks >= 3) crit = true;
  const k = knock || (P.flame === 'tide' ? { x: Math.cos(I.ang) * 140 * P.knock, y: -60 } : { x: Math.cos(I.ang) * 30 * P.knock, y: -10 });
  const taken = dealDamage(game, { source: I.caster, target: e, amount, flame: P.flame, via: I.wickId || `spell:${P.flame}_${P.shape}`, viaName: I.wickName || `${P.flame} ${P.shape}`, knock: k, crit, critChance: I.caster.crit || 0, critMult: I.caster.critMult || 1.5, tags: [P.shape, ...P.charms] });
  const st = P.status; const stacks = P.charms.includes('heavy') && (st === 'burn' || st === 'chill' || st === 'corrode') ? 2 : 1;
  if (st && !e.dead) applyStatus(game, e, st, { source: I.caster, hitDamage: taken, stacks, via: I.wickId, viaName: I.wickName });
  if (P.flame === 'spark' && !opts.chain) chain(game, I, e, taken);
  if (P.flame === 'shade' && I.caster.hp != null) { heal(game, I.caster, I.caster, taken * 0.06, I.wickId, I.wickName); I.caster.oil = Math.min(I.caster.maxOil || 100, (I.caster.oil || 0) + taken * 0.04); }
  if (P.siphon && I.team === 'player') { const cap = P.oil * 0.3; const back = Math.min(cap - (I.siphoned || 0), taken * P.siphon.oil); if (back > 0) { I.caster.oil = Math.min(I.caster.maxOil, I.caster.oil + back); I.siphoned = (I.siphoned || 0) + back; } heal(game, I.caster, I.caster, taken * P.siphon.hp, I.wickId, I.wickName); }
  if (I.knot && I.depth === 0 && I.knot.trigger === 'on_hit') fireKnot(game, I, e.x, e.y - e.h / 2);
  if (I.knot && I.depth === 0 && I.knot.trigger === 'on_kill' && e.dead) fireKnot(game, I, e.x, e.y - e.h / 2);
}
function chain(game, I, from, dmg) {
  let cur = from, d = dmg; const hit = new Set([from.id]);
  for (let j = 0; j < 2 + (I.plan.chainBonus || 0); j++) {
    let best = null, bd = 48; for (const e of targetsFor(game, I)) { if (hit.has(e.id)) continue; const dist = Math.hypot(e.x - cur.x, e.y - cur.y); if (dist < bd) { bd = dist; best = e; } }
    if (!best) break; hit.add(best.id); d *= 0.7;
    game.arcs.push({ x0: cur.x, y0: cur.y - cur.h / 2, x1: best.x, y1: best.y - best.h / 2, t: 0.15, color: I.plan.color });
    dealDamage(game, { source: I.caster, target: best, amount: d, flame: 'spark', via: I.wickId, viaName: (I.wickName || 'Spark') + ' (chain)', tags: ['chain'] });
    applyStatus(game, best, 'shocked', { source: I.caster }); cur = best;
  }
}
function knotTimer(game, I, every = 0.5) {
  if (!I.knot || I.depth > 0 || I.knot.trigger !== 'on_timer') return;
  I.timerT += DT; if (I.timerT >= every) { I.timerT -= every; fireKnot(game, I, I.x, I.y); }
}
function fireKnot(game, I, x, y) {
  const K = I.knot; if (!K || I.children >= (K.max || 3)) return;
  const caster = I.caster; const childPlan = compileWick(K.child, game.data, caster.stats || {}, {});
  const cost = childPlan.oil * 0.5 * (K.oilExtra || 1);
  if (I.team === 'player') { if (caster.oil < cost) { game.bus?.emit('cast.fizzle', { caster, quiet: true }); return; } caster.oil -= cost; }
  I.children++;
  const aimA = I.ang ?? 0;
  castPlan(game, caster, childPlan, { ox: x, oy: y, x: x + Math.cos(aimA) * 50, y: y + Math.sin(aimA) * 50 }, { wickId: `knot:${I.wickId}`, wickName: `${I.wickName} ↳ ${K.child.flame} ${K.child.shape}`, depth: 1, power: 0.6 * (K.powerExtra || 1) });
}

export function endInstance(game, I, impact = false, x = I.x, y = I.y, burstDone = false) {
  if (!I.alive) return; I.alive = false; const P = I.plan;
  if (impact && I.team === 'player') game.things?.spellHit(x, y, P.flame, P.shape);
  if (impact && !burstDone) game.flashes.push({ x, y, r: (P.light?.r || 26) * 1.5, color: hexToRgb01(P.color), i: 1.2, t: 0.15, max: 0.15 });
  if (P.volatile && !burstDone) { burst(game, { ...I, alive: true, plan: { ...P, volatile: 0 } }, x, y, P.volatile, 0.6); }
  if (P.linger) game.fields.push({ x, y, r: P.shape === 'bolt' ? 6 : Math.max(8, P.size * 0.7), t: P.linger, tickT: 0, dmg: P.damage * 0.25 * (I.power || 1), flame: P.flame, status: P.status, caster: I.caster, team: I.team, wickId: I.wickId, wickName: I.wickName, color: P.color });
  if (I.knot && I.depth === 0 && I.knot.trigger === 'on_land' && impact) fireKnot(game, I, x, y - 2);
  if (I.shape === 'tether' && I.line) { I.line.dead = true; }
  game.bus?.emit('spell.end', { x, y, flame: P.flame, shape: P.shape, impact });
}

/** Lingering fields, shocked water zones, flashes, arcs: timed things spells leave behind. */
export function stepSpellLeftovers(game) {
  for (const f of game.fields) {
    f.t -= DT; f.tickT += DT;
    if (f.tickT >= 1) { f.tickT -= 1; const I = { team: f.team, caster: f.caster }; for (const e of targetsFor(game, I)) if (circleHits(e, f.x, f.y, f.r)) { dealDamage(game, { source: f.caster, target: e, amount: f.dmg, flame: f.flame, via: f.wickId, viaName: (f.wickName || '') + ' (field)', tags: ['linger'] }); if (f.status) applyStatus(game, e, f.status, { source: f.caster, hitDamage: f.dmg, via: f.wickId }); } applyElement(game, f.x, f.y, f.r * 0.6, f.flame, { maxCells: 40 }); }
  }
  game.fields = game.fields.filter(f => f.t > 0);
  for (const z of game.shockZones) {
    z.t -= DT; z.tickT += DT;
    if (z.tickT >= 0.5) { z.tickT -= 0.5; const g = game.grid;
      for (const e of [game.player, ...game.entities]) { if (!e || e.dead) continue; const inShock = shockedIn(g, e); if (inShock) dealDamage(game, { source: z.caster, target: e, amount: z.dmg, flame: 'spark', via: 'combo:electrified', viaName: 'Electrified water', tags: ['combo'] }); } }
  }
  game.shockZones = game.shockZones.filter(z => z.t > 0);
  for (const f of game.flashes) f.t -= DT; game.flashes = game.flashes.filter(f => f.t > 0);
  for (const a of game.arcs) a.t -= DT; game.arcs = game.arcs.filter(a => a.t > 0);
}
function shockedIn(g, e) { const x0 = Math.round(e.x - e.w / 2), y0 = Math.round(e.y - e.h); for (let y = y0; y < y0 + e.h; y += 2) for (let x = x0; x < x0 + e.w; x += 2) { if (!g.inside(x, y)) continue; const i = y * g.W + x; if (g.flags[i] & 4) return true; } return false; }
