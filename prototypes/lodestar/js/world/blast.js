// Explosions (PLAN M1). PURE.
//
// The ground is flat, so a blast BREAKS the ground instead of digging it (there is no height field
// anywhere). Inside radius r, by distance d = dist/r (made ragged by a per-cell jitter):
//   * d < rubbleCore  → the material's `blast` result (ground → rubble, tree → burning log, rock →
//     rubble); ore, water, lava and cliffs are left alone;
//   * d < scorchRing  → the material's `blastRing` result (grass → scorched, tree → log);
//   * everything inside gets hot (coreTemp at the centre falling to rimTemp at the edge), burnables
//     catch with a chance that falls off with distance, ice melts, water throws up steam;
//   * wall cells lose hit points (M4 moves that onto the wall's 4 m sections).
// Broken material is thrown out as debris (debris.js, with its caps) and a puff of smoke and ash
// (steam over water) goes into the gas layer. The blast is reported as an `explosion` event.

import { BURN, EDGE, SCORCH } from './grid.js';
import { puff, GAS_SMOKE, GAS_ASH, GAS_STEAM } from './gas.js';
import { hash2, isqrt } from '../sim/rng.js';

export function createBlast(g, M, fire, debris, rng, events) {
  const R = M.rules.blast;
  const wallId = M.id.wall;
  const wallPart = new Uint8Array(256); M.list.forEach((m, i) => { if (m.wallPart || i === wallId) wallPart[i] = 1; });
  const rubble = M.id.rubble;

  /** Detonate at (x, y) with radius r cells and power (1 = a standard charge). */
  function blast(x, y, r, power = 1) {
    x |= 0; y |= 0;
    r = Math.max(1, Math.round(r));
    const r2 = r * r;
    let water = 0, land = 0;
    const chainKey = events.length;
    for (let dy = -r; dy <= r; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= g.H) continue;
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= g.W) continue;
        const dd = dx * dx + dy * dy;
        if (dd > r2) continue;
        const i = g.idx(xx, yy);
        let c = g.cells[i];
        const m = c & 255;
        const dist = Math.sqrt(dd) / r;
        const jit = (((hash2(xx, yy, 1234) & 1023) / 1023) - 0.5) * 2 * R.edgeJitter;
        const d = Math.max(0, dist + (dd === 0 ? -1 : jit));
        if (c & EDGE) continue;
        if (M.water[m]) {
          water++;
          continue;
        }
        if (M.hot[m]) continue;
        land++;
        // melt ice
        if (M.melt[m] !== 255) {
          c = ((M.melt[m] & 255) | (M.ambient << 8) | (c & 0xffff0000)) >>> 0;
          g.cells[i] = c; g.ver[i >>> 12]++;
          continue;
        }
        let nm = m;
        if (wallPart[m]) {
          // M4: a wall's hit points live on its 4 m sections (js/sim/defence/walls.js takes the blast there); the
          // cell itself only gets hot (a timber wall can catch)
        } else if (d < R.rubbleCore && M.blast[m] !== 255) {
          nm = M.blast[m];
        } else if (d < R.scorchRing && M.blastRing[m] !== 255) {
          nm = M.blastRing[m];
        }
        const broke = nm !== m;
        if (broke) {
          c = ((c & ~0xff & ~0xff0000) | nm) >>> 0;
          if (M.walk[nm] > 0 && nm !== m) c = (c | SCORCH) >>> 0;
          if ((c & BURN) && !M.flammable[nm]) c = (c & ~BURN) >>> 0;
          if (M.regrow[nm] !== 255) g.regrowHint[i >>> 12] = 1;
        }
        // heat
        const t = Math.round(R.coreTemp - (R.coreTemp - R.rimTemp) * dist);
        const ct = (c >>> 8) & 255;
        if (t > ct) c = ((c & ~0xff00) | (t << 8)) >>> 0;
        g.cells[i] = c;
        g.ver[i >>> 12]++;
        // burnables catch
        if (M.flammable[c & 255] && !(c & BURN) && rng.float() < R.igniteChance * (1 - dist * 0.7)) {
          fire.ignite(xx, yy);
        }
        // debris from broken cells
        if (broke && rng.float() < R.debrisPerCell * power) {
          const len = dist > 0 ? Math.sqrt(dd) : 1;
          const ux = dd ? dx / len : (rng.float() - 0.5), uy = dd ? dy / len : (rng.float() - 0.5);
          const sp = R.debrisSpeed * (0.35 + rng.float() * 0.9) * (0.6 + 0.4 * Math.min(2, power));
          const lift = R.debrisLift * (0.5 + rng.float() * 0.8);
          const hot = rng.float() < R.hotDebris * (1 - dist * 0.5);
          const carry = M.flammable[m] ? M.id.log : (nm === rubble || M.shade[nm] === 11 ? rubble : nm);
          debris.spawn(xx + 0.5, yy + 0.5, ux * sp, uy * sp, lift, carry === 255 ? rubble : carry, hot);
        }
      }
    }
    // wake everything touched
    for (let cy = (y - r - 2) >> 6; cy <= (y + r + 2) >> 6; cy++)
      for (let cx = (x - r - 2) >> 6; cx <= (x + r + 2) >> 6; cx++) g.wakeChunk(cx, cy);
    if (land) {
      puff(g, x, y, Math.max(4, r), GAS_SMOKE, Math.round(R.smoke * Math.min(2, power)));
      puff(g, x, y, Math.max(4, r >> 1), GAS_ASH, Math.round(R.ash * Math.min(2, power)));
    }
    if (water) puff(g, x, y, Math.max(4, r), GAS_STEAM, Math.round(R.steam * Math.min(2, power) * Math.min(1, water / (water + land + 1) + 0.3)));
    events.push({ e: 'explosion', x, y, r, power, water: water > land, chain: 0 });
    return { water, land, at: chainKey };
  }

  return { blast };
}
