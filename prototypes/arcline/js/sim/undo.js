// Undo (owner report #76, 2026-11-16): "Add support to undo with a 60 second timer that gives full refunds. Allow
// ctrl+z to undo build placements, including multi-tile road or wall segments."
//
// Every build action (one press-drag-release of any tool: a road or wall run, a zone rectangle, a building, a turret,
// a move, bulldozing, levelling, a ghost rebuilt) is recorded as a DIFF: which tiles changed and from what, which
// buildings/turrets came or went, what it cost. Undo puts back exactly those tiles — only where they still hold what
// the action left, so a wall the creatures have since broken, or money earned since, is never rolled back — and pays
// back every credit and material the action cost. Buildings that grew on a zone you undo go with it.
// Undo works for T.undoSec real seconds (60) after the action, newest first.
//
// Pure: no DOM. Time = real ms (Date.now()), like the free-move minute in build.js. The stack lives in memory (not
// in the save): a reload starts with nothing to undo.
import { T } from './tuning.js';
import { reindexLots } from './build.js';

const TILE_KEYS = ['zone', 'road', 'power', 'pipe', 'wall', 'wallHp', 'transit'];
const TER_KEYS = ['height', 'flora'];
const stacks = new WeakMap();
const stack = r => { let s = stacks.get(r); if (!s) { s = []; stacks.set(r, s); } return s; };
export const undoSec = () => T.undoSec ?? 60;

/** Before an action: a copy of what it may change. */
export function snapshot(r) {
  const a = {}; for (const k of TILE_KEYS) a[k] = r.tiles[k].slice(); for (const k of TER_KEYS) a['ter.' + k] = r.ter[k].slice();
  return { a, lots: r.lots.slice(), pos: new Map(r.lots.map(l => [l, [l.x, l.z]])), turrets: r.turrets.slice(), ghosts: (r.ghosts || []).slice(), money: r.money, stock: { ...r.stock }, day: r.day };
}
const arr = (r, k) => k.startsWith('ter.') ? r.ter[k.slice(4)] : r.tiles[k];

/** After the action: keep what it changed as an undo step. label = what to call it ("Street"). → the step, or null if
 *  nothing changed. */
export function record(r, before, label, now = Date.now()) {
  const diffs = {}; let any = false;
  for (const k of Object.keys(before.a)) {
    const b = before.a[k], c = arr(r, k), idx = [];
    for (let i = 0; i < c.length; i++) if (b[i] !== c[i]) idx.push(i);
    if (idx.length) { any = true; diffs[k] = { idx, from: idx.map(i => b[i]), to: idx.map(i => c[i]) }; }
  }
  const now0 = new Set(r.lots), was = new Set(before.lots);
  const lotsAdded = r.lots.filter(l => !was.has(l)), lotsRemoved = before.lots.filter(l => !now0.has(l));
  const moved = r.lots.filter(l => was.has(l) && (before.pos.get(l)[0] !== l.x || before.pos.get(l)[1] !== l.z)).map(l => ({ lot: l, from: before.pos.get(l), to: [l.x, l.z] }));
  const tNow = new Set(r.turrets), tWas = new Set(before.turrets);
  const turretsAdded = r.turrets.filter(t => !tWas.has(t)), turretsRemoved = before.turrets.filter(t => !tNow.has(t));
  const gNow = new Set(r.ghosts || []), ghostsRemoved = before.ghosts.filter(g => !gNow.has(g));
  const cost = Math.max(0, before.money - r.money), mats = {};
  for (const [k, v] of Object.entries(before.stock)) if (v - (r.stock[k] || 0) > 0) mats[k] = v - (r.stock[k] || 0);
  if (!any && !lotsAdded.length && !lotsRemoved.length && !moved.length && !turretsAdded.length && !turretsRemoved.length && !ghostsRemoved.length && !cost) return null;
  const step = { label, at: now, day: before.day, diffs, lotsAdded, lotsRemoved, moved, turretsAdded, turretsRemoved, ghostsRemoved, cost, mats };
  const s = stack(r); s.push(step); while (s.length > 40) s.shift();
  return step;
}

/** The step Ctrl+Z would undo now, with secondsLeft — or null. */
export function nextUndo(r, now = Date.now()) {
  const s = stack(r);
  while (s.length && now - s[s.length - 1].at > undoSec() * 1000) s.pop();   // expired steps are gone for good
  const st = s[s.length - 1]; if (!st) return null;
  return { label: st.label, at: st.at, cost: st.cost, mats: st.mats, secondsLeft: Math.max(0, Math.ceil(undoSec() - (now - st.at) / 1000)) };
}
/** Forget every step (a new region, a load). */
export function clearUndo(r) { stacks.delete(r); }

/** Undo the newest step. → { ok, why?, label, refund, mats } */
export function undo(r, now = Date.now()) {
  if (!nextUndo(r, now)) return { ok: false, why: `Nothing to undo — a build can be undone for ${undoSec()} seconds` };
  const st = stack(r).pop(), N = r.size;
  // buildings the action put down (and homes/shops that grew since on a zone it painted) come away
  const zoned = new Set(st.diffs.zone ? st.diffs.zone.idx.filter((i, k) => st.diffs.zone.to[k] && !st.diffs.zone.from[k]) : []);
  const grew = r.lots.filter(l => l.kind === 'zoned' && l.built >= st.day && tilesOf(l, N).some(i => zoned.has(i)));
  const drop = new Set([...st.lotsAdded, ...grew]);
  if (drop.size) { r.lots = r.lots.filter(l => !drop.has(l)); reindexLots(r); }
  r.turrets = r.turrets.filter(t => !st.turretsAdded.includes(t));
  // tiles: put back what the action changed, where they still hold what it left
  for (const [k, d] of Object.entries(st.diffs)) {
    if (k === 'wallHp') continue;
    const c = arr(r, k);
    d.idx.forEach((i, n) => { if (c[i] === d.to[n]) c[i] = d.from[n]; });
  }
  if (st.diffs.wallHp) { const c = r.tiles.wallHp, d = st.diffs.wallHp; d.idx.forEach((i, n) => { if (Math.abs(c[i] - d.to[n]) < 0.5 || !r.tiles.wall[i]) c[i] = r.tiles.wall[i] ? d.from[n] : 0; }); }
  // moved buildings go back; removed ones and turrets come back where their ground is still free
  for (const m of st.moved) if (r.lots.includes(m.lot) && m.lot.x === m.to[0] && m.lot.z === m.to[1]) {
    const lot = m.lot; tilesOf(lot, N).forEach(i => { r.tiles.lot[i] = -1; });
    const free = tilesOf({ ...lot, x: m.from[0], z: m.from[1] }, N).every(i => r.tiles.lot[i] < 0 && !r.tiles.wall[i]);
    if (free) { lot.x = m.from[0]; lot.z = m.from[1]; if (lot.id === 'col-core' && r.core) { r.core.x = lot.x; r.core.z = lot.z; } }
    reindexLots(r);
  }
  for (const l of st.lotsRemoved) if (tilesOf(l, N).every(i => r.tiles.lot[i] < 0 && !r.tiles.wall[i] && !r.tiles.road[i])) { r.lots.push(l); reindexLots(r); }
  for (const t of st.turretsRemoved) if (!r.turrets.some(o => o.x === t.x && o.z === t.z) && r.tiles.lot[t.z * N + t.x] < 0 && !r.tiles.wall[t.z * N + t.x]) r.turrets.push(t);
  if (st.ghostsRemoved.length) { r.ghosts ||= []; for (const g of st.ghostsRemoved) if (!r.ghosts.includes(g)) r.ghosts.push(g); }
  // a full refund
  r.money += st.cost; for (const [k, v] of Object.entries(st.mats)) r.stock[k] = (r.stock[k] || 0) + v;
  r.dirty = true; r.wallsChanged = true; r.lineRev = (r.lineRev || 0) + 1; if (st.diffs['ter.height']) r.terrainChanged = true;
  return { ok: true, label: st.label, refund: st.cost, mats: st.mats };
}
function tilesOf(l, N) { const out = []; for (let k = 0; k < l.d; k++) for (let j = 0; j < l.w; j++) out.push((l.z + k) * N + l.x + j); return out; }
