// Stream E — the SET PIECES (owner play-test 2, Q18: "more bespoke areas, especially near the start: graveyards,
// farmlands, …"). Hand-designed places from data/vignettes/setpieces.json, pinned near the start by their `pin`:
//
//   pin.zone        the E zone it belongs in (only that zone's run places it)
//   pin.near        'Torborhold' (any settlement name) | '<set piece id>' placed earlier
//   pin.fromEdge    [min, max] metres from the settlement's EDGE to the set piece's centre
//   pin.dist        [min, max] metres from the near thing's centre
//   pin.route       a route id from data/provinces/<prov>-routes.json: stand by that road (dist = metres from the hub)
//   pin.road        the disc edge within this many metres of a road (and the set piece faces it)
//   pin.water       open water within this many metres of the disc edge; pin.waterSide '-z' turns the back to it
//   pin.biome       prefer ground with this World Forge biome within pin.biomeWithin metres
//   pin.awayFromRoad  the centre at least this far from any road
//   pin.high        prefer a rise (higher than the ground 60 m round)
//
// Placed BEFORE forts, farms and vignettes so they get the best ground. Each becomes a `vignette` record with
// `setpiece: true` (stream A's vignetteContent already reads props/monsters/objects; js/client reads parts/models/
// buildings/fields), plus: a `rare` record for a set piece `boss` (in = the set piece, short respawn: a quest boss),
// `folk` records for its workers (in = the set piece, world path in zone metres). `ground` goes to stream B as a
// terrain ask (flat/surface) through the record itself (B reads our placements every bake).
import { findSpot, settlementEdge, ROAD_GAP, openPoint, walkLine, discProblem } from './content-place.mjs';
import { vignettePoint } from '../js/sim/vignettes.js';


/**
 * Place every set piece of zone `eid`. `ctx` = the zone context; `hubAt(x, z)` = metres from the province hub;
 * `routes` = the routes file (world metres) and `org` = this zone's world origin [x, z]. Pushes records via `push`.
 */
export function placeSetpieces({ list, eid, ctx, rnd, push, problems, terrain, lvlFloor, top, hubAt, routes = null, org = [0, 0], faceRoad, bake = [], pins = {} }) {
  const mine = list.filter(v => v.setpiece && v.pin && v.pin.zone === eid);
  // pieces bound onto stream B's ground go first (B's spot is fixed: the free ones keep clear of them), then the free
  // ones, those pinned to another set piece last
  const isBound = v => !!(v.bind && v.bind.zone === eid && bake.some(b => b.kind === 'set_piece' && b.id === v.bind.piece));
  mine.sort((a, b) => (isBound(b) - isBound(a)) || ((isSp(a.pin.near) ? 1 : 0) - (isSp(b.pin.near) ? 1 : 0)));
  const placed = new Map();
  for (const v of mine) {
    const pin = v.pin, R = v.radius;
    const near = nearOf(pin);
    if (pin.near && !near && !pin.route) { problems.push(`setpiece ${v.id}: nothing called ${pin.near}`); continue; }
    // bound onto stream B's baked ground piece (play-test 2): B's spot, B's facing, scaled into B's radius
    const piece = v.bind && v.bind.zone === eid ? bake.find(b => b.kind === 'set_piece' && b.id === v.bind.piece) : null;
    if (v.bind && v.bind.zone === eid && !piece) problems.push(`setpiece ${v.id}: stream B's piece ${v.bind.piece} is not in the bake — placed on its own`);
    if (piece) {
      // the centre: B's piece centre when it is open ground, else (a mill pond, a stone ring) the first worker slot on
      // open ground — our objects and folk stand round it, inside a smaller circle
      let c = { x: piece.x, z: piece.z }, pr = piece.data.r || R;
      if (!openPoint(ctx, c.x, c.z, { allowSolid: true, allowRoad: true, slope: 35 })) {
        const sl = (piece.data.slots || []).find(q => Number.isFinite(q.x) && openPoint(ctx, q.x, q.z, { allowSolid: true, allowRoad: true, slope: 35 }));
        if (sl) { c = { x: sl.x, z: sl.z }; pr = Math.min(pr, 12); }
      }
      const scale = +Math.min(1, pr / R).toFixed(3);
      const lv = lvlFloor(c.x, c.z);
      const rec = push({ type: 'vignette', setpiece: true, id: v.id, name: v.name, kind: v.kind, x: +c.x.toFixed(1), z: +c.z.toFixed(1), yaw: +(piece.yaw || 0).toFixed(2), radius: +pr.toFixed(1),
        bound: piece.id, scale, biome: terrain.biomes[terrain.biomeAt(c.x, c.z)].key, biomeFits: true, ground: null,
        level: 1, levelBase: lv, levelCap: Math.min(top, lv + 1), hub: Math.round(hubAt(c.x, c.z)) });
      placed.set(v.id, rec);
      extras(v, rec, lv, scale);
      continue;
    }
    const score = scoreFor(v);
    let spot = null;
    // the spot it had last time, while it is still fair (data/provinces/setpiece-pins.json): stream B shapes the ground
    // under our discs on every bake, so a set piece that moved after each bake would chase its own levelled ground
    const was = pins[v.id];
    if (was && !discProblem(ctx, 'setpiece', was.x, was.z, R) && score(was.x, was.z) !== -Infinity) spot = { x: was.x, z: was.z, yaw: was.yaw };
    if (spot) { /* kept */ }
    else if (pin.route) spot = routeSpot(v);
    else for (const widen of [0, 60, 160]) {
      const ann = annulus(near, pin, widen);
      spot = findSpot(ctx, rnd, 'setpiece', R, { near: ann, tries: 4000, spread: 0.2, score });
      if (spot) break;
    }
    if (!spot) { problems.push(`setpiece ${v.id}`); continue; }
    const yaw = spot.yaw ?? yawFor(v, spot);
    const lv = lvlFloor(spot.x, spot.z);
    const rec = push({ type: 'vignette', setpiece: true, id: v.id, name: v.name, kind: v.kind, x: spot.x, z: spot.z, yaw, radius: R,
      biome: terrain.biomes[terrain.biomeAt(spot.x, spot.z)].key, biomeFits: true, ground: v.ground || null,
      level: 1, levelBase: lv, levelCap: Math.min(top, lv + 1), hub: Math.round(hubAt(spot.x, spot.z)) });
    placed.set(v.id, rec);
    extras(v, rec, lv, 1);
  }
  return placed;

  /** a set piece's boss (a `rare` record inside it, short respawn) and its folk (world paths in zone metres) */
  function extras(v, rec, lv, scale) {
    if (v.boss) {
      const bl = Math.max(lv + 1, 2);
      push({ type: 'rare', id: v.boss, slot: null, name: null, in: v.id, questBoss: true, x: rec.x, z: rec.z, yaw: 0, path: null, respawnMin: [2, 4], level: Math.min(top + 1, Math.max(4, bl)) });
    }
    (v.folk || []).forEach((f, i) => {
      const L = (lx, lz) => vignettePoint(rec, lx * scale, lz * scale);
      const at = L(f.x || 0, f.z || 0);
      let path = (f.path || [[f.x || 0, f.z || 0], [(f.x || 0) + 2, (f.z || 0) + 1]]).map(([lx, lz]) => { const w = L(lx, lz); return [+w.x.toFixed(1), +w.z.toFixed(1)]; });
      // a loop that crosses a wall or a building on B's ground (or before B clears the disc): a small loop round the
      // nearest open point instead; no open point, no worker
      const ok = pts => pts.every((q, k) => walkLine(ctx, { x: q[0], z: q[1] }, { x: pts[(k + 1) % pts.length][0], z: pts[(k + 1) % pts.length][1] }));
      if (!ok(path)) {
        path = null;
        for (let r = 0; r <= rec.radius && !path; r += 2) for (let a = 0; a < 8 && !path; a++) {
          const x = at.x + Math.cos(a * 0.785) * r, z = at.z + Math.sin(a * 0.785) * r;
          const loop = [[x, z], [x + 2, z + 1], [x + 0.5, z + 2.2]].map(([qx, qz]) => [+qx.toFixed(1), +qz.toFixed(1)]);
          if (Math.hypot(x - rec.x, z - rec.z) <= rec.radius && ok(loop)) path = loop;
        }
        if (!path) return;
      }
      push({ type: 'folk', id: `${v.id}_folk${i}`, in: v.id, role: f.role, name: f.name || null, work: f.work || null, chatter: f.chatter || null, x: path[0][0], z: path[0][1], yaw: 0, path });
    });
  }

  function isSp(s) { return typeof s === 'string' && s.startsWith('sp_'); }
  function nearOf(pin) {
    if (!pin.near) return null;
    if (isSp(pin.near)) { const p = placed.get(pin.near) || ctx.placed.find(q => q.id === pin.near); return p ? { x: p.x, z: p.z, r: p.radius } : null; }
    const s = ctx.settlements.find(q => q.name === pin.near);
    return s ? { x: s.x, z: s.z, r: s.r } : null;
  }
  function annulus(n, pin, widen) {
    if (!n) return null;
    if (pin.fromEdge) return { x: n.x, z: n.z, min: Math.max(0, n.r + pin.fromEdge[0] - widen * 0.3), max: n.r + pin.fromEdge[1] + widen };
    const d = pin.dist || [n.r + 60, n.r + 600];
    return { x: n.x, z: n.z, min: Math.max(0, d[0] - widen * 0.3), max: d[1] + widen };
  }
  function scoreFor(v) {
    const pin = v.pin, R = v.radius;
    return (x, z) => {
      let s = 0;
      if (pin.water != null) { const wd = ctx.waterDist(x, z) - R; if (wd > pin.water) return -Infinity; s += 60 - wd; }
      if (pin.road != null) { const rd = ctx.roadDist(x, z) - R; if (rd > pin.road) return -Infinity; s += 40 - rd; }
      if (pin.awayFromRoad != null && ctx.roadDist(x, z) < pin.awayFromRoad) return -Infinity;
      if (pin.biome) s += biomeNear(x, z, pin.biome, pin.biomeWithin || 40) ? 120 : 0;
      if (pin.high) s += rise(x, z) * 6;
      return s;
    };
  }
  function biomeNear(x, z, key, within) {
    const B = k => terrain.biomes[terrain.biomeAt(k[0], k[1])].key;
    for (let a = 0; a < 8; a++) for (const f of [0.5, 1]) { const px = x + Math.cos(a * 0.785) * within * f, pz = z + Math.sin(a * 0.785) * within * f; if (px > 0 && pz > 0 && px < ctx.extent && pz < ctx.extent && B([px, pz]) === key) return true; }
    return B([x, z]) === key;
  }
  function rise(x, z) {
    const h = terrain.heightAt(x, z); let m = 0, n = 0;
    for (let a = 0; a < 8; a++) { const px = x + Math.cos(a * 0.785) * 60, pz = z + Math.sin(a * 0.785) * 60; if (px > 0 && pz > 0 && px < ctx.extent && pz < ctx.extent) { m += terrain.heightAt(px, pz); n++; } }
    return n ? h - m / n : 0;
  }
  /** a spot beside the named route's road, at `dist` metres (from the hub) along it */
  function routeSpot(v) {
    const pin = v.pin, R = v.radius;
    const r = routes && routes.routes.find(q => q.id === pin.route);
    if (!r) { problems.push(`setpiece ${v.id}: no route ${pin.route}`); return null; }
    const d = pin.dist || [400, 900];
    const pts = r.pts.map(([x, z]) => ({ x: x - org[0], z: z - org[1] })).filter(p => p.x > 0 && p.z > 0 && p.x < ctx.extent && p.z < ctx.extent)
      .map(p => ({ ...p, h: hubAt(p.x, p.z) })).filter(p => p.h >= d[0] && p.h <= d[1]);
    const mid = (d[0] + d[1]) / 2;
    pts.sort((a, b) => Math.abs(a.h - mid) - Math.abs(b.h - mid));
    for (const p of pts) {
      const s = findSpot(ctx, rnd, 'setpiece', R, { near: { x: p.x, z: p.z, min: R + ROAD_GAP + 1, max: R + (pin.road || 30) + 6 }, tries: 800, spread: 0, score: (x, z) => -Math.abs(ctx.roadDist(x, z) - R - ROAD_GAP - 3) });
      if (s) return s;
    }
    return null;
  }
  function yawFor(v, s) {
    const pin = v.pin;
    if (pin.water != null && pin.waterSide === '-z') {
      let best = 0, bd = Infinity;
      for (let a = 0; a < 16; a++) { const ax = Math.sin(a / 16 * 6.283), az = Math.cos(a / 16 * 6.283); const d = ctx.waterDist(s.x + ax * (v.radius + 6), s.z + az * (v.radius + 6)); if (d < bd) { bd = d; best = a / 16 * 6.283; } }
      return +((best + Math.PI) % (Math.PI * 2)).toFixed(2);     // local -z (the back) toward the water
    }
    if (pin.road != null || pin.route || pin.near === 'Torborhold') return faceRoad(s);
    return +(rnd() * Math.PI * 2).toFixed(2);
  }
}

/** Is a placement disc one a set piece owns (its boss, its folk)? Those sit inside the set piece's disc on purpose. */
export const insideSetpiece = (a, b) => !!a && !!b && (a.in === b.id || b.in === a.id);
void settlementEdge;

/**
 * Stream B's set pieces that carry none of our set pieces still have people's places marked (`data.slots`: a gravedigger
 * by a graveyard's gate, a farmer in a farmyard, a picker in an orchard, an innkeeper at a crossroads inn…): put a
 * worker there (`folk`, a small walkable loop round the slot) so B's ground is never an empty stage.
 */
export const SLOT_FOLK = { gravedigger: 'sexton', farmer: 'farmer', picker: 'orchard_keeper', miller: 'miller', shepherd: 'shepherd', innkeeper: 'innkeeper', stablehand: 'stablehand' };
export function slotFolk({ bake, eid, push, ctx, walkLine, taken = new Set(), chatterFor = () => null }) {
  let n = 0;
  for (const b of bake.filter(q => q.kind === 'set_piece' && !taken.has(q.id))) {
    for (const [k, sl] of (b.data.slots || []).entries()) {
      const role = SLOT_FOLK[sl.kind];
      if (!role || !Number.isFinite(sl.x)) continue;
      const loop = [[sl.x, sl.z], [sl.x + 2.5, sl.z + 1], [sl.x + 1, sl.z + 2.5]].map(([x, z]) => [+x.toFixed(1), +z.toFixed(1)]);
      const pts = loop.map(([x, z]) => ({ x, z }));
      if (!pts.every((p, i) => walkLine(ctx, p, pts[(i + 1) % pts.length]))) continue;
      push({ type: 'folk', id: `${b.id}_slot${k}`, in: b.id, slotOf: b.id, role, name: null, work: sl.kind === 'picker' ? 'tend' : sl.kind === 'gravedigger' ? 'dig' : sl.kind === 'farmer' ? 'farm' : 'tend', chatter: chatterFor(role), x: loop[0][0], z: loop[0][1], yaw: 0, path: loop });
      n++;
    }
  }
  void eid;
  return n;
}
