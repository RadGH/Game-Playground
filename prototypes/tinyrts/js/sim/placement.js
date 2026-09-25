// Can a building go here? Returns {ok, reason, link} where link is the node that would link it.
// Rules: inside the map, footprint free of solid cells (loose dust/rubble is fine — it gets
// cleared), at least 80% of the row under it solid (terrain, walls or rubble — so turrets can sit on
// walls), a 1-cell gap from other buildings, linked (except the Core and Gates), affordable, and
// unlocked.

import { M, S } from '../world/materials.js';
import { bdef } from './buildings.js';
import { findLinkFor } from './network.js';
import { canAfford } from './teams.js';

export function checkPlacement(game, team, type, x, y, opts = {}) {
  const def = bdef(game, type);
  const w = game.world;
  if (!def) return { ok: false, reason: 'Unknown building' };
  const [bw, bh] = def.size;
  if (x < 2 || y < 1 || x + bw > w.w - 2 || y + bh >= w.h) return { ok: false, reason: 'Out of bounds' };
  if (!opts.ignoreTech && !game.isUnlocked(team, type)) return { ok: false, reason: 'Not available in this mission' };
  // Footprint.
  let terrain = 0, walls = 0, bldg = 0;
  for (let yy = y; yy < y + bh; yy++) for (let xx = x; xx < x + bw; xx++) {
    const m = w.mat[w.idx(xx, yy)];
    if (m === M.EMPTY) continue;
    const st = w.mats.state[m];
    if (st === S.LOOSE) continue;
    if (m === M.FOOTPRINT) bldg++;
    else if (w.mats.built[m]) walls++;
    else terrain++;
  }
  if (bldg) return { ok: false, reason: 'Overlaps a building' };
  if (terrain) return { ok: false, reason: 'Blocked by terrain (dig it out first)' };
  if (walls) return { ok: false, reason: 'Blocked by walls' };
  // Support underneath.
  let solid = 0, onBuilding = 0;
  for (let xx = x; xx < x + bw; xx++) {
    const m = w.mat[w.idx(xx, y + bh)];
    if (m === M.FOOTPRINT) onBuilding++;
    else if (m !== M.EMPTY) solid++;
  }
  if (onBuilding) return { ok: false, reason: "Can't stack on another building" };
  if (solid / bw < 0.8) return { ok: false, reason: 'Needs solid ground under it' };
  // Gap from other buildings.
  for (let yy = y - 1; yy <= y + bh; yy++) for (let xx = x - 1; xx <= x + bw; xx++) {
    if (yy >= y && yy < y + bh && xx >= x && xx < x + bw) continue;
    if (w.get(xx, yy) === M.FOOTPRINT) return { ok: false, reason: 'Too close to another building' };
  }
  // Link.
  let link = null;
  if (type !== 'core' && !def.noLink) {
    link = findLinkFor(game, team, x, y, bw, bh);
    if (!link) return { ok: false, reason: 'Out of link range (build a Relay)' };
  }
  // Limits.
  if (type === 'core' && game.buildings.some((b) => b.team === team && b.type === 'core')) return { ok: false, reason: 'Only one Core' };
  // Cost.
  if (!opts.free && !canAfford(game.teams[team], def.cost)) return { ok: false, reason: 'Not enough resources', link, poor: true };
  return { ok: true, link };
}

// Where a building would sit if the cursor is at cell (cx, cy): centered on the cursor, lifted
// out of terrain if the cursor is inside the ground, or dropped onto the first surface below.
export function snapPlacement(game, type, cx, cy) {
  const def = bdef(game, type);
  const [bw, bh] = def.size;
  const x = Math.round(cx - bw / 2);
  const w = game.world;
  const free = (yy) => {
    for (let y2 = yy; y2 < yy + bh; y2++) for (let x2 = x; x2 < x + bw; x2++) {
      const m = w.get(x2, y2);
      if (m !== M.EMPTY && w.mats.state[m] !== S.LOOSE) return false;
    }
    return true;
  };
  const supported = (yy) => {
    let n = 0;
    for (let x2 = x; x2 < x + bw; x2++) { const m = w.get(x2, yy + bh); if (m !== M.EMPTY && w.mats.state[m] !== S.LOOSE) n++; }
    return n / bw >= 0.5;
  };
  // (Buildings can't stack, but snapping still stops on top of them so the ghost shows why.)
  let y = Math.max(1, Math.round(cy - bh / 2));
  if (!free(y)) {
    for (let k = 1; k < 90; k++) if (free(y - k)) { y -= k; break; }
    return { x, y };
  }
  for (let k = 0; k < 160 && y + bh < w.h - 1; k++) {
    if (supported(y) || !free(y + 1)) break;
    y++;
  }
  return { x, y };
}
