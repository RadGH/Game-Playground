// Helpers every boss script uses (js/ai/bosses/*.js). Kept apart from bosses.js so boss files can import it
// without an import cycle. A boss definition has the shape of BOSSES.boss_tallow in bosses.js, plus optional hooks:
//   step(game, b)                 every tick while awake (gimmicks: water level, bands, snuffing lights)
//   onTelegraph(game, b, a, tele) every tick of a wind-up (place void zones that warm up with the telegraph)
//   attacks[id].fire(game, b, a)  the moment the attack lands (Tallow's four are built in by id)
//   onPhase(game, b, phase)       on each phase change;  onDeath(game, b) once
//   draw(game, b, out, x, y)      the body (out = { sprites, additive, lights, overlays }); default is a block
import { hurtPlayer } from './brain.js';
import { spawnVoidZone } from '../rpg/voidzones.js';
import { castPlan } from '../spells/instances.js';
import { dealDamage, heal } from '../rpg/damage.js';
import { applyStatus } from '../rpg/status.js';
import { hexToRgb01 } from '../core/math.js';
export { hurtPlayer, spawnVoidZone, castPlan, dealDamage, heal, applyStatus, hexToRgb01 };

/** Damage scaled by the boss's act multiplier and the difficulty. */
export const dmg = (game, b, n) => n * (b.dmgMult || 1) * (game.difficulty?.enemyDamage ?? 1);
/** Hit the player if they are inside a box {x,y,w,h} (y is the top). Returns damage dealt. */
export function hitBox(game, b, box, amount, flame, knock, id) {
  const p = game.player; if (p.dead) return 0;
  if (p.x + 3 > box.x && p.x - 3 < box.x + box.w && p.y > box.y && p.y - 14 < box.y + box.h) return hurtPlayer(game, b, dmg(game, b, amount), flame, knock, id);
  return 0;
}
/** A boss projectile: a plan for castPlan with sensible defaults. */
export function shoot(game, b, from, to, o = {}) {
  return castPlan(game, b, { flame: o.flame || 'physical', shape: o.shape || 'bolt', charms: [], color: o.color || '#ffffff', damage: dmg(game, b, o.damage ?? 12), speed: o.speed ?? 160, size: o.size ?? 4,
    lifetime: o.lifetime ?? 3, count: o.count ?? 1, spread: o.spread ?? 0, bounces: 0, pierce: 0, seek: o.seek ?? 0, dig: o.dig ?? 0, knock: o.knock ?? 1, gravity: o.gravity, light: { r: 24, i: 1 }, status: o.status || null, oil: 0 },
    { ox: from.x, oy: from.y, x: to.x, y: to.y }, { wickId: `boss:${o.id || 'shot'}`, wickName: `${b.name} — ${(o.id || 'shot').replace(/_/g, ' ')}` });
}
/** A void zone scaled by the boss's damage multiplier. */
export const zone = (game, b, id, x, y, def) => spawnVoidZone(game, id, x, y, { ...def, dps: (def.dps ?? 6) * (b.dmgMult || 1), source: b });
/** Put material cells in a rectangle where there is air (e.g. flooding, rubble). */
export function fillCells(game, mat, x0, y0, w, h, onlyAir = true) {
  const g = game.grid, m = typeof mat === 'number' ? mat : game.data.mats.byKey[mat];
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (g.inside(x, y) && (!onlyAir || g.get(x, y) === 0)) g.set(x, y, m);
}
