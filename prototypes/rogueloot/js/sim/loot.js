// Loot in the world: personal ground drops (every hero sees and picks up only their own, ruling 5), gold that is
// collected by walking over it, potions and items picked up by click/tap/Space, and chests every hero may open once
// (ruling 25: chests come back each game session). Pure. Events with `to` are delivered only to that player (hub.js).
import { dropsFor, chestDrops } from '../rules/loot.js';
import { itemName } from '../rules/items.js';
import { isPotion, toBelt, beltSlots, potionName } from '../rules/potions.js';
import { findSpot } from '../rules/bag.js';

export const PICKUP_RANGE = 3.2, GOLD_RANGE = 1.6, GROUND_LIFE = 300;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function dropAt(w, owner, x, z, thing) {
  w.ground ||= new Map();
  const a = w.rng() * Math.PI * 2, r = 0.6 + w.rng() * 1.4;
  const g = { gid: 'g' + (w.nextId++), owner, x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, born: w.time, ...thing };
  w.ground.set(g.gid, g);
  const D = w.content.items, P = w.content.potions;
  const label = g.gold ? `${g.gold} gold` : g.potion ? potionName(P, g.potion) : itemName(D, g.item);
  w.events.push({ k: 'drop', to: owner, gid: g.gid, x: +g.x.toFixed(2), z: +g.z.toFixed(2), what: g.gold ? 'gold' : g.potion ? 'potion' : 'item', r: g.item ? (g.item.ided === false ? 'unid' : g.item.rarity) : null, b: g.item?.base || g.potion?.kind || null, name: label, real: g.item?.rarity || null });
  return g;
}
/** A monster died: every hero near it rolls their own drops. */
export function lootFoe(w, f, heroes) {
  const D = w.content.items; if (!D?.bases) return;
  const kind = f.def.boss ? (f.def.raw?.actBoss ? 'actBoss' : 'boss') : f.rank === 'normal' ? 'normal' : f.rank;
  for (const p of heroes) {
    const r = dropsFor(D, w.content.potions, w.rng, { level: f.level, kind, players: heroes.length, mf: p.st.magicFind || 0, gf: p.st.goldFind || 0, ch: p.char });
    if (r.gold) dropAt(w, p.id, f.x, f.z, { gold: r.gold });
    for (const it of r.items) dropAt(w, p.id, f.x, f.z, { item: it });
    for (const pt of r.potions) dropAt(w, p.id, f.x, f.z, { potion: pt });
  }
}
export function stepLoot(w) {
  if (!w.ground) return;
  for (const g of [...w.ground.values()]) {
    if (w.time - g.born > GROUND_LIFE) { w.ground.delete(g.gid); w.events.push({ k: 'gone', to: g.owner, gid: g.gid }); continue; }
    if (!g.gold) continue;
    const p = w.players.get(g.owner); if (!p || p.dead) continue;
    if (dist(p, g) < GOLD_RANGE) { p.char = { ...p.char, gold: (p.char.gold || 0) + g.gold }; w.charDirty.add(p.id); w.ground.delete(g.gid); w.events.push({ k: 'gone', to: g.owner, gid: g.gid, got: `+${g.gold} gold` }); }
  }
}
export function pickup(w, p, gid) {
  const g = w.ground?.get(gid);
  if (!g || g.owner !== p.id) return { err: 'That is not yours.' };
  if (dist(p, g) > PICKUP_RANGE) return { err: 'Get closer.' };
  const D = w.content.items, ch = p.char;
  if (g.gold) { p.char = { ...ch, gold: (ch.gold || 0) + g.gold }; }
  else if (g.potion) {
    const st = p.st, r = toBelt(w.content.potions, ch.belt || [], beltSlots(st), g.potion);
    let bag = ch.bag;
    if (r.rest) { const pos = findSpot(D, bag, r.rest); if (!pos) return { err: 'Your bag is full.' }; bag = [...bag, { ...r.rest, pos }]; }
    p.char = { ...ch, belt: r.belt, bag };
  } else {
    const pos = findSpot(D, ch.bag || [], g.item); if (!pos) return { err: 'Your bag is full.' };
    p.char = { ...ch, bag: [...(ch.bag || []), { ...g.item, pos }] };
  }
  w.ground.delete(gid); w.charDirty.add(p.id);
  w.events.push({ k: 'gone', to: p.id, gid, got: g.gold ? `+${g.gold} gold` : null });
  return { ok: true };
}

// ---- chests ---------------------------------------------------------------------------------------------------------
export function placeChests(w) {
  w.chests = new Map();
  for (const c of w.area.chests || []) { const id = 'c' + (w.nextId++); w.chests.set(id, { id, x: c.x, z: c.z, tier: c.tier || 'chest', level: c.level || w.area.level || 1, openedBy: new Set() }); }
}
export function openChest(w, p, id) {
  const c = w.chests?.get(id); if (!c) return { err: 'Nothing there.' };
  if (dist(p, c) > PICKUP_RANGE) return { err: 'Get closer.' };
  if (c.openedBy.has(p.id)) return { err: 'You already opened this.' };
  c.openedBy.add(p.id);
  const r = chestDrops(w.content.items, w.content.potions, w.rng, { tier: c.tier, level: c.level, mf: p.st.magicFind || 0, gf: p.st.goldFind || 0, ch: p.char, players: w.players.size });
  if (r.gold) dropAt(w, p.id, c.x, c.z, { gold: r.gold });
  for (const it of r.items) dropAt(w, p.id, c.x, c.z, { item: it });
  for (const pt of r.potions) dropAt(w, p.id, c.x, c.z, { potion: pt });
  w.events.push({ k: 'chest', to: p.id, id });
  return { ok: true };
}
export { isPotion };
