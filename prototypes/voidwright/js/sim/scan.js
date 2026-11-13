// The Scan pulse (play-test #32: "Add a scanner that can be used to find types of asteroids in the system").
// Press Scan (V / D-pad right / the Scan button): a ring sweeps out from your ship and every asteroid inside
// its reach is marked with its ore type — on screen, on the radar and on the local map — until you leave
// the system. Every ship has a short-range pulse from its bridge; Scanner parts reach much further.

import { MATERIALS } from '../data/types.js';

export const BASE_SCAN = 1500;       // bridge sensors, no scanner fitted
export const SCAN_COOLDOWN = 6;      // seconds between pulses

export const scanRange = P => Math.max(BASE_SCAN, P.stats.scanRange || 0);

/** Fire a pulse. Returns { ok, range, found: [{ body, type }] } or { ok:false, wait }. Marks bodies `scanned`. */
export function scanPulse(w, P) {
  if ((P.scanCd || 0) > w.t) return { ok: false, wait: P.scanCd - w.t };
  const range = scanRange(P); P.scanCd = w.t + SCAN_COOLDOWN;
  const found = [];
  for (const b of w.bodies) {
    if (b.dead || Math.hypot(b.x - P.x, b.y - P.y) > range + b.r) continue;
    if (b.kind === 'rock' && b.oreType) { if (!b.scanned) found.push({ body: b, type: rockOre(b).type }); b.scanned = true; }
    else if (b.kind === 'wreck' || b.cache) { if (!b.scanned) found.push({ body: b, type: b.cache ? 'cache' : 'wreck' }); b.scanned = true; }
  }
  w.notes.push({ t: 'scan', found: found.map(f => ({ id: f.body.id, type: f.type })), range });
  w.events.push({ t: 'scanpulse', x: P.x, y: P.y, r: range });
  return { ok: true, range, found };
}

/** "3 Ferrite, 1 Diamond, 2 plain rock" — what one pulse found, for the toast. */
export function scanSummary(found) {
  const by = {};
  for (const f of found) by[f.type] = (by[f.type] || 0) + 1;
  const name = t => t === 'rock' ? 'plain rock' : t === 'mixed' ? 'mixed ore' : t === 'cache' ? 'sealed cache' : t === 'wreck' ? 'wreck' : MATERIALS[t]?.name || t;
  const order = Object.keys(by).sort((a, b) => (MATERIALS[b]?.price || 0) - (MATERIALS[a]?.price || 0));
  return order.map(t => `${by[t]} ${name(t)}`).join(', ');
}

/**
 * What a rock REALLY holds, read from its live cells (report #50: "asteroids claim to be ferrite when I scan them,
 * but only have rock in them"). An ore counts only with a decent node: at least ORE_NODE_MIN cells and
 * ORE_NODE_SHARE of the rock. Two such ores = 'mixed'; none = 'rock'. Cached per grid version, so the label
 * follows the rock as it is mined out. Returns { type, cells: { oreId: n }, ore, total }.
 */
export const ORE_NODE_MIN = 4;
export const ORE_NODE_SHARE = 0.06;
export function rockOre(b) {
  const g = b.grid; if (!g) return { type: b.oreType || 'rock', cells: {}, ore: 0, total: 0 };
  if (b._ore && b._ore.v === g.version) return b._ore;
  const cells = {}; let total = 0, ore = 0;
  for (const bl of g.blocks) { if (bl.alive === false) continue; total++; const m = bl.def?.ore; if (m) { cells[m] = (cells[m] || 0) + 1; ore++; } }
  const need = Math.max(ORE_NODE_MIN, Math.ceil(total * ORE_NODE_SHARE));
  const good = Object.keys(cells).filter(m => cells[m] >= need).sort((x, y) => cells[y] - cells[x]);
  const type = good.length > 1 ? 'mixed' : good.length ? good[0] : 'rock';
  b._ore = { v: g.version, type, cells, ore, total };
  return b._ore;
}

/** Colour and label for a scanned asteroid's marker (from what the rock really holds now). */
export function scanLabel(b) {
  const t = b.kind === 'rock' && b.grid ? rockOre(b).type : b.oreType;
  if (t === 'rock') return { label: 'Rock', color: '#8a7f74' };
  if (t === 'mixed') return { label: 'Mixed ore', color: '#ffd27a' };
  const m = MATERIALS[t]; return { label: m?.name || t, color: m?.color || '#fff' };
}
