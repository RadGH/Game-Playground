// Bodies: anything made of blocks that sits in space (ships, rocks, wreck chunks, stations). A body's blocks live in
// grid coordinates; its centre of mass is the pivot, and `pos` + `quat` place it in the world.
//   world point = pos + quat · (local point − pivot)      (local points are continuous grid coords; a cell spans x..x+1)

import { computeStats } from './stats.js';
import { BLOCKS, TURRETS } from '../data/blocks.js';
import { partStats } from './items.js';
import { qrot, qinv, qid, v3, vcross, DIRV, vnorm } from '../core/math.js';
import { key } from './grid.js';

let nextId = 1;

/** The frame of a turret mounted on face d: up = the face's normal, yaw 0 looks along `f`. */
export const FACE_BASIS = DIRV.map(n => {
  const f = Math.abs(n.z) > 0.5 ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
  const r = vcross(n, f);   // right = up × forward  (x = y × z)
  return { r, u: n, f };
});

export function createBody(grid, { kind = 'ship', team = 'neutral', pos = v3(), quat = qid(), name = '', faction = null, danger = 1 } = {}) {
  const b = {
    id: nextId++, kind, team, grid, name, faction, danger,
    pos: { ...pos }, quat: { ...quat }, vel: v3(), angVel: v3(),   // angVel is in the body's own frame
    input: { thrust: v3(), aimDir: null, roll: 0, boost: false, fire: false, aimPoint: null },
    dead: false, shield: 0, lastHit: -99, boostE: 1, version: 0, meshVersion: -1,
    turrets: [], target: null, born: 0,
  };
  refresh(b, true);
  if (kind === 'ship') { b.shield = b.stats.shield; b.baseHp = b.stats.maxHp; }
  return b;
}

/** Recompute stats + turret list after the grid changed. Keeps turret aim where it was. */
export function refresh(b, first = false) {
  const old = new Map(b.turrets.map(t => [t.key, t]));
  b.stats = computeStats(b.grid);
  const c = b.stats.com;
  const pivot = { x: c.x + 0.5, y: c.y + 0.5, z: c.z + 0.5 };
  if (!first && b.pivot) {
    // keep the body where it is in the world when its centre of mass shifts
    const d = qrot(b.quat, { x: pivot.x - b.pivot.x, y: pivot.y - b.pivot.y, z: pivot.z - b.pivot.z });
    b.pos.x += d.x; b.pos.y += d.y; b.pos.z += d.z;
  }
  b.pivot = pivot;
  b.radius = b.stats.radius;
  b.turrets = b.stats.turrets.map(blk => {
    const k = key(blk.x, blk.y, blk.z); const prev = old.get(k);
    const def = TURRETS[blk.t]; const s = partStats(blk.item);
    s.turn *= b.stats.turretTurn || 1;   // economy: research turret turn speed (stats.js computeStats)
    return prev && prev.blk === blk ? prev : {
      key: k, blk, kind: blk.t, def, s, item: blk.item, face: blk.r,
      yaw: 0, pitch: 0.15, cd: (k % 97) / 194, charge: 0, beamT: 0, auto: false, firing: false, aim: null, salvoLeft: 0, idle: (k % 61) / 10,
    };
  });
  b.shield = Math.min(b.shield, b.stats.shield);
  b.version++;
}

export const toWorld = (b, p) => { const r = qrot(b.quat, { x: p.x - b.pivot.x, y: p.y - b.pivot.y, z: p.z - b.pivot.z }); return { x: r.x + b.pos.x, y: r.y + b.pos.y, z: r.z + b.pos.z }; };
export const toLocal = (b, p) => { const r = qinv(b.quat, { x: p.x - b.pos.x, y: p.y - b.pos.y, z: p.z - b.pos.z }); return { x: r.x + b.pivot.x, y: r.y + b.pivot.y, z: r.z + b.pivot.z }; };
export const dirToWorld = (b, d) => qrot(b.quat, d);
export const dirToLocal = (b, d) => qinv(b.quat, d);
export const forward = b => qrot(b.quat, { x: 0, y: 0, z: 1 });
export const upOf = b => qrot(b.quat, { x: 0, y: 1, z: 0 });

/** Where a turret sits (world) and its frame (world vectors). */
export function turretFrame(b, t) {
  const blk = t.blk; const B = FACE_BASIS[t.face]; const n = B.u;
  const mount = toWorld(b, { x: blk.x + 0.5 + n.x * 0.62, y: blk.y + 0.5 + n.y * 0.62, z: blk.z + 0.5 + n.z * 0.62 });
  return { mount, r: qrot(b.quat, B.r), u: qrot(b.quat, B.u), f: qrot(b.quat, B.f) };
}
/** The direction a turret's barrels point now (world). */
export function turretDir(fr, yaw, pitch) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
  return vnorm({
    x: fr.r.x * sy * cp + fr.u.x * sp + fr.f.x * cy * cp,
    y: fr.r.y * sy * cp + fr.u.y * sp + fr.f.y * cy * cp,
    z: fr.r.z * sy * cp + fr.u.z * sp + fr.f.z * cy * cp,
  });
}
/** Yaw / pitch that point the turret along world direction d. */
export function aimAngles(fr, d) {
  const x = d.x * fr.r.x + d.y * fr.r.y + d.z * fr.r.z, y = d.x * fr.u.x + d.y * fr.u.y + d.z * fr.u.z, z = d.x * fr.f.x + d.y * fr.f.y + d.z * fr.f.z;
  return { yaw: Math.atan2(x, z), pitch: Math.asin(Math.max(-1, Math.min(1, y))) };
}
export const PITCH_MIN = -0.3, PITCH_MAX = 1.5;      // a turret can dip 17° below its mount face
export const blockDef = blk => BLOCKS[blk.t];
