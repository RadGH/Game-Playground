// Stream W — owner play-test 5, T8a: "some fences are rotated 90 degrees from their fence posts".
//   node --test prototypes/thousandvale/tests/B/fences.test.js
// Every way a fence reaches the screen, measured: the rail's long axis against the line its posts stand on.
//   1. stream E's recipes (data/vignettes/*.json): `fence_rail` props between `fence_post` props, and rows of the
//      `wooden_fence` / `iron_fence` / `stone_wall` models. THE BUG: three recipes (the Drill Field beside Torborhold,
//      Turnwater Mill, the Spider Bridge toll) put rails at yaw 1.57 between posts spaced along X — a rail runs along
//      local X at yaw 0, so every one stood across its own fence.
//   2. stream B's `fence` placements round pastures, as js/client/setpiece-view.js plans them.
//   3. proctown's kit: fenceParts (the hamlet fence), the set-piece kit's fenced models and fenceLine.
// (Town perimeters and their gates: tests/B/walls.test.js "T8a".)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { fenceParts, FENCE_KINDS, FENCE_SEG } from '../../../../proctown/js/buildkit.js';
import * as KIT from '../../../../proctown/js/propkit.js';

register('../../../../avatar-3d/tests/three-loader.mjs', import.meta.url);
const ROOT = new URL('../../', import.meta.url);
const json = p => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8'));
const deg = r => r * 180 / Math.PI;
/** Angle (degrees, 0-90) between two plan directions, ignoring which way each points. */
const between = (a, b) => deg(Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1]) / (Math.hypot(...a) * Math.hypot(...b)))));
/** A thing turned by yaw: its local +X in the plane (the convention every placer here uses: three's rotation.y). */
const localX = yaw => [Math.cos(yaw), -Math.sin(yaw)];

const RECIPE_FILES = readdirSync(new URL('data/vignettes/', ROOT)).filter(f => f.endsWith('.json'));
const RECIPES = RECIPE_FILES.flatMap(f => (json('data/vignettes/' + f).vignettes || []).map(v => ({ file: f, v })));

test('T8a recipes: every fence_rail runs along the line to the fence posts it hangs between', () => {
  let rails = 0, hung = 0; const bad = [];
  for (const { file, v } of RECIPES) {
    const posts = (v.props || []).filter(p => p.id === 'fence_post');
    for (const r of (v.props || []).filter(p => p.id === 'fence_rail')) {
      rails++;
      const near = posts.filter(q => Math.hypot(q.x - r.x, q.z - r.z) < 2.6);
      if (!near.length) continue;                         // a loose rail lying about: no line to be wrong against
      hung++;
      const q = near.sort((a, b) => Math.hypot(a.x - r.x, a.z - r.z) - Math.hypot(b.x - r.x, b.z - r.z))[0];
      const off = between(localX(r.yaw || 0), [q.x - r.x, q.z - r.z]);
      if (off > 20) bad.push(`${file} ${v.id}: rail at ${r.x},${r.z} (yaw ${r.yaw}) is ${off.toFixed(0)} deg across the line to its post at ${q.x},${q.z}`);
    }
  }
  assert.deepEqual(bad, []);
  assert.ok(rails >= 20 && hung >= 15, `rails ${rails}, between posts ${hung}`);
});

test('T8a recipes: fence / wall section models in a row run along the row', () => {
  const bad = []; let n = 0;
  for (const { file, v } of RECIPES) {
    const secs = (v.models || []).filter(m => ['wooden_fence', 'iron_fence', 'stone_wall'].includes(m.id));
    for (const s of secs) {
      const nb = secs.filter(o => o !== s && Math.hypot(o.x - s.x, o.z - s.z) < 3.6);
      if (!nb.length) continue;
      n++;
      // some neighbour continues this section's own line (a corner's other neighbour does not, and need not)
      if (!nb.some(o => between(localX(s.yaw || 0), [o.x - s.x, o.z - s.z]) < 20)) bad.push(`${file} ${v.id}: ${s.id} at ${s.x},${s.z} stands across its row`);
    }
  }
  assert.deepEqual(bad, []);
  assert.ok(n >= 60, 'sections in rows: ' + n);
});

/** Rails and posts in a kit part list (model space): a post is upright and thin, a rail long, thin and level. */
function railsAndPosts(parts) {
  const posts = [], rails = [];
  for (const p of parts) {
    if (p.mesh !== 'box' && p.mesh !== 'cyl') continue;
    const cy = Math.cos(p.yaw || 0), sy = Math.sin(p.yaw || 0), cx = Math.cos(p.rx || 0), sx = Math.sin(p.rx || 0), cz = Math.cos(p.rz || 0), sz = Math.sin(p.rz || 0);
    const X = [cy * cz + sy * sx * sz, cx * sz, cy * sx * sz - sy * cz], Y = [sy * sx * cz - cy * sz, cx * cz, sy * sz + cy * sx * cz], Z = [sy * cx, -sx, cy * cx];
    const dims = [[p.w, X], [p.h, Y], [p.d, Z]].sort((a, b) => b[0] - a[0]), [L, ax] = dims[0];
    if (L < 0.7 || dims[1][0] > 0.3) continue;
    const c = [p.x + Y[0] * p.h / 2, p.y + Y[1] * p.h / 2, p.z + Y[2] * p.h / 2];
    if (Math.abs(ax[1]) > 0.9) posts.push({ x: c[0], z: c[2] });
    else if (Math.abs(ax[1]) < 0.25 && L > 1.2 && c[1] < 1.6) rails.push({ x: c[0], z: c[2], L, ax: [ax[0], ax[2]] });
  }
  return { posts, rails };
}
/** Rails that have posts round them but fewer than two ON their own line. */
function railsOffTheirPosts(parts) {
  const { posts, rails } = railsAndPosts(parts), out = [];
  for (const r of rails) {
    const U = Math.hypot(...r.ax), ux = r.ax[0] / U, uz = r.ax[1] / U;
    const near = posts.filter(q => Math.hypot(q.x - r.x, q.z - r.z) < r.L / 2 + 0.3);
    const on = near.filter(q => { const dx = q.x - r.x, dz = q.z - r.z, t = dx * ux + dz * uz; return Math.hypot(dx - t * ux, dz - t * uz) < 0.3; });
    if (near.length >= 2 && on.length < 2) out.push(r);
  }
  return { bad: out, rails: rails.length, posts: posts.length };
}

test('T8a kit: the fence lengths (rail, stake), the set-piece kit\'s models and fenceLine keep every rail on its posts', () => {
  for (const k of FENCE_KINDS) {
    const parts = fenceParts(k), { rails } = railsAndPosts(parts);
    // a fence length runs FENCE_SEG along +Z: its rails must too
    for (const r of rails) assert.ok(between(r.ax, [0, 1]) < 5 && Math.abs(r.L - FENCE_SEG) < 0.3, `${k}: a rail off the +Z line`);
    assert.equal(railsOffTheirPosts(parts).bad.length, 0, k);
  }
  let fenced = 0;
  for (const id of KIT.PROP_MODEL_IDS) {
    const r = railsOffTheirPosts(KIT.propModel(id, { seed: 3 }).parts);
    if (r.rails && r.posts >= 2) fenced++;
    assert.equal(r.bad.length, 0, `${id}: ${r.bad.length} rail(s) not between their posts`);
  }
  assert.ok(fenced >= 5, 'models with rails and posts: ' + fenced);
  // fenceLine along a dog-leg: every rail follows its own leg
  const pts = [[0, 0], [7.5, 0], [7.5, 5], [12, 9]];
  const { rails } = railsAndPosts(KIT.fenceLine(pts, { kind: 'wooden' }));
  assert.ok(rails.length >= 6);
  for (const r of rails) {
    const leg = pts.slice(1).map((b, i) => [pts[i], b]).sort((p, q) => segD(r, p) - segD(r, q))[0];
    assert.ok(between(r.ax, [leg[1][0] - leg[0][0], leg[1][1] - leg[0][1]]) < 5, 'a fenceLine rail across its leg');
  }
});
function segD(r, [a, b]) { const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((r.x - a[0]) * dx + (r.z - a[1]) * dz) / (dx * dx + dz * dz))); return Math.hypot(r.x - a[0] - dx * t, r.z - a[1] - dz * t); }

test('T8a client: the pasture fences of every zone, as setpiece-view plans them — rails along their span, a post at each joint', async () => {
  const { planSetPieces } = await import('../../js/client/setpiece-view.js');
  const PMAP = json('data/world/province-map.json').provinces.torbor_downs.map;
  let rails = 0, fences = 0;
  for (const id of Object.values(PMAP)) {
    const P = json(`data/zones/${id}/placements.json`).placements.filter(p => p.kind === 'fence');
    for (const rec of P) {
      fences++;
      const plan = planSetPieces({ placements: [rec] });
      const pts = rec.data.pts, legs = pts.slice(1).map((b, i) => [pts[i], b]);
      const posts = plan.parts.filter(p => p.h > 0.8 && p.w < 0.3 && p.d < 0.3);
      for (const p of plan.parts) {
        const long = Math.max(p.w, p.d); if (long < 1.0 || p.h > 0.4) continue;
        rails++;
        const ax = p.w >= p.d ? localX(p.yaw) : [Math.sin(p.yaw), Math.cos(p.yaw)];
        const leg = legs.slice().sort((a, b) => segD(p, a) - segD(p, b))[0];
        assert.ok(between(ax, [leg[1][0] - leg[0][0], leg[1][1] - leg[0][1]]) < 3, `${id} ${rec.id}: a rail across its fence at ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
        // and it ends ON posts: one within a hand of each end
        for (const sg of [-1, 1]) { const ex = p.x + ax[0] * sg * long / 2, ez = p.z + ax[1] * sg * long / 2; assert.ok(posts.some(q => Math.hypot(q.x - ex, q.z - ez) < 0.25), `${id} ${rec.id}: a rail end with no post`); }
      }
    }
  }
  assert.ok(fences >= 20 && rails > 400, `fences ${fences}, rails ${rails}`);
});
