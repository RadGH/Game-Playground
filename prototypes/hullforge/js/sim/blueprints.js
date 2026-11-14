// Saved ship designs (the Shipyard's Blueprints). A blueprint keeps the SHAPE and the KIND of every part, not the
// parts themselves: loading one rebuilds the design from the structure blocks you pay for and the parts you own.
//   G.blueprints = [{ name, at (ISO date), rows: [[x, y, z, t, r, p, tier, rarity]] }]   (tier/rarity 0 for structure)
// Loading: every part slot takes the closest part you own of that kind (same Mk and rarity first, then the nearest
// Mk, then the best rarity); slots with no part are left out and listed; blocks then cut loose from the bridge are
// left out too. Structure is charged at the Shipyard price, and the current hull is refunded as if removed.
// Pure: no DOM.

import { createGrid, put, connectedFrom, findType, remove } from './grid.js';
import { STRUCTURE, BLOCKS, TIER_NAMES } from '../data/blocks.js';

export const MAX_BLUEPRINTS = 20;

/** The blueprint rows of a grid. */
export function gridToBlueprint(grid) {
  return [...grid.cells.values()].map(b => [b.x, b.y, b.z, b.t, b.r, b.p, b.item ? b.item.tier : 0, b.item ? b.item.rarity : 0]);
}

/** Save (or overwrite by name) a blueprint. Returns the entry. */
export function saveBlueprint(G, grid, name) {
  name = String(name || '').trim().slice(0, 40) || 'Untitled design';
  const entry = { name, at: new Date().toISOString(), rows: gridToBlueprint(grid) };
  G.blueprints ||= [];
  const i = G.blueprints.findIndex(b => b.name.toLowerCase() === name.toLowerCase());
  if (i >= 0) G.blueprints[i] = entry; else G.blueprints.unshift(entry);
  if (G.blueprints.length > MAX_BLUEPRINTS) G.blueprints.length = MAX_BLUEPRINTS;
  return entry;
}
export function deleteBlueprint(G, name) { G.blueprints = (G.blueprints || []).filter(b => b.name !== name); }

/** A short summary for the list: blocks, structure cost, parts by kind. */
export function blueprintSummary(bp) {
  let cost = 0, parts = 0; const kinds = {};
  for (const r of bp.rows) { const t = r[3]; if (STRUCTURE[t]) cost += STRUCTURE[t].cost; else { parts++; kinds[t] = (kinds[t] || 0) + 1; } }
  return { blocks: bp.rows.length, cost, parts, kinds };
}

/**
 * Work out what loading a blueprint gives, without changing anything.
 * @param {object[]} items every part you own (spare + fitted now — loading puts the current parts back in the pool)
 * @param {object} current the grid in the Shipyard now (its structure is refunded)
 * @returns {{ grid, missing: {kind, tier, n, name}[], dropped: number, cost: number, refund: number, net: number, placed: number, blocks: number }}
 */
export function planBlueprint(bp, items, current) {
  const pool = [...items];
  const take = (kind, tier, rarity) => {
    let best = -1, bs = Infinity;
    pool.forEach((it, i) => {
      if (it.kind !== kind) return;
      const s = (it.tier === tier && it.rarity === rarity ? 0 : 10) + Math.abs(it.tier - tier) * 3 + (it.tier < tier ? 1 : 0) - it.rarity * 0.5;
      if (s < bs) { bs = s; best = i; }
    });
    return best < 0 ? null : pool.splice(best, 1)[0];
  };
  const g = createGrid(); const missing = new Map(); let cost = 0;
  // the bridge first (a ship always has one to hand: the current one), then bigger parts first so they get the best match
  const rows = [...bp.rows].filter(r => BLOCKS[r[3]]).sort((a, b) => (b[3] === 'bridge') - (a[3] === 'bridge') || b[6] - a[6] || b[7] - a[7]);
  for (const [x, y, z, t, r, p, tier, rarity] of rows) {
    if (STRUCTURE[t]) { put(g, { x, y, z, t, r, p }); continue; }
    const it = take(t, tier || 1, rarity || 0);
    if (!it) { const k = `${t}:${tier}`; const m = missing.get(k) || { kind: t, tier, n: 0, name: `${BLOCKS[t].name} ${TIER_NAMES[(tier || 1) - 1]}` }; m.n++; missing.set(k, m); continue; }
    put(g, { x, y, z, t, r, p, item: it });
  }
  // anything no longer joined to the bridge (a missing part was holding it on) is left out
  let dropped = 0;
  const br = findType(g, 'bridge');
  if (br) {
    const keep = connectedFrom(g, br.x, br.y, br.z);
    for (const [k, b] of [...g.cells]) if (!keep.has(k)) { remove(g, b.x, b.y, b.z); dropped++; }
    g.version++;
  }
  for (const b of g.cells.values()) if (STRUCTURE[b.t]) cost += STRUCTURE[b.t].cost;
  let refund = 0; for (const b of current.cells.values()) if (STRUCTURE[b.t]) refund += STRUCTURE[b.t].cost;
  return { grid: g, missing: [...missing.values()], dropped, cost, refund, net: cost - refund, placed: g.cells.size, blocks: bp.rows.length, hasBridge: !!br };
}
