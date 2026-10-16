// Town perimeters (stream B, play-test 4 S7): every `town_wall` placement drawn with proctown's town-edge kit — a
// stone curtain with towers and gatehouses round a town, a palisade round a village, a rail fence (or a hedge) round a
// hamlet, a barricade round a frontier or blighted place — plus the gates' doors, standing OPEN and swung INTO the
// town, and an iron grate where a stream runs through the ring.
//
// Data (tools/lib/zone-walls.mjs, docs/world.md §11): runs [[x, z, h]…] (open polylines, ordered round the ring so a
// piece's local +X is OUTSIDE), towers [{x, z, h, yaw}], gates [{x, z, h, yaw, out, wallYaw, open, width, pass, kind, ends}]
// where yaw = atan2(dx, dz) of the way OUT along the road and wallYaw = the wall's outward normal there (the gate is
// drawn IN the wall, by wallYaw; play-test 5 T8b), openings [{kind, ends, grate, h}]. Same conventions as town-view.js: a
// part's local frame turned by yaw (protocol yaw = three's rotation.y), its `y` its bottom, tilts rx/rz after yaw.
//
// planWalls() is pure (no three) and exported for tests; createWallsView() builds the meshes (one InstancedMesh per
// unit shape, like town-view / setpiece-view) and camera solids.

import { propTier, propsOff } from './surface-plan.js';
import { surfaceMaterial, surfaceInstances, disposeKit } from './surface-mat.js';
import * as THREE from 'three';
import { LIGHTS } from './lightpool.js';
import { unitGeometry } from './town-view.js';
import { makeFlameTexture } from './decor.js';
import { wallKitParts, gatehouseParts, fenceParts, gatePostParts, gateLeafParts, grateParts, tintParts, MESHES, WALL_SEG, FENCE_SEG } from '../../../../proctown/js/buildkit.js';

const FENCES = new Set(['rail', 'hedge', 'stake']);
const WOOD = '#7a5a3c';
const BANNER = '#7b2a26';

/**
 * Every part of every perimeter in a zone, in world metres with absolute heights.
 * placements: the zone's placements (zone metres); ox/oz: the zone's world origin; groundAt(x, z): world ground height.
 * Returns { parts: [{ mesh, x, y, z, w, h, d, yaw, rx, rz, colour }], fires: [{ x, y, z, s }], solids: [{ x, z, r, bottom, top }],
 *           stats: { towns, pieces, towers, gates, grates },
 *           gates: [{ x, z, yaw, open, jamb, kind, stubs }] — each drawn gate's frame (world metres; local X = along the wall) }.
 */
export function planWalls(placements, { ox = 0, oz = 0, groundAt = () => 0 } = {}) {
  const parts = [], fires = [], solids = [], gates = [];
  const stats = { towns: 0, pieces: 0, towers: 0, gates: 0, grates: 0 };
  // place a kit part list at (x, z) on ground g, turned by yaw (scaled along local x/z first if asked)
  const put = (list, x, z, g, yaw, { sx = 1, sz = 1, sy = 1 } = {}) => {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (const p of list) {
      const lx = p.x * sx, lz = p.z * sz;
      // a part LAID DOWN along the piece (a barricade's log: a cylinder tipped rx 90 degrees) has its length in `h`, so a
      // piece shortened along z must shorten that, or a 1 m stub of barricade carries a 6 m log out into the road
      const laid = Math.abs(Math.abs(p.rx || 0) - Math.PI / 2) < 0.01 && !(p.yaw || 0);
      parts.push({ mesh: p.mesh, x: x + lx * c + lz * s, y: g + p.y * sy, z: z - lx * s + lz * c, w: p.w * sx, h: p.h * (laid ? sz : sy), d: p.d * (laid ? 1 : sz), yaw: yaw + (p.yaw || 0), rx: p.rx || 0, rz: p.rz || 0, colour: p.colour });
    }
  };
  for (const rec of placements) {
    if (rec.kind !== 'town_wall' || !rec.data) continue;
    const d = rec.data, mat = d.material || 'stone', tint = d.tint || '#a29c90';
    const fence = FENCES.has(mat), seg = fence ? FENCE_SEG : WALL_SEG;
    const piece = fence ? tintParts(fenceParts(mat), tint) : tintParts(wallKitParts(mat, 'wall'), tint);
    stats.towns++;
    // runs: whole kit lengths along each straight, stretched a little to fit; each sits on the LOWER of its two ends
    for (const run of d.runs || []) {
      for (let k = 0; k < run.length - 1; k++) {
        const ax = run[k][0] + ox, az = run[k][1] + oz, bx = run[k + 1][0] + ox, bz = run[k + 1][1] + oz;
        const L = Math.hypot(bx - ax, bz - az); if (L < 0.2) continue;
        const n = Math.max(1, Math.round(L / seg)), len = L / n, yaw = Math.atan2(bx - ax, bz - az);
        for (let q = 0; q < n; q++) {
          const t0 = q / n, t1 = (q + 1) / n, tm = (t0 + t1) / 2;
          const x = ax + (bx - ax) * tm, z = az + (bz - az) * tm;
          const g = Math.min(groundAt(ax + (bx - ax) * t0, az + (bz - az) * t0), groundAt(ax + (bx - ax) * t1, az + (bz - az) * t1), groundAt(x, z)) - 0.12;
          put(piece, x, z, g, yaw, { sz: len / seg });
          stats.pieces++;
          if (q === 0 || q === n - 1 || q % 2 === 0) solids.push({ x, z, r: Math.max(0.6, (d.thick || 1) / 2 + 0.3), bottom: g - 1, top: g + (d.h || 3) });
        }
      }
    }
    for (const t of d.towers || []) {
      const x = t.x + ox, z = t.z + oz, g = groundAt(x, z) - 0.2;
      put(tintParts(wallKitParts(mat, 'tower'), tint), x, z, g, t.yaw || 0);
      solids.push({ x, z, r: 2.6, bottom: g - 1, top: g + 11 });
      stats.towers++;
    }
    for (const gt of d.gates || []) {
      if (gt.kind === 'gap') continue;
      stats.gates++;
      // T8b (play-test 5): the gate stands IN the wall. Its frame is the ring's at that point — local +Z = the wall's
      // outward normal (`wallYaw`), local X = along the wall — whatever angle the road crosses at; `open` is the clear
      // opening along the wall (wider than the road's `pass` when the road comes through at a slant). `yaw` (the way
      // out along the road) is only the fallback for a bake older than T8b.
      const x = gt.x + ox, z = gt.z + oz, g = groundAt(x, z) - 0.1, yaw = gt.wallYaw ?? gt.yaw ?? 0, pass = gt.pass || gt.width || 4.2;
      const open = Math.max(gt.open || pass, gt.kind === 'gatehouse' ? 4.2 : 1.5);
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
      let jamb;                                        // metres of structure outside the opening, each side
      if (gt.kind === 'gatehouse') {
        jamb = 1.6;
        // jambs keep their size and move apart; only the lintel grows (proctown's opt-in gatehouseParts)
        put(tintParts(gatehouseParts(mat, open), tint), x, z, g, yaw);
        // the two doors, hinged at the INNER face of the jambs and swung ~80 degrees into the town (out = local +Z)
        const leaf = gateLeafParts('door', 0.16).map(p => ({ ...p, colour: p.colour.startsWith('#3') ? p.colour : WOOD }));
        const hgt = mat === 'palisade' ? 4.6 : 4.7, len = Math.min(open / 2 * 0.98, 3.4);
        for (const [hx, yw] of [[-open / 2, 1.4], [open / 2, Math.PI - 1.4]]) {
          const [hxw, hzw] = at(hx, -1.6);
          put(leaf, hxw, hzw, g, yaw + yw, { sx: len, sy: hgt });
        }
        // a banner over the arch on the OUTSIDE face (stone kinds), and a torch either side of the mouth
        if (!['palisade', 'barricade', 'hedge'].includes(mat)) put([{ mesh: 'box', x: 0, y: 4.95, z: 1.78, w: Math.min(1.6, open * 0.3), h: 1.25, d: 0.06, colour: BANNER }], x, z, g, yaw);
        for (const sg of [-1, 1]) {
          const [fx, fz] = at(sg * (open / 2 + 0.55), 1.95);
          put([{ mesh: 'box', x: 0, y: 2.6, z: 0, w: 0.12, h: 0.55, d: 0.12, colour: '#3a2c20' }], fx, fz, g, yaw);
          fires.push({ x: fx, y: g + 3.3, z: fz, s: 0.55 });
        }
        for (const sg of [-1, 1]) { const [jx, jz] = at(sg * (open / 2 + 0.8), 0); solids.push({ x: jx, z: jz, r: 1.0, bottom: g - 1, top: g + 6.5 }); }
      } else {
        // posts (fence / hedge / barricade): posts either side ON THE FENCE LINE, and the gate leaves latched back
        const postKind = mat === 'barricade' ? 'barricade' : mat === 'hedge' ? 'hedge' : mat === 'stake' ? 'stake' : 'rail';
        jamb = postKind === 'barricade' ? 1.4 : postKind === 'hedge' ? 0.9 : 0.35;
        put(tintParts(gatePostParts(postKind, open), postKind === 'rail' ? WOOD : tint), x, z, g, yaw);
        if (postKind === 'barricade') {
          // the cheval de frise that closes the road, dragged aside: it lies ALONG the barricade, just outside it
          const len = Math.max(2, Math.min(pass, 5) * 0.8), leaf = tintParts(gateLeafParts('frise', 0.16, len), tint);
          const [lx, lz] = at(open / 2 + 1.2, 1.7);
          put(leaf, lx, lz, g, yaw);
        } else {
          // T8a: a field gate swung to ~100 degrees read as a length of fence turned across its own posts. It is
          // latched BACK now: 25 degrees off the fence, inside it, so the rails run with the fence they belong to.
          const leaf = tintParts(gateLeafParts('rail'), WOOD), len = Math.min(open / 2 * 0.96, 2.6), back = 0.44;
          for (const [hx, yw] of [[-open / 2, Math.PI - back], [open / 2, back]]) {
            const [hxw, hzw] = at(hx, 0);
            put(leaf, hxw, hzw, g, yaw + yw, { sx: len, sy: 1.15 });
          }
        }
      }
      // the wall runs on from each jamb to where its run stops (the opening is cut a little wider than the gate, and
      // wider still where a second way runs beside the wall): the same pieces as a run, so there is no gap beside a gate
      const frame = { x, z, yaw, open, jamb, kind: gt.kind, stubs: 0 };
      for (const e of gt.ends || []) {
        const dx = e[0] + ox - x, dz = e[1] + oz - z, lx = dx * c - dz * s, lz = dx * s + dz * c, sg = Math.sign(lx) || 1;
        const edge = sg * (open / 2 + jamb);
        if (Math.abs(lx) - Math.abs(edge) < 1.0) continue;         // (under a metre the jamb and the run already meet)
        const [jx, jz] = at(edge, 0), ex = e[0] + ox, ez = e[1] + oz;
        // local +X of the gate frame runs AGAINST the ring's angle, and a run piece's outside is its +X only when it is
        // laid with the angle increasing: so the stub on the +X side runs end -> jamb, the other jamb -> end
        const [ax, az, bx, bz] = sg > 0 ? [ex, ez, jx, jz] : [jx, jz, ex, ez];
        const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / seg)), ryaw = Math.atan2(bx - ax, bz - az);
        for (let q = 0; q < n; q++) {
          const tm = (q + 0.5) / n, px = ax + (bx - ax) * tm, pz = az + (bz - az) * tm;
          put(piece, px, pz, Math.min(groundAt(px, pz), groundAt(ax, az), groundAt(bx, bz)) - 0.12, ryaw, { sz: L / n / seg });
          solids.push({ x: px, z: pz, r: Math.max(0.6, (d.thick || 1) / 2 + 0.3), bottom: g - 1, top: g + (d.h || 3) });
        }
        frame.stubs++; stats.pieces += n;
      }
      gates.push(frame);
    }
    for (const o of d.openings || []) {
      if (!o.grate || !o.ends) continue;
      const [e0, e1] = o.ends, dx = e1[0] - e0[0], dz = e1[1] - e0[1], width = Math.hypot(dx, dz);
      const x = (e0[0] + e1[0]) / 2 + ox, z = (e0[1] + e1[1]) / 2 + oz, yaw = Math.atan2(-dz, dx);
      const top = (o.h ?? groundAt(x, z)) + 2.2, base = Math.min(groundAt(x, z), top - 2.6);
      put(grateParts(width, top - base).map(p => ({ ...p, colour: p.colour.startsWith('#3') ? p.colour : tint })), x, z, base, yaw);
      stats.grates++;
    }
  }
  return { parts, fires, solids, stats, gates };
}

export function createWallsView(T, placements, { quality = 'high' } = {}) {
  const ox = T.ox || 0, oz = T.oz || 0;
  if (!placements.some(p => p.kind === 'town_wall')) return null;
  const plan = planWalls(placements, { ox, oz, groundAt: (x, z) => T.heightAt(x, z) });
  if (!plan.parts.length) return null;
  const cheap = quality === 'low';
  const group = new THREE.Group(); group.name = 'walls-' + (T.zoneKey || '');
  const Mat = cheap ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;
  const mat = new Mat(cheap ? {} : { roughness: 0.92, metalness: 0 });
  const tier = propTier(quality, { off: propsOff() });          // G-PROPS 2026-10-16: stone courses, palisade logs, wear
  if (!cheap) surfaceMaterial(mat, tier, { unit: true });
  const meshes = [];
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), col = new THREE.Color();
  const byMesh = Object.fromEntries(MESHES.map(m => [m, []]));
  for (const p of plan.parts) (byMesh[p.mesh] || byMesh.box).push(p);
  for (const [kind, list] of Object.entries(byMesh)) {
    if (!list.length) continue;
    const m = new THREE.InstancedMesh(unitGeometry(kind), mat, list.length);
    list.forEach((p, i) => {
      _e.set(p.rx, p.yaw, p.rz, 'YXZ'); _q.setFromEuler(_e);
      m.setMatrixAt(i, _m.compose(_v.set(p.x, p.y, p.z), _q, _s.set(p.w, p.h, p.d)));
      m.setColorAt(i, col.set(p.colour || '#a29c90'));
    });
    surfaceInstances(m, tier);
    m.castShadow = !cheap; m.receiveShadow = true; m.computeBoundingSphere(); m.name = 'wall-' + kind;
    group.add(m); meshes.push(m);
  }
  // gate torches: a flame sprite each, lit at night, one pooled light per gate (never a new PointLight)
  const flameMat = new THREE.SpriteMaterial({ map: makeFlameTexture(), color: 0xffc070, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const flames = plan.fires.map(f => { const s = new THREE.Sprite(flameMat); s.position.set(f.x, f.y + f.s * 0.45, f.z); s.scale.set(f.s * 0.9, f.s * 1.3, 1); s.userData.s = f.s; s.visible = false; group.add(s); return s; });
  const lights = [];
  for (let i = 0; i < plan.fires.length; i += 2) { const f = plan.fires[i], g = plan.fires[i + 1] || f; lights.push(LIGHTS.add({ x: (f.x + g.x) / 2, y: f.y, z: (f.z + g.z) / 2, color: '#ffae5c', intensity: 0, distance: 12, decay: 1.6, flicker: 0.14, owner: group })); }
  let t = 0;
  return {
    group, solids: plan.solids, stats: { ...plan.stats, meshes: meshes.length, parts: plan.parts.length },
    setNight(n) { for (const s of flames) s.visible = n > 0.05; for (const h of lights) h.intensity = n > 0.05 ? 9 * n : 0; },
    update(dt) { t += dt; for (let i = 0; i < flames.length; i++) { const f = flames[i]; if (f.visible) f.scale.y = f.userData.s * (1.2 + Math.sin(t * 9 + i) * 0.12); } },
    dispose() { for (const m of meshes) disposeKit(m); mat.dispose(); flameMat.dispose(); for (const h of lights) h.remove(); },
  };
}
