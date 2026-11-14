// Ship numbers from its blocks: mass, centre of mass, thrust in each of the six directions, turning, power,
// shields, cargo, auto-aim slots, block limit and a single "rating". Recomputed whenever a block changes.

import { BLOCKS, TURRETS } from '../data/blocks.js';
import { DIRS, OPP } from '../core/math.js';
import { partStats, turretDps } from './items.js';

export const SHIELD_DELAY = 3;          // seconds out of fire before shields refill
export const BASE_TURN = 0.55;          // rad/s with no gyroscopes on a small ship
export const BREAK_AT = 0.3;            // a ship comes apart below this share of its full block health (or when the bridge goes)
const NO_BONUS = {};                    // economy: no research bonuses (enemies, starters)

/**
 * @param g the block grid
 * @param bonus economy: research bonuses (sim/research.js researchBonus) — multipliers for thrust, turn, shield, regen,
 *   power, cargo, turretTurn. Defaults to `g.bonus`, which state.js designGrid / liveGrid set for the player's ship,
 *   so every recompute (a block shot off, the Shipyard) keeps them. Enemies have none. This is the ONE place they apply.
 */
export function computeStats(g, bonus = g.bonus) {
  const B = bonus || NO_BONUS;
  let mass = 0, cx = 0, cy = 0, cz = 0, hp = 0, maxHp = 0;
  const thrust = [0, 0, 0, 0, 0, 0];    // push along each DIRS direction
  let torque = 0, powerMade = 0, powerUse = 0, shield = 0, regen = 0, cargo = 30, auto = 0, maxBlocks = 0, dps = 0;
  let scanRange = 0; const bays = [];   // world: scanner reach, drone bays
  let bridge = null; const turrets = []; let structure = 0, parts = 0, r2max = 0;
  for (const b of g.cells.values()) {
    const def = BLOCKS[b.t]; if (!def) continue;
    const h = ((def.size || 1) - 1) / 2;   // a big block's centre
    mass += def.mass; cx += (b.x + h) * def.mass; cy += (b.y + h) * def.mass; cz += (b.z + h) * def.mass;
    hp += b.hp; maxHp += b.maxHp;
    if (def.cat === 'structure') { structure++; continue; }
    if (!b.item) continue;
    parts++;
    const s = partStats(b.item);
    switch (b.t) {
      case 'bridge': bridge = b; powerMade += s.power; auto += s.auto; maxBlocks = s.maxBlocks; break;
      case 'reactor': powerMade += s.power; break;
      case 'thruster': thrust[OPP[b.r]] += s.thrust; break;     // nozzle points r, ship is pushed the other way
      case 'gyro': torque += s.torque; break;
      case 'shield': shield += s.shield; regen += s.regen; powerUse += s.power; break;
      case 'cargo': cargo += s.cargo; break;
      case 'targeting': auto += s.auto; powerUse += s.power; break;
      case 'scanner': scanRange = Math.max(scanRange, s.scan); powerUse += s.power; break;   // world:
      case 'dronebay': bays.push(b); powerUse += s.power; break;   // world:
      default:
        if (TURRETS[b.t]) { turrets.push(b); powerUse += s.power; dps += turretDps(b.item); }
    }
  }
  // economy: research bonuses
  for (let i = 0; i < 6; i++) thrust[i] *= B.thrust ?? 1;
  shield *= B.shield ?? 1; regen *= B.regen ?? 1; powerMade *= B.power ?? 1; cargo *= B.cargo ?? 1;
  const n = g.cells.size || 1;
  const com = mass ? { x: cx / mass, y: cy / mass, z: cz / mass } : { x: 0, y: 0, z: 0 };
  for (const b of g.cells.values()) { const h = ((BLOCKS[b.t]?.size || 1) - 1) / 2; const d = (b.x + h - com.x) ** 2 + (b.y + h - com.y) ** 2 + (b.z + h - com.z) ** 2 + h * h * 3; if (d > r2max) r2max = d; }
  const radius = Math.sqrt(r2max) + 1;
  const totalThrust = thrust.reduce((a, b) => a + b, 0);
  // every thruster helps a little in every direction (manoeuvring jets); the ones pointing the right way help most
  const accel = thrust.map(t => (t + totalThrust * 0.4) / Math.max(1, mass));
  const fwd = accel[4];                  // +z is forward
  const maxSpeed = Math.min(160, 30 + fwd * 3.2);
  const inertia = Math.max(1, mass) ** 0.85;
  const turn = Math.min(2.4 * (B.turn ?? 1), (BASE_TURN * (14 / (8 + inertia ** 0.55)) + (torque / inertia) * 1.2) * (B.turn ?? 1));
  const powerRatio = powerUse <= 0 ? 1 : Math.min(1, powerMade / powerUse);
  const rating = Math.round(maxHp / 30 + shield / 10 + dps * 1.5 + Math.min(40, fwd * 1.5));
  return {
    mass, com, radius, hp, maxHp, blocks: n, structure, parts,
    thrust, accel, maxSpeed, turn, torque,
    powerMade, powerUse, powerRatio,
    shield, regen: regen * powerRatio, cargo: Math.round(cargo), auto, maxBlocks, dps: dps * powerRatio, rating,
    turretTurn: B.turretTurn ?? 1,   // economy: body.js multiplies each turret's turn rate by this
    hasBridge: !!bridge, bridge, turrets,
    scanRange, bays,   // world:
  };
}

/** Plain-language problems that stop a design from launching (empty list = fine). */
export function designProblems(g, st = computeStats(g)) {
  const out = [];
  if (!st.hasBridge) out.push('The ship needs a bridge.');
  if (st.maxBlocks && st.blocks > st.maxBlocks) out.push(`Too many blocks for this bridge: ${st.blocks} of ${st.maxBlocks}. Remove some, or fit a bigger bridge.`);
  if (st.thrust.reduce((a, b) => a + b, 0) <= 0) out.push('The ship needs at least one thruster.');
  return out;
}
/** Warnings that do not stop a launch. */
export function designWarnings(st) {
  const out = [];
  if (st.powerRatio < 1) out.push(`Not enough power: ${Math.round(st.powerRatio * 100)}% — guns fire slower and shields refill slower. Add a reactor.`);
  if (st.turrets.length > st.auto) out.push(`${st.turrets.length - st.auto} turret${st.turrets.length - st.auto > 1 ? 's' : ''} only fire while you hold Fire (more auto-aim needs a targeting computer or a bigger bridge).`);
  if (st.accel[4] < 5) out.push('Very little forward thrust: put thrusters on the back, nozzles pointing back.');
  return out;
}
export const DIR_NAMES = ['right', 'left', 'up', 'down', 'forward', 'back'];
export { DIRS };
