#!/usr/bin/env node
// Measure the footprint of every kit model a solid scatter kind is drawn as (play-test 11, Z37 — live #38: "trees and
// rocks … collisions are off-centre and often square when the object is circular"). Builds the SAME pieces
// js/client/scatter-view.js draws (same names, seeds, detail) and prints, per scatter kind and variant, the radius of
// the model's cross-section at body height (where a walker touches it) and how far its middle sits off the item's spot.
// The numbers go into js/rules/nav-refine.js SCATTER_COLLIDE by hand (they change only when the kit art does).
//   node --import ./avatar-3d/tests/three-register.mjs prototypes/thousandvale/tools/measure-scatter.mjs
import { buildTree } from '../../../highdef-3d/js/kit/trees.js';
import { buildRock } from '../../../highdef-3d/js/kit/rocks.js';
import { buildVharlPiece } from '../js/client/vharl-scatter-art.js';
import { KIND_ART } from '../js/client/scatter-view.js';
import { SCATTER_KINDS } from '../js/rules/terrain-read.js';

// the band of height (model units above the ground line) a walker's body touches
const BAND = { tree: [0.25, 0.8], rock: [0.25, 1.5], custom: [0.05, 1.6] };
const PCT = { tree: 0.6, rock: 0.85, custom: 0.85 };   // a trunk: most of the band is trunk (low branches and root flare are the far tail); a rock: its bulk
function measure(geo, band, pct = 0.85) {
  const p = geo.getAttribute('position'); const rs = []; let cx = 0, cz = 0, n = 0;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < band[0] || y > band[1]) continue; cx += p.getX(i); cz += p.getZ(i); n++; }
  if (!n) return null;
  cx /= n; cz /= n;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < band[0] || y > band[1]) continue; rs.push(Math.hypot(p.getX(i) - cx, p.getZ(i) - cz)); }
  rs.sort((a, b) => a - b);
  return { r: +rs[Math.floor(rs.length * pct)].toFixed(3), cx: +cx.toFixed(3), cz: +cz.toFixed(3), n };
}
const out = {};
KIND_ART.forEach((art, kind) => {
  if (!SCATTER_KINDS[kind]?.solid) return;
  const type = art.custom ? 'custom' : art.tree ? 'tree' : art.rock ? 'rock' : null; if (!type) return;
  const rows = art[type].map(name => {
    let geo = null;
    if (type === 'tree') geo = buildTree(name, { seed: 1000 + name.length * 13, lod: 0 }).bark;
    else if (type === 'rock') geo = buildRock(name, { seed: 40 + name.length, lod: 1, size: 2 }).geometry;
    else geo = buildVharlPiece(art.key, name);
    const m = geo ? measure(geo, BAND[type], PCT[type]) : null;
    return { name, ...m };
  });
  out[SCATTER_KINDS[kind].key] = { kind, type, artScale: art.scale, squash: art.squash ? art.squash[0] : 1, variants: rows };
});
console.log(JSON.stringify(out, null, 1));
