// Heights in metres. A World Forge map stores elevation as 0…1 with the shoreline always at 0.5
// (world.js puts sea level there), so a height is measured up from 0.5 and a depth down from it.
//
//   import { elevationToMetres, formatMetres, hasSea, DEFAULT_RELIEF } from './relief.js';
//   elevationToMetres(0.75)                    // 2100 — on the classic ±4200 m scale
//   elevationToMetres(0.75, world.relief)      // on that world's own scale, if it carries one
//
// A world may carry its own scale as `world.relief` (Star Forge sets one per planet or moon):
//   { landMetres, seaMetres, datum: 'sea' | 'datum', label }
//     landMetres  metres at elevation 1
//     seaMetres   metres below the datum at elevation 0
//     datum       'sea' — below 0.5 is water depth; 'datum' — no sea, below 0.5 is just low ground
//     label       what heights are measured from, for a readout ('sea level', 'datum', …)
// No DOM, no world generation — the renderer and cellInfo() both import it.

export const DEFAULT_RELIEF = { landMetres: 4200, seaMetres: 4200, datum: 'sea', label: 'sea level' };

/**
 * Signed metres for an elevation value, WITHOUT rounding: positive above the datum, negative below.
 *
 * R21 — THE WHOLE-METRE STAIRCASE, AND WHY IT IS VISIBLE FROM A HUNDRED METRES.
 *
 * `elevationToMetres` rounds, and for a readout ("1,250 m") that is exactly right. But Farhold's
 * ground height is built on top of it (`prototypes/farhold/js/planet.js` `naturalHeightAt`), and
 * there the rounding is a disaster you can see from across a valley: a map cell is 640 m wide and
 * the elevation field between two cells is interpolated smoothly, so a gentle hillside ought to be
 * a ramp. Rounding the result to whole metres turns that ramp into a STAIRCASE — flat treads with
 * a 1 m riser every forty metres or so.
 *
 * Measured on seed 7: walking half a metre moved the unrounded base height by at most 0.0019 m and
 * the rounded one by a full 1.0000 m. The mesh samples every 2 m near the camera, so one quad in
 * twenty catches a riser and tilts ~25° while its nineteen neighbours lie dead flat. Under smooth
 * vertex lighting that reads as exactly what the play-test reported: "you can clearly see a lot of
 * triangles along the slopes". Adjacent vertex normals differed by up to 27°; without the rounding,
 * by 12°.
 *
 * So the rounding stays where it belongs — in the thing that prints a number for a person to read —
 * and the terrain reads this instead.
 */
export function elevationToMetresExact(e, relief = DEFAULT_RELIEF) {
  const r = relief || DEFAULT_RELIEF;
  const land = Number.isFinite(r.landMetres) ? r.landMetres : DEFAULT_RELIEF.landMetres;
  const sea = Number.isFinite(r.seaMetres) ? r.seaMetres : DEFAULT_RELIEF.seaMetres;
  const v = Number.isFinite(e) ? e : 0.5;
  return v >= 0.5 ? (v - 0.5) * 2 * land : (v - 0.5) * 2 * sea;
}

/** Signed metres for an elevation value, rounded to whole metres for display. */
export function elevationToMetres(e, relief = DEFAULT_RELIEF) {
  return Math.round(elevationToMetresExact(e, relief));
}

/** "1,250" / "−340" — thousands separators and a real minus sign. */
export function formatMetres(n) {
  const v = Math.round(Number.isFinite(n) ? n : 0);
  return (v < 0 ? '−' : '') + Math.abs(v).toLocaleString('en-US');
}

/**
 * Whether low ground on this map is sea. False for a world generated dry (`liquid: 'none'`) and for
 * one whose relief measures from a datum instead of sea level. World Forge's own worlds: true.
 */
export function hasSea(world) {
  if ((world?.opts?.liquid ?? 'water') === 'none') return false;
  return (world?.relief?.datum ?? 'sea') !== 'datum';
}
