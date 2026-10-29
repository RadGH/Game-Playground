// Gas at half resolution: smoke, steam, poison, spores, marsh gas. PURE.
// One kind + a density per gas cell. It drifts with the wind, spreads a little and fades.
// Spores and marsh gas BURN: a gas cell over something burning flashes into fire (see cells.js).

export const GAS = { none: 0, smoke: 1, steam: 2, poison: 3, spores: 4, marshgas: 5 };
export const GAS_NAMES = ['none', 'smoke', 'steam', 'poison', 'spores', 'marshgas'];
// fade per step (out of 256) and how it looks: [r, g, b, opacity scale, glow]
export const GAS_LOOK = [
  [0, 0, 0, 0, 0],
  [40, 36, 38, 0.75, 0],
  [235, 240, 245, 0.32, 0],
  [120, 220, 60, 0.55, 0.25],
  [210, 120, 255, 0.5, 0.45],
  [140, 170, 90, 0.35, 0],
];
const FADE = [0, 3, 9, 4, 5, 2];
export const FLAMMABLE_GAS = [0, 0, 0, 0, 1, 1];

export function addGas(w, x, y, kind, amount) {
  const gx = x >> 1, gy = y >> 1;
  if (gx < 0 || gy < 0 || gx >= w.GW || gy >= w.GH) return;
  const j = gy * w.GW + gx;
  if (w.gasKind[j] !== kind && w.gasDens[j] > amount) return; // a thicker gas holds the cell
  if (w.gasKind[j] !== kind) w.gasDens[j] = 0;
  w.gasKind[j] = kind;
  w.gasDens[j] = Math.min(255, w.gasDens[j] + amount);
  w.gasTotal = (w.gasTotal || 0) + 1;
}

export function gasAt(w, x, y) {
  const gx = x >> 1, gy = y >> 1;
  if (gx < 0 || gy < 0 || gx >= w.GW || gy >= w.GH) return 0;
  return w.gasDens[gy * w.GW + gx];
}

/** One gas step: drift with the wind, spread, fade. */
export function stepGas(w, rng) {
  if (!w.gasTotal) return;
  const GW = w.GW, GH = w.GH;
  const kind = w.gasKind, dens = w.gasDens, back = w.gasBack, kback = w.gasKindBack;
  back.fill(0); kback.fill(0);
  const wx = w.wind.x * w.wind.strength * 0.6, wy = w.wind.y * w.wind.strength * 0.6;
  let total = 0;
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      const j = y * GW + x;
      let d = dens[j];
      if (!d) continue;
      const k = kind[j];
      d -= Math.min(d, FADE[k] + (rng() < 0.5 ? 1 : 0));
      if (d < 3) continue;
      total++;
      // drift: move whole cell one step with probability = wind speed
      let tx = x, ty = y;
      if (rng() < Math.abs(wx)) tx += Math.sign(wx);
      if (rng() < Math.abs(wy)) ty += Math.sign(wy);
      if (rng() < 0.18) { tx += rng() < 0.5 ? -1 : 1; } // a little wander
      if (tx < 0 || ty < 0 || tx >= GW || ty >= GH) continue; // blown off the map
      // spread: keep most, share some with one random neighbour
      const share = d >> 3;
      const keep = d - share;
      put(tx + ty * GW, k, keep);
      const r = (rng() * 4) | 0;
      const nx = tx + (r === 0 ? 1 : r === 1 ? -1 : 0), ny = ty + (r === 2 ? 1 : r === 3 ? -1 : 0);
      if (share && nx >= 0 && ny >= 0 && nx < GW && ny < GH) put(nx + ny * GW, k, share);
    }
  }
  function put(t, k, a) {
    if (back[t] && kback[t] !== k) { if (a <= back[t]) return; back[t] = 0; }
    kback[t] = k;
    back[t] = Math.min(255, back[t] + a);
  }
  dens.set(back); kind.set(kback);
  w.gasTotal = total;
}
