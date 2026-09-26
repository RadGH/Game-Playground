// Build mode (docs/07 §9): pick a part, a ghost follows the aim (4-cell grid, 64-cell range, line of sight),
// green = valid / red + a reason, place for scrap. Parts are REAL cells with the BUILT flag (they burn, break,
// float, fall). The room keeps a part list (prefab state) so built parts persist; a Rekindle refunds them.
// Pure: main feeds it the aim + intent; it writes cells and emits bus events.
import { F } from '../world/grid.js';
import { CLS } from '../world/materials.js';

export const PARTS = {
  bp_plank: { name: 'Plank', scrap: 2, w: 24, h: 2, mat: 'plank', rot: true },
  bp_brace: { name: 'Brace', scrap: 2, w: 12, h: 12, mat: 'plank', tri: true },
  bp_crate: { name: 'Crate', scrap: 4, w: 10, h: 10, mat: 'plank', crate: true },
};
export function createBuilder(game) {
  const B = { on: false, part: 'bp_plank', rot: 0, ghost: null, reason: null, parts: [] };
  const cellsOf = (part, x, y, rot) => { const P = PARTS[part], out = []; let w = P.w, h = P.h; if (P.rot && rot % 2) [w, h] = [h, w];
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) { if (P.tri && dx < dy) continue; out.push([x + dx, y + dy]); } return out; };
  B.toggle = () => { B.on = !B.on && !!game.hero?.unlocked?.mechanics?.includes('plank_kit'); if (!B.on) B.ghost = null; return B.on; };
  B.step = function (I, aim) {
    if (!B.on) return; const g = game.grid, p = game.player;
    if (I.pressed?.nextWick) B.rot = (B.rot + 1) % 2;
    for (const [k, id] of Object.keys(PARTS).entries()) if (I.pressed?.['wick' + (k + 1)]) B.part = id;
    const P = PARTS[B.part]; const gx = Math.round(aim.x / 4) * 4, gy = Math.round(aim.y / 4) * 4;
    const cells = cellsOf(B.part, gx, gy, B.rot); let reason = null;
    if (Math.hypot(gx - p.x, gy - (p.y - 8)) > (game.hero.class === 'tinker' ? 80 : 64)) reason = 'Too far';
    if (!reason && game.room.room.kind === 'hub') reason = 'No building here';
    if (!reason) for (const [x, y] of cells) { if (!g.inside(x, y)) { reason = 'Out of the room'; break; } const c = g.mats.cls[g.mat[y * g.W + x]]; if (c === CLS.STATIC) { reason = 'Something is in the way'; break; } if (x > p.x - 4 && x < p.x + 4 && y > p.y - 13 && y <= p.y) { reason = 'You are standing there'; break; } }
    if (!reason && !P.crate) { let touch = false; for (const [x, y] of cells) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const c = g.mats.cls[g.get(x + dx, y + dy)]; if ((c === CLS.STATIC || c === CLS.POWDER) && !cells.some(q => q[0] === x + dx && q[1] === y + dy)) touch = true; } if (!touch) reason = 'Needs a solid end'; }
    if (!reason && (game.hero.scrap || 0) < P.scrap) reason = `Needs ${P.scrap} scrap`;
    B.ghost = { cells, ok: !reason }; B.reason = reason;
    if (I.pressed?.cast && !reason) {
      game.hero.scrap -= P.scrap; const m = g.mats.byKey[P.mat];
      for (const [x, y] of cells) { const c = g.mats.cls[g.mat[y * g.W + x]]; if (c === CLS.LIQUID || c === CLS.POWDER) { let ty = y - 1; while (ty > 0 && g.mat[ty * g.W + x]) ty--; if (ty > 0) g.set(x, ty, g.mat[y * g.W + x]); } g.set(x, y, m, { flags: F.BUILT, shade: P.crate && ((x - gx) % 5 === 0 || (y - gy) % 5 === 0) ? 0 : 2 }); }
      B.parts.push({ part: B.part, x: gx, y: gy, rot: B.rot, room: game.room.room.id });
      game.bus.emit('build.place', { part: B.part, x: gx, y: gy });
    }
  };
  /** Refund every part built in this room (a Rekindle). */
  B.refundRoom = roomId => { let n = 0; B.parts = B.parts.filter(p => { if (p.room !== roomId) return true; n += PARTS[p.part].scrap; return false; }); game.hero.scrap = (game.hero.scrap || 0) + n; return n; };
  B.draw = out => { if (!B.on || !B.ghost) return; const c = B.ghost.ok ? [0.4, 1, 0.5, 0.45] : [1, 0.3, 0.3, 0.45]; for (const [x, y] of B.ghost.cells) out.overlays.push({ x, y, w: 1, h: 1, tint: c }); };
  return B;
}
