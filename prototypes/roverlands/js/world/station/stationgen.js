// Lantern Station — the generator for map 'station' (Expansion 1, groundwork for M11). PURE (no DOM / three.js /
// Rapier) and the same on every machine (+ - * / only). Called through ../worldgen.js: generateWorld({ map: 'station' }).
//
// The station is an INTERIOR for floating in zero-g, so it is not a heightfield. It still fills the world contract
// (a tiny flat heightfield far below, so anything that asks heightAt gets an answer) and adds:
//
//   world.gravity = 0, world.sky = 'black', world.space = { hour, sunDir, planet }
//   world.objects   one per wall / floor / ceiling panel: kind 'hull', shape box (base at o.y, like every box object),
//                   yaw 0, `room` (the room or tunnel it belongs to), `glass: true` for a window, `hatch: true` for a
//                   closed hatch. A physics that builds fixed box colliders from objects gets the whole hull for free.
//   world.station   { name, rooms, tunnels, doors, handholds, spots, lights, props, spawn, bounds }
//                   rooms:   [{ id, name, kind, c: [x,y,z], h: [hx,hy,hz] (inside half-sizes), light }]
//                   tunnels: [{ id, a, b, axis, c, h }]   (inside box of the tunnel)
//                   doors:   [{ room, tunnel, face, x, y, z }] (the middle of each open doorway)
//                   handholds: [{ x, y, z, axis, len, room }]   rails 0.12 m off a wall to grab and push off
//                   spots:   [{ id, name, room, x, y, z, note? }]
// Helpers for tests and the physics: insideStation(world, x, y, z) (in a room or tunnel), solidAt(world, x, y, z, pad).

import { SURFACES, SURF, BIOMES, BIOME } from '../world-data.js';
import { STATION } from './station-data.js';

const SIZE = 128, CELL = 4, DIM = SIZE / CELL + 1, HALF = SIZE / 2;   // just round the hull, so the map shows it big
const AX = { x: 0, y: 1, z: 2 };
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function* generateStationSteps(opts = {}) {
  const t0 = now();
  const seed = (Number(opts.seed) || 0) >>> 0;
  yield { progress: 0.1, label: 'pressurising the station' };
  const T = STATION.wall, W = STATION.tunnel;
  const N = DIM * DIM;
  const heights = new Float32Array(N).fill(STATION.floorY);
  const surface = new Uint8Array(N).fill(SURF.concrete);
  const biome = new Uint8Array(N).fill(BIOME.s_station);
  const water = new Float32Array(N).fill(NaN);
  const roadDist = new Float32Array(N).fill(999);

  const rooms = STATION.rooms.map(r => ({ id: r.id, name: r.name, kind: r.kind, c: r.c.slice(), h: r.h.slice(), light: { ...r.light }, openings: (r.openings || []).map(o => ({ ...o })) }));
  const roomById = Object.fromEntries(rooms.map(r => [r.id, r]));

  // tunnels: find the axis the two rooms line up on, and the faces they leave by
  const tunnels = [], doors = [];
  for (const [ai, bi] of STATION.tunnels) {
    const a = roomById[ai], b = roomById[bi];
    let axis = -1;
    for (let q = 0; q < 3; q++) {
      const others = [0, 1, 2].filter(o => o !== q);
      if (others.every(o => Math.abs(a.c[o] - b.c[o]) < 1e-6)) { axis = q; break; }
    }
    if (axis < 0) throw new Error(`station: tunnel ${ai}-${bi} does not line up on one axis`);
    const sgn = b.c[axis] > a.c[axis] ? 1 : -1;
    const fa = a.c[axis] + sgn * a.h[axis], fb = b.c[axis] - sgn * b.h[axis];       // the two inside faces
    const c = a.c.slice(); c[axis] = (fa + fb) / 2;
    const h = [W, W, W]; h[axis] = Math.abs(fb - fa) / 2;
    const id = `${ai}_${bi}`;
    const axisName = 'xyz'[axis];
    tunnels.push({ id, a: ai, b: bi, axis: axisName, c, h });
    a.openings.push({ face: (sgn > 0 ? '+' : '-') + axisName, u: W, v: W, fill: 'open', tunnel: id });
    b.openings.push({ face: (sgn > 0 ? '-' : '+') + axisName, u: W, v: W, fill: 'open', tunnel: id });
    const da = a.c.slice(); da[axis] = fa; const db = b.c.slice(); db[axis] = fb;
    doors.push({ room: ai, tunnel: id, face: (sgn > 0 ? '+' : '-') + axisName, x: da[0], y: da[1], z: da[2] });
    doors.push({ room: bi, tunnel: id, face: (sgn > 0 ? '-' : '+') + axisName, x: db[0], y: db[1], z: db[2] });
  }

  // the hull: every face of every room as slabs, cut round its openings; every tunnel as four slabs
  const objects = [];
  const addBox = (cx, cy, cz, hx, hy, hz, room, extra = {}) => {
    if (hx <= 0.001 || hy <= 0.001 || hz <= 0.001) return;
    objects.push({ id: objects.length, kind: 'hull', x: r3(cx), y: r3(cy - hy), z: r3(cz), yaw: 0, s: 1, shape: { t: 'box', hx: r3(hx), hy: r3(hy), hz: r3(hz) },
      breakAt: null, mass: 0, fall: 'topple', look: extra.glass ? 'glass' : extra.hatch ? 'hatch' : 'hull', room, ...extra });
  };
  /** A box from min / max corners. */
  const addMinMax = (lo, hi, room, extra) => addBox((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2, (hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2, (hi[2] - lo[2]) / 2, room, extra);
  for (const r of rooms) {
    for (const face of ['-x', '+x', '-y', '+y', '-z', '+z']) {
      const n = AX[face[1]], s = face[0] === '+' ? 1 : -1;
      const [ua, va] = [0, 1, 2].filter(q => q !== n);
      // the slab spans the room's inside plus the wall on both in-plane axes (so corners close)
      const lo = [0, 0, 0], hi = [0, 0, 0];
      lo[n] = s > 0 ? r.c[n] + r.h[n] : r.c[n] - r.h[n] - T;
      hi[n] = s > 0 ? r.c[n] + r.h[n] + T : r.c[n] - r.h[n];
      const U = r.h[ua] + T, V = r.h[va] + T;
      const holes = r.openings.filter(o => o.face === face);
      if (!holes.length) { lo[ua] = r.c[ua] - U; hi[ua] = r.c[ua] + U; lo[va] = r.c[va] - V; hi[va] = r.c[va] + V; addMinMax(lo, hi, r.id); continue; }
      if (holes.length > 1) throw new Error(`station: ${r.id} ${face} has more than one opening`);
      const o = holes[0], ou = o.ou || 0, ov = o.ov || 0;
      const u0 = ou - o.u, u1 = ou + o.u, v0 = ov - o.v, v1 = ov + o.v;
      if (u0 < -r.h[ua] || u1 > r.h[ua] || v0 < -r.h[va] || v1 > r.h[va]) throw new Error(`station: ${r.id} ${face} opening is bigger than the wall`);
      const piece = (a0, a1, b0, b1, extra) => {
        const L = lo.slice(), Hh = hi.slice();
        L[ua] = r.c[ua] + a0; Hh[ua] = r.c[ua] + a1; L[va] = r.c[va] + b0; Hh[va] = r.c[va] + b1;
        addMinMax(L, Hh, r.id, extra);
      };
      piece(-U, u0, -V, V); piece(u1, U, -V, V);          // full-height strips either side
      piece(u0, u1, -V, v0); piece(u0, u1, v1, V);        // above and below the hole
      if (o.fill === 'glass') piece(u0, u1, v0, v1, { glass: true, face });
      else if (o.fill === 'hatch') piece(u0, u1, v0, v1, { hatch: true, face });
    }
  }
  for (const t of tunnels) {
    const n = AX[t.axis];
    for (const q of [0, 1, 2]) {
      if (q === n) continue;
      for (const s of [-1, 1]) {
        const lo = [0, 0, 0], hi = [0, 0, 0];
        lo[n] = t.c[n] - t.h[n]; hi[n] = t.c[n] + t.h[n];
        lo[q] = s > 0 ? t.c[q] + W : t.c[q] - W - T; hi[q] = s > 0 ? t.c[q] + W + T : t.c[q] - W;
        const o = 3 - n - q;
        lo[o] = t.c[o] - W - T; hi[o] = t.c[o] + W + T;
        addMinMax(lo, hi, t.id);
      }
    }
  }

  // handholds: a rail along the middle of each solid side wall of each room, and down both sides of each tunnel
  const handholds = [];
  const rail = (x, y, z, axis, len, room) => handholds.push({ x: r3(x), y: r3(y), z: r3(z), axis, len: r3(len), r: 0.035, room });
  for (const r of rooms) {
    for (const face of ['-x', '+x', '-z', '+z', '-y', '+y']) {
      const n = AX[face[1]], s = face[0] === '+' ? 1 : -1;
      const [ua, va] = [0, 1, 2].filter(q => q !== n);
      // run the rail along the longer in-plane axis, at the wall's middle (pushed to one side if a hole is there)
      const along = r.h[ua] >= r.h[va] ? ua : va, across = along === ua ? va : ua;
      const hole = r.openings.find(o => o.face === face);
      let off = 0;
      if (hole) {
        const hAcross = across === ua ? hole.u : hole.v, oAcross = across === ua ? (hole.ou || 0) : (hole.ov || 0);
        off = oAcross + hAcross + 0.35;
        if (off > r.h[across] - 0.25) continue;
      }
      const p = r.c.slice();
      p[n] = r.c[n] + s * (r.h[n] - 0.12);
      p[across] = r.c[across] + off;
      rail(p[0], p[1], p[2], 'xyz'[along], Math.min(r.h[along] * 2 - 1.2, 6), r.id);
    }
  }
  for (const t of tunnels) {
    const n = AX[t.axis];
    for (const q of [0, 1, 2]) {
      if (q === n) continue;
      for (const s of [-1, 1]) {
        const p = t.c.slice(); p[q] = t.c[q] + s * (W - 0.12);
        if (t.h[n] * 2 > 1.2) rail(p[0], p[1], p[2], t.axis, t.h[n] * 2 - 0.6, t.id);
      }
    }
  }

  const spots = STATION.spots.map(s => ({ id: s.id, name: s.name, room: s.room, x: s.at[0], y: s.at[1], z: s.at[2], ...(s.note ? { note: s.note } : {}) }));
  const lights = rooms.map(r => ({ room: r.id, x: r.c[0], y: r.c[1] + r.h[1] - 0.25, z: r.c[2], colour: r.light.colour, power: r.light.power, range: Math.max(r.h[0], r.h[1], r.h[2]) * 2.6 }));
  const props = STATION.props.map(([room, kind, x, y, z, hx, hy, hz]) => ({ room, kind, x, y, z, hx, hy, hz }));
  let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const o of objects) {
    const c = [o.x, o.y + o.shape.hy, o.z], h = [o.shape.hx, o.shape.hy, o.shape.hz];
    for (let q = 0; q < 3; q++) { lo[q] = Math.min(lo[q], c[q] - h[q]); hi[q] = Math.max(hi[q], c[q] + h[q]); }
  }
  const spawn = spots.find(s => s.id === STATION.spawn);

  const nearestK = (x, z) => clampI(Math.round((z + HALF) / CELL), 0, DIM - 1) * DIM + clampI(Math.round((x + HALF) / CELL), 0, DIM - 1);
  const world = {
    seed, map: 'station', name: STATION.name, size: SIZE, cell: CELL, dim: DIM, interior: true,
    heights, surface, biome, water, roadDist,
    waterLevel: -1e4,
    gravity: STATION.gravity, sky: 'black', space: JSON.parse(JSON.stringify(STATION.space)),
    heightAt: () => STATION.floorY,
    normalAt(x, z, out) { if (out) { out.x = 0; out.y = 1; out.z = 0; return out; } return [0, 1, 0]; },
    slopeAt: () => 0,
    surfaceIdAt: (x, z) => surface[nearestK(x, z)],
    surfaceAt: (x, z) => SURFACES[surface[nearestK(x, z)]],
    biomeIdAt: (x, z) => biome[nearestK(x, z)],
    biomeAt: (x, z) => BIOMES[biome[nearestK(x, z)]].label,
    waterAt: () => null,
    roadDistAt: () => 999,
  };
  const labels = rooms.map(r => ({ x: Math.round(r.c[0]), z: Math.round(r.c[2]), text: r.name, kind: r.kind === 'dock' || r.kind === 'airlock' ? 'base' : 'place' }));
  world.station = {
    name: STATION.name,
    rooms: rooms.map(r => ({ id: r.id, name: r.name, kind: r.kind, c: r.c, h: r.h, light: r.light,
      windows: r.openings.filter(o => o.fill === 'glass').map(o => o.face), hatches: r.openings.filter(o => o.fill === 'hatch').map(o => o.face) })),
    tunnels, doors, handholds, spots, lights, props,
    spawn: { x: spawn.x, y: spawn.y, z: spawn.z, id: spawn.id },
    bounds: { lo: lo.map(r3), hi: hi.map(r3) },
  };
  world.sites = {
    home: { x: spawn.x, z: spawn.z, y: spawn.y, r: 2, place: 'dock' }, flags: [], pads: [], ramps: [], bridges: [], labels,
    places: rooms.map(r => ({ id: 'station_' + r.id, kind: r.kind, city: null, name: r.name, x: r.c[0], z: r.c[2], y: r.c[1], yaw: 0, r: Math.min(r.h[0], r.h[2]) })),
    shops: [], survey: [], spots,
    dock: { x: -32 - T, y: 0, z: 0, face: '-x', room: 'dock', note: 'the rocket docks against the hatch on the dock\'s west end' },
    airlock: { inner: spots.find(s => s.id === 'airlock_inner'), outer: spots.find(s => s.id === 'airlock_outer') },
  };
  world.labels = labels;
  world.objects = objects;
  world.decor = [];
  world.roads = [];
  world.roadGraph = { nodes: [], edges: [] };
  world.river = { pts: [] };
  world.lakes = [];
  world.stats = { ms: Math.round(now() - t0), objects: objects.length, handholds: handholds.length, rooms: rooms.length, tunnels: tunnels.length };
  yield { progress: 1, label: 'ready', world };
  return world;
}

/** The room or tunnel (id) that holds (x, y, z) inside it, or null. */
export function insideStation(world, x, y, z) {
  const st = world.station;
  for (const b of [...st.rooms, ...st.tunnels]) {
    if (Math.abs(x - b.c[0]) <= b.h[0] && Math.abs(y - b.c[1]) <= b.h[1] && Math.abs(z - b.c[2]) <= b.h[2]) return b.id;
  }
  return null;
}

/** The hull panel that (x, y, z) is in (grown by `pad` m on every side), or null. */
export function solidAt(world, x, y, z, pad = 0) {
  for (const o of world.objects) {
    if (o.kind !== 'hull') continue;
    const s = o.shape;
    if (Math.abs(x - o.x) <= s.hx + pad && Math.abs(y - (o.y + s.hy)) <= s.hy + pad && Math.abs(z - o.z) <= s.hz + pad) return o;
  }
  return null;
}

function clampI(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function r3(v) { return Math.round(v * 1000) / 1000; }
