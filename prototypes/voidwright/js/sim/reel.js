// The rarity reel (report #62: "display a random rarity spinner… scroll vertically more like wheel of fortune… if a
// legendary item is 1% chance to happen it should only appear 1% in the wheel"). Pure data: the UI (ui/reel.js)
// scrolls the strip and stops on `land`, which always holds the real result.

/**
 * @param {{id: string, p: number}[]} odds  the real odds of THIS roll (craftOdds / cacheOdds)
 * @param {string} result  the rarity id that was actually rolled
 * @param {() => number} r  a random source (0..1)
 * @returns {{ strip: string[], land: number }}  every slot but `land` is an independent draw from `odds`
 */
export function reelStrip(odds, result, r, { length = 46, land = 40 } = {}) {
  const live = odds.filter(o => o.p > 0); const tot = live.reduce((s, o) => s + o.p, 0);
  const pick = () => { let v = r() * tot; for (const o of live) { v -= o.p; if (v <= 0) return o.id; } return live[live.length - 1].id; };
  const strip = Array.from({ length }, pick);
  strip[land] = result;
  return { strip, land };
}
