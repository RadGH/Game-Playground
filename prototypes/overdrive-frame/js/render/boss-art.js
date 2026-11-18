// How a boss and a rival ace look on screen.
// Boss (sim/boss.js): the City Kit model with each broken part swapped for its stump (recipe params brk_<part>, so
// "she lost a claw" is visible on the model itself). Every combination of broken parts is a different picture; the
// whole look is baked during the drop (bossBakeJobs), a new combination bakes in the background the moment a part
// breaks, and until it is ready the last baked look stays on screen (never a blink or a stall mid-fight).
// Wind-ups are marked on the ground under her (drawBossMarks): the claw sweep fills red, the charge lane fills
// along its length; the spit barrage uses the artillery circles view.js already draws. The open weak point pulses.
// Ace: drawn by the mech drawer like a player; a red callsign tag and armour bar over it, a ring while it drops in.
import { composite } from '../../../../citykit/js/bake.js';
import { TILE_W, TILE_H, dirOfHeading } from '../../../../citykit/js/iso.js';
import { DIRS } from './sprites.js';
import { partWorld } from '../sim/boss.js';

const partKey = name => 'brk_' + name.replace(/-/g, '_');       // the City Kit's own key (enemy-bits.js partKey)
const FPS = 8;

/** The recipe params for her current look: seed 1 + one brk_ key per broken part (whole = { seed: 1 }, the same
 *  picture the drop already bakes for a wave's walk). */
export function bossParams(e) {
  const p = { seed: 1 };
  for (const q of e.parts || []) if (q.broken) p[partKey(q.id)] = 1;
  return p;
}

/** Bake list for the drop screen: her whole look in every facing — crawl first (urgent), then the attacks and her death.
 *  Each entry is a function; call them over a few frames and run sprites.work() like the other jobs. */
export function bossBakeJobs(sprites, K, params = { seed: 1 }) {
  const jobs = [], id = K.recipe;
  const anim = a => sprites.animOf(id, a);
  for (const [a, urgent, frames] of [[anim('crawl'), true, null], [anim('spit'), false, [1, 2]], [anim('roar'), false, null], [anim('summon'), false, [0, 2]]]) {
    if (!a) continue;
    const n = sprites.frames(id, a), list = frames ? frames.filter(f => f < n) : Array.from({ length: n }, (_, f) => f);
    for (let d = 0; d < DIRS; d++) for (const f of list) jobs.push(() => sprites.facing(id, params, d, a, f, urgent));
  }
  const die = anim('die');
  if (die) { const n = sprites.frames(id, die); for (let d = 0; d < DIRS; d += 2) for (let f = 0; f < n; f++) jobs.push(() => sprites.facing(id, params, d, die, f)); }
  return jobs;
}

/** Bake list for an ace's frame (its standing + walking poses first, then boosts, jumps and recoils). */
export function aceBakeJobs(mechArt, aceBuild) {
  return [...mechArt.prebakeSteps(aceBuild, 'load'), ...mechArt.prebakeSteps(aceBuild, 'rest')];
}

function frameOf(sprites, id, anim, e, S) {
  const n = sprites.frames(id, anim);
  if (anim === sprites.animOf(id, 'die')) return Math.min(n - 1, Math.floor((S.time - (e.diedAt ?? S.time)) * FPS));
  return Math.floor((e.animT || 0) * (anim === sprites.animOf(id, 'crawl') ? FPS * 1.2 : FPS)) % Math.max(1, n);
}

/** Draw her (view._enemy hands bosses here). p = her drawn position. */
export function drawBoss(ctx, view, S, e, p, t) {
  const K = S.kinds[e.kind], sp = view.sprites, id = K.recipe, sc = view.zoom / sp.scale;
  const q = view.P(p.x, p.z, 0);
  if (e.state === 'warn') {                 // the ground heaves where she comes up: a wide pulsing ring
    const k = 0.5 + 0.5 * Math.sin(t * 10);
    ctx.save(); ctx.strokeStyle = '#ff5a3a'; ctx.lineWidth = 3; ctx.globalAlpha = 0.4 + 0.4 * k;
    ctx.beginPath(); ctx.ellipse(q.sx, q.sy, e.r * TILE_W * view.zoom * 0.75, e.r * TILE_H * view.zoom * 0.75, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    return;
  }
  const params = bossParams(e), key = JSON.stringify(params);
  if (e._artKey !== key) {                  // a part just broke: queue the new look's crawl in every facing
    e._artKey = key; const crawl = sp.animOf(id, 'crawl');
    for (let d = 0; d < DIRS; d++) for (let f = 0; f < sp.frames(id, crawl); f++) sp.facing(id, params, d, crawl, f, true);
  }
  const want = e.dead ? 'die' : e.anim || 'crawl', anim = sp.animOf(id, want), crawl = sp.animOf(id, 'crawl');
  const dir = dirOfHeading(e.face, DIRS, 0), f = frameOf(sp, id, anim, e, S);
  let pic = sp.facing(id, params, dir, anim, f) || sp.facing(id, params, dir, crawl, f % sp.frames(id, crawl));
  if (pic) e._goodParams = params;
  else if (e._goodParams) pic = sp.facing(id, e._goodParams, dir, anim, f) || sp.facing(id, e._goodParams, dir, crawl, f % sp.frames(id, crawl));
  if (!pic) {                               // nothing baked yet: a dark mound of the right size
    ctx.fillStyle = '#3a2f4e'; ctx.beginPath(); ctx.ellipse(q.sx, q.sy - e.r * 18 * view.zoom, e.r * TILE_W * 0.55 * view.zoom, e.r * TILE_W * 0.35 * view.zoom, 0, 0, Math.PI * 2); ctx.fill();
    return;
  }
  const n = view.night * 0.5, flash = !e.dead && (S.time - (e.lastHit || -9)) < 0.05;
  composite(ctx, pic, q.sx, q.sy, n, sc);
  if (flash) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.28; composite(ctx, pic, q.sx, q.sy, 0, sc); ctx.restore(); }
  // the open weak point: a pulsing amber diamond over the head plate
  const crest = e.parts?.find(x => K.parts.find(d => d.id === x.id)?.weak);   // the weak point (head plate)
  if (!e.dead && crest && !crest.locked && !crest.broken) {
    const w = partWorld(S, e, crest.id), c = view.P(w.x, w.z, 0.75), s = (5 + 2 * Math.sin(t * 7)) * view.zoom * 0.5;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#ffcf4a'; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(c.sx, c.sy - s); ctx.lineTo(c.sx + s, c.sy); ctx.lineTo(c.sx, c.sy + s); ctx.lineTo(c.sx - s, c.sy); ctx.closePath(); ctx.fill(); ctx.restore();
  }
}

/** Ground marks for every boss wind-up (view.draw calls this with the other ground markers, under everything). */
export function drawBossMarks(ctx, view, S, t) {
  for (const e of S.enemies) {
    if (!e.parts || e.dead || !e.atk) continue;
    const K = S.kinds[e.kind], A = e.atk;
    if (A.kind === 'claw') {
      const fill = Math.min(1, A.t / A.wind), R = K.claw.range, half = K.claw.arc / 2;
      sector(ctx, view, e.x, e.z, A.dir, half, R, 'rgba(255,60,40,0.16)', '#ff4030');
      sector(ctx, view, e.x, e.z, A.dir, half, R * Math.max(0.15, fill), 'rgba(255,80,50,0.38)', null);
    } else if (A.kind === 'charge') {
      const fill = Math.min(1, A.t / A.wind);
      lane(ctx, view, e.x, e.z, A.dir, A.len + e.r, A.w, 'rgba(255,60,40,0.16)', '#ff4030');
      lane(ctx, view, e.x, e.z, A.dir, (A.len + e.r) * fill, A.w, 'rgba(255,80,50,0.38)', null);
    }
  }
}

function poly(ctx, view, pts, fill, stroke) {
  ctx.save(); ctx.beginPath();
  pts.forEach(([x, z], i) => { const p = view.P(x, z, 0.01); if (i) ctx.lineTo(p.sx, p.sy); else ctx.moveTo(p.sx, p.sy); });
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
  ctx.restore();
}
function sector(ctx, view, x, z, dir, half, r, fill, stroke) {
  const pts = [[x, z]];
  for (let i = 0; i <= 16; i++) { const a = dir - half + (i / 16) * half * 2; pts.push([x + Math.cos(a) * r, z + Math.sin(a) * r]); }
  poly(ctx, view, pts, fill, stroke);
}
function lane(ctx, view, x, z, dir, len, w, fill, stroke) {
  const cx = Math.cos(dir), cz = Math.sin(dir), nx = -cz * w / 2, nz = cx * w / 2;
  poly(ctx, view, [[x + nx, z + nz], [x + cx * len + nx, z + cz * len + nz], [x + cx * len - nx, z + cz * len - nz], [x - nx, z - nz]], fill, stroke);
}

/** Over an enemy mech (view._mech hands team 'enemy' here after drawing it): its callsign in red and an armour bar;
 *  while it drops in, a pulsing ring on the ground instead of the frame. Returns true when the frame itself is skipped. */
export function drawEnemyMech(ctx, view, m, p, t, before) {
  const g = view.P(p.x, p.z, 0);
  if (before) {
    if (m.state !== 'warn') return false;
    const k = 0.5 + 0.5 * Math.sin(t * 14);
    ctx.save(); ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.35 + 0.5 * k;
    ctx.beginPath(); ctx.ellipse(g.sx, g.sy, 0.45 * TILE_W * view.zoom * 0.5, 0.45 * TILE_H * view.zoom * 0.5, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    return true;
  }
  if (m.dead) return false;
  const top = view.P(p.x, p.z, (p.y || 0) + 0.95), w = 46 * Math.min(1.4, view.zoom / 2.5);
  ctx.save(); ctx.textAlign = 'center'; ctx.font = `800 ${Math.round(12 * Math.min(1.3, view.zoom / 2.5))}px "Barlow Condensed", system-ui, sans-serif`;
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(m.name || 'Ace', top.sx, top.sy - 6);
  ctx.fillStyle = '#ff5a4a'; ctx.fillText(m.name || 'Ace', top.sx, top.sy - 6);
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(top.sx - w / 2 - 1, top.sy - 1, w + 2, 5);
  ctx.fillStyle = '#ff3b3b'; ctx.fillRect(top.sx - w / 2, top.sy, w * Math.max(0, m.hp / m.hpMax), 3);
  // a red ring at its feet: never mistaken for a teammate
  ctx.strokeStyle = 'rgba(255,59,59,0.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(g.sx, g.sy, 0.3 * TILE_W * view.zoom * 0.5, 0.3 * TILE_H * view.zoom * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  return false;
}
