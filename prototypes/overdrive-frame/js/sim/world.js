// The mission's ground: a grid of tiles with building lots on it. Buildings block movement and shots until they fall;
// a mech can jump onto a roof and stand on it. Every building has health and four looks (citykit wreck stages:
// 0 whole, 1 damaged, 2 burning, 3 rubble). When one collapses it crushes what stands next to it.
// Pure: no drawing. The renderer reads lot.stage and the events this file pushes.

export const STAGE_AT = [1, 0.7, 0.35, 0];   // health share at or below which a building shows stage 1, 2, 3
export const RUBBLE_H = 0.05;                 // rubble is a low heap you walk over
// Round 7 city layouts: deep water (canals, the harbour) is tile code 'w' in map.city.ground — the SAME string the
// ground drawing (render/city-ground.js) paints from. Nothing below DEEP_CLEAR walks or wades in it (a frame can jump
// a canal if it clears the height); shots fly over it.
export const DEEP_CODE = 'w', DEEP_CLEAR = 0.45;

/**
 * @param {{ w: number, h: number, lots: Array<{ id?: string, x: number, z: number, w: number, d: number, h: number,
 *   hp: number, recipe?: string, params?: object, solid?: boolean, explosive?: number }>, props?: any[] }} def
 *   x, z = the lot's min corner in tiles; w, d = its size; h = roof height in tiles.
 */
export function makeWorld(def) {
  const W = { w: def.w, h: def.h, lots: [], cells: new Int32Array(def.w * def.h).fill(-1) };
  def.lots.forEach((l, i) => {
    const lot = { id: l.id || `lot${i}`, i, x: l.x, z: l.z, w: l.w, d: l.d, h0: l.h, h: l.h, hpMax: l.hp, hp: l.hp, stage: 0,
      recipe: l.recipe || null, params: l.params || null, solid: l.solid !== false, explosive: l.explosive || 0, objective: l.objective || null,
      fixed: !!l.fixed, face: l.face ?? null };   // fixed = never damaged (hangar walls); face = screen direction for props that face a way
    W.lots.push(lot);
    for (let z = l.z; z < l.z + l.d; z++) for (let x = l.x; x < l.x + l.w; x++) if (x >= 0 && z >= 0 && x < def.w && z < def.h) W.cells[z * def.w + x] = i;
  });
  const g = def.city?.ground;
  if (g && g.includes(DEEP_CODE)) { W.deep = new Uint8Array(def.w * def.h); for (let i = 0; i < W.deep.length; i++) W.deep[i] = g[i] === DEEP_CODE ? 1 : 0; }
  return W;
}

/** The lot standing on tile (x, z), or null. */
export function lotAt(W, x, z) {
  const tx = Math.floor(x), tz = Math.floor(z);
  if (tx < 0 || tz < 0 || tx >= W.w || tz >= W.h) return null;
  const i = W.cells[tz * W.w + tx]; return i < 0 ? null : W.lots[i];
}

/** Height of what you would stand on at (x, z): a roof, rubble, or the ground (0). */
export function groundAt(W, x, z) {
  const l = lotAt(W, x, z); if (!l || !l.solid) return 0;
  return l.stage >= 3 ? RUBBLE_H : l.h;
}

/** Is (x, z, y) inside a standing building? */
export function blocked(W, x, z, y = 0) {
  if (x < 0 || z < 0 || x >= W.w || z >= W.h) return true;
  if (W.deep && y < DEEP_CLEAR && W.deep[Math.floor(z) * W.w + Math.floor(x)]) return true;   // round 7: canal / harbour water
  const l = lotAt(W, x, z); if (!l || !l.solid || l.stage >= 3) return false;
  return y < l.h - 0.02;
}

/**
 * Push a round body (radius r, feet at height y) out of standing buildings and the map edge. Mutates b.x / b.z and
 * stops its velocity into the wall. Returns true if it touched something.
 */
export function pushOut(W, b, r) {
  let hit = false;
  if (b.x < r) { b.x = r; if (b.vx < 0) b.vx = 0; hit = true; }
  if (b.z < r) { b.z = r; if (b.vz < 0) b.vz = 0; hit = true; }
  if (b.x > W.w - r) { b.x = W.w - r; if (b.vx > 0) b.vx = 0; hit = true; }
  if (b.z > W.h - r) { b.z = W.h - r; if (b.vz > 0) b.vz = 0; hit = true; }
  const x0 = Math.floor(b.x - r), x1 = Math.floor(b.x + r), z0 = Math.floor(b.z - r), z1 = Math.floor(b.z + r);
  for (let tz = z0; tz <= z1; tz++) for (let tx = x0; tx <= x1; tx++) {
    if (!blocked(W, tx + 0.5, tz + 0.5, b.y || 0)) continue;
    // nearest point of this tile to the body's centre
    const nx = Math.max(tx, Math.min(b.x, tx + 1)), nz = Math.max(tz, Math.min(b.z, tz + 1));
    let dx = b.x - nx, dz = b.z - nz; const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 < 1e-9) {           // centre inside the tile: push out the short way
      const ex = [b.x - tx, tx + 1 - b.x], ez = [b.z - tz, tz + 1 - b.z]; const m = Math.min(...ex, ...ez);
      if (m === ex[0]) { b.x = tx - r; b.vx = Math.min(0, b.vx || 0); } else if (m === ex[1]) { b.x = tx + 1 + r; b.vx = Math.max(0, b.vx || 0); }
      else if (m === ez[0]) { b.z = tz - r; b.vz = Math.min(0, b.vz || 0); } else { b.z = tz + 1 + r; b.vz = Math.max(0, b.vz || 0); }
      continue;
    }
    const d = Math.sqrt(d2), push = r - d; dx /= d; dz /= d;
    b.x += dx * push; b.z += dz * push;
    const vn = (b.vx || 0) * dx + (b.vz || 0) * dz; if (vn < 0) { b.vx -= vn * dx; b.vz -= vn * dz; }
  }
  return hit;
}

/** Does a straight walk from (x0, z0) to (x1, z1) cross deep water? (bots check it before walking straight) */
export function wetLine(W, x0, z0, x1, z1) {
  if (!W.deep) return false;
  const len = Math.hypot(x1 - x0, z1 - z0), steps = Math.ceil(len / 0.25);
  for (let i = 1; i <= steps; i++) { const t = i / steps, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t; if (x >= 0 && z >= 0 && x < W.w && z < W.h && W.deep[Math.floor(z) * W.w + Math.floor(x)]) return true; }
  return false;
}

/** First standing building along a straight line at height y, or null: { lot, x, z, t } (t = 0..1 along the line). */
export function rayLot(W, x0, z0, x1, z1, y = 0.2) {
  const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz); if (len < 1e-6) return null;
  const steps = Math.ceil(len / 0.2);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, x = x0 + dx * t, z = z0 + dz * t;
    if (x < 0 || z < 0 || x >= W.w || z >= W.h) return null;
    const l = lotAt(W, x, z);
    if (l && l.solid && l.stage < 3 && y < l.h) return { lot: l, x, z, t };
  }
  return null;
}

/**
 * Damage a building. Pushes { type: 'wreck', lot, stage } when its look changes and { type: 'collapse', lot } when it
 * falls (the mission turns a collapse into crush damage and a chain reaction for explosive lots).
 */
export function damageLot(W, lot, amount, events) {
  if (!lot || lot.stage >= 3 || !lot.solid || lot.fixed) return;
  lot.hp = Math.max(0, lot.hp - amount);
  const share = lot.hp / lot.hpMax;
  let stage = 0; for (let s = 1; s <= 3; s++) if (share <= STAGE_AT[s] + 1e-9) stage = s;
  if (share > 0 && stage === 3) stage = 2;
  if (stage !== lot.stage) {
    lot.stage = stage;
    if (stage >= 2) lot.h = Math.max(lot.h0 * (stage === 2 ? 0.8 : 0), RUBBLE_H);
    events.push({ type: 'wreck', lot: lot.id, stage });
    if (stage === 3) events.push({ type: 'collapse', lot: lot.id, x: lot.x + lot.w / 2, z: lot.z + lot.d / 2, w: lot.w, d: lot.d, h: lot.h0, explosive: lot.explosive });
  }
}

/** Save/load the parts of the world that change. */
export const worldState = W => W.lots.map(l => [l.hp, l.stage]);
export function setWorldState(W, s) { s.forEach(([hp, stage], i) => { const l = W.lots[i]; l.hp = hp; l.stage = stage; l.h = stage >= 3 ? RUBBLE_H : stage === 2 ? l.h0 * 0.8 : l.h0; }); }
