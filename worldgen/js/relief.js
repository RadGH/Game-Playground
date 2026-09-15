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

/** Signed metres for an elevation value: positive above the datum, negative below it. */
export function elevationToMetres(e, relief = DEFAULT_RELIEF) {
  const r = relief || DEFAULT_RELIEF;
  const land = Number.isFinite(r.landMetres) ? r.landMetres : DEFAULT_RELIEF.landMetres;
  const sea = Number.isFinite(r.seaMetres) ? r.seaMetres : DEFAULT_RELIEF.seaMetres;
  const v = Number.isFinite(e) ? e : 0.5;
  return Math.round(v >= 0.5 ? (v - 0.5) * 2 * land : (v - 0.5) * 2 * sea);
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
