// The world: flat per-cell typed arrays + 16x16 chunks that sleep. PURE (no DOM).
//
//   mat    what stands in the cell (materials.json, layer "cell"; 0 = empty)
//   ground the floor under it (layer "ground")
//   height terrain height. A liquid's surface is height*LEVEL + amount.
//   temp   heat byte, ambient = M.ambient
//   life   per-material counter: fuel while burning, a liquid's amount, ticks left, growth stage
//   flag   BURN | WET | OWNED | CHARGED
// Rules touch a cell through `touch(i)`, which keeps its chunk (and neighbours near an edge) awake
// next tick. A chunk with nothing to do sleeps, so a calm lake costs nothing.

export const CH = 16;
export const BURN = 1, WET = 2, OWNED = 4, CHARGED = 8, STILL = 16;
export const LEVEL = 8; // liquid amount units per height step

export function createWorld(W, H, M) {
  const N = W * H;
  const CW = Math.ceil(W / CH), CHh = Math.ceil(H / CH);
  const w = {
    W, H, N, M, CW, CHh,
    mat: new Uint8Array(N),
    ground: new Uint8Array(N),
    height: new Uint8Array(N),
    temp: new Uint8Array(N).fill(M.ambient),
    life: new Uint8Array(N),
    flag: new Uint8Array(N),
    awake: new Uint8Array(CW * CHh),
    next: new Uint8Array(CW * CHh),
    heightVer: 0,               // bumped when the height map changes (renderer re-uploads)
    // half-resolution gas: kind + density
    GW: W >> 1, GH: H >> 1,
    gasKind: new Uint8Array((W >> 1) * (H >> 1)),
    gasDens: new Uint8Array((W >> 1) * (H >> 1)),
    gasBack: new Uint8Array((W >> 1) * (H >> 1)),
    gasKindBack: new Uint8Array((W >> 1) * (H >> 1)),
    wind: { x: 0.6, y: 0.2, strength: 1 },
    tick: 0,
    clock: 0.35,                // time of day 0..1 (0.25 dawn, 0.5 noon, 0.75 dusk)
    dayLength: 3600,            // ticks per full day
    rain: [],                   // rain clouds { x, y, r, vx, vy, ttl, acid }
    lights: [],                 // short-lived lights { x, y, r, g, b, rad, ttl, max }
    shake: 0,
    events: [],                 // things the game layer listens for: { type, ... }
    stats: { burning: 0, liquid: 0, lava: 0 },
  };
  w.idx = (x, y) => y * W + x;
  w.inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  w.touch = (i) => {
    const x = i % W, y = (i / W) | 0;
    const cx = (x / CH) | 0, cy = (y / CH) | 0;
    w.next[cy * CW + cx] = 1;
    const lx = x - cx * CH, ly = y - cy * CH;
    if (lx === 0 && cx > 0) w.next[cy * CW + cx - 1] = 1;
    if (lx === CH - 1 && cx < CW - 1) w.next[cy * CW + cx + 1] = 1;
    if (ly === 0 && cy > 0) w.next[(cy - 1) * CW + cx] = 1;
    if (ly === CH - 1 && cy < CHh - 1) w.next[(cy + 1) * CW + cx] = 1;
  };
  w.wakeAll = () => { w.next.fill(1); w.awake.fill(1); };
  w.emit = (type, data) => { w.events.push({ type, ...data }); };
  return w;
}

/** Put a material in a cell, with sensible starting life/temp. Does not check what was there. */
export function setCell(w, i, m, amount) {
  const M = w.M;
  w.mat[i] = m;
  w.flag[i] &= ~(BURN | STILL | CHARGED);
  if (M.liquid[m]) w.life[i] = amount ?? LEVEL * 2;
  else if (M.lifeTicks[m]) w.life[i] = Math.min(255, M.lifeTicks[m]);
  else if (M.coolTicks[m]) w.life[i] = 255;
  else w.life[i] = 0;
  if (M.hot[m]) w.temp[i] = Math.max(w.temp[i], M.hot[m]);
  if (m === M.id.fire) { w.flag[i] |= BURN; w.life[i] = M.fuel[m]; w.temp[i] = M.fireTemp; }
  w.touch(i);
}

/** Set a floor. */
export function setGround(w, i, g) {
  w.ground[i] = g;
  w.touch(i);
}

/** Light a cell if it can burn. Returns true if it caught. */
export function ignite(w, i, force = false) {
  const M = w.M, m = w.mat[i];
  if (w.shield && w.shield[i]) return false;
  if (w.flag[i] & BURN) return false;
  if (m === 0 || !M.ignite[m]) {
    // nothing burnable standing here: a burnable floor can carry a quick flame
    const g = w.ground[i];
    if (m === 0 && M.ignite[g] && (force || !(w.flag[i] & WET))) {
      setCell(w, i, M.id.fire);
      w.life[i] = Math.max(4, M.fuel[g]);
      return true;
    }
    return false;
  }
  if ((w.flag[i] & WET) && !force) { w.flag[i] &= ~WET; return false; }
  w.flag[i] |= BURN;
  w.life[i] = Math.max(w.life[i], M.fuel[m]);
  w.temp[i] = M.fireTemp;
  w.touch(i);
  return true;
}

/** Paint a disc of a material (or a floor) — the brush. Returns cells changed. */
export function paint(w, cx, cy, r, m, opts = {}) {
  const M = w.M;
  let n = 0;
  const r2 = r * r;
  const isGround = M.ground[m] === 1;
  const rnd = opts.rng || Math.random;
  const density = opts.density ?? (M.tree[m] || m === M.id.flowers || m === M.id.tallgrass || m === M.id.seed ? 0.35 : 1);
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (!w.inside(x, y)) continue;
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > r2 + 0.5) continue;
      if (density < 1 && rnd() > density) continue;
      const i = y * w.W + x;
      if (m === 0) { // eraser: clears the cell, keeps the floor
        if (w.mat[i] !== 0) { w.mat[i] = 0; w.flag[i] &= ~(BURN | CHARGED); w.life[i] = 0; w.temp[i] = M.ambient; w.touch(i); n++; }
        continue;
      }
      if (isGround) {
        if (w.ground[i] !== m) { setGround(w, i, m); n++; }
        if (opts.clear && w.mat[i] && !M.liquid[w.mat[i]]) { w.mat[i] = 0; w.flag[i] &= ~BURN; }
        continue;
      }
      if (M.liquid[m]) {
        if (w.mat[i] === m) { w.life[i] = Math.min(255, w.life[i] + (opts.amount ?? LEVEL)); w.touch(i); n++; continue; }
        if (w.mat[i] !== 0 && M.blocksLiquid[w.mat[i]]) continue;
        setCell(w, i, m, opts.amount ?? LEVEL * 2);
        n++;
        continue;
      }
      if (opts.keep && w.mat[i] !== 0) continue;
      if (w.mat[i] !== m) { setCell(w, i, m); n++; }
    }
  }
  return n;
}

/** Add (or remove) height in a soft disc. */
export function raise(w, cx, cy, r, amount) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (!w.inside(x, y)) continue;
      const d = Math.hypot(x - cx, y - cy) / r;
      if (d > 1) continue;
      const i = y * w.W + x;
      const k = Math.cos(d * Math.PI / 2);
      w.height[i] = Math.max(0, Math.min(255, Math.round(w.height[i] + amount * k * k)));
      w.touch(i);
    }
  }
  w.heightVer++;
}

/** Add a short-lived coloured light. */
export function flash(w, x, y, rgb, rad, ttl) {
  w.lights.push({ x, y, r: rgb[0], g: rgb[1], b: rgb[2], rad, ttl, max: ttl });
}
