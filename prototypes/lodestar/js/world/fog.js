// Fog of war is sensor range (PLAN §0.10, §3.1). PURE. Since M3 this is THE fog rule: the sim works the field out
// in the worker (js/sim/index.js, every balance.sight.every ticks) and frames carry it to the scope.
//
// The quarter-res `fog` field holds 0 = never seen (static on the scope), 1 = seen before (the last picture, grey),
// 2 = live. A quarter cell is LIVE when its middle is inside a sensor circle AND
//   * the gas there is below `smokeBlocks` (smoke, steam and ash blind the sensors), AND
//   * it is day (daylight at or above `darkBelow`) or the coarse `light` field there is at least `litAbove`,
// except that a sensor always sees its own close ring (`close` × r). Live never drops to 0: seen stays seen.

export const FOG_NEVER = 0, FOG_SEEN = 1, FOG_LIVE = 2;

/** The rule for one quarter cell (shared with tests). */
export function sightAt({ inSensor, close = false, gas, light, daylight }, sight) {
  if (!inSensor) return false;
  if (close) return true;
  if (gas >= sight.smokeBlocks) return false;
  if (daylight < sight.darkBelow && light < sight.litAbove) return false;
  return true;
}

export function createFog(g, M) {
  const defaults = { smokeBlocks: M.rules.gas.blindAt, darkBelow: 70, litAbove: 70, close: 0.12 };

  /**
   * sensors: [{ x, y, r }] in cells. o: { daylight 0..255 (or night: bool), sight: balance.json sight block }.
   * Returns { live, changed } (quarter cells live now, quarter cells whose state changed).
   */
  function update(sensors, o = {}) {
    const sight = { ...defaults, ...(o.sight || {}) };
    const daylight = o.daylight ?? (o.night === true ? 0 : 255);
    const QW = g.QW, QH = g.QH, fog = g.fog;
    const was = fog.slice();
    for (let i = 0; i < fog.length; i++) if (fog[i] === 2) fog[i] = 1;
    let live = 0;
    for (const s of sensors) {
      const r2 = s.r * s.r, c2 = r2 * sight.close * sight.close;
      const qx0 = Math.max(0, Math.floor((s.x - s.r) / 4)), qx1 = Math.min(QW - 1, Math.floor((s.x + s.r) / 4));
      const qy0 = Math.max(0, Math.floor((s.y - s.r) / 4)), qy1 = Math.min(QH - 1, Math.floor((s.y + s.r) / 4));
      for (let qy = qy0; qy <= qy1; qy++) {
        const dy = qy * 4 + 2 - s.y;
        for (let qx = qx0; qx <= qx1; qx++) {
          const dx = qx * 4 + 2 - s.x, d2 = dx * dx + dy * dy;
          if (d2 > r2) continue;
          const q = qy * QW + qx;
          if (fog[q] === 2) continue;
          if (sightAt({ inSensor: true, close: d2 <= c2, gas: g.gasDensity[q], light: g.light[q], daylight }, sight)) { fog[q] = 2; live++; }
        }
      }
    }
    let changed = 0;
    for (let i = 0; i < fog.length; i++) if (fog[i] !== was[i]) changed++;
    return { live, changed };
  }

  /** Is world cell (x, y) seen live right now? */
  const isLive = (x, y) => g.fog[(y >> 2) * g.QW + (x >> 2)] === 2;

  return { update, isLive };
}
