// Pickups on the ground (docs/08 §2.2-2.3, §14): a drop becomes a small physics actor that pops out of
// the kill, floats on water, glows by rarity (a relic carries a real 16-cell light), is pulled to the
// player within 24 cells and collected on touch. Currencies, oil, scrap and dust always auto-pick; an
// item with a full satchel stays on the ground (glowing) until there is room. Pure.
//
// Wiring (see the Integration note in the agent report):
//   installLoot(game)   -> bus.on('kill', dropLootFor) + stepPickups in game.systems
//   pickupVisuals(game, alpha) -> { sprites, additive, lights } for render/frame.js (beam + outline)
import { createActor } from './actor.js';
import { rollLoot, rollPot } from '../rpg/loot.js';
import { addToSatchel, giveCurrency, roomFor, satchelFree, ensureInventory, knowsStrand, rarityDef, displayName } from '../rpg/items.js';
import { hexToRgb01 } from '../core/math.js';

export const MAGNET = 24, GRAB = 5, MAGNET_SPEED = 220;
const KIND_COLOR = { pennies: '#c7803d', pearls: '#e8f0f2', oil: '#ffcf6a', scrap: '#8f8a80', dust: '#b9a6ff', consumable: '#d8d2c4', strand: '#ffe28a', key: '#ffd36b' };
const AUTO = new Set(['pennies', 'pearls', 'oil', 'scrap', 'dust']);

function dropName(game, d) {
  const I = game.data?.items?.byId || {};
  if (d.kind === 'item') return displayName(d.item);
  if (d.kind === 'dust') return 'Strand Dust';
  if (d.kind === 'oil') return 'oil';
  if (d.id) return I[d.id]?.name || d.id;
  return d.kind;
}
function dropColor(game, d) {
  if (d.kind === 'item') return rarityDef(game.data, d.item.rarity).color;
  if (d.kind === 'strand') { const f = game.data?.items?.byId?.[d.id]; const fl = f?.part === 'flame' && game.data.flames?.byId?.[f.ref]; return fl?.color || KIND_COLOR.strand; }
  return KIND_COLOR[d.kind] || '#d8d2c4';
}

/** Put one drop on the ground at (x, y) with a little pop. Returns the pickup actor. */
export function spawnPickup(game, drop, x, y) {
  const rng = game.rng?.loot, r = () => (rng ? rng.next() : Math.random());
  const color = dropColor(game, drop), rar = drop.kind === 'item' ? rarityDef(game.data, drop.item.rarity) : null;
  const a = createActor('pickup', { x, y, w: 3, h: 3, hp: 1, name: dropName(game, drop), team: 'none', gravity: 0.8, stepUp: 1,
    extra: { drop, intangible: true, color: hexToRgb01(color), pickColor: color, beam: rar?.beam || 0, age: 0, magnet: false, corpseTime: 0,
      light: rar?.light ? { r: rar.light, color: hexToRgb01(color), i: 0.7 } : null } });
  a.vx = (r() - 0.5) * 80; a.vy = -90 - r() * 60;
  game.entities.push(a);
  return a;
}

/** Hand a drop to the hero. Returns false when it cannot be taken (full satchel). */
export function collectDrop(game, drop) {
  const hero = game.hero, p = game.player, data = game.data; if (!hero) return false; ensureInventory(hero, data);
  let amount = drop.amount ?? 1, item = null, kind = drop.kind, name = dropName(game, drop);
  switch (drop.kind) {
    case 'pennies': case 'pearls': amount = giveCurrency(hero, data, drop.kind, drop.amount); break;
    case 'oil': { const add = drop.full ? (p.maxOil || 0) - (p.oil || 0) : Math.min(drop.amount, (p.maxOil || 0) - (p.oil || 0)); p.oil = (p.oil || 0) + Math.max(0, add); amount = Math.max(0, Math.round(add)); break; }
    case 'scrap': addToSatchel(hero, data, 'scrap', drop.amount); break;
    case 'dust': addToSatchel(hero, data, 'strand_dust', drop.amount); break;
    case 'key': addToSatchel(hero, data, drop.id, 1); break;
    case 'consumable': { if (roomFor(hero, data, drop.id) < 1) return false; const r = addToSatchel(hero, data, drop.id, drop.amount); amount = r.added; drop.amount = r.left; if (r.left > 0) { game.bus?.emit('pickup', { kind, name, amount, color: dropColor(game, drop), id: drop.id }); return false; } break; }
    case 'strand': {
      const def = data.items.byId[drop.id];
      if (knowsStrand(hero, def)) { kind = 'dust'; name = 'Strand Dust'; addToSatchel(hero, data, 'strand_dust', 1); break; } // a duplicate becomes dust on pickup
      if (roomFor(hero, data, drop.id) < 1) return false; addToSatchel(hero, data, drop.id, 1); break;
    }
    case 'item': { if (satchelFree(hero) < 1) return false; addToSatchel(hero, data, drop.item); item = drop.item; break; }
    default: return false;
  }
  game.bus?.emit('pickup', { kind, name, amount, color: dropColor(game, { ...drop, kind: drop.kind }), item, id: drop.id });
  return true;
}

/** Every tick: rescue drops that fell out, push drops out of void zones, magnet, collect. */
export function stepPickups(game) {
  const p = game.player, g = game.grid, DT = 1 / 60;
  for (const a of game.entities) {
    if (a.kind !== 'pickup' || a.dead) continue;
    a.age += DT;
    // never fall through the world (08 §2.3): back to the room's lootSafe marker, else next to the player
    if (g && a.y > g.H - 2) { const safe = game.room?.lootSafe || game.room?.things?.find(t => t.t === 'lootSafe')?.at; const [sx, sy] = safe || [p?.x ?? 20, (p?.y ?? 20) - 8]; a.x = a.px = sx; a.y = a.py = sy; a.vx = a.vy = 0; }
    // drops inside a void zone are pushed to its rim
    for (const z of game.voidZones || []) if (z.shape === 'circle' || z.shape === 'pool') { const dx = a.x - z.x, dy = a.y - z.y, d = Math.hypot(dx, dy), R = z.shape === 'pool' ? Math.max(z.w, 6) : z.r; if (d < R) { const k = d > 0.01 ? dx / d : 1; a.x = z.x + k * (R + 2); } }
    if (!p || p.dead || a.age < 0.35) continue;
    const dx = p.x - a.x, dy = (p.y - (p.h || 10) / 2) - a.y, d = Math.hypot(dx, dy);
    const canTake = AUTO.has(a.drop.kind) || a.drop.kind === 'key' || (game.hero && (a.drop.kind === 'item' ? satchelFree(game.hero) > 0 : roomFor(game.hero, game.data, a.drop.id) > 0 || (a.drop.kind === 'strand' && knowsStrand(game.hero, game.data.items.byId[a.drop.id]))));
    if (!canTake) { a.magnet = false; a.flying = false; a.gravity = 0.8; continue; }
    if (d < MAGNET) { a.magnet = true; a.magnetT = (a.magnetT || 0) + DT; a.flying = true; a.gravity = 0; const sp = MAGNET_SPEED * Math.min(1, 0.4 + a.magnetT * 2); a.vx = dx / (d || 1) * sp; a.vy = dy / (d || 1) * sp; }
    if (d < GRAB || (a.magnet && a.magnetT > 0.6)) { if (collectDrop(game, a.drop)) { a.dead = true; a.deadT = 99; } else { a.magnet = false; a.flying = false; a.gravity = 0.8; } }
  }
}

/** Roll an enemy's table on its death and put the drops on the ground. Call from bus 'kill'. */
export function dropLootFor(game, enemy) {
  if (!enemy || (enemy.kind !== 'enemy' && enemy.kind !== 'boss') || enemy.looted || !game.data?.loot) return [];
  const def = enemy.def || {}; const table = def.loot; if (!table) return [];
  enemy.looted = true;
  const actId = (Array.isArray(def.act) ? def.act[0] : def.act) || game.room?.act || 'act1', act = +String(actId).replace(/\D/g, '') || 1;
  const st = game.hero?.stats || {};
  const drops = rollLoot(table, { data: game.data, rng: game.rng.loot, level: enemy.level || def.level || 1, act, tier: def.tier, elite: !!enemy.elite, pennies: def.pennies, enemyId: def.id,
    extra: def.drops?.extra, lootFind: st.lootFind || 0, penniesFind: st.penniesFind || 0, hero: game.hero, classId: game.hero?.class, mode: game.mode, underwater: !!enemy.inLiquid });
  const x = enemy.x, y = enemy.y - (enemy.h || 8) / 2;
  for (const d of drops) spawnPickup(game, d, x, y);
  return drops;
}
/** A pot or crate broke (08 §14.5). */
export function dropPotLoot(game, x, y, act = 1) { const drops = rollPot({ data: game.data, rng: game.rng.loot, act }); for (const d of drops) spawnPickup(game, d, x, y); return drops; }

/** One call wires it all: loot on every kill, pickups stepped every tick. Safe to run more than once. */
export function installLoot(game) {
  if (game._lootInstalled) return; game._lootInstalled = true;
  game.bus.on('kill', e => dropLootFor(game, e.target));
  (game.systems ||= []).push(stepPickups);
}

/** Beam + outline for render/frame.js (drawn additive, so it reads in the dark). */
export function pickupVisuals(game, alpha = 1) {
  const sprites = [], additive = [], lights = [], t = game.time || 0;
  for (const a of game.entities) {
    if (a.kind !== 'pickup' || a.dead) continue;
    const x = a.px + (a.x - a.px) * alpha, y = a.py + (a.y - a.py) * alpha, c = a.color, bob = a.inLiquid ? Math.sin(t * 3 + a.age) * 0.8 : 0;
    const pulse = a.drop.kind === 'item' && a.drop.item.rarity !== 'common' ? 0.75 + 0.25 * Math.sin(t * 3) : 1;
    additive.push({ x: x - 2.5, y: y - 3.5 + bob, w: 5, h: 5, tint: [c[0], c[1], c[2], 0.35 * pulse], emit: 1 });
    for (let k = 0; k < a.beam; k += 2) additive.push({ x: x - 0.5, y: y - 3 - k + bob, w: 1, h: 1, tint: [c[0], c[1], c[2], 0.5 * (1 - k / a.beam) * pulse], emit: 1.2 });
    if (a.light) lights.push({ x, y: y - 2, r: a.light.r, color: a.light.color, i: a.light.i * pulse, shadow: false });
    else if (AUTO.has(a.drop.kind)) lights.push({ x, y: y - 2, r: 6, color: c, i: 0.3, shadow: false });
  }
  return { sprites, additive, lights };
}
