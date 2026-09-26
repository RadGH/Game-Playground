// What a flame does to cells in a radius (docs/03 §12.2, docs/06 §7.4). Pure. Returns a summary the
// spell system uses for combos (e.g. how many water cells were boiled -> steam burst).
import { CLS } from './materials.js';
import { F } from './grid.js';
import { ignite } from './cellsim.js';
import { electrify } from './liquids.js';

// material ids (fixed forever, data/materials.json)
const AIR = 0, BEDROCK = 1, STONE = 2, BRICK = 3, METAL = 4, GLASS = 5, WOOD = 6, PLANK = 7, WAX = 8, ICE = 9, MOSS = 10, GLOWMOSS = 11, ROPE = 12, WEB = 13, BONE = 14,
  DIRT = 16, SAND = 17, SILT = 18, ASH = 19, RUBBLE = 20, EMBER_C = 21, WATER = 22, OIL = 23, MWAX = 24, BILE = 25, ICHOR = 26, MUD = 27, MGLASS = 28, STEAM = 29, SMOKE = 30, MIASMA = 31, FIRE = 32, SPARK_C = 33, RUST = 34;

// hardness for dig (docs/03 §12.1)
export const HARDNESS = { [STONE]: 4, [BRICK]: 3, [WOOD]: 2, [PLANK]: 2, [WAX]: 1, [DIRT]: 1, [SILT]: 1, [SAND]: 0, [ICE]: 2, [GLASS]: 2, [METAL]: 5, [MOSS]: 1, [GLOWMOSS]: 1, [ASH]: 0, [ROPE]: 1, [BONE]: 2, [RUBBLE]: 0, [WEB]: 0, [RUST]: 0, [15]: 3 };

/**
 * @param game  needs game.grid, game.world (steamDebt), game.rng.spell
 * @param opts  { dig, power, fromPlayer, maxCells, falloff }
 */
export function applyElement(game, cx, cy, r, flame, opts = {}) {
  const g = game.grid, W = g.W, H = g.H, mats = g.mats, rng = game.rng?.spell || { next: () => g.rand(), chance: p => g.rand() < p };
  const res = { boiled: 0, frozen: 0, ignited: 0, dissolved: 0, water: 0, shockedWater: false, touched: 0, sand: 0, wet: 0 };
  const dig = opts.dig ?? 0; let budget = opts.maxCells ?? 400;
  cx = Math.round(cx); cy = Math.round(cy); r = Math.max(1, Math.round(r));
  const place = (x, y, m, o) => { if (g.get(x, y) === AIR) { g.set(x, y, m, o); return true; } return false; };
  let addWater = flame === 'tide' ? (opts.water ?? 6) : 0;
  for (let y = cy - r; y <= cy + r && budget > 0; y++) for (let x = cx - r; x <= cx + r && budget > 0; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const d2 = (x - cx) ** 2 + (y - cy) ** 2; if (d2 > r * r) continue;
    if (d2 > (r * 0.7) ** 2 && !rng.chance(0.5)) continue; // outer ring falloff
    const i = y * W + x, m = g.mat[i], c = mats.cls[m];
    if (m === BEDROCK || (g.flags[i] & F.PINNED && c === CLS.STATIC)) continue;
    res.touched++;
    // dig: break cells up to hardness
    if (dig > 0 && c !== CLS.LIQUID && c !== CLS.GAS && HARDNESS[m] !== undefined && HARDNESS[m] <= dig && m !== WATER) {
      const broken = m === STONE ? RUBBLE : m === BRICK ? RUBBLE : m === ICE ? WATER : m === GLASS ? SAND : (m === WOOD || m === PLANK) ? RUBBLE : AIR;
      g.set(x, y, rng.chance(0.4) ? broken : AIR); budget--; continue;
    }
    switch (flame) {
      case 'ember':
        if (m === WATER) { if (rng.chance(0.3)) { g.set(x, y, STEAM, { temp: 120, flags: F.FROM_WATER }); game.world.steamDebt = (game.world.steamDebt || 0) + 1; res.boiled++; budget--; } }
        else if (m === ICE) { g.set(x, y, WATER, { flags: g.flags[i] & F.FROM_WATER }); budget--; }
        else if (m === WAX) { if (rng.chance(0.2)) ignite(g, i, x, y); else g.set(x, y, MWAX, { temp: 95 }); budget--; }
        else if (m === OIL || m === WOOD || m === PLANK || m === ROPE || m === WEB || m === MOSS || m === GLOWMOSS || m === MIASMA) {
          const p = (m === WOOD || m === PLANK) ? 0.6 : 1; if (rng.chance(p)) { ignite(g, i, x, y); res.ignited++; budget--; }
        }
        else if (m === SAND) { g.heat(x, y, 90); res.sand++; }
        else if (m === STEAM) g.life[i] = Math.min(255, g.life[i] + 45);
        else if (m === METAL) g.heat(x, y, 60);
        else if (c === CLS.STATIC) { g.heat(x, y, 20); g.flags[i] &= ~F.WET; }
        if (m === AIR && rng.chance(0.08)) { g.set(x, y, FIRE); budget--; }
        break;
      case 'rime':
        if (m === WATER) { g.set(x, y, ICE, { temp: -30, flags: F.FROM_WATER | (opts.fromPlayer ? F.BUILT : 0) }); res.frozen++; budget--; }
        else if (m === FIRE) { g.set(x, y, AIR); budget--; }
        else if (m === MWAX) { g.set(x, y, WAX); budget--; }
        else if (m === STEAM) { if ((game.world.steamDebt || 0) > 0) { game.world.steamDebt--; g.set(x, y, WATER, { flags: F.FROM_WATER }); } else g.set(x, y, AIR); budget--; }
        else if (m === MUD) { g.set(x, y, DIRT); budget--; }
        else if (m === MGLASS) { g.set(x, y, GLASS); budget--; }
        if (g.flags[i] & F.BURNING) { g.flags[i] &= ~F.BURNING; g.touchGfx(x, y); }
        if (g.mat[i] !== AIR) { g.temp[i] = Math.min(g.temp[i], -30); g.markHot(x, y); }
        break;
      case 'spark':
        if ((m === WATER || m === METAL || m === BILE) && !res.shockedWater) { res.shockedWater = electrify(game.world, x, y, 30, opts.shockBudget ?? 600) > 0; }
        else if (m === OIL || m === MIASMA || m === WEB) { ignite(g, i, x, y); res.ignited++; }
        else if ((m === WOOD || m === PLANK) && rng.chance(0.15)) { ignite(g, i, x, y); res.ignited++; }
        else if (m === SAND && rng.chance(0.05)) g.set(x, y, GLASS);
        else if (m === AIR && rng.chance(0.03)) g.set(x, y, SPARK_C);
        break;
      case 'bile':
        if (m === BRICK || m === METAL || m === BONE || m === GLASS) { if (rng.chance(m === BRICK ? 0.35 : m === BONE ? 0.25 : 0.2)) { g.set(x, y, m === METAL ? RUST : m === BONE ? ASH : m === GLASS ? SAND : RUBBLE); res.dissolved++; budget--; } }
        else if (m === WATER && rng.chance(0.3)) { g.set(x, y, BILE); budget--; }
        else if ((m === MOSS || m === GLOWMOSS) && rng.chance(0.5)) { g.set(x, y, DIRT); budget--; }
        else if (m === AIR && rng.chance(0.04)) { g.set(x, y, BILE); budget--; }
        break;
      case 'gleam':
        if (m === WEB || m === ICHOR) { g.set(x, y, AIR); budget--; }
        else if (m === MOSS && rng.chance(0.2)) { g.set(x, y, GLOWMOSS); budget--; }
        break;
      case 'tide':
        if (g.flags[i] & F.BURNING) { g.flags[i] &= ~F.BURNING; g.touchGfx(x, y); }
        if (m === FIRE) { g.set(x, y, AIR); budget--; }
        else if (m === MWAX) { g.set(x, y, WAX); budget--; }
        else if (m === DIRT && rng.chance(0.3)) { g.set(x, y, MUD); budget--; }
        else if (c === CLS.STATIC || c === CLS.POWDER) { g.wet(x, y, 255); res.wet++; }
        else if (m === AIR && addWater > 0 && rng.chance(0.5)) { g.set(x, y, WATER); addWater--; res.water++; budget--; }
        break;
      case 'shade':
        if ((m === MOSS || m === GLOWMOSS) && rng.chance(0.8)) { g.set(x, y, ASH); budget--; }
        else if (m === WOOD && rng.chance(0.25)) { g.set(x, y, ASH); budget--; }
        else if (m === WATER && rng.chance(0.15)) { g.set(x, y, ICHOR); budget--; }
        break;
    }
  }
  return res;
}

/** Explosion (docs/06 §13): carve by blast resist, throw liquids as particles, debris, events. */
export function explode(game, cx, cy, r, power, opts = {}) {
  const R = () => game.grid.rand();
  const g = game.grid, W = g.W, H = g.H, mats = g.mats, P = game.particles;
  r = Math.min(48, Math.round(r)); let debris = 0, thrown = 0;
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
    const d2 = (x - cx) ** 2 + (y - cy) ** 2; if (d2 > r * r) continue;
    const f = 1 - d2 / (r * r), i = y * W + x, m = g.mat[i], c = mats.cls[m];
    if (c === CLS.LIQUID) { if (thrown < 300 && P) { const d = Math.sqrt(d2) || 1; P.spawn(3, x, y, (x - cx) / d * (100 + R() * 150), (y - cy) / d * (100 + R() * 150) - 60, 2, 0x4070b0, m, 900); g.set(x, y, AIR); thrown++; } continue; }
    if (c === CLS.STATIC || c === CLS.POWDER) {
      if (g.flags[i] & F.PINNED) continue;
      const destroyed = g.damage(x, y, power * f, 0);
      if (destroyed && debris < 120 && P && R() < 0.3) { const ramp = mats.ramps[m][0]; const d = Math.sqrt(d2) || 1; P.spawn(7, x, y, (x - cx) / d * (120 + R() * 200), (y - cy) / d * (120 + R() * 200) - 80, 1.5, (ramp[0] << 16) | (ramp[1] << 8) | ramp[2], mats.brokenTo[m] === m ? 0 : mats.brokenTo[m], 900); debris++; }
    }
    if (opts.heat) g.heat(x, y, power * f * opts.heat);
  }
  game.bus?.emit('explode', { x: cx, y: cy, r, power, source: opts.source });
}
