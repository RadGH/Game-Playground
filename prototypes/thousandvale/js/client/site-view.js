// Stream E's placed content for one zone (data/vignettes/placements/<zone>.json, docs/requests.md "E -> D —
// drawing the placed content"): the buildings and dressing of every fort, farm, cave mouth and zone hook.
// The SERVER owns everything you use or fight there (js/sim/placements.js turns the same file into NPCs,
// camps, chests, cave doors, waystones, clues and caches, and `fort` / `farm` / `hook` marker objects); this
// file only draws the place itself, so a garrison stands in a fort and a shepherd by a fold.
//
//   fort  — sites.json forts[template].props + a structure per template (watchtower, palisade ring with a gate
//           facing yaw, stone keep with curtain walls, warband stockade with tents, ruined walls, toll gatehouse)
//   farm  — sites.json farms[template].props + a farmhouse and barn (proctown kit) + fields / pens / orchard rows
//   cave  — a rock or earth mound with a dark mouth facing yaw (downhill), by template
//   hook  — data/hooks.json parts (props in a line or round the spot); a `features` hook with `pts` is a line
//           (the Thorn Wall: brambles every 3 m along it)
// Local offsets turn with the placement's yaw by the server's own vignettePoint formula (localToWorld).
// Also returns `solids` (towers, keeps, halls, mounds) for the camera.

import * as THREE from 'three';
import { nextFrame } from './perf.js';
import { describeBuilding, partsFor, radiusOf } from '../../../../proctown/js/buildkit.js';
import { tuneFor } from './building-tune.js';   // T13: Thousandvale's building heights
import { buildBush } from '../../../../highdef-3d/js/kit/trees.js';
import { createDecor, foliageMaterials } from './decor.js';
import { unitGeometry, localToWorld } from './town-view.js';
import { loadVignetteRecipes, vignettePropList } from './vignette-props.js';

let siteData = null;
export function loadSiteData() {
  if (!siteData) siteData = Promise.all(['provinces/sites.json', 'hooks.json'].map(f => fetch(new URL(`../../data/${f}`, import.meta.url)).then(r => (r.ok ? r.json() : null)).catch(() => null)))
    .then(([sites, hooks]) => ({ sites: sites || { forts: {}, farms: {}, caves: {} }, hooks: new Map(((hooks && hooks.hooks) || []).map(h => [h.id, h])) }));
  return siteData;
}

const FIRE = new Set(['campfire', 'torch_post', 'fire_ring']);
const STONE = '#8a857c', DARK_STONE = '#6d6961', WOOD = '#6e553d', DARK_WOOD = '#4a3a2c', THATCH = '#a8925a', EARTH = '#5f6b45', VOID = '#0b0a0c';

/**
 * Every prop and structure part a placement list needs, in world metres. Pure given the data (exported for tests):
 * -> { props: [{kind, id, x, z, yaw, scale, dead}], parts: [{mesh, x, y (above ground), z, yaw, w, h, d, colour}], buildings: [{plot, want}],
 *      bushes: [{x, z, yaw, s}], solids: [{x, z, r, h}] }
 */
export function sitePlan(placements, features, data, ox = 0, oz = 0) {
  const props = [], parts = [], buildings = [], bushes = [], solids = [];
  const { sites, hooks } = data;
  for (const raw of [...(placements || []), ...(features || [])]) {
    const p = { ...raw, x: raw.x + ox, z: raw.z + oz };
    const yaw = p.yaw || 0;
    const L = (lx, lz) => localToWorld(p.x, p.z, yaw, lx, lz);
    const part = (mesh, lx, lz, y, w, h, d, colour, ry = 0) => { const q = L(lx, lz); parts.push({ mesh, x: q.x, y, z: q.z, yaw: yaw + ry, w, h, d, colour }); };
    const tplProps = list => { for (const pr of list || []) { const q = L(pr.x || 0, pr.z || 0); props.push({ kind: pr.kind, id: pr.id, x: q.x, z: q.z, yaw: (pr.yaw || 0) + yaw, scale: pr.scale || 1, dead: !!pr.dead }); } };
    const ring = (r, step, gapHalf, fn) => { for (let a = 0; a < Math.PI * 2; a += step) { const d = Math.atan2(Math.sin(a), Math.cos(a)); if (Math.abs(d) < gapHalf) continue; fn(Math.sin(a) * r, Math.cos(a) * r, a); } };   // gap faces local +z (the yaw)
    if (p.type === 'fort') {
      const t = sites.forts[p.template] || {};
      tplProps(t.props);
      const R = (p.radius || t.radius || 18) * 0.82;
      switch (p.template) {
        case 'watchtower_garrison':
          part('cyl', 0, -3, -0.5, 4.6, 10.5, 4.6, STONE); part('cone', 0, -3, 10, 5.6, 3.2, 5.6, DARK_WOOD);
          part('cyl', 0, -3, 9.4, 5.2, 0.6, 5.2, DARK_STONE);
          solids.push({ ...L(0, -3), r: 2.6, h: 13 });
          ring(R * 0.7, 0.16, 0.45, (lx, lz, a) => part('box', lx, lz, -0.3, 0.3, 1.6, 2.2, WOOD, -a));
          break;
        case 'palisade_fort': case 'toll_fort': case 'warband_stockade': {
          const crude = p.template === 'warband_stockade';
          ring(R, crude ? 0.085 : 0.07, 0.32, (lx, lz) => part('cyl', lx, lz, -0.4, 0.5, crude ? 3.4 : 4.2, 0.5, crude ? DARK_WOOD : WOOD));
          for (const s of [-1, 1]) { part('box', s * 3.2, R, -0.4, 1.4, 6.2, 1.4, DARK_WOOD); solids.push({ ...L(s * 3.2, R), r: 1, h: 6 }); }
          if (crude) { for (const [lx, lz] of [[-5, -4], [4, -6], [6, 3], [-6, 4]]) { part('cone', lx, lz, 0, 4, 3.4, 4, '#7a6a4a'); solids.push({ ...L(lx, lz), r: 1.8, h: 3.4 }); } }
          else buildings.push({ plot: { ...L(0, -R * 0.35), w: 9, d: 7, angle: Math.PI / 2 - yaw, facing: Math.PI / 2 - yaw, want: p.template === 'toll_fort' ? 'watchpost' : 'barracks' }, yaw });
          if (p.template === 'toll_fort') { part('box', 0, R, 5.6, 8, 1, 1.6, DARK_WOOD); }
          break;
        }
        case 'stone_keep':
          part('box', 0, -2, -0.6, 8, 11, 8, STONE); part('box', 0, -2, 10.4, 8.6, 0.8, 8.6, DARK_STONE);
          solids.push({ ...L(0, -2), r: 5.6, h: 12 });
          for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { part('cyl', lx * R * 0.72, lz * R * 0.72, -0.5, 3.2, 8, 3.2, STONE); part('cone', lx * R * 0.72, lz * R * 0.72, 7.5, 3.8, 2.4, 3.8, '#5a3a32'); solids.push({ ...L(lx * R * 0.72, lz * R * 0.72), r: 1.8, h: 10 }); }
          // curtain walls between the towers, a gate gap on the front (+z)
          for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [-1, -1, -1, 1], [1, -1, 1, 1]]) { const k = R * 0.72; const mx = (ax + bx) / 2 * k, mz = (az + bz) / 2 * k, len = Math.hypot(bx - ax, bz - az) * k; part('box', mx, mz, -0.5, ax === bx ? 1.2 : len, 5, ax === bx ? len : 1.2, DARK_STONE); }
          for (const s of [-1, 1]) part('box', s * R * 0.72 * 0.62, R * 0.72, -0.5, R * 0.72 * 0.66, 5, 1.2, DARK_STONE);
          break;
        case 'ruined_fort': {
          let h = 7;
          ring(R * 0.85, 0.36, 0.3, (lx, lz, a) => { h = (h * 9301 + 49297) % 233280; const hh = 1 + (h / 233280) * 3.5; part('box', lx, lz, -0.4, 4.2, hh, 1.1, DARK_STONE, -a + Math.PI / 2); });
          part('cyl', -R * 0.4, -R * 0.3, -0.4, 3.4, 4.5, 3.4, STONE); solids.push({ ...L(-R * 0.4, -R * 0.3), r: 1.9, h: 4.5 });
          break;
        }
      }
    } else if (p.type === 'farm') {
      const t = sites.farms[p.template] || {};
      tplProps(t.props);
      const R = (p.radius || t.radius || 20) * 0.7;
      buildings.push({ plot: { ...L(-R * 0.55, -R * 0.55), w: 7, d: 6, angle: Math.PI / 2 - yaw, facing: Math.PI / 2 - yaw, want: p.template === 'mill' ? 'mill' : p.template === 'fishing_plot' ? 'hut' : 'house' }, yaw });
      if (p.template !== 'fishing_plot') buildings.push({ plot: { ...L(R * 0.55, -R * 0.6), w: 8, d: 7, angle: Math.PI / 2 - yaw, facing: Math.PI / 2 - yaw, want: 'granary' }, yaw });
      if (p.template === 'arable') {
        const burned = p.flavour === 'burned', colour = burned ? '#3a3330' : p.flavour === 'corrupted' ? '#5a4a6a' : '#b9a24e';
        for (let k = -4; k <= 4; k++) part('box', k * 1.6, R * 0.35, -0.15, 0.7, 0.45, R * 0.9, k % 2 ? colour : '#7a8a3a');
      } else if (p.template === 'sheep' || p.template === 'pig') {
        ring(R * 0.62, 0.22, 0.25, (lx, lz, a) => { part('box', lx, lz + R * 0.2, -0.2, 0.14, 1.1, 0.14, WOOD); part('box', lx, lz + R * 0.2, 0.55, 0.08, 0.1, 2.0, WOOD, -a + Math.PI / 2); });
      } else if (p.template === 'orchard') {
        for (let i = -1; i <= 1; i++) for (let j = 0; j <= 2; j++) { const q = L(i * 5, j * 5); props.push({ kind: 'tree', id: (i + j) % 2 ? 'oak' : 'birch', x: q.x, z: q.z, yaw: i + j, scale: 0.8 }); }
      } else if (p.template === 'mill') {
        const c = L(R * 0.1, R * 0.4); parts.push({ mesh: 'cyl', x: c.x, y: -0.4, z: c.z, yaw, w: 4, h: 8, d: 4, colour: STONE }, { mesh: 'cone', x: c.x, y: 7.6, z: c.z, yaw, w: 4.6, h: 2.6, d: 4.6, colour: THATCH });
        for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; const q = L(R * 0.1 + Math.sin(a) * 0.1, R * 0.4 + 2.2); parts.push({ mesh: 'box', x: q.x, y: 6.2 + Math.cos(a) * 2.6 - 0.15, z: q.z, yaw: yaw, w: 0.5 + Math.abs(Math.sin(a)) * 5, h: 0.3 + Math.abs(Math.cos(a)) * 5, d: 0.12, colour: '#d8cdb0' }); }
        solids.push({ ...c, r: 2.2, h: 10 });
      }
    } else if (p.type === 'cave') {
      if (p.template === 'barrow_mound') {
        part('dome', 0, -6, -1.5, 13, 4, 11, EARTH); solids.push({ ...L(0, -6), r: 5.5, h: 3.5 });
        for (const s of [-1, 1]) part('box', s * 1.8, -0.6, -0.3, 0.8, 3.2, 0.8, STONE);
        part('box', 0, -0.6, 2.8, 4.6, 0.7, 1, DARK_STONE); part('box', 0, -0.6, -0.2, 2.8, 3, 0.3, VOID);
      } else if (p.template === 'old_shaft') {
        for (const s of [-1, 1]) part('box', s * 1.6, 0, -0.2, 0.35, 3.6, 0.35, WOOD);
        part('box', 0, 0, 3.3, 3.8, 0.35, 0.4, WOOD); part('box', 0, -0.2, -0.3, 3, 0.4, 3, VOID);
        part('box', 0, -0.2, 0.1, 3.6, 0.3, 3.6, DARK_WOOD);
      } else {
        // a hillside mouth: three rock lumps behind and over a dark opening
        part('dome', 0, -5, -1.2, 12, 5.5, 9, p.template === 'spider_hollow' ? '#5a5650' : '#6f6a60'); solids.push({ ...L(0, -5), r: 5, h: 5 });
        part('dome', -4.5, -2.5, -1, 5, 4, 5, DARK_STONE); part('dome', 4.5, -2.5, -1, 5, 3.6, 5, DARK_STONE);
        part('dome', 0, -0.9, -0.6, 4.2, 3.2, 1.4, VOID);
      }
    } else if (p.type === 'hook') {
      const h = hooks.get(p.id);
      if (!h) continue;
      if (Array.isArray(p.pts) && p.pts.length > 1) {
        // a hook that IS a line (the Thorn Wall): brambles every 3 m
        const pts = p.pts.map(([x, z]) => [x + ox, z + oz]);
        for (let i = 0; i < pts.length - 1; i++) {
          const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az);
          for (let s = 0; s < len; s += 3) { const k = (i * 131 + s) % 7; bushes.push({ x: ax + (bx - ax) * s / len + (k - 3) * 0.3, z: az + (bz - az) * s / len, yaw: k, s: 1.3 + (k % 3) * 0.25 }); }
        }
        continue;
      }
      let ringN = 0;
      for (const pt of h.parts || []) {
        if (!['prop', 'tree', 'ground'].includes(pt.kind)) continue;     // bespoke models: stream F's, later
        const n = Math.max(1, pt.count || 1);
        if (pt.spacing) { for (let k = 0; k < n; k++) { const q = L(0, (k - (n - 1) / 2) * pt.spacing); props.push({ kind: pt.kind, id: pt.id, x: q.x, z: q.z, yaw, scale: 1 }); } }
        else for (let k = 0; k < n; k++) { const a = (ringN++) * 2.399, r = 3 + ringN * 0.8; const q = L(Math.sin(a) * r, Math.cos(a) * r); props.push({ kind: pt.kind, id: pt.id, x: q.x, z: q.z, yaw: a, scale: 1 }); }
      }
    }
  }
  return { props, parts, buildings, bushes, solids };
}

const SITE_TREES = new Map();
export async function createSiteView(T, file, { quality = 'high' } = {}) {
  const data = await loadSiteData();
  const recipes = await loadVignetteRecipes();
  const ox = T.ox || 0, oz = T.oz || 0;
  const placements = file.placements || [], features = file.features || [];
  const plan = sitePlan(placements, features, data, ox, oz);
  // vignette props join the same prop pass
  plan.props.push(...vignettePropList(placements.filter(p => !p.type || p.type === 'vignette' || p.type === 'curio'), recipes, ox, oz));
  if (!plan.props.length && !plan.parts.length && !plan.buildings.length && !plan.bushes.length) return null;
  const cheap = quality === 'low';
  const decor = await createDecor(T, { placements: plan.props.filter(p => p.kind === 'prop').map(p => ({ kind: 'prop', id: p.id, x: p.x, z: p.z, yaw: p.yaw, data: FIRE.has(p.id) ? { fire: true } : {} })), density: 0, cheap });
  const group = decor.group; group.name = 'sites-' + (T.zoneKey || '');
  const mats = await foliageMaterials(cheap);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  // trees + ground details (shared with vignettes)
  const { buildTree } = await import('../../../../highdef-3d/js/kit/trees.js');
  const { buildGroundDetail } = await import('../../../../highdef-3d/js/kit/rocks.js');
  await nextFrame();                    // P1: the site pass is cut into frame-sized pieces
  const treeGeo = SITE_TREES;           // one cache for the page: each zone used to rebuild its species from scratch
  // trees are instanced per species (curios and vignettes bring hundreds; a Mesh each was a draw call each)
  const bySpecies = new Map();
  for (const p of plan.props.filter(p => p.kind === 'tree')) { const sp = p.dead ? 'dead_snag' : p.id; if (!bySpecies.has(sp)) bySpecies.set(sp, []); bySpecies.get(sp).push(p); }
  for (const [sp, ps] of bySpecies) {
    if (!treeGeo.has(sp + cheap)) { try { treeGeo.set(sp + cheap, buildTree(sp, { seed: 3100 + sp.length, lod: cheap ? 1 : 0 })); } catch { treeGeo.set(sp + cheap, null); } await nextFrame(); }
    const b = treeGeo.get(sp + cheap); if (!b) continue;
    for (const [geo, mat] of [[b.bark, mats.bark], [b.foliage, mats.leaf]]) {
      if (!geo) continue;
      const m = new THREE.InstancedMesh(geo, mat, ps.length);
      ps.forEach((p, i) => { _q.setFromAxisAngle(up, p.yaw); m.setMatrixAt(i, _m.compose(_v.set(p.x, T.heightAt(p.x, p.z) - 0.1, p.z), _q, _s.setScalar(Math.min(1.6, p.scale * 0.62)))); });
      m.castShadow = !cheap; m.computeBoundingSphere(); group.add(m);
    }
  }
  await nextFrame();
  const byGround = new Map();
  for (const p of plan.props.filter(p => p.kind === 'ground')) { if (!byGround.has(p.id)) byGround.set(p.id, []); byGround.get(p.id).push(p); }
  for (const [id, ps] of byGround) {
    let g; try { g = buildGroundDetail(id, { seed: 9, lod: 0 }).geometry; } catch { continue; }
    const m = new THREE.InstancedMesh(g, mats.prop, ps.length);
    ps.forEach((p, i) => { _q.setFromAxisAngle(up, p.yaw); m.setMatrixAt(i, _m.compose(_v.set(p.x, T.heightAt(p.x, p.z) + 0.02, p.z), _q, _s.setScalar(p.scale))); });
    group.add(m);
  }
  // structures: unit shapes, instanced per shape
  const Mat = cheap ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;
  const kitMat = new Mat(cheap ? {} : { roughness: 0.9 });
  const all = plan.parts.map(p => ({ ...p, y: T.heightAt(p.x, p.z) + p.y }));
  const solids = plan.solids.map(s => { const g = T.heightAt(s.x, s.z); return { x: s.x, z: s.z, r: s.r, bottom: g - 1, top: g + s.h }; });
  for (const b of plan.buildings) {
    const g = T.heightAt(b.plot.x, b.plot.z);
    const desc = describeBuilding({ plot: { cx: b.plot.x, cz: b.plot.z, w: b.plot.w, d: b.plot.d, angle: b.plot.angle, facing: b.plot.facing, want: b.plot.want }, culture: 'halfling', seed: Math.round(b.plot.x * 7 + b.plot.z * 13) >>> 0, want: b.plot.want, tune: tuneFor(b.plot.want, { plot: b.plot, seed: Math.round(b.plot.x * 7 + b.plot.z * 13) >>> 0 }) });
    const c = Math.cos(desc.yaw), s = Math.sin(desc.yaw);
    let top = 0;
    all.push({ mesh: 'box', x: b.plot.x, y: g - 0.7, z: b.plot.z, yaw: desc.yaw, w: desc.footprint.w + 0.6, h: 0.95, d: desc.footprint.d + 0.6, colour: '#5a5248' });
    for (const pt of partsFor(desc)) { top = Math.max(top, pt.y + pt.h); all.push({ mesh: pt.mesh, x: b.plot.x + pt.x * c + pt.z * s, y: g + pt.y, z: b.plot.z - pt.x * s + pt.z * c, yaw: desc.yaw + (pt.yaw || 0), w: pt.w, h: pt.h, d: pt.d, colour: pt.colour }); }
    solids.push({ x: b.plot.x, z: b.plot.z, r: radiusOf(desc) * 0.85, bottom: g - 1, top: g + top });
  }
  await nextFrame();
  const byMesh = new Map();
  for (const p of all) { if (!byMesh.has(p.mesh)) byMesh.set(p.mesh, []); byMesh.get(p.mesh).push(p); }
  const col = new THREE.Color();
  for (const [mesh, list] of byMesh) {
    const m = new THREE.InstancedMesh(unitGeometry(mesh), kitMat, list.length);
    list.forEach((p, i) => { _e.set(0, p.yaw, 0); _q.setFromEuler(_e); m.setMatrixAt(i, _m.compose(_v.set(p.x, p.y, p.z), _q, _s.set(p.w, p.h, p.d))); m.setColorAt(i, col.set(p.colour)); });
    m.castShadow = !cheap; m.receiveShadow = true; m.computeBoundingSphere(); group.add(m);
  }
  // hook lines: brambles
  if (plan.bushes.length) {
    const b = buildBush('bramble', { seed: 77, lod: 1 });
    for (const [geo, mat] of [[b.bark, mats.bark], [b.foliage, mats.leaf]]) {
      if (!geo) continue;
      const m = new THREE.InstancedMesh(geo, mat, plan.bushes.length);
      plan.bushes.forEach((p, i) => { _q.setFromAxisAngle(up, p.yaw); m.setMatrixAt(i, _m.compose(_v.set(p.x, T.heightAt(p.x, p.z) - 0.05, p.z), _q, _s.setScalar(p.s))); });
      m.castShadow = !cheap; group.add(m);
    }
  }
  return { group, update: decor.update, solids, stats: { props: plan.props.length, parts: all.length, buildings: plan.buildings.length, bushes: plan.bushes.length }, dispose() { kitMat.dispose(); decor.dispose?.(); } };
}
