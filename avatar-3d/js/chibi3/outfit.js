// Chibi 3 outfit: reads the shared avatar JSON slots and builds clothes, armour, hair, beards,
// headwear, capes and held things as layers on the body. No Three.js here except through cape.js.
//
// Ids are matched by FAMILY (a regex on the id), so every Chibi 2 id lands on something sensible:
// `plate`, `full_plate`, `breastplate` all build the cuirass; `trim_robe`, `robe`, `silks` the robe.
// New Chibi 3 ids (harness, fur_kilt, fur_mantle, spiked_pauldron, wraps, fur_boots, long_beard...)
// are listed in CHIBI3_PARTS so the builder page can offer them.

import { landmarks } from './garments.js';
import { hauberk, cuirass, faulds, pauldron, armHarness, gauntlet, legHarness, sabaton } from './armour.js';
import { tunic, robe, surcoat, belt, trousers, boots, slippers, furMantle, harness, wraps, kilt, furRing } from './clothes.js';
import { buildHair, buildBeard } from './hair.js';
import { buildHeadwear } from './headwear.js';
import { buildCape } from './cape.js';
import { buildHeld } from './weapons.js';
import { shadeHex, mixHex } from './paint.js';
import { Shape, cone } from './sdf.js';

/** Families each slot understands, with the ids the builder page offers for them. */
export const CHIBI3_PARTS = {
  top: { tunic: ['tunic', 'tshirt', 'travel_shirt', 'doublet', 'shirt'], gambeson: ['gambeson'], leather: ['leather', 'vest', 'jerkin'], chain: ['chainmail'],
    plate: ['plate', 'breastplate'], surcoat: ['surcoat', 'tabard'], robe: ['robe', 'trim_robe', 'silks', 'dress'], harness: ['harness'], bare: ['bare'] },
  bottom: { trousers: ['pants', 'breeches', 'leggings'], greaves: ['greaves', 'plate_legs'], kilt: ['kilt', 'fur_kilt', 'skirt', 'loincloth'] },
  shoes: { boots: ['boots'], heavy: ['heavy', 'sabatons'], fur: ['fur_boots'], slippers: ['slippers', 'shoes', 'sandals'], bare: ['barefoot'] },
  hat: { none: ['none'], bascinet: ['plate_helm'], greathelm: ['great_helm'], warhelm: ['war_helm'], horned: ['horned_helm'], wizard: ['wizard'], hood: ['hood'], circlet: ['circlet'], cap: ['cap'] },
  hair: { styles: ['bald', 'short', 'side_part', 'slicked', 'buzz', 'long', 'wavy', 'ponytail', 'braids', 'bun', 'topknot', 'mohawk'] },
  facialHair: { styles: ['none', 'stubble', 'mustache', 'goatee', 'short', 'full', 'long_beard', 'braided'] },
  cape: { none: ['none'], cape: ['cape', 'travel_cloak'], tattered: ['tattered_cape'], short: ['shoulder_cape'] },
  decor: { none: ['none'], pauldrons: ['pauldrons'], spiked: ['spiked_pauldron'], fur: ['fur_mantle'], belt: ['belt_pouches'], wraps: ['wraps'] },
};

const fam = (id, table, fallback) => {
  for (const [f, ids] of Object.entries(table)) if (ids.includes(id)) return f;
  return fallback(id || '');
};
export const topFamily = id => fam(id, CHIBI3_PARTS.top, i => /plate|cuirass/.test(i) ? 'plate' : /mail|chain/.test(i) ? 'chain' : /surcoat|tabard/.test(i) ? 'surcoat' : /robe|silk|dress|gown/.test(i) ? 'robe' : /harness|strap/.test(i) ? 'harness' : /bare|none|naked/.test(i) ? 'bare' : /leather|vest|jerkin|brigand/.test(i) ? 'leather' : /coat|apron|hood/.test(i) ? 'gambeson' : 'tunic');
export const bottomFamily = id => fam(id, CHIBI3_PARTS.bottom, i => /greave|plate/.test(i) ? 'greaves' : /kilt|skirt|loin/.test(i) ? 'kilt' : 'trousers');
export const shoeFamily = id => fam(id, CHIBI3_PARTS.shoes, i => /heavy|sabaton|plate/.test(i) ? 'heavy' : /fur/.test(i) ? 'fur' : /slipper|sandal|shoe|sneaker/.test(i) ? 'slippers' : /bare|none/.test(i) ? 'bare' : 'boots');
export const decorFamily = id => fam(id, CHIBI3_PARTS.decor, i => /spike/.test(i) ? 'spiked' : /pauldron/.test(i) ? 'pauldrons' : /fur|mantle|pelt/.test(i) ? 'fur' : /wrap/.test(i) ? 'wraps' : /belt|pouch/.test(i) ? 'belt' : 'none');
export const capeFamily = id => fam(id, CHIBI3_PARTS.cape, i => /tatter|rag/.test(i) ? 'tattered' : /shoulder|short|capelet/.test(i) ? 'short' : /none/.test(i) || !i ? 'none' : 'cape');

export function buildOutfit(a, R, body, asm, opts = {}) {
  const L = landmarks(R);
  const ctx = { a, R, L, body, asm, lod: opts.lod || 0, bodyFast: opts.bodyFast || null };
  const top = topFamily(a.top?.id), bottom = bottomFamily(a.bottom?.id), shoes = shoeFamily(a.shoes?.id), decor = decorFamily(a.decor?.id), cape = capeFamily(a.cape?.id);
  const c = (slot, fb) => a[slot]?.color || fb, c2 = (slot, fb) => a[slot]?.color2 || fb;
  const steel = '#b8c0cc', leatherBrown = '#4a3426';
  const plated = top === 'plate' || top === 'surcoat' || decor === 'pauldrons';
  // ---- legs first (what sits under the top)
  if (bottom === 'greaves') {
    trousers(ctx, shadeHex(c('bottom', '#3a3a40'), -0.3), { cuff: 0.95 });
    for (const s of ['L', 'R']) legHarness(ctx, s, c('bottom', steel));
  } else if (bottom === 'kilt') {
    if (top === 'robe') { /* the robe covers it */ } else kilt(ctx, c('bottom', '#5a4030'), { fur: /fur/.test(a.bottom?.id || '') ? c2('bottom', '#8a7058') : null });
    if (a.bottom?.id !== 'skirt') trousers(ctx, shadeHex(c('bottom', '#4a3a2a'), -0.25), { cuff: 0.9, kind: 'leather' });
  } else if (top !== 'robe') trousers(ctx, c('bottom', '#394c53'), { cuff: shoes === 'slippers' ? 1.0 : 0.85, kind: /leather/.test(a.bottom?.id || '') ? 'leather' : 'cloth' });
  // ---- feet
  if (shoes === 'heavy') for (const s of ['L', 'R']) sabaton(ctx, s, c('shoes', steel));
  else if (shoes === 'fur') boots(ctx, c('shoes', leatherBrown), { height: 0.6, fur: c2('shoes', '#7a6450') });
  else if (shoes === 'slippers') slippers(ctx, c('shoes', '#3a2a4a'));
  else if (shoes !== 'bare') boots(ctx, c('shoes', '#62524a'), { height: 0.5 });
  // ---- body
  if (top === 'surcoat') {
    hauberk(ctx, '#8a9098');
    cuirass(ctx, c('decor', steel));
    surcoat(ctx, c('top', '#2a4a9a'), { trim: c2('top', '#d8b040') === c('top', '#2a4a9a') ? '#d8b040' : c2('top', '#d8b040') });
    belt(ctx, '#3a2a20', { at: L.waist - 0.02 * L.S, over: 0.044 });
  } else if (top === 'plate') {
    hauberk(ctx, '#8a9098');
    cuirass(ctx, c('top', steel)); faulds(ctx, c('top', steel));
    belt(ctx, '#3a2a20', { at: L.waist - 0.035 * L.S, over: 0.03 });
  } else if (top === 'chain') {
    hauberk(ctx, c('top', '#8a9098'));
    belt(ctx, '#3a2a20', { over: 0.014 });
  } else if (top === 'robe') {
    robe(ctx, c('top', '#2a3a8a'), { trim: c2('top', '#d8b040') });
    belt(ctx, c2('top', '#d8b040'), { at: L.waist + 0.01 * L.S, over: 0.016, width: 0.02 });
  } else if (top === 'leather') {
    tunic(ctx, c('top', '#5a3a26'), { kind: 'leather', thick: 0.0075, sleeve: 0.55 });
    belt(ctx, '#2a1e16', { over: 0.016 });
  } else if (top === 'gambeson') {
    tunic(ctx, c('top', '#8a7a5a'), { thick: 0.01, quilted: true, trim: a.top?.color2 });
    belt(ctx, '#3a2a20', { over: 0.02 });
  } else if (top === 'harness') {
    harness(ctx, c('top', '#3a2618'));
    belt(ctx, '#2a1a10', { at: L.waist - 0.02 * L.S, over: 0.016, width: 0.04, studs: true });
  } else if (top === 'bare') {
    belt(ctx, '#2a1a10', { at: L.waist - 0.02 * L.S, over: 0.012, width: 0.032 });
  } else {
    tunic(ctx, c('top', '#2e7d32'), { trim: a.top?.color2 });
    belt(ctx, '#3a2a20', { over: 0.016 });
  }
  // ---- shoulders and arms
  if (decor === 'pauldrons' || (top === 'plate' && decor === 'none')) {
    for (const s of ['L', 'R']) { pauldron(ctx, s, c('decor', steel)); armHarness(ctx, s, c('decor', steel)); gauntlet(ctx, s, '#3a2a20', c('decor', steel)); }
  }
  if (decor === 'spiked') {
    pauldron(ctx, 'L', c('decor', '#5a5a60'), { lames: 2, size: 1.15, spikes: 3, haute: false });
    furMantle(ctx, c2('decor', '#6a5440'), { sides: ['R'] });
    wraps(ctx, '#c8b89a');
  }
  if (decor === 'fur') furMantle(ctx, c('decor', '#6a5440'));
  if (decor === 'wraps') wraps(ctx, c('decor', '#c8b89a'));
  void plated;
  // ---- head
  const hw = buildHeadwear(ctx);
  buildHair(ctx, hw);
  buildBeard(ctx);
  if ((R.P.race.face.tusks || 0) > 0.3) tusks(ctx);
  // ---- extras on the skin: war paint, scars
  if (/paint|tattoo/.test(a.extras?.id || '')) warPaint(ctx, c('extras', '#a02020'));
  // ---- cape and held things
  if (cape !== 'none') buildCape(ctx, { length: cape === 'short' ? 0.3 : 0.85, tattered: cape === 'tattered' });
  const hold = buildHeld(a, R, body, asm, opts);
  return { hold, families: { top, bottom, shoes, decor, cape } };
}

/** Lower tusks jutting up past the upper lip, on the jaw bone. */
function tusks(ctx) {
  const { R, body, asm } = ctx, hs = R.hs, headY = R.headY, hz = R.byName.head.pos[2], k = R.P.race.face.tusks;
  const H = (x, y, z) => [x * hs, headY + y * hs, hz + z * hs];
  const my = (body.mouth.y - headY) / hs, mz = (body.mouth.z - hz) / hs;
  const sh = new Shape([], { name: 'tusks' });
  const ivory = { tile: 2, rough: 0.4, metal: 0, sheen: 0.2, detail: 0.2, wear: 0.4, vary: 0.06, color: '#e6dcc0' };
  for (const s of [1, -1]) {
    const a = H(s * 0.065, my - 0.05, mz - 0.03), b = H(s * 0.085, my + 0.06 * k, mz + 0.015), c = H(s * 0.075, my + 0.12 * k, mz - 0.005);
    sh.add(Object.assign(cone(a, b, 0.024 * hs, 0.016 * hs), { k: 0.008 * hs, paint: ivory }));
    sh.add(Object.assign(cone(b, c, 0.016 * hs, 0.003 * hs), { k: 0.008 * hs, paint: ivory }));
  }
  asm.addField({ name: 'tusks', shape: sh, owner: body.shape, step: 0.0022, simplify: 0.0002, covers: false, hideable: false, weights: () => [[R.byName.jaw.index, 1]] });
}

/** Stripes of war paint across the eyes and down the chest, as paint on the skin. */
function warPaint(ctx, color) {
  const { R, body } = ctx, hs = R.hs, headY = R.headY, hz = R.byName.head.pos[2];
  const p = { tile: 0, rough: 0.7, metal: 0, sheen: 0.1, detail: 0.3, vary: 0.15, color };
  // a band across the eyes
  body.shape.add({ op: 'paint', k: 0, box: null, band: 0.0025, paint: p, d: (x, y, z) => (z < hz + 0.1 * hs ? 1 : Math.abs((y - headY) / hs - 0.36 + Math.abs(x / hs) * 0.15) * hs - 0.03 * hs) });
  // three claw stripes down the chest
  const L = ctx.L;
  // three claw marks across the left pectoral
  const claws = [-1, 0, 1].map(i => [0.05 * L.S + i * 0.03 * L.S, L.chest + 0.15 * L.S, 0.11 * L.S + i * 0.03 * L.S, L.chest + 0.02 * L.S]);
  body.shape.add({ op: 'paint', k: 0, box: null, band: 0.003, paint: p, d: (x, y, z) => { if (z < 0.03) return 1; let d = 1; for (const [x0, y0, x1, y1] of claws) { const dx = x1 - x0, dy = y1 - y0, t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy))); d = Math.min(d, Math.hypot(x - x0 - dx * t, y - y0 - dy * t) - 0.008 * L.S * (1 - t * 0.6)); } return d; } });
}
