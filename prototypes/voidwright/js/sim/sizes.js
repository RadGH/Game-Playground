// Part sizes (reports #67/#68, 2026-11-16): "allow changing the tier 1,2,3 changing from 1x1, 2x2, 4x4 and
// requiring more advanced metals" and "build 2x2 and 4x4 thrusters etc. … shops should sell them too in higher
// danger systems". The families themselves are data (data/blocks.js SIZE_FAMILIES); this file answers the
// questions the fabricator, the shops and the cards ask. Pure — no DOM.
//
//   family(id)               → [1×1 id, 2×2 id, 4×4 id] (the sizes that exist), or [id] for a part with no sizes
//   sizeTierOf(def)          → 1 / 2 / 3 (Tier 1 = 1×1, Tier 2 = 2×2, Tier 3 = 4×4)
//   SIZE_LABEL[size]         → 'Tier 2 · 2×2'
//   fabSizeCap({fab, station}) → the biggest size a fabricator can make (Fabricator 2×2, Forge bay / station 4×4)
//   fabCan(def, ctx)         → { ok, why } — can this workshop make it (tier + size), the reason on the card if not
//   fitInfo(cls, def)        → { ok, text } — does it fit this hull (ruling E5: size is gated by hull class)
//   upsizeOdds(danger)       → { 2: p, 4: p } — chance a shop shelf pick comes in a bigger size
//   upsizeForShop(r, id, danger) → the id the shop stocks (maybe a bigger size of id)

import { BLOCKS, SIZE_FAMILIES } from '../data/blocks.js';
import { CLASSES } from '../data/hulls.js';

export const family = id => SIZE_FAMILIES[BLOCKS[id]?.fam] || [id];
export const sizeTierOf = def => [1, 2, 4].indexOf(def?.size || 1) + 1;
export const SIZE_LABEL = { 1: 'Tier 1 · 1×1', 2: 'Tier 2 · 2×2', 4: 'Tier 3 · 4×4' };

/** Biggest part a workshop can make: an on-board Fabricator 2×2, a Forge bay or a station workshop 4×4. */
export const fabSizeCap = ({ fab = 0, station = false } = {}) => (station || fab >= 5 ? 4 : 2);

/**
 * Can this workshop make `def`? ctx = { tierCap, sizeCap } (sizeCap from fabSizeCap). A bigger size of a part is
 * judged by its 1×1's tier (the size tier asks for better ore instead, see craft.js recipe); a part with no sizes
 * by its own tier.
 */
export function fabCan(def, ctx) {
  const base = BLOCKS[def.fam] || def; const n = def.size || 1;
  if ((base.tier || 1) > ctx.tierCap) return { ok: false, why: ctx.station ? 'Too advanced for this workshop. Workshops further out make better parts.' : 'Too advanced for this fabricator. A Forge bay or a station workshop can make it.' };
  if (n > ctx.sizeCap) return { ok: false, why: `A Fabricator makes parts up to ${ctx.sizeCap}×${ctx.sizeCap}. Fit a Forge bay, or use a station workshop, for ${n}×${n}.` };
  return { ok: true, why: '' };
}

/** Does `def` fit a hull of class `cls`? The text says what to do when it does not (lessons rule 10). */
export function fitInfo(cls, def) {
  const C = CLASSES[cls] || CLASSES.skiff; const m = C.maxBlock || 1; const n = def.size || 1;
  if (n <= m) return { ok: true, text: `Fits your ${C.name}` };
  const to = Object.values(CLASSES).filter(c => c.maxBlock >= n && c.rank < 9).sort((a, b) => a.rank - b.rank)[0];
  return { ok: false, text: `Too big for your ${C.name} (parts up to ${m}×${m}). ${n}×${n} parts fit a ${to?.name || 'bigger'} hull or bigger: Grow hull at a shipyard.` };
}

/** Chance a shop pick comes as a 2×2 / 4×4: none near home, 2×2 from danger 2, 4×4 from danger 4, rising with danger. */
export function upsizeOdds(danger) {
  const d = danger || 1;
  return { 2: d >= 2 ? Math.min(0.45, 0.12 + 0.06 * (d - 2)) : 0, 4: d >= 4 ? Math.min(0.35, 0.1 + 0.05 * (d - 4)) : 0 };
}

/** The part a shop stocks for a shelf pick `id` at `danger`: maybe a bigger size of it (only sizes it may sell: tier ≤ danger + 1). */
export function upsizeForShop(r, id, danger) {
  const fam = family(id); if (fam.length < 2 || BLOCKS[id].size > 1) return id;
  const odds = upsizeOdds(danger); const roll = r();
  const pick = n => fam.find(x => BLOCKS[x].size === n && BLOCKS[x].tier <= danger + 1);
  if (roll < odds[4] && pick(4)) return pick(4);
  if (roll < odds[4] + odds[2] && pick(2)) return pick(2);
  return id;
}
