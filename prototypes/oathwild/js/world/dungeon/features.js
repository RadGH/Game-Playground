// Oathwild dungeons — the things in a dungeon that are more than floor and wall (brainstorm 2026-11-27-regions §3).
// Pure. plan.js calls the placers while it builds the grid; the game calls the state helpers.
//
//   CODE                                 tile codes in plan.cells
//   featureState(plan, saved?)           → { open: { <gate or secret id>: bool } }  (JSON-safe; keep it in the world save)
//   pullLever(plan, state, leverId, walk?) → { gate, open }   flips the lever's gate; tells the walk grid (walk.setOpen)
//   openSecret(plan, state, id, walk?)   → true              a secret door, once found, stays open
//   isOpen(state, id)
//
// Feature kinds in plan.features:
//   gate        { id, room, corridor, tiles[], at, facing, width, lever, leverRoom }  shut = a wall in the walk grid
//   lever       { id, room, at, facing, gate }                    pulled where it stands (not solid)
//   secret      { id, room, from, corridor, tiles[], at, facing }  shut = rock (walk AND sight); the room behind is a hoard
//   chasm       { id, room, rect, depth, bridge: { id, rect, y } } the pit is never walkable; the bridge is plain floor
//   sarcophagus { id, room, at, facing, r, h, solid, loot, skeleton }  lootable; solid for feet, too low for the camera
//   bone_wall   { id, room, from, to, gaps[] }                    ossuary walls of stacked bones (drawing only)

export const CODE = { ROCK: 0, FLOOR: 1, CHASM: 2, GATE: 3, SECRET: 4 };
const TILE = 2;
const r2 = v => Math.round(v * 100) / 100;
const rectM = r => [r.x * TILE, r.z * TILE, (r.x + r.w) * TILE, (r.z + r.h) * TILE];

// ---------------------------------------------------------------- placers (plan.js)

/** A pit 8 m wide across the room, square to the way in, with one 6 m bridge. Rects in tiles. */
export function chasmStrip(r, rng) {
  const horiz = r.inDir === 'E' || r.inDir === 'W';
  const perp = horiz ? r.h : r.w;
  const b = rng.int(3, Math.max(3, perp - 6));                   // the bridge keeps ≥ 6 m from either wall
  if (horiz) {
    const x = r.x + Math.floor(r.w / 2) - 2;
    return { tiles: { x, z: r.z, w: 4, h: r.h }, bridgeTiles: { x, z: r.z + b, w: 4, h: 3 } };
  }
  const z = r.z + Math.floor(r.h / 2) - 2;
  return { tiles: { x: r.x, z, w: r.w, h: 4 }, bridgeTiles: { x: r.x + b, z, w: 3, h: 4 } };
}

/** Sarcophagi along the walls of a crypt, 2.5 m out, kept clear of the doors and corners. */
export function sarcophagiFor(r, rng, doors, hoard = false) {
  const [x0, z0, x1, z1] = rectM(r), off = 2.5;
  const spots = [];
  for (let x = x0 + 4; x <= x1 - 4; x += 4) { spots.push([x, z0 + off, 0]); spots.push([x, z1 - off, Math.PI]); }
  for (let z = z0 + 4; z <= z1 - 4; z += 4) { spots.push([x0 + off, z, Math.PI / 2]); spots.push([x1 - off, z, -Math.PI / 2]); }
  const clear = spots.filter(([x, z]) => doors.every(d => Math.hypot(x - d.at[0], z - d.at[1]) > d.width / 2 + 4));
  const n = Math.min(clear.length, rng.int(4, 7));
  const out = rng.shuffle(clear).slice(0, n).map(([x, z, f], j) => ({ id: `sarc-${r.id}-${j}`, kind: 'sarcophagus', room: r.id, at: [r2(x), r2(z)], facing: r2(f),
    r: 0.8, h: 1.2, solid: true, loot: 'sarcophagus', skeleton: rng() < 0.3 }));
  if (hoard) out.push({ id: `hoard-${r.id}`, kind: 'sarcophagus', room: r.id, at: [r2((x0 + x1) / 2), r2((z0 + z1) / 2)], facing: 0, r: 1, h: 1.4, solid: true, loot: 'hoard', skeleton: false });
  return out;
}

/** Bone-stacked walls round an ossuary (drawing only), with a gap at each door. */
export function boneWallsFor(r, doors) {
  const [x0, z0, x1, z1] = rectM(r);
  const walls = [[[x0, z0], [x1, z0]], [[x1, z0], [x1, z1]], [[x1, z1], [x0, z1]], [[x0, z1], [x0, z0]]];
  return walls.map(([a, b], j) => {
    const gaps = doors.filter(d => onSegment(d.at, a, b)).map(d => { const along = Math.hypot(d.at[0] - a[0], d.at[1] - a[1]); return [r2(along - d.width / 2 - 1), r2(along + d.width / 2 + 1)]; });
    return { id: `bones-${r.id}-${j}`, kind: 'bone_wall', room: r.id, from: a, to: b, gaps };
  });
}
const onSegment = (p, a, b) => Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) < 1e-6 && p[0] >= Math.min(a[0], b[0]) - 1e-6 && p[0] <= Math.max(a[0], b[0]) + 1e-6 && p[1] >= Math.min(a[1], b[1]) - 1e-6 && p[1] <= Math.max(a[1], b[1]) + 1e-6;

/** The lever for a gate: on the far wall of its room, 1.5 m out, facing in. Renames gate.lever to the lever's id. */
export function leverFor(room, gate, doors) {
  const [x0, z0, x1, z1] = room.rect || rectM(room), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const d = doors[0];
  let dx = cx - d.at[0], dz = cz - d.at[1];
  const along = Math.abs(dx) > Math.abs(dz);
  const at = along ? [dx > 0 ? x1 - 1.5 : x0 + 1.5, cz] : [cx, dz > 0 ? z1 - 1.5 : z0 + 1.5];
  const id = `lever-${gate.id}`;
  gate.leverRoom = room.id; gate.lever = id;
  return { id, kind: 'lever', room: room.id, at: at.map(r2), facing: r2(Math.atan2(cx - at[0], cz - at[1])), gate: gate.id };
}

// ---------------------------------------------------------------- state (the game)

export function featureState(plan, saved = null) {
  const open = {};
  for (const f of plan.features) if (f.kind === 'gate' || f.kind === 'secret') open[f.id] = !!(saved?.open?.[f.id] ?? f.open);
  return { open };
}
export const isOpen = (state, id) => !!state.open[id];

export function pullLever(plan, state, leverId, walk = null) {
  const lever = plan.features.find(f => f.id === leverId && f.kind === 'lever');
  if (!lever) return null;
  const open = !state.open[lever.gate];
  state.open[lever.gate] = open;
  walk?.setOpen(lever.gate, open);
  return { gate: lever.gate, open };
}
export function openSecret(plan, state, id, walk = null) {
  if (!plan.features.some(f => f.id === id && f.kind === 'secret')) return false;
  state.open[id] = true;
  walk?.setOpen(id, true);
  return true;
}
