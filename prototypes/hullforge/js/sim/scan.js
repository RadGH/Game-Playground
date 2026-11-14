// The scan pulse (V). A ring sweeps out from your ship: every asteroid inside its reach is marked with the ore it
// really holds, hidden things (sealed caches, pirates waiting in the rocks) are revealed, and survey jobs count the
// rocks. Marks show on screen and on the radar for MARK_TIME seconds. Every ship scans 1.5 km from its bridge; a
// Scanner part reaches further (stats.js scanRange).

import { ORES, BLOCKS } from '../data/blocks.js';
import { vdist } from '../core/math.js';

export const BASE_SCAN = 1500;      // m, bridge sensors with no Scanner fitted
export const SCAN_COOLDOWN = 6;     // s between pulses
export const MARK_TIME = 120;       // s a mark stays on screen
export const ORE_NODE_MIN = 4;      // a rock "holds" an ore only with at least this many ore blocks

export const scanRange = P => Math.max(BASE_SCAN, P?.stats?.scanRange || 0);

/**
 * What a rock really holds now, from its live blocks (cached per grid version): { type: oreId | 'rock' | 'mixed',
 * cells: { oreId: n }, total }. Two ores with a decent node each = 'mixed'.
 */
export function rockOre(b) {
  const g = b.grid; if (b._ore && b._ore.v === g.version) return b._ore;
  const cells = {}; let total = 0;
  for (const bl of g.cells.values()) { total++; const o = BLOCKS[bl.t]?.ore; if (o) cells[o] = (cells[o] || 0) + 1; }
  const good = Object.keys(cells).filter(o => cells[o] >= ORE_NODE_MIN).sort((a, c) => cells[c] - cells[a]);
  b._ore = { v: g.version, type: good.length > 1 ? 'mixed' : good[0] || 'rock', cells, total };
  return b._ore;
}
/** Label + colour of a scan mark. */
export function scanLabel(b) {
  if (b.cache) return { label: 'Sealed cache', color: '#ffd38a' };
  if (b.derelict) return { label: 'Derelict station', color: '#c48cff' };
  if (b.kind === 'wreck') return { label: 'Wreck', color: '#c9b8a8' };
  const o = rockOre(b);
  if (o.type === 'rock') return { label: 'Plain rock', color: '#8a7f74' };
  if (o.type === 'mixed') { const [a, c] = Object.keys(o.cells).sort((x, y) => o.cells[y] - o.cells[x]); return { label: `${ORES[a].name} + ${ORES[c].name.replace(' ore', '')}`, color: ORES[a].color }; }
  return { label: `${ORES[o.type].name} · ${o.cells[o.type]} blocks`, color: ORES[o.type].color };
}
/** Is this body's scan mark still showing? */
export const marked = (w, b) => b.scannedAt != null && w.t - b.scannedAt < MARK_TIME;

/**
 * Fire a pulse from ship P. Returns { ok: true, range, found: [{ body, type }] } or { ok: false, wait } while it
 * recharges. Marks bodies with `scannedAt` (and reveals `hidden` ones). Pushes a 'scan' event for the ring.
 */
export function scanPulse(w, P) {
  if ((P.scanCd || 0) > w.t) return { ok: false, wait: P.scanCd - w.t };
  const range = scanRange(P); P.scanCd = w.t + SCAN_COOLDOWN;
  const found = [];
  for (const b of w.bodies) {
    if (b.dead || b === P || vdist(b.pos, P.pos) > range + b.radius) continue;
    if (b.kind === 'rock' || b.kind === 'wreck' || b.cache) {
      const first = b.scannedAt == null;
      b.scannedAt = w.t; if (b.hidden) b.hidden = false;
      found.push({ body: b, type: b.cache ? 'cache' : b.derelict ? 'derelict' : b.kind === 'wreck' ? 'wreck' : rockOre(b).type, first });
    }
  }
  // pirates waiting in the rocks show up too
  for (const e of w.enc || []) if (e.kind === 'ambush' && !e.sprung && vdist(e.pos, P.pos) < range) { e.revealed = true; found.push({ body: null, type: 'ambush', first: true }); }
  w.events.push({ type: 'scan', pos: { ...P.pos }, range });
  return { ok: true, range, found };
}

/** "3 Copper ore, 1 sealed cache, 5 plain rock" — what a pulse found, richest first. */
export function scanSummary(found) {
  const by = {};
  for (const f of found) by[f.type] = (by[f.type] || 0) + 1;
  const name = t => ({ rock: 'plain rock', mixed: 'mixed ore', cache: 'sealed cache', wreck: 'wreck', derelict: 'derelict station', ambush: 'pirates hiding in the rocks' })[t] || ORES[t]?.name || t;
  const order = Object.keys(by).sort((a, b) => (ORES[b]?.price || (b === 'cache' || b === 'ambush' ? 99 : 0)) - (ORES[a]?.price || (a === 'cache' || a === 'ambush' ? 99 : 0)));
  return order.map(t => `${by[t]} ${name(t)}`).join(', ');
}
