// The world drawn from the same data the server walks (lessons rule 22): the ground, water, worn roads, town paving and
// fields come from ground.js (grass tufts: grass.js), bridges from bridge-draw.js (decks at their deck height), props from data/placements.json, trees and decor from js/world/scatter.js.
// Everything is cut into 128 m tiles so the camera only draws what is near (fog hides the edge).
//
// Art: data/art.json. A "ready" scenery piece loads its GLB (avatar-3d/fal models); a "kit" piece is built from unit
// shapes by kit-props.js (the playground's set-piece + building kits, and Oathwild's own pieces in the same style) and
// instanced by kit-draw.js (placed things: one InstancedMesh per shape per tile; trees / rocks / bushes: one baked mesh
// per kind). Only an id with neither falls back to the plain shape below.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createGround, GROUND_CFG } from './ground.js';
import { createGrass } from './grass.js';
import { kitModel } from './kit-props.js';
import { createKitDraw } from './kit-draw.js';
import { createTrees } from './trees.js';
import { wind } from './wind.js';
import { createTownView } from './town-draw.js';
import { createBridgeView } from './bridge-draw.js';
import { addContactShade } from './contact.js';
import { findChimney } from './chimney.js';
import { ATMOS } from './atmos.js';
import { UNDERSTORY_SPECIES, TREE_SPECIES } from '../../world/scatter.js';
import { makeSurface } from '../../../../../highdef-3d/js/kit/textures.js';

const TILE = 128;
const ROOT = new URL('../../../../../', import.meta.url);     // the playground folder
const loader = new GLTFLoader();
const glbCache = new Map();
const glb = file => { if (!glbCache.has(file)) glbCache.set(file, loader.loadAsync(new URL(file, ROOT).href)); return glbCache.get(file); };

const hash = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };

export function createWorldView(view, { T, placements, art, scattered, book, town = null, quality = 'medium' }) {
  const scene = view.scene;
  const root = new THREE.Group(); root.name = 'world'; scene.add(root);
  const tiles = new Map();          // "i,k" -> Group
  const tileOf = (x, z) => `${Math.floor(x / TILE)},${Math.floor(z / TILE)}`;
  function tileGroup(x, z) {
    const k = tileOf(x, z);
    if (!tiles.has(k)) { const g = new THREE.Group(); g.name = 'tile ' + k; const [i, j] = k.split(',').map(Number); g.userData.cx = (i + 0.5) * TILE; g.userData.cz = (j + 0.5) * TILE; root.add(g); tiles.set(k, g); }
    return tiles.get(k);
  }
  const artById = new Map((art.scenery || []).map(a => [a.id, a]));

  // ---------------------------------------------------------------- ground, roads (worn into it), water, fields, grass: ground.js
  const ground = createGround(view, { T, placements, art, cfg: GROUND_CFG, quality, tileGroup, scattered });
  const grass = createGrass(view, ground, GROUND_CFG.grass[quality] || GROUND_CFG.grass.medium, { quality });

  // ---------------------------------------------------------------- bridges: built from js/world/bridge-plan.js (the deck drawn
  // is the deck walked, tests/world/bridges.test.mjs) by bridge-draw.js — planks, railings, trestles; arches, parapets
  createBridgeView({ T, tileGroup });

  // ---------------------------------------------------------------- props (placements) and the shapes for placeholders
  const matCache = new Map();
  const matOf = hex => { if (!matCache.has(hex)) matCache.set(hex, new THREE.MeshLambertMaterial({ color: hex })); return matCache.get(hex); };
  function shapeGeometry(ph, id = '') {
    const [w, h, d] = ph.size || [1, 1, 1];
    const s = ph.shape;
    let geo;
    if (s === 'cylinder') { geo = new THREE.CylinderGeometry(w / 2 * 0.9, w / 2, h, 10); geo.translate(0, h / 2, 0); }
    else if (s === 'cone') { geo = new THREE.ConeGeometry(w / 2, h, 9); geo.translate(0, h / 2, 0); }
    else if (s === 'rock') { geo = new THREE.IcosahedronGeometry(0.5, 0); geo.scale(w, h, d); geo.translate(0, h * 0.38, 0); }
    else if (s === 'house') {
      const body = new THREE.BoxGeometry(w, h * 0.6, d); body.translate(0, h * 0.3, 0);
      const roof = new THREE.ConeGeometry(Math.max(w, d) * 0.75, h * 0.42, 4); roof.rotateY(Math.PI / 4); roof.translate(0, h * 0.6 + h * 0.2, 0);
      geo = mergeGeometries([body.toNonIndexed(), roof.toNonIndexed()]);
      const n = geo.attributes.position.count, cols = new Float32Array(n * 3), bodyN = body.toNonIndexed().attributes.position.count;
      const wall = new THREE.Color(ph.colour).offsetHSL(0, -0.1, 0.12), roofC = new THREE.Color(ph.colour).offsetHSL(0, 0.05, -0.08);
      for (let i = 0; i < n; i++) { const c = i < bodyN ? wall : roofC; cols.set([c.r, c.g, c.b], i * 3); }
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    } else { geo = new THREE.BoxGeometry(w, h, d); geo.translate(0, h / 2, 0); }
    return geo;
  }
  const houseMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  function placeholderMesh(a) {
    const ph = a.placeholder || { shape: 'box', size: a.size || [1, 1, 1], colour: '#8a7a64' };
    const geo = shapeGeometry(ph, a.id);
    const m = new THREE.Mesh(geo, ph.shape === 'house' ? houseMat : matOf(ph.colour));
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  const pending = [];
  const kit = createKitDraw({ root, tileGroup, tileKey: tileOf });
  const seedAt = (x, z) => ((Math.floor(x * 7.31) * 73856093) ^ (Math.floor(z * 5.17) * 19349663)) >>> 0;
  /** A kit model for an art row (null when the row has a GLB or no kit). Same spot, same seed, same model. */
  const kitFor = (a, seed) => (a && a.status !== 'ready' ? kitModel(a.id, { seed, size: a.size || a.placeholder?.size }) : null);
  const chimneyOf = new Map();       // art id → chimney top in model space (or null)
  const placedTrees = [];             // hand-placed trees (placements.props) join the storybook trees below
  function place(id, x, z, y, facing = 0, { scale = 1, name = '' } = {}) {
    const a = artById.get(id);
    const holder = new THREE.Group();
    const gy = y ?? T.heightAt(x, z);
    holder.position.set(x, gy, z);
    holder.rotation.y = facing || 0;
    holder.name = name || id;
    tileGroup(x, z).add(holder);
    // a tree is never the flat kit tree (owner 2026-11-26, lessons rule 77): drawn by trees.js like every other tree
    if (TREE_SPECIES[id]) { placedTrees.push({ art: id, x, z, y: gy, rot: facing || 0, h: TREE_SPECIES[id].h * scale }); return holder; }
    if (a?.status === 'ready' && a.file) {
      pending.push(glb(a.file).then(g => {
        const m = g.scene.clone(true);
        m.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; if (o.material?.map) o.material.map.colorSpace = THREE.SRGBColorSpace; } });
        m.scale.setScalar(scale);
        holder.add(m);
        // a lived-in house smokes: find its chimney from its shape (cached per model) and tell the ambient smoke
        if (/cottage|inn|smithy|house|hut|mill|tavern|hall/.test(id)) {
          if (!chimneyOf.has(id)) {
            holder.updateWorldMatrix(true, true); const inv = new THREE.Matrix4().copy(holder.matrixWorld).invert(), pts = [], v = new THREE.Vector3();
            m.traverse(o => { if (!o.isMesh) return; const P = o.geometry.attributes.position, M = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld); for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(M); pts.push(v.x, v.y, v.z); } });
            chimneyOf.set(id, findChimney(pts));
          }
          const c = chimneyOf.get(id);
          // (the holder's world matrix refreshed for every house, not only the first of its model)
          if (c) { holder.updateWorldMatrix(true, false); const w = new THREE.Vector3(c.x, c.y, c.z).applyMatrix4(holder.matrixWorld); kit.chimneys.push({ x: w.x, y: w.y, z: w.z }); }
        }
      }).catch(() => holder.add(placeholderMesh({ ...a, placeholder: { shape: 'box', size: a.size || [2, 2, 2], colour: '#8a7a64' } }))));
      return holder;
    }
    const km = kitFor(a, seedAt(x, z) % 997 + 1);
    if (km) { kit.place(km, x, gy, z, facing || 0); holder.userData.kit = a.id; return holder; }   // the holder stays as the named spot
    holder.add(placeholderMesh(a || { placeholder: { shape: 'box', size: [1, 1, 1], colour: '#8a7a64' } }));
    if (scale !== 1 && holder.children[0]) holder.children[0].scale.multiplyScalar(scale);
    return holder;
  }
  for (const b of placements.buildings || []) place(b.art, b.at[0], b.at[1], b.y, b.facing, { name: b.name });
  for (const p of placements.props || []) place(p.art, p.at[0], p.at[1], p.y, p.facing);
  const shrineMarks = [];
  for (const s of placements.shrines || []) { const h = place(s.art || 'shrine-respawn', s.at[0], s.at[1], s.y, s.facing, { name: s.name }); shrineMarks.push({ id: s.id, holder: h }); }
  const chestMeshes = new Map();
  for (const c of placements.chests || []) chestMeshes.set(c.id, place(c.art || 'chest-common', c.at[0], c.at[1], c.y, c.facing, { name: c.name }));
  const objectMeshes = new Map();
  for (const o of placements.objects || []) {
    const h = o.art ? place(o.art, o.at[0], o.at[1], o.y, o.facing || 0, { name: o.name }) : (() => { const g = new THREE.Group(); g.position.set(o.at[0], o.y ?? T.heightAt(o.at[0], o.at[1]), o.at[1]); g.add(placeholderMesh({ placeholder: { ...(o.fallback || { shape: 'box', size: [1, 1, 1], colour: '#b08d3c' }) } })); tileGroup(o.at[0], o.at[1]).add(g); return g; })();
    objectMeshes.set(o.id, h);
  }
  // the towns (js/world/town.js plan → town-draw.js); the few town props drawn with the scenery kit go in first
  const TOWN_ART = { rack: 'weapon-rack', banner: 'banner-village', dummy: 'scarecrow-post' };
  for (const p of town?.props || []) if (TOWN_ART[p.kind]) place(TOWN_ART[p.kind], p.at[0], p.at[1], p.y, p.facing || 0);
  let townView = null;
  if (town) pending.push(createTownView({ T, plan: town, quality, tileGroup, chimneys: kit.chimneys }).then(v => { townView = v; }).catch(e => console.warn('town', e)));
  kit.build();
  // the arena place (brainstorm 2026-11-27 §2b): its walls, stands, gates, crowd from the same layout the server walks
  let arenaView = null;
  if (placements.arenaLayout) pending.push(import('./arena-draw.js').then(m => m.createArenaView({ scene: root, L: placements.arenaLayout, quality })).then(v => { arenaView = v; }).catch(e => console.warn('arena', e)));
  if (!new URLSearchParams(location.search).has('envoff')) addContactShade(view, { T, placements });
  // the mist pools in the low ground: its base is set from this map's own heights (the lowest 4% of the land: river bottoms)
  { const hs = Float32Array.from(T.grid.heights).sort(); ATMOS.set({ mist: { base: hs[Math.floor(hs.length * 0.04)] } }); }

  // ---------------------------------------------------------------- trees and decor (instanced per art id and tile)
  // walk-through decor is thinned on lower settings (trees never are: every tree is drawn, 2026-11-26)
  const DECOR_KEEP = { low: 0.4, medium: 0.75, high: 1 }[quality] ?? 0.75;
  const vcMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  // the scattered stones, stumps and logs were flat vertex colour (lessons rule 77, owner 2026-11-26: no untextured
  // models): they keep their kit shapes and colours, with a painted rock / bark picture laid over them in world space
  // (three-way projection, so no stretched seams on an instanced, scaled, turned stone)
  const DETAIL = { rock: /^(rock|boulder|cliff)/, bark_oak: /^(stump|log)/ };
  const detailMats = Object.fromEntries(Object.keys(DETAIL).map(name => [name, detailed(name)]));
  const matFor = id => { for (const [name, re] of Object.entries(DETAIL)) if (re.test(id)) return detailMats[name]; return vcMat; };
  function detailed(name) {
    const tex = makeSurface(name, { size: 256, seed: 5 }).map;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    // the picture's mean brightness (decoded from sRGB) so laying it on keeps the kit colour's own brightness
    let mean = 0.5;
    try { const c = tex.image, g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data; let t = 0; const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; for (let i = 0; i < d.length; i += 16) t += 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]); mean = Math.max(0.02, t / (d.length / 16)); } catch { /* keep 0.5 */ }
    const m = new THREE.MeshLambertMaterial({ vertexColors: true });
    m.onBeforeCompile = shader => {
      shader.uniforms.uDetail = { value: tex }; shader.uniforms.uDetailMean = { value: mean };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vDetailPos; varying vec3 vDetailN;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          { vec4 dw = vec4(transformed, 1.0); vec3 dn = objectNormal;
            #ifdef USE_INSTANCING
              dw = instanceMatrix * dw; dn = mat3(instanceMatrix) * dn;
            #endif
            dw = modelMatrix * dw; vDetailPos = dw.xyz; vDetailN = normalize(mat3(modelMatrix) * dn); }`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uDetail; uniform float uDetailMean; varying vec3 vDetailPos; varying vec3 vDetailN;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          { vec3 bw = pow(abs(normalize(vDetailN)), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
            vec3 p = vDetailPos * 0.33;
            vec3 tx = texture2D(uDetail, p.zy).rgb * bw.x + texture2D(uDetail, p.xz).rgb * bw.y + texture2D(uDetail, p.xy).rgb * bw.z;
            float l = dot(tx, vec3(0.2126, 0.7152, 0.0722)) / uDetailMean;
            diffuseColor.rgb *= mix(1.0, clamp(l, 0.25, 1.9), 0.85); }`);
    };
    m.customProgramCacheKey = () => 'ow-detail-' + name;
    return m;
  }
  const geoCache = new Map();
  const VARIANTS = quality === 'low' ? 1 : quality === 'medium' ? 2 : 3;   // each rock / bush kind is baked three ways (lean, which stones), picked by spot; one on Low (fewer draw calls on phones)
  function instGeo(id, v = 0) {
    const key = id + '#' + v;
    if (geoCache.has(key)) return geoCache.get(key);
    const a = artById.get(id) || { id, placeholder: { shape: 'rock', size: [1, 1, 1], colour: '#7a7a6a' } };
    let geo;
    // lessons rule 77: a tree never comes through here as a flat vertex-colour kit tree (trees.js draws every tree)
    if (a.kind === 'tree' || TREE_SPECIES[id]) throw new Error(`world tree ${id} must be drawn by trees.js, not the untextured kit`);
    const km = kitFor(a, v + 1);
    if (km) geo = kit.bake(km);
    else { geo = shapeGeometry(a.placeholder || { shape: 'rock', size: a.size || [1, 1, 1], colour: '#7a7a6a' }); if (geo.index) geo = geo.toNonIndexed(); const c = new THREE.Color(a.placeholder?.colour || '#7a7a6a'); const n = geo.attributes.position.count; const cols = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const t = c.clone().offsetHSL(0, 0, (hash(i, 7) - 0.5) * 0.08); cols.set([t.r, t.g, t.b], i * 3); } geo.setAttribute('color', new THREE.BufferAttribute(cols, 3)); }
    geoCache.set(key, geo);
    return geo;
  }
  function instance(list, keep) {
    const groups = new Map();
    // grouped in 256 m blocks (two tiles a side): 442 draw calls on Medium at 128 m (environment round)
    const blockOf = (x, z) => `${Math.floor(x / (TILE * 2)) * 2},${Math.floor(z / (TILE * 2)) * 2}`;
    list.forEach((t, n) => { if (!keep(n)) return; const v = Math.floor(hash(t.x * 0.37, t.z * 0.41) * VARIANTS) % VARIANTS; const k = `${blockOf(t.x, t.z)}|${t.art}|${v}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); });
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const [k, items] of groups) {
      const [tk, art, v] = k.split('|');
      const mesh = new THREE.InstancedMesh(instGeo(art, Number(v)), matFor(art), items.length);
      items.forEach((t, i) => { q.setFromAxisAngle(up, t.rot || 0); s.setScalar(t.scale || 1); p.set(t.x, (t.y ?? T.heightAt(t.x, t.z)) - 0.1, t.z); m4.compose(p, q, s); mesh.setMatrixAt(i, m4); });
      mesh.castShadow = artById.get(art)?.kind === 'tree'; mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      mesh.name = 'scatter ' + art;
      const [i, j] = tk.split(',').map(Number);
      tileGroup((i + 1) * TILE, (j + 1) * TILE).add(mesh);   // the block's middle
    }
  }
  // trees: big storybook trees, sized by js/world/scatter.js (trees.js)
  let treeView = null;
  // bushes are leaf tufts like the trees now (the kit's bush balls looked faceted beside fluffy crowns); the understory
  // (shrubs at tree feet, saplings + shrubs along wood edges: scatter.js understory()) joins them, thinned on Low
  const BUSH_AS = { 'bush-a': 'shrub', 'bush-b': 'shrub-berry', 'bush-c': 'shrub-dry' };
  const keepU = { low: 0.3, medium: 0.8, high: 1 }[quality] ?? 0.8;
  const bushes = (scattered.decor || []).filter(d => BUSH_AS[d.art]).map(d => ({ ...d, art: BUSH_AS[d.art], h: UNDERSTORY_SPECIES[BUSH_AS[d.art]].h * (d.scale || 1) }));
  const under = [...bushes, ...(scattered.understory || [])].filter((t, n) => (n % 100) / 100 < keepU);
  // every tree is drawn by the storybook renderer at every setting (owner 2026-11-26: "Where did these low poly mvp trees
  // come from? Unacceptable." — the trees Low / Medium used to thin out were drawn as the flat kit pine / oak instead).
  // Every tree is solid on the server (#132), so none is left out; extra trees join their block's existing groups
  // (same draw calls, more instances). tests/world/textured.test.mjs fails if a world tree goes through instance() again.
  pending.push(createTrees({ trees: [...(scattered.trees || []), ...placedTrees, ...under], tileGroup: quality === 'low' ? () => root : tileGroup, cell: TILE * (quality === 'low' ? 4 : 2), quality }).then(v => { treeView = v; }));
  // (Low: 512 m blocks hang on the root — a far tile's hiding must not take a block whose near edge is beside you)
  // (anything solid is always drawn: a rock you bump into is never thinned away)
  const decorList = (scattered.decor || []).filter(d => !BUSH_AS[d.art]);
  instance(decorList, n => decorList[n].solid || (n % 100) / 100 < DECOR_KEEP);

  // ---------------------------------------------------------------- per frame
  let wt = 0;
  return {
    get arena() { return arenaView; },
    root, tiles, chestMeshes, objectMeshes, shrineMarks, ground, grass, kitStats: kit.stats, chimneys: kit.chimneys, get treeStats() { return treeView?.stats || null; }, get townStats() { return townView?.stats || null; }, ready: () => Promise.allSettled([...pending, ground.ready]),
    update(dt, at) {
      wt += dt;
      wind.update(dt);   // the ONE wind: trees, tufts, grass and crops all bend to it (./wind.js)
      kit.update(dt, wt);
      arenaView?.update(dt, wt);
      treeView?.update(wt);
      ground.update(dt, at);
      grass.update(view.camera.position);
      const far = (view.camera.far || 300) + TILE * 0.75;
      for (const g of tiles.values()) g.visible = Math.hypot(g.userData.cx - at.x, g.userData.cz - at.z) < far;
    },
  };
}
