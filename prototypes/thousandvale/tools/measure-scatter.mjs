#!/usr/bin/env node
// Measure the footprint of every kit model a solid scatter kind is drawn as (play-test 11, Z37 — live #38: "trees and
// rocks … collisions are off-centre and often square when the object is circular"). Builds the SAME pieces
// js/client/scatter-view.js draws (same names, seeds, detail) and prints, per scatter kind and variant, the radius of
// the model's cross-section at body height (where a walker touches it) and how far its middle sits off the item's spot.
// The numbers go into js/rules/nav-refine.js SCATTER_COLLIDE by hand (they change only when the kit art does).
//   node --import ./avatar-3d/tests/three-register.mjs prototypes/thousandvale/tools/measure-scatter.mjs
import { buildSceneryTree } from '../js/client/tree-style.js';     // the storybook tree when there is one (what the game draws), else the kit's
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
/**
 * A tree trunk is measured by SLICING it: where the triangles cross three heights across the band (2026-10-20 — the
 * storybook trunks, js/client/tree-style.js, are long tubes with few rings, so often no VERTEX sits inside the band).
 */
function measureSlice(geo, band, pct = 0.6) {
  const p = geo.getAttribute('position'), idx = geo.index ? geo.index.array : null, n = idx ? idx.length : p.count;
  const pts = [];
  for (const y0 of [band[0], (band[0] + band[1]) / 2, band[1]]) {
    for (let t = 0; t < n; t += 3) {
      const v = [0, 1, 2].map(k => { const i = idx ? idx[t + k] : t + k; return [p.getX(i), p.getY(i), p.getZ(i)]; });
      for (let e = 0; e < 3; e++) {
        const a = v[e], b = v[(e + 1) % 3];
        if ((a[1] - y0) * (b[1] - y0) > 0 || a[1] === b[1]) continue;
        const f = (y0 - a[1]) / (b[1] - a[1]); pts.push([a[0] + (b[0] - a[0]) * f, a[2] + (b[2] - a[2]) * f]);
      }
    }
  }
  if (!pts.length) return null;
  let cx = 0, cz = 0; for (const [x, z] of pts) { cx += x; cz += z; } cx /= pts.length; cz /= pts.length;
  const rs = pts.map(([x, z]) => Math.hypot(x - cx, z - cz)).sort((a, b) => a - b);
  return { r: +rs[Math.floor(rs.length * pct)].toFixed(3), cx: +cx.toFixed(3), cz: +cz.toFixed(3), n: pts.length };
}
const out = {};
KIND_ART.forEach((art, kind) => {
  if (!SCATTER_KINDS[kind]?.solid) return;
  const type = art.custom ? 'custom' : art.tree ? 'tree' : art.rock ? 'rock' : null; if (!type) return;
  const rows = art[type].map(name => {
    let geo = null;
    if (type === 'tree') geo = buildSceneryTree(name, { seed: 1000 + name.length * 13, lod: 0 }).bark;
    else if (type === 'rock') geo = buildRock(name, { seed: 40 + name.length, lod: 1, size: 2 }).geometry;
    else geo = buildVharlPiece(art.key, name);
    const m = geo ? (type === 'tree' ? measureSlice(geo, BAND[type], PCT[type]) : measure(geo, BAND[type], PCT[type])) : null;
    return { name, ...m };
  });
  out[SCATTER_KINDS[kind].key] = { kind, type, artScale: art.scale, squash: art.squash ? art.squash[0] : 1, variants: rows };
});
console.log(JSON.stringify(out, null, 1));
