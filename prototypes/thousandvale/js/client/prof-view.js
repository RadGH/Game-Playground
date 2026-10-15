// Professions in the world (play-test 8, W9 — stream P-client): the gathering nodes, the stations, the tool in a
// worker's hand and the work loops, the skinning prompt on a corpse.
//
// What the server says (docs/requests.md "Round 8 contracts — P-core"):
//   room objects  info.type === 'node', info.node = { prof, kind, tier, minSkill, look: { model, size, tint, n, v } }, info.key 'node:<id>'
//                 — the SAME entity for everyone; it is spent for YOU while its key is in your opened list (ui/prof.js tells us)
//   skinnable     { id (a corpse you may skin), on, name }                       (ui/prof.js passes it on)
//   ev fx         { kind: 'gather' | 'craft', id (the worker), phase: 'start' | 'done' | 'fail' | 'end', prof, x, z, quality? }
//   info.working  { prof, anim, node? | at? } on a player who is working (someone who walks up late still sees it)
//   NPC roles     a craftsman whose role is a station (data/rules/professions.json `roles`) gets the station's props beside him
//
// COST. Nodes are INSTANCED: one InstancedMesh per part (4 boulder shapes, 5 ore-chunk shapes, 4 trees, the band, the
// patches…), two shared materials (plain / tinted per instance), rebuilt only when the set of nodes or a spent flag
// changes — a zone's 150 nodes in sight are about twenty draw calls. The glints are one more instanced mesh, the only
// thing touched every frame. Tools and stations are a handful of plain meshes on the same material. `sample()` hands
// one of everything to the boot warm-up (P1: no first-use stutter).
//
//   const prof = createProfView(scene, { actors, objects, camera, groundY })
//   prof.setNode(id, {x, z, yaw}, info) · removeNode(id) · clear() · setSpent(key, untilMs) · setSpentAll(map)
//   prof.setSkinnable(id, on, {name}) · setWorking(id, info.working) · setNpc(id, {x, z, yaw}, role) · onEvent(ev) · update(dt, now)

import * as THREE from 'three';
import { NODE_PARTS, PART_GEOMETRY, TINT_PARTS, chunkPlacements, trunkRadius, glintHeight, glintGeometry, stationGeometry, stationsFor, toolGeometry, TOOL_KINDS, STATION_KINDS } from './prof-models.js';
import { PROF_CLIP, PROF_TOOL, PROF_TOOL_MOUNT } from '../../../../avatar-3d/js/chibi2-motion-prof.js';

const VERB = { mining: 'Mine', logging: 'Fell', foraging: 'Gather', skinning: 'Skin' };
const PATCH_SCALE = 1.35;            // herb / mushroom / fibre patches are drawn a little larger than life so they read at a walk
const CHUNK_SCALE = 1.55;            // …and so are the ore chunks: "ore chunks sticking out" is the whole point of a boulder
const CAP0 = 96;
/** Which props a role's building gets: role -> ['forge', 'temper'] (from the data file's roles table). Pure. */
export function roleStations(numbers, role) { const r = numbers?.roles?.[role]; return r && typeof r === 'object' ? stationsFor(r.stations || []) : []; }
/** Where a role's station props stand, relative to the craftsman: [{ kind, x, z, yaw }] in world metres. Pure. */
export function stationSpots(npc, kinds) {
  const yaw = npc.yaw || 0, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  return kinds.map((kind, i) => { const side = i % 2 ? -1 : 1, d = 2.3 + Math.floor(i / 2) * 2.4; return { kind, x: npc.x + rx * side * d - fx * 0.4, z: npc.z + rz * side * d - fz * 0.4, yaw }; });
}
/** A node's twinkle at time t (s): mostly a faint glimmer, a bright flash every few seconds, each node on its own beat. 0..1. Pure. */
export function twinkle(t, phase) { const s = Math.max(0, Math.sin(t * 1.9 + phase)); return 0.16 + 0.84 * s ** 10; }

export function createProfView(scene, { actors = null, objects = null, camera = null, groundY = () => 0, selfId = () => null } = {}) {
  const plainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const tintMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const glintMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const group = new THREE.Group(); group.name = 'professions'; scene.add(group);
  const geos = new Map(), meshes = new Map();
  const geo = part => { if (!geos.has(part)) geos.set(part, PART_GEOMETRY[part]()); return geos.get(part); };
  const nodes = new Map();         // entity id -> node
  const byKey = new Map();         // 'node:<id>' -> node
  const spent = new Map();         // key -> until (ms, wall clock)
  const skins = new Map();         // corpse id -> { name }
  const workers = new Map();       // actor id -> { prof, clip, tool, mesh }
  const npcs = new Map();          // npc id -> { role, x, z, yaw, props: [Mesh], glows: [...] }
  const pops = [];                 // short-lived glints: { x, y, z, t, life, color, size }
  const stats = { nodes: 0, spent: 0, instances: 0, meshes: 0, rebuilds: 0, glints: 0, workers: 0, stations: 0 };
  let dirty = true, numbers = null, lastCheck = 0, clock = 0;
  fetch(new URL('../../data/rules/professions.json', import.meta.url)).then(r => (r.ok ? r.json() : null)).catch(() => null).then(n => { numbers = n; for (const [id, s] of npcs) placeStations(id, s); });

  // ---- instanced parts ----------------------------------------------------------------------------------------
  function meshFor(part, need) {
    let m = meshes.get(part);
    if (m && m.userData.cap >= need) return m;
    const cap = Math.max(CAP0, need, m ? m.userData.cap * 2 : 0);
    if (m) { group.remove(m); m.dispose(); }
    m = new THREE.InstancedMesh(geo(part), TINT_PARTS.has(part) ? tintMat : plainMat, cap);
    m.userData.cap = cap; m.count = 0; m.frustumCulled = false; m.name = 'prof:' + part;
    m.castShadow = /^(boulder|tree\d)/.test(part); m.receiveShadow = /^boulder/.test(part);
    m.setColorAt(0, new THREE.Color('#ffffff'));          // (allocates instanceColor: every part is drawn by the same two programs)
    group.add(m); meshes.set(part, m); stats.meshes = meshes.size;
    return m;
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _up = new THREE.Vector3(0, 1, 0), _n = new THREE.Vector3(), _e = new THREE.Euler();
  const isSpent = n => (spent.get(n.key) || 0) > Date.now();
  function rebuild() {
    dirty = false; stats.rebuilds++;
    // count what each part needs, then fill
    const want = new Map(), add = (part, k = 1) => want.set(part, (want.get(part) || 0) + k);
    const plan = [];
    for (const n of nodes.values()) {
      const L = n.look, gone = isSpent(n); n.spent = gone;
      n.y = groundY(n.x, n.z);
      const parts = (NODE_PARTS[L.model] || NODE_PARTS.herb)(L.v | 0).filter(p => p.when === 'both' || (p.when === 'spent') === gone);
      for (const p of parts) add(p.part);
      const chunks = L.model === 'boulder' && !gone ? chunkPlacements(L.v | 0, Math.max(1, Math.min(10, L.n | 0 || 5))) : null;
      if (chunks) add('ore' + Math.max(1, Math.min(5, n.tier | 0 || 1)), chunks.length);
      plan.push({ n, parts, chunks, gone });
    }
    for (const m of meshes.values()) m.count = 0;
    for (const [part, k] of want) meshFor(part, k);
    let total = 0, spentN = 0;
    for (const { n, parts, chunks, gone } of plan) {
      const L = n.look, size = L.size || 1; if (gone) spentN++;
      _q.setFromAxisAngle(_up, n.yaw || 0);
      for (const p of parts) {
        const m = meshes.get(p.part), i = m.count++;
        const patch = L.model !== 'boulder' && L.model !== 'tree';
        if (p.unit === 'trunk') { const r = trunkRadius(size); _s.set(r, 1, r); } else _s.setScalar(size * (patch ? PATCH_SCALE : 1));
        m.setMatrixAt(i, _m.compose(_p.set(n.x, n.y - (L.model === 'boulder' ? size * 0.06 : 0), n.z), _q, _s));
        m.setColorAt(i, p.tint ? _c.set(gone ? '#6a6a6a' : L.tint || '#ffffff') : _c.set(gone && L.model === 'boulder' ? '#b9b4ac' : '#ffffff'));
        total++;
      }
      if (chunks) {
        const m = meshes.get('ore' + Math.max(1, Math.min(5, n.tier | 0 || 1)));
        for (const c of chunks) {
          const i = m.count++;
          _n.set(c.normal[0], c.normal[1], c.normal[2]).normalize();
          _q2.setFromUnitVectors(_up, _n).multiply(new THREE.Quaternion().setFromAxisAngle(_up, c.spin));
          _p.set(c.pos[0] * size, c.pos[1] * size - size * 0.06, c.pos[2] * size).applyQuaternion(_q).add(new THREE.Vector3(n.x, n.y, n.z));
          m.setMatrixAt(i, _m.compose(_p, _q2.premultiply(_q), _s.setScalar(size * c.scale * CHUNK_SCALE)));
          m.setColorAt(i, _c.set(L.tint || '#c9824a'));
          total++;
        }
      }
    }
    for (const m of meshes.values()) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.visible = m.count > 0; }
    stats.nodes = nodes.size; stats.spent = spentN; stats.instances = total;
  }

  // ---- nodes --------------------------------------------------------------------------------------------------
  function prompt(n) { objects?.upsert?.({ id: n.id, verb: VERB[n.prof] || 'Gather', spent: isSpent(n), prof: n.prof }); }
  function setNode(id, at, info) {
    const d = info?.node; if (!d || !at || !Number.isFinite(at.x)) return;
    let n = nodes.get(id);
    if (!n) { n = { id, phase: (id * 2.399) % 6.283, born: clock }; nodes.set(id, n); }
    Object.assign(n, { x: at.x, z: at.z, yaw: at.yaw || 0, key: info.key, name: info.name, prof: d.prof, kind: d.kind, tier: d.tier || 1, look: { model: 'boulder', size: 1.7, tint: '#c9824a', n: 5, v: 0, ...(d.look || {}) } });
    if (n.key) byKey.set(n.key, n);
    prompt(n); dirty = true;
  }
  function removeNode(id) { const n = nodes.get(id); if (!n) return; nodes.delete(id); if (byKey.get(n.key) === n) byKey.delete(n.key); dirty = true; }
  function clear() { nodes.clear(); byKey.clear(); for (const id of [...skins.keys()]) setSkinnable(id, false); for (const id of [...npcs.keys()]) removeNpc(id); for (const id of [...workers.keys()]) setWorking(id, null); dirty = true; }
  function setSpent(key, until) { if (until > Date.now()) spent.set(key, until); else spent.delete(key); const n = byKey.get(key); if (n) { prompt(n); if (until > Date.now()) pop(n.x, n.y + glintHeight(n.look) * 0.6, n.z, n.look.tint, 1.4); } dirty = true; }
  function setSpentAll(map) { spent.clear(); for (const [k, u] of map || []) if (u > Date.now()) spent.set(k, u); for (const n of nodes.values()) prompt(n); dirty = true; }

  // ---- skinning: a prompt on the corpse, and a small knife-coloured glint over it -------------------------------
  function setSkinnable(id, on, info = {}) {
    const key = 'skin:' + id;
    if (!on) { if (skins.delete(id)) objects?.remove?.(key); const g = actors?.get(id); if (g) g.skinMark = false; return; }
    const a = actors?.get(id); skins.set(id, { name: info.name || a?.name || 'the beast', x: a?.pos.x, z: a?.pos.z });
    if (a) a.skinMark = true;      // [World #19] the body stays drawn while it can be skinned (actors.js fade) — never clickable (pick-rule emptyCorpse)
    if (a) objects?.upsert?.({ id: key, type: 'skin', corpse: id, name: info.name || a.name, x: a.pos.x, z: a.pos.z, r: 1.6, source: 'prof' });
  }

  // ---- the worker: a loop and a tool in the hand ----------------------------------------------------------------
  const toolGeos = new Map();
  const toolGeo = kind => { if (!toolGeos.has(kind)) toolGeos.set(kind, toolGeometry(kind)); return toolGeos.get(kind); };
  function setWorking(id, w) {
    const cur = workers.get(id);
    if (!w || !w.prof) { if (cur) { cur.mesh?.parent?.remove(cur.mesh); workers.delete(id); actors?.setWorking?.(id, null); stats.workers = workers.size; } return; }
    if (cur && cur.prof === w.prof) return;
    if (cur) cur.mesh?.parent?.remove(cur.mesh);
    const tool = PROF_TOOL[w.prof] || null, clip = PROF_CLIP[w.prof] || null;
    const mesh = tool ? new THREE.Mesh(toolGeo(tool), plainMat) : null;
    if (mesh) { const M = PROF_TOOL_MOUNT[tool]; mesh.position.set(...M.position); mesh.rotation.set(...M.rotation); mesh.castShadow = true; mesh.frustumCulled = false; }
    workers.set(id, { prof: w.prof, clip, tool, mesh, t: 0 }); stats.workers = workers.size;
    actors?.setWorking?.(id, clip);
  }
  function updateWorker(id, w, dt) {
    const a = actors?.get(id);
    if (!a || a.dead) { setWorking(id, null); return; }
    w.t += dt;
    if (!w.mesh) return;
    const parts = a.body?.parts, far = a.lod === 'far' || !parts, moving = a.speed > 0.4;
    const bone = !far ? parts[PROF_TOOL_MOUNT[w.tool].bone] : null;
    if (bone && w.mesh.parent !== bone) bone.add(w.mesh);          // a re-dress swaps the skeleton: re-parent when it changed
    w.mesh.visible = !!bone && !moving;
  }

  // ---- stations beside a craftsman ------------------------------------------------------------------------------
  const stationGeos = new Map();
  const station = kind => { if (!stationGeos.has(kind)) stationGeos.set(kind, stationGeometry(kind)); return stationGeos.get(kind); };
  function placeStations(id, s) {
    for (const m of s.props) group.remove(m); s.props = []; s.glows = [];
    for (const sp of stationSpots(s, roleStations(numbers, s.role))) {
      const { geometry, glow } = station(sp.kind), m = new THREE.Mesh(geometry, plainMat);
      m.position.set(sp.x, groundY(sp.x, sp.z), sp.z); m.rotation.y = sp.yaw; m.castShadow = m.receiveShadow = true; m.name = 'station:' + sp.kind;
      group.add(m); s.props.push(m);
      if (glow) { const v = new THREE.Vector3(glow.x, glow.y, glow.z).applyAxisAngle(_up, sp.yaw); s.glows.push({ x: sp.x + v.x, y: m.position.y + v.y, z: sp.z + v.z, color: glow.color }); }
    }
    stats.stations = [...npcs.values()].reduce((k, x) => k + x.props.length, 0);
  }
  function setNpc(id, at, role) {
    if (!role || !at || !Number.isFinite(at.x)) return;
    let s = npcs.get(id);
    if (s && s.role === role && Math.hypot(s.x - at.x, s.z - at.z) < 0.5) return;
    if (!s) { s = { props: [], glows: [] }; npcs.set(id, s); }
    Object.assign(s, { role, x: at.x, z: at.z, yaw: at.yaw || 0 });
    if (numbers) placeStations(id, s);
  }
  function removeNpc(id) { const s = npcs.get(id); if (!s) return; for (const m of s.props) group.remove(m); npcs.delete(id); }

  // ---- glints ---------------------------------------------------------------------------------------------------
  const glint = new THREE.InstancedMesh(glintGeometry(), glintMat, 512); glint.count = 0; glint.frustumCulled = false; glint.renderOrder = 3; glint.setColorAt(0, new THREE.Color('#fff')); group.add(glint);
  function pop(x, y, z, color = '#ffffff', size = 1) { if (pops.length < 40) pops.push({ x, y, z, t: 0, life: 0.6, color, size }); }
  function updateGlints(dt) {
    const cp = camera?.position; let k = 0;
    const put = (x, y, z, size, color) => {
      if (k >= 512) return;
      const yaw = cp ? Math.atan2(cp.x - x, cp.z - z) : 0;
      glint.setMatrixAt(k, _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, yaw, 0)), _s.setScalar(size))); glint.setColorAt(k, _c.set(color)); k++;
    };
    for (const n of nodes.values()) {
      if (n.spent) continue;
      const d = cp ? Math.hypot(n.x - cp.x, n.z - cp.z) : 0; if (d > 170) continue;
      // the same size on screen from 12 m to the edge of sight; close up it shrinks so it never hides the node
      const tw = twinkle(clock, n.phase), far = Math.max(0.35, Math.min(1, (d - 4) / 10)), grow = 0.55 + Math.max(0, d - 12) / 26;
      put(n.x, (n.y || 0) + glintHeight(n.look), n.z, tw * far * grow * 1.15, n.look.tint || '#ffffff');
    }
    for (const [id, s] of skins) { const a = actors?.get(id); if (!a) continue; put(a.pos.x, (a.pos.y || groundY(a.pos.x, a.pos.z)) + 1.1, a.pos.z, 0.45 + 0.35 * twinkle(clock * 1.6, id), '#ffd9a0'); }
    for (const s of npcs.values()) for (const g of s.glows) put(g.x, g.y, g.z, 0.28 + 0.08 * Math.sin(clock * 9 + g.x), g.color);
    for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i]; p.t += dt; if (p.t >= p.life) { pops.splice(i, 1); continue; } const u = p.t / p.life; put(p.x, p.y + u * 0.8, p.z, p.size * (0.5 + 2.2 * u) * (1 - u * u), p.color); }
    glint.count = k; glint.visible = k > 0; glint.instanceMatrix.needsUpdate = true; if (glint.instanceColor) glint.instanceColor.needsUpdate = true;
    stats.glints = k;
  }

  // ---- events ---------------------------------------------------------------------------------------------------
  function onEvent(ev) {
    if (!ev || ev.type !== 'fx' || (ev.kind !== 'gather' && ev.kind !== 'craft')) return false;
    if (ev.phase === 'start') setWorking(ev.id, { prof: ev.prof });
    else {
      setWorking(ev.id, null);
      if (ev.phase === 'done') { const a = actors?.get(ev.id); const x = ev.x ?? a?.pos.x, z = ev.z ?? a?.pos.z; if (Number.isFinite(x)) pop(x, groundY(x, z) + 1.2, z, ev.quality === 'perfect' ? '#ffe17a' : '#ffffff', ev.quality === 'perfect' ? 1.6 : 1); }
    }
    return true;
  }

  function update(dt, now = performance.now()) {
    clock += dt;
    if (clock - lastCheck > 1) {          // a spent node comes back by the clock; a node that arrived before its ground did gets its height
      lastCheck = clock;
      for (const n of nodes.values()) { if (!!n.spent !== isSpent(n)) { prompt(n); dirty = true; } else if (clock - n.born < 6 && Math.abs((n.y || 0) - groundY(n.x, n.z)) > 0.05) dirty = true; }
      for (const [k, u] of spent) if (u <= Date.now()) spent.delete(k);
      for (const [id, s] of skins) if (!actors?.get(id)) setSkinnable(id, false);
    }
    if (dirty) rebuild();
    for (const [id, w] of workers) updateWorker(id, w, dt);
    updateGlints(dt);
  }

  /** One of everything, visible, for the boot shader warm-up (warmup.js `extras`). */
  function sample() {
    const g = new THREE.Group();
    const im = (part, mat) => { const m = new THREE.InstancedMesh(geo(part), mat, 1); m.setMatrixAt(0, new THREE.Matrix4()); m.setColorAt(0, new THREE.Color('#ffffff')); m.castShadow = true; m.receiveShadow = true; return m; };
    g.add(im('boulder0', plainMat), im('ore1', tintMat));
    g.add(new THREE.Mesh(toolGeo('pick'), plainMat), new THREE.Mesh(station('forge').geometry, plainMat));
    const gl = new THREE.InstancedMesh(glint.geometry, glintMat, 1); gl.setMatrixAt(0, new THREE.Matrix4()); gl.setColorAt(0, new THREE.Color('#fff')); g.add(gl);
    for (const c of g.children) c.castShadow = true;
    return g;
  }
  /** For specs: build every geometry now and say how big each is. */
  function audit() { const out = {}; for (const part of Object.keys(PART_GEOMETRY)) out[part] = geo(part).index.count / 3; for (const k of TOOL_KINDS) out['tool:' + k] = toolGeo(k).index.count / 3; for (const k of STATION_KINDS) out['station:' + k] = station(k).geometry.index.count / 3; return out; }

  return { group, nodes, skins, workers, npcs, stats, setNode, removeNode, clear, setSpent, setSpentAll, setSkinnable, clearSkins() { for (const id of [...skins.keys()]) setSkinnable(id, false); }, setWorking, setNpc, removeNpc, onEvent, update, sample, audit, pop,
    remove(id) { removeNode(id); setSkinnable(id, false); removeNpc(id); setWorking(id, null); },
    dispose() { scene.remove(group); for (const m of meshes.values()) m.dispose(); glint.dispose(); for (const g of geos.values()) g.dispose(); plainMat.dispose(); tintMat.dispose(); glintMat.dispose(); } };
}
