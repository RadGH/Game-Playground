// Slow life of the land: grass spreads, scorched earth heals, trees seed, crops ripen, glowcaps
// creep at night, thornbriar spreads, seeds sprout, mud dries. PURE. Random sampling over the whole
// map each tick (no chunk wake needed), so a burnt valley greens again over a few minutes.

import { setCell, WET, BURN } from './world.js';

const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];

export function createGrowth(w, rng, opts = {}) {
  const M = w.M, W = w.W, H = w.H, ID = M.id;
  const { mat, ground, flag, life } = w;
  const rate = opts.rate ?? 1;

  function step() {
    const samples = Math.round((w.N / 300) * rate * (w.growthScale ?? 1));
    const night = w.clock < 0.22 || w.clock > 0.8;
    for (let s = 0; s < samples; s++) {
      const i = (rng() * w.N) | 0;
      const x = i % W, y = (i / W) | 0;
      const m = mat[i], g = ground[i];
      if (flag[i] & BURN) continue;
      const d = (rng() * 4) | 0;
      const nx = x + DX[d], ny = y + DY[d];
      const j = nx >= 0 && ny >= 0 && nx < W && ny < H ? ny * W + nx : -1;
      if (m === 0) {
        // floors
        const to = M.growsTo[g];
        if (to !== 255) {
          if (M.slowGrow[g] && rng() > 0.25) continue;
          // grass spreads from a grassy neighbour (or ash is fertile on its own)
          if (to === ID.grass && !M.flag.fertile[g] && (j < 0 || (ground[j] !== ID.grass && ground[j] !== ID.meadow))) continue;
          ground[i] = to; w.touch(i);
          continue;
        }
        if (M.dryTo[g] !== 255 && !(flag[i] & WET) && rng() < 0.3) { ground[i] = M.dryTo[g]; continue; }
        if ((g === ID.grass || g === ID.meadow) && rng() < 0.006) {
          // a wild meadow fills itself in
          const r = rng();
          if (g === ID.meadow && r < 0.4) setCell(w, i, ID.flowers);
          else if (r < 0.6) setCell(w, i, ID.tallgrass);
          else if (r < 0.62 && j >= 0 && M.tree[mat[j]]) setCell(w, i, mat[j]);
          continue;
        }
        if (g === ID.grass && j >= 0 && M.tree[mat[j]] && rng() < 0.05) { setCell(w, i, rng() < 0.7 ? mat[j] : ID.bush); continue; }
        if (g === ID.marsh && night && j >= 0 && mat[j] === ID.mushroom && rng() < 0.2) { setCell(w, i, ID.mushroom); continue; }
        continue;
      }
      if (m === ID.crop) { if (life[i] < 255) life[i] = Math.min(255, life[i] + Math.round((12 + (flag[i] & WET ? 8 : 0)) * (w.cropScale ?? 1))); continue; }
      if (m === ID.seed) {
        life[i] = Math.min(255, life[i] + 4 + (flag[i] & WET ? 10 : 0));
        if (life[i] >= 255) setCell(w, i, ground[i] === ID.snow ? ID.pine : rng() < 0.8 ? ID.tree : ID.bush);
        continue;
      }
      if (m === ID.thorns && j >= 0 && mat[j] === 0 && rng() < 0.12 && !M.liquid[mat[j]]) { setCell(w, j, ID.thorns); continue; }
      if (m === ID.mushroom && night && j >= 0 && mat[j] === 0 && (ground[j] === ID.marsh || ground[j] === ID.dirt || ground[j] === ID.crystalfloor) && rng() < 0.08) { setCell(w, j, ID.mushroom); continue; }
      if (m === ID.charwood && rng() < 0.02) { setCell(w, i, 0); continue; }
      if (m === ID.ashpile && rng() < 0.03) { setCell(w, i, 0); ground[i] = ID.ashfloor; continue; }
      if (m === ID.deadtree && (ground[i] === ID.grass) && rng() < 0.002) { setCell(w, i, ID.tree); continue; }
      if (m === ID.rubble && rng() < 0.002) { setCell(w, i, 0); continue; }
      if (m === ID.fire) continue;
      if (M.liquid[m] && m === ID.water && g === ID.dirt && rng() < 0.05) { ground[i] = ID.mud; continue; }
    }
  }
  return { step };
}
