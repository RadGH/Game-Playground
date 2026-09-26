// Bosses (docs/05 §19+): a small phase-script framework (arena lock, phase thresholds with a 20% heal for the
// player on each transition, enrage, telegraphed attacks drawn in the unlit overlay, void zones) and the Act 1
// boss, Mother Tallow. Other bosses plug into BOSSES with the same shape (see docs/HANDOFF.md). Pure.
import { createActor, stepActorPhysics } from '../entities/actor.js';
import { hurtPlayer } from './brain.js';
import { spawnVoidZone } from '../rpg/voidzones.js';
import { castPlan } from '../spells/instances.js';
import { heal } from '../rpg/damage.js';
import { hexToRgb01 } from '../core/math.js';

const DT = 1 / 60;

export const BOSSES = {
  boss_tallow: {
    name: 'Mother Tallow', hp: 1500, w: 26, h: 54, speed: 22, color: '#e9e0c4', bar: [0.95, 0.72, 0.35, 1],
    resist: { ember: -25, rime: 25, tide: -25 },
    phases: diff => diff?.tallowP3 ? [{ at: 1, title: 'I — The Chandler\'s Mother' }, { at: 0.66, title: 'II — The Wick Runs Low' }, { at: 0.33, title: 'III — Last Pour' }] : [{ at: 1, title: 'I — The Chandler\'s Mother' }, { at: 0.5, title: 'II — The Wick Runs Low' }],
    enrage: 180,
    attacks: {
      wick_lash: { phase: 1, range: [0, 44], windup: 700, recovery: 700, cd: 2.5, tele: 'line', color: '#e8e2d0' },
      drip_rain: { phase: 1, range: [0, 400], windup: 900, recovery: 500, cd: 5, tele: 'columns', color: '#ffb347' },
      wax_wave: { phase: 1, range: [30, 400], windup: 1800, recovery: 900, cd: 7, tele: 'ground', color: '#ff8a2a' },
      tallow_slam: { phase: 2, range: [20, 300], windup: 900, recovery: 900, cd: 6, tele: 'circle', color: '#ff8a2a' },
    },
    voidZones: { vz_molten_pool: { shape: 'pool', w: 14, h: 3, warmup: 500, duration: 4000, dps: 8, flame: 'ember', rim: '#ffcf6a', mat: 'molten_wax', cells: 30, hitsEnemies: false }, vz_drip: { shape: 'column', w: 8, warmup: 900, duration: 350, dps: 34, flame: 'ember', rim: '#ffb347' } },
    rewards: { xp: 200, pennies: [80, 120], strands: ['arc', 'ring', 'wave'], relic: 'relic_tallow_heart', wick: 'great_wick_act1' },
  },
};

/** A boss with no script yet borrows Tallow's (scaled to its act, renamed) so every act can be finished. See docs/HANDOFF.md. */
export function bossDef(game, id) {
  if (BOSSES[id]) return BOSSES[id];
  const T = BOSSES.boss_tallow, act = +String(game.act || 'act1').slice(3) || 1, name = game.data.npcs?.byId?.[id]?.name || id.replace(/^boss_/, '');
  return { ...T, name: name.replace(/^the /, 'The '), hp: Math.round(T.hp * Math.pow(1.9, act - 1)), resist: {}, standIn: true, rewards: { ...T.rewards, relic: null } };
}

export function spawnBoss(game, id, x, y, flag = id) {
  if (game.flags[`${flag}_dead`]) return null;
  const D = bossDef(game, id);
  const diff = game.difficulty || {}, hp = Math.round(D.hp * (diff.bossHp ?? 1));
  const b = createActor('boss', { name: D.name, x, y, w: D.w, h: D.h, hp, resist: D.resist, kbResist: 1, tags: ['boss', 'steadfast'], extra: { bossId: id, flag, def: D, corpseTime: 2.5, dmgMult: Math.pow(1.6, (+String(game.act || 'act1').slice(3) || 1) - 1), steadfast: true, phase: 1, phases: D.phases(diff), atk: null, pt: 0, cds: {}, t: 0, awake: false, eyes: hexToRgb01('#ffb347'), barColor: D.bar, flipSprite: true } });
  b.phaseTicks = b.phases.slice(1).map(p => p.at); b.bossBar = false;
  game.entities.push(b); game.boss = b; return b;
}

export function stepBosses(game) {
  const b = game.boss; if (!b) return;
  const p = game.player, D = b.def;
  if (b.dead) { if (!b.rewarded) { b.rewarded = true; bossDied(game, b); } return; }
  if (!b.awake) { if (Math.abs(p.x - b.x) < 220) { b.awake = true; b.bossBar = true; game.bus.emit('boss.open', { boss: b.bossId }); game.arenaLocked = true; game.say?.(b.bossId, 'boss_opener'); } else return; }
  b.t += DT;
  // phase changes: the player heals 20%, the title shows, the boss roars
  const f = b.hp / b.maxHp, next = b.phases[b.phase];
  if (next && f <= next.at) { b.phase++; b.phaseTitle = next.title; b.phaseTitleT = game.time; heal(game, { id: 'guild', name: 'Guild lantern' }, p, p.maxHp * 0.2, 'phase', 'Second wind'); b.atk = null; b.telegraph = null; game.shake?.(0.4); game.bus.emit('boss.phase', { boss: b.bossId, phase: b.phase }); game.say?.(b.bossId, 'boss_phase'); }
  const enraged = b.t > D.enrage && game.difficulty?.enrage !== false; const speedMul = (b.phase >= 2 ? 1.25 : 1) * (enraged ? 1.4 : 1);
  if (b.statuses.frozen || b.statuses.staggered) { b.vx = 0; b.telegraph = null; return; }
  // melting: burning Tallow drips wax where she stands
  if ((b.statuses.burn || b.phase >= 2) && game.tick % 20 === 0) { const x = Math.round(b.x + (Math.random() - 0.5) * b.w), y = Math.round(b.y - 2); if (game.grid.get(x, y) === 0) game.grid.set(x, y, 24); }
  for (const k in b.cds) if (b.cds[k] > 0) b.cds[k] -= DT * speedMul;
  const dx = p.x - b.x, dist = Math.abs(dx);
  if (!b.atk) {
    b.facing = Math.sign(dx) || b.facing;
    const choices = Object.entries(D.attacks).filter(([k, a]) => a.phase <= b.phase && !(b.cds[k] > 0) && dist >= a.range[0] && dist <= a.range[1]);
    if (choices.length && (b.idleT = (b.idleT || 0) + DT) > 0.6) { const [k, a] = choices[Math.floor(game.rng.ai.next() * choices.length)]; b.atk = { id: k, ...a }; b.pt = 0; b.idleT = 0; b.aim = { x: p.x, y: p.y }; if (k === 'drip_rain') b.cols = Array.from({ length: 3 + b.phase * 2 }, (_, i) => p.x + (i - (1 + b.phase)) * 34 + (game.rng.ai.next() - 0.5) * 10); game.bus.emit('boss.telegraph', { boss: b.bossId, attack: k }); }
    else { b.vx = dist > 30 ? Math.sign(dx) * D.speed * speedMul : 0; b.ai.moving = dist > 30; b.anim = 'walk'; }
    return;
  }
  const a = b.atk, tele = Math.max(250, a.windup * (game.act1Grace ? 1.25 : 1) * (game.difficulty?.telegraph ?? 1) / speedMul);
  b.pt += DT * 1000; b.vx = 0;
  if (b.pt < tele) { b.telegraph = { a, t: b.pt / tele, color: hexToRgb01(a.color), part: a.tele, aim: b.aim, cols: b.cols }; if (a.id === 'drip_rain' && !b.zonesPlaced) { b.zonesPlaced = true; for (const cx of b.cols) spawnVoidZone(game, 'vz_drip', cx, game.grid.H, { ...D.voidZones.vz_drip, dps: D.voidZones.vz_drip.dps * b.dmgMult, warmup: tele, source: b }); } return; }
  if (!b.fired) {
    b.fired = true; b.telegraph = null; b.zonesPlaced = false;
    if (a.id === 'wick_lash') { const box = { x: b.facing > 0 ? b.x : b.x - 44, y: b.y - 34, w: 44, h: 20 }; if (p.x > box.x && p.x < box.x + box.w && p.y > box.y && p.y - 12 < box.y + box.h) hurtPlayer(game, b, 18 * b.dmgMult * (game.difficulty?.enemyDamage ?? 1), 'ember', { x: b.facing * 160, y: -100 }, 'wick_lash'); game.shake?.(0.1); }
    if (a.id === 'drip_rain') for (const cx of b.cols) for (let k = 0; k < 4; k++) game.particles.spawn(3, cx + (k - 1.5), 4 + k * 2, 0, 60, 3, 0xb39f6d, 24, 900);
    if (a.id === 'wax_wave') for (const dir of [-1, 1]) castPlan(game, b, { flame: 'ember', shape: 'wave', charms: [], color: '#ffb347', damage: 18 * b.dmgMult * (game.difficulty?.enemyDamage ?? 1), speed: 120, size: 12, lifetime: 3, count: 1, spread: 0, bounces: 0, pierce: 0, seek: 0, dig: 0, knock: 1.5, light: { r: 30, i: 1 }, status: 'burn', oil: 0 }, { ox: b.x + dir * 16, oy: b.y - 4, x: b.x + dir * 100, y: b.y - 4 }, { wickId: 'boss:wax_wave', wickName: 'Mother Tallow — wax wave' });
    if (a.id === 'tallow_slam') { b.x = Math.max(20, Math.min(game.grid.W - 20, b.aim.x)); b.vy = 60; game.shake?.(0.45); if (Math.abs(p.x - b.x) < 30 && Math.abs(p.y - b.y) < 30) hurtPlayer(game, b, 25 * b.dmgMult * (game.difficulty?.enemyDamage ?? 1), 'physical', { x: Math.sign(p.x - b.x || 1) * 220, y: -160 }, 'tallow_slam'); spawnVoidZone(game, 'vz_molten_pool', b.x, b.y, { ...D.voidZones.vz_molten_pool, dps: D.voidZones.vz_molten_pool.dps * b.dmgMult, source: b }); }
  }
  if (b.pt >= tele + a.recovery) { b.cds[a.id] = a.cd; b.atk = null; b.fired = false; }
}

function bossDied(game, b) {
  const D = b.def; game.arenaLocked = false; game.flags[`${b.flag}_dead`] = true; game.flags[`${b.bossId}_dead`] = true; game.bus.emit('boss.die', { boss: b.bossId });
  game.say?.(b.bossId, 'boss_death');
  game.onBossDead?.(b, D.rewards);
}

/** Draw a boss: Tallow is a candle-woman built from quads (no sprite sheet needed), with a live flame and drips. */
export function drawBoss(game, out, alpha) {
  const b = game.boss; if (!b) return;
  const x = b.px + (b.x - b.px) * alpha, y = b.py + (b.y - b.py) * alpha, { sprites, additive, lights, overlays } = out;
  const fade = b.dead ? Math.max(0, 1 - b.deadT / 2) : 1, flash = b.hurtFlash > 0 ? 1.6 : 1;
  const body = [0.91 * flash, 0.88 * flash, 0.77 * flash, fade], shade = [0.66, 0.6, 0.47, fade], w = b.w, h = b.h, melt = 1 - b.hp / b.maxHp;
  sprites.push({ x: x - w / 2, y: y - h + melt * 10, w, h: h - melt * 10, tint: body });                 // the candle body sinks as she melts
  for (let k = 0; k < 6; k++) sprites.push({ x: x - w / 2 + k * (w / 6), y: y - h * 0.6 + ((k * 7) % 5), w: 2, h: 10 + ((k * 13) % 9), tint: shade }); // drips
  sprites.push({ x: x - w / 2 - 8, y: y - h * 0.62, w: 8, h: 4, tint: body }); sprites.push({ x: x + w / 2, y: y - h * 0.62, w: 8, h: 4, tint: body }); // arms
  sprites.push({ x: x - 1, y: y - h + melt * 10 - 5, w: 2, h: 5, tint: [0.1, 0.08, 0.06, fade] });          // wick
  if (!b.dead) { const fl = 1 + Math.sin(game.time * 17) * 0.2; additive.push({ x: x - 3, y: y - h + melt * 10 - 13 * fl, w: 6, h: 9 * fl, tint: [1, 0.7, 0.25, 1], emit: 2.5 }); lights.push({ x, y: y - h + melt * 10 - 8, r: 90, color: [1, 0.66, 0.3], i: 1.3, shadow: true, flicker: 0.1 }); }
  overlays.push({ x: x - 4, y: y - h * 0.8 + melt * 10, w: 2, h: 2, tint: [1, 0.7, 0.28, fade] }); overlays.push({ x: x + 2, y: y - h * 0.8 + melt * 10, w: 2, h: 2, tint: [1, 0.7, 0.28, fade] });
  const T = b.telegraph; if (!T) return; const c = T.color, a = 0.4 + 0.6 * Math.min(1, T.t);
  if (T.part === 'line') { const x0 = b.facing > 0 ? x : x - 44; for (let k = 0; k < 44; k += 2) additive.push({ x: x0 + k, y: y - 26, w: 1, h: 1, tint: [c[0], c[1], c[2], a], emit: 1.5 }); }
  if (T.part === 'ground') for (let k = -120; k < 120; k += 3) additive.push({ x: x + k, y: y - 1, w: 2, h: 1, tint: [c[0], c[1], c[2], a * (1 - Math.abs(k) / 140)], emit: 1.5 });
  if (T.part === 'circle' && T.aim) for (let k = 0; k < 32; k++) { const t = k / 32 * Math.PI * 2; additive.push({ x: T.aim.x + Math.cos(t) * 30, y: T.aim.y - 2 + Math.sin(t) * 6, w: 1, h: 1, tint: [c[0], c[1], c[2], a], emit: 1.5 }); }
  lights.push({ x, y: y - h / 2, r: 40 + 30 * T.t, color: c, i: 0.9 * T.t, shadow: false });
}
export { stepActorPhysics };
