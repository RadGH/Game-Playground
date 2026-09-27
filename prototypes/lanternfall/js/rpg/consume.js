// Consumables (docs/08): what a tonic, oil flask, cleanse or pot actually does when used — from the satchel menu
// (bus 'item.use') or a belt key (belt1-4). Timed effects (heal over time, the Gillwater swim buff, a pot's fuse)
// live on game.consumeFx and are advanced by stepConsumables, one of game.systems. Pure apart from the game object.
import { heal, dealDamage } from './damage.js';
import { explode } from '../world/elements.js';
import { removeFromSatchel } from './items.js';

const DT = 1 / 60;
const HARMFUL_KEEP = new Set(['radiant']); // the one beneficial status; Clearwater leaves it alone

/** Apply one consumable definition (data/items.json `use` block). Returns a short line for a toast, or null. */
export function useConsumable(game, def) {
  const p = game.player, u = def?.use; if (!u || !p || p.dead) return null;
  const fx = game.consumeFx || (game.consumeFx = []);
  if (u.healPct) fx.push({ kind: 'heal', perSec: (p.maxHp * u.healPct) / (u.over || 1), t: u.over || 1, name: def.name });
  if (u.oil) p.oil = Math.min(p.maxOil, (p.oil || 0) + u.oil);
  if (u.breath) p.breath = (p.breath || 0) + u.breath;
  if (u.swimPct) { p.traits.swimMult = 1 + u.swimPct; fx.push({ kind: 'swim', t: u.time || 60 }); }
  if (u.cleanse) for (const k of Object.keys(p.statuses || {})) if (!HARMFUL_KEEP.has(k)) delete p.statuses[k];
  if (u.flame) { // a thrown pot: lands ahead of you and bursts after its fuse
    const act = +String(game.act || 'act1').slice(3) || 1;
    fx.push({ kind: 'pot', t: u.fuse ?? 1.5, x: Math.round(p.x + p.facing * 40), y: Math.round(p.y - 4), flame: u.flame, damage: (u.damagePerAct || 10) * act, r: u.radius || 14, name: def.name });
  }
  game.bus?.emit('consumable.used', { id: def.id });
  return def.name;
}

/** Use the first stack of a belt slot (k = 0..3). Returns true if something was used. */
export function useBelt(game, k) {
  const h = game.hero; const uid = h?.belt?.[k]; if (!uid) return false;
  const item = h.satchel?.find(x => x.uid === uid); if (!item) { h.belt[k] = null; return false; }
  const def = game.data.items.byId[item.base]; if (def?.type !== 'consumable') return false;
  if (!useConsumable(game, def)) return false;
  const left = (item.qty || 1) - 1; removeFromSatchel(h, item.uid, 1); if (left <= 0) h.belt[k] = null;
  return true;
}

/** A game system: timed consumable effects + belt keys. */
export function stepConsumables(game, intent) {
  if (intent?.pressed && game.hero && !game.player?.dead) for (let k = 0; k < 4; k++) if (intent.pressed[`belt${k + 1}`]) useBelt(game, k);
  const fx = game.consumeFx; if (!fx?.length) return;
  const p = game.player;
  for (const e of fx) {
    e.t -= DT;
    if (e.kind === 'heal') heal(game, { id: 'tonic', name: e.name }, p, e.perSec * DT, 'item', e.name);
    if (e.kind === 'swim' && e.t <= 0) p.traits.swimMult = 1;
    if (e.kind === 'pot' && e.t <= 0) {
      explode(game, e.x, e.y, Math.min(10, e.r / 2), 30, { heat: e.flame === 'ember' ? 3 : 0, source: { id: 'hero', name: e.name } });
      for (const t of game.entities) if (!t.dead && t.kind !== 'pickup' && Math.hypot(t.x - e.x, (t.y - (t.h || 8) / 2) - e.y) <= e.r)
        dealDamage(game, { source: p, target: t, amount: e.damage, flame: e.flame, via: `item:${e.name}`, viaName: e.name });
      game.bus?.emit('explode', { x: e.x, y: e.y, r: e.r, power: 30 });
    }
  }
  game.consumeFx = fx.filter(e => e.t > 0);
}
