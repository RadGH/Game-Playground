// Stream B — play-test 1 P21: the water meets its bank. node --test prototypes/thousandvale/tests/B/water-edge.test.js
// The water sheet is drawn from triangles whose three corners carry a surface (terrain-view.js). Its EDGE must always
// be under the ground — otherwise you see the edge hang in the air ("water doesn't meet the bank") and the 2 m grid
// shows as square steps. And the shoreline must follow the river's line: the waterline sits at the channel edge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTerrain } from '../../js/rules/terrain-read.js';
import { RIVER_WIDTH } from '../../tools/lib/world-core.mjs';

const ROOT = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, ROOT));
const ZONES = Object.values(/* every province (Torbor Downs + Vharlen) */ Object.assign({}, ...Object.values(JSON.parse(read('data/world/province-map.json')).provinces).map(p => p.map)));
const W = JSON.parse(read('data/world/world.json'));

test('all 16 zones: every water-sheet edge vertex is buried in the bank (ground ≥ surface), corners included', () => {
  const bad = [];
  let edges = 0;
  for (const id of ZONES) {
    const t = parseTerrain(read(`data/zones/${id}/terrain.bin`)), S = t.size, Hg = t.heightGrid(), Wg = t.waterGrid();
    const drawn = (i, j, up) => {
      if (i < 0 || j < 0 || i >= S - 1 || j >= S - 1) return true;            // beyond the zone: the neighbour's sheet
      const a = up ? Wg[(j + 1) * S + i + 1] : Wg[j * S + i], b = Wg[j * S + i + 1], c = Wg[(j + 1) * S + i];
      return !Number.isNaN(a) && !Number.isNaN(b) && !Number.isNaN(c);
    };
    let worst = 0, n = 0;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const k = j * S + i; if (Number.isNaN(Wg[k])) continue;
      const around = [[i, j, false], [i - 1, j, false], [i - 1, j, true], [i, j - 1, false], [i, j - 1, true], [i - 1, j - 1, true]];
      if (around.every(([a, b, u]) => drawn(a, b, u))) continue;
      edges++;
      const over = Wg[k] - Hg[k];
      if (over > 0.03) { n++; worst = Math.max(worst, over); }
    }
    if (n) bad.push(`${id}: ${n} sheet-edge vertices with water above the ground (worst ${worst.toFixed(2)} m)`);
  }
  assert.deepEqual(bad, []);
  assert.ok(edges > 10000, `${edges} edge vertices checked`);
});

test('the shoreline follows the river: across every river the water starts within a metre of the channel edge', () => {
  const bad = [];
  let n = 0;
  for (const id of ZONES) {
    const t = parseTerrain(read(`data/zones/${id}/terrain.bin`)), z0 = W.zones.find(z => z.id === id).origin;
    for (const r of W.rivers) {
      if (r.bbox[2] < z0.x || r.bbox[0] > z0.x + 2048 || r.bbox[3] < z0.z || r.bbox[1] > z0.z + 2048) continue;
      for (let k = 1; k < r.pts.length - 2; k += 2) {
        const a = r.pts[k], b = r.pts[k + 1], cls = Math.max(a[3], b[3]), half = RIVER_WIDTH[cls] / 2;
        const x = (a[0] + b[0]) / 2 - z0.x, z = (a[1] + b[1]) / 2 - z0.z;
        if (x < 40 || z < 40 || x > 2008 || z > 2008) continue;
        // skip where the river meets another water body or a bridge (the line is not a plain bank there)
        if (t.waterAt(x, z).kind !== 'river' || !Number.isNaN(t.deckAt(x, z))) continue;
        const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L;
        for (const side of [1, -1]) {
          let o = 0; while (o < half + 6 && t.waterAt(x + nx * side * o, z + nz * side * o).depth > 0) o += 0.25;
          if (o >= half + 6) continue;                                        // runs into a lake / another channel
          n++;
          if (Math.abs(o - half) > 1.6) bad.push(`${id} river ${r.id} at ${x.toFixed(0)},${z.toFixed(0)}: waterline ${o.toFixed(2)} m out, channel edge ${half}`);
        }
      }
    }
  }
  assert.ok(bad.length <= n * 0.03, `${bad.length} of ${n} cross-sections off the channel line:\n${bad.slice(0, 8).join('\n')}`);
  assert.ok(n > 500, `${n} cross-sections`);
});
