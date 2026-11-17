// Putting the city back together after an attack (owner reports #73 and #82, 2026-11-16).
//
// Ghosts (#73): a wall, gate, turret or placed building that creatures destroy leaves a ghost — a see-through outline
// of what stood there. Tap it to rebuild that one at its normal price, or use Tools › Rebuild everything to rebuild
// every ghost at once (buildings, defences or both) and patch every damaged wall. Zoned homes/shops/industry leave no
// ghost: their zone is still painted, so they grow back by themselves. A ghost is cleared when something is built over
// it, or by the Bulldoze tool.
//
// Self-repair (#82): a wall that hasn't been hit for T.wallRegenQuietSec seconds heals itself back to full over
// T.wallRegenFullSec seconds — but only while it is above T.wallRegenAbove (50%) of its health. Below that it LOOKS
// damaged (map.js wallLook) and stays damaged until you repair it. So a wall that looks whole is at least half
// health, and is back to full a few seconds after the fighting stops.
//
// Pure: no DOM. Times are game days (r.day); the tuning's seconds are at 1× speed (T.dayLengthSec a day).
import { T } from './tuning.js';
import { item } from './catalog.js';
import * as B from './build.js';
import { WALL_ID, wallMaxHp } from './arms.js';

const dayLen = () => Math.max(0.1, T.dayLengthSec ?? 6);

// ---------------------------------------------------------------- ghosts
/** g: { kind: 'wall'|'turret'|'lot', x, z, w, d, id, v? (tiles.wall value), recipe?, params?, face?, tier? } */
export function addGhost(r, g) {
  r.ghosts ||= [];
  r.ghosts = r.ghosts.filter(o => !overlaps(o, g));
  r.ghosts.push({ w: 1, d: 1, ...g, day: Math.round(r.day * 100) / 100 });
}
const overlaps = (a, b) => a.x < b.x + (b.w || 1) && b.x < a.x + (a.w || 1) && a.z < b.z + (b.d || 1) && b.z < a.z + (a.d || 1);
export function ghostAt(r, x, z) { return (r.ghosts || []).find(g => x >= g.x && z >= g.z && x < g.x + g.w && z < g.z + g.d) || null; }
/** What a ghost is called on screen. */
export function ghostName(g) {
  if (g.kind === 'wall') return item(WALL_ID[g.v] || 'wall-1')?.name || 'Wall';
  return item(g.id)?.name || 'Building';
}
/** Is it a defence (wall, gate, turret) rather than a building? */
export const isDefence = g => g.kind === 'wall' || g.kind === 'turret';

/** Run a quote as if money and materials were no object (so a total can be shown before you can afford it). */
function quoteFree(r, fn) {
  const m = r.money, st = { ...r.stock };
  r.money = 1e12; for (const k of Object.keys(r.stock)) r.stock[k] = 1e12;
  try { return fn(); } finally { r.money = m; Object.assign(r.stock, st); }
}
/** The sim call that rebuilds a ghost (quote or apply). */
function act(r, g, apply) {
  if (g.kind === 'wall') {
    const id = g.v === 9 ? 'wall-1' : WALL_ID[g.v] || 'wall-1';   // a wall drawn over the gate's road becomes a gate again
    return apply ? B.buildWall(r, [[g.x, g.z]], id) : B.quoteWall(r, [[g.x, g.z]], id);
  }
  if (g.kind === 'turret') return apply ? B.buildTurret(r, g.id, g.x, g.z) : B.quoteTurret(r, g.id, g.x, g.z);
  return apply ? B.place(r, g.id, g.x, g.z, { params: g.params ? { seed: g.params.seed } : {} }) : B.quotePlace(r, g.id, g.x, g.z);
}
/** → { ok, why, cost, mats, blocked } — blocked = something else stands there now (can't rebuild at any price). */
export function quoteGhost(r, g) {
  const free = quoteFree(r, () => act(r, g, false));
  if (!free.ok) return { ok: false, why: free.why || 'Something is in the way', cost: 0, mats: {}, blocked: true };
  const q = act(r, g, false);
  return { ok: !!q.ok, why: q.why || null, cost: free.cost || 0, mats: free.mats || {}, blocked: false };
}
export function rebuildGhost(r, g) {
  const q = quoteGhost(r, g); if (!q.ok) return q;
  const res = act(r, g, true);
  if (res.ok) r.ghosts = (r.ghosts || []).filter(o => o !== g);
  return { ...res, cost: q.cost };
}
/** Drop ghosts whose spot now holds a building, wall or turret (rebuilt by hand, or built over). */
export function pruneGhosts(r) {
  if (!r.ghosts?.length) return;
  const N = r.size;
  r.ghosts = r.ghosts.filter(g => {
    for (let k = 0; k < g.d; k++) for (let j = 0; j < g.w; j++) {
      const x = g.x + j, z = g.z + k, i = z * N + x;
      if (r.tiles.lot[i] >= 0 || r.tiles.wall[i] || r.turrets.some(t => t.x === x && t.z === z)) return false;
    }
    return true;
  });
}
/** Clear the ghosts touching any of these tiles (the Bulldoze tool). → how many. */
export function clearGhosts(r, tiles) {
  if (!r.ghosts?.length) return 0;
  const n = r.ghosts.length;
  r.ghosts = r.ghosts.filter(g => !tiles.some(([x, z]) => x >= g.x && z >= g.z && x < g.x + g.w && z < g.z + g.d));
  return n - r.ghosts.length;
}

// ---------------------------------------------------------------- rebuild everything (Tools › Rebuild everything)
/**
 * The plan for the bulk rebuild. opts: { buildings, defences, walls } (walls = patch every damaged wall too).
 * → { ghosts: [...ready to rebuild, defences first], blocked: n, cost, mats, repair: { cost, tiles }, total, counts: {
 *    walls, turrets, buildings }, ok, why }
 */
export function bulkPlan(r, { buildings = true, defences = true, walls = true } = {}) {
  const out = { ghosts: [], blocked: 0, cost: 0, mats: {}, repair: { cost: 0, tiles: 0 }, counts: { walls: 0, turrets: 0, buildings: 0 } };
  const order = { turret: 0, wall: 1, lot: 2 };
  for (const g of [...(r.ghosts || [])].sort((a, b) => order[a.kind] - order[b.kind])) {
    if (isDefence(g) ? !defences : !buildings) continue;
    const q = quoteGhost(r, g); if (q.blocked) { out.blocked++; continue; }
    out.ghosts.push(g); out.cost += q.cost; for (const [k, v] of Object.entries(q.mats)) out.mats[k] = (out.mats[k] || 0) + v;
    out.counts[g.kind === 'lot' ? 'buildings' : g.kind === 'turret' ? 'turrets' : 'walls']++;
  }
  if (walls) { const t = damagedWalls(r); if (t.length) { const q = quoteFree(r, () => B.quoteRepair(r, t)); out.repair = { cost: q.cost || 0, tiles: t.length }; } }
  out.total = out.cost + out.repair.cost;
  const lackMoney = r.money < out.total ? `Needs ¢${Math.ceil(out.total - r.money).toLocaleString('en-US')} more` : null;
  const lackMat = Object.entries(out.mats).find(([k, v]) => (r.stock[k] || 0) < v);
  out.why = !out.ghosts.length && !out.repair.tiles ? 'Nothing to rebuild' : lackMoney || (lackMat ? `Needs ${Math.ceil(lackMat[1] - (r.stock[lackMat[0]] || 0))} more ${lackMat[0] === 'cells' ? 'Power cells' : lackMat[0][0].toUpperCase() + lackMat[0].slice(1)}` : null);
  out.ok = !out.why;
  return out;
}
/** Do the bulk rebuild (all of it or nothing). → { ok, why, cost, rebuilt, repaired } */
export function bulkRebuild(r, opts) {
  const p = bulkPlan(r, opts); if (!p.ok) return { ok: false, why: p.why, cost: 0 };
  const m0 = r.money; let rebuilt = 0, repaired = 0;
  for (const g of p.ghosts) if (rebuildGhost(r, g).ok) rebuilt++;
  if (p.repair.tiles) { const t = damagedWalls(r); if (B.repairWalls(r, t).ok) repaired = t.length; }
  return { ok: true, cost: Math.round(m0 - r.money), rebuilt, repaired };
}
/** Every wall tile below full health. */
export function damagedWalls(r) {
  const out = [], N = r.size;
  for (let i = 0; i < N * N; i++) if (r.tiles.wall[i] && r.tiles.wallHp[i] < wallMaxHp(r, r.tiles.wall[i]) - 0.5) out.push([i % N, (i / N) | 0]);
  return out;
}

// ---------------------------------------------------------------- self-repair (#82)
const seen = new WeakMap();   // region → { prev: Float32Array, hit: Map(i → day) } — not saved: after a load every wall is "quiet"
function memo(r) { let m = seen.get(r); if (!m || m.prev.length !== r.size * r.size) { m = { prev: Float32Array.from(r.tiles.wallHp), hit: new Map() }; seen.set(r, m); } return m; }
/** Health as a fraction of the wall's maximum. */
export function wallFrac(r, i) { return r.tiles.wall[i] ? Math.max(0, Math.min(1, r.tiles.wallHp[i] / wallMaxHp(r, r.tiles.wall[i]))) : 0; }
/** The picture a wall shows: 0 whole (above half health), 1 cracked (a quarter to half), 2 battered (below a quarter).
 *  "Looks whole" therefore always means "heals itself" (#82). */
export function wallLook(frac) { const a = T.wallRegenAbove ?? 0.5; return frac > a ? 0 : frac > a / 2 ? 1 : 2; }
/** Was this wall hit in the last quiet spell (still fighting)? */
export function wallUnderAttack(r, i) { const h = memo(r).hit.get(i); return h != null && r.day - h < (T.wallRegenQuietSec ?? 8) / dayLen(); }
/** The wall's state in words for the info panel: { frac, look, healing, text }. */
export function wallState(r, i) {
  const frac = wallFrac(r, i), look = wallLook(frac), fighting = wallUnderAttack(r, i), above = T.wallRegenAbove ?? 0.5;
  const text = frac >= 0.999 ? 'Full health' : fighting ? 'Under attack' : frac > above ? 'Healing itself' : `Damaged: below ${Math.round(above * 100)}% it can't heal itself — use Repair walls`;
  return { frac, look, healing: !fighting && frac > above && frac < 0.999, fighting, text };
}
/**
 * Advance wall self-repair by `days`. field = the creatures' path map (citykit Grid) if a battle is running: its hp is
 * where the fighting happens, so healing is written there too. Call about once a second. → tiles healed.
 */
export function wallTick(r, days, field = null) {
  const m = memo(r), N = r.size, quiet = (T.wallRegenQuietSec ?? 8) / dayLen(), above = T.wallRegenAbove ?? 0.5;
  const rate = (1 - above) / Math.max(0.01, (T.wallRegenFullSec ?? 12) / dayLen());   // fraction of max a day
  let healed = 0;
  for (let i = 0; i < N * N; i++) {
    const v = r.tiles.wall[i]; if (!v) continue;
    const live = field && field.src?.[i] === 1 ? field.hp[i] : r.tiles.wallHp[i];
    if (live < m.prev[i] - 0.01) m.hit.set(i, r.day);
    let hp = live;
    const max = wallMaxHp(r, v), frac = hp / max, h = m.hit.get(i);
    if (frac > above && frac < 1 && (h == null || r.day - h >= quiet)) {
      hp = Math.min(max, hp + max * rate * days); healed++;
      r.tiles.wallHp[i] = hp; if (field && field.src?.[i] === 1) field.hp[i] = hp;
      if (hp >= max) m.hit.delete(i);
    }
    m.prev[i] = hp;
  }
  return healed;
}
