// Where the County's emergency and haul jobs happen (Expansion 1 M7): PURE, read off the finished road network, so the
// same seed always gives the same spots. countygen.js stores the result as `world.sites.jobSpots`; the job referees
// (js/game/jobs/{ambulance,patrol,tow,haul}.js) read it in the room and the page reads it to draw the scenes. A map
// without it (the old world) has none of these jobs.
//
//   jobSpots({ roads, heightAt, waterAt, riverZ, gorge, cities }) -> {
//     crash:  [{ id, x, z, y, yaw, road }]   a car off the road on a highway shoulder (ambulance levels 1-2)
//     hiker:  [...]                          a walker hurt beside the Highgate switchback (ambulance level 3)
//     gorge:  [...]                          the floor of Tollen Gorge, beside the river (ambulance level 4: helicopter)
//     wreck:  { shoulder, ditch, cliff, heavy }   broken-down cars (tow levels 1-4)
//     chase:  { vale, mountain, highway }    { name, pts: [[x, z, y], …] every ~6 m } routes a runaway car drives
//     stops:  { <cityId>: [{ id, x, z, y }] }      parcel drop-offs on a town's streets (haul level 1)
//   }
// Every spot is dry ground; shoulder spots sit just off the tarmac on the side whose ground is nearest the road's height.

const r2 = v => Math.round(v * 100) / 100;

/** A point `t` (0..1) of the way along a polyline [[x, z, y], …], with its heading (yaw: atan2(dx, dz)). */
export function along(pts, t) {
  let len = 0; const seg = [];
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); len += d; }
  let want = Math.max(0, Math.min(1, t)) * len;
  for (let i = 0; i < seg.length; i++) {
    if (want <= seg[i] || i === seg.length - 1) {
      const k = seg[i] ? Math.min(1, want / seg[i]) : 0, a = pts[i], b = pts[i + 1];
      return { x: a[0] + (b[0] - a[0]) * k, z: a[1] + (b[1] - a[1]) * k, y: (a[2] ?? 0) + ((b[2] ?? 0) - (a[2] ?? 0)) * k, yaw: Math.atan2(b[0] - a[0], b[1] - a[1]) };
    }
    want -= seg[i];
  }
  const p = pts[pts.length - 1]; return { x: p[0], z: p[1], y: p[2] ?? 0, yaw: 0 };
}
/** Every `step` metres along a polyline (keeps both ends). */
export function resample(pts, step = 6) {
  if (pts.length < 2) return pts.slice();
  const out = [pts[0].slice()]; let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let s = step - carry;
    while (s <= d) { const k = s / d; out.push([r2(a[0] + (b[0] - a[0]) * k), r2(a[1] + (b[1] - a[1]) * k), r2((a[2] ?? 0) + ((b[2] ?? 0) - (a[2] ?? 0)) * k)]); s += step; }
    carry = d - (s - step);
  }
  const last = pts[pts.length - 1];
  if (Math.hypot(out[out.length - 1][0] - last[0], out[out.length - 1][1] - last[1]) > 1) out.push(last.slice());
  return out;
}

export function jobSpots({ roads = [], heightAt = () => 0, waterAt = () => null, riverZ = null, gorge = null, cities = [] } = {}) {
  const dry = (x, z) => waterAt(x, z) == null;
  /** Just off the road at fraction t: `off` m beyond the road's edge on the side whose ground is nearest the road. */
  function shoulder(r, t, off, { lower = false } = {}) {
    const a = along(r.pts, t), nx = Math.cos(a.yaw), nz = -Math.sin(a.yaw);      // the road's right-hand side
    let best = null;
    for (const s of [1, -1]) {
      const d = (r.halfW || 4) + off, x = a.x + nx * d * s, z = a.z + nz * d * s;
      if (!dry(x, z)) continue;
      const y = heightAt(x, z), drop = a.y - y;
      // a ditch wants ground a little lower than the road; everything else wants ground at the road's height
      const score = lower ? (drop >= 0.4 && drop <= 5 ? Math.abs(drop - 1.5) : 99 + Math.abs(drop)) : Math.abs(drop);
      if (!best || score < best.score) best = { x: r2(x), z: r2(z), y: r2(y), yaw: r2(a.yaw), score };
    }
    if (!best || best.score > (lower ? 98 : 3)) return null;
    delete best.score; return best;
  }
  const byKind = k => roads.filter(r => r.kind === k && r.pts?.length > 4);
  const out = { crash: [], hiker: [], gorge: [], wreck: { shoulder: [], ditch: [], cliff: [], heavy: [] }, chase: {}, stops: {} };
  const add = (list, id, p, road) => { if (p) list.push({ id, ...p, road }); };

  const highways = byKind('highway');
  highways.forEach((r, k) => {
    add(out.crash, `crash_${k}`, shoulder(r, 0.5, 2.5), r.id);
    add(out.wreck.heavy, `heavy_${k}`, shoulder(r, 0.28, 3.5), r.id);
  });
  for (const [k, r] of [...byKind('lane'), ...highways].entries()) {
    add(out.wreck.shoulder, `shoulder_${k}`, shoulder(r, 0.72, 2.5), r.id);
    if (k % 2 === 0) add(out.wreck.ditch, `ditch_${k}`, shoulder(r, 0.4, 5.5, { lower: true }), r.id);
  }
  for (const r of byKind('switchback')) [0.3, 0.5, 0.7].forEach((t, k) => add(out.hiker, `hiker_${k}`, shoulder(r, t, 2), r.id));
  for (const r of byKind('mountain')) [0.35, 0.6, 0.8].forEach((t, k) => add(out.wreck.cliff, `cliff_${r.id}_${k}`, shoulder(r, t, 2.2), r.id));
  for (const r of byKind('switchback')) [0.45, 0.85].forEach((t, k) => add(out.wreck.cliff, `cliff_sb_${k}`, shoulder(r, t, 2.2), r.id));

  // the gorge floor: dry ground beside the river, between the walls (well clear of the bridge in the middle)
  if (gorge && riverZ) {
    const mid = (gorge.x0 + gorge.x1) / 2;
    for (const x of [gorge.x0 + 90, gorge.x0 + 150, gorge.x1 - 140, gorge.x1 - 80]) {
      if (Math.abs(x - mid) < 60) continue;
      const rz = riverZ(x);
      for (let d = 6; d <= 40; d += 2) {
        const z = [rz + d, rz - d].find(zz => dry(x, zz));
        if (z == null) continue;
        out.gorge.push({ id: `gorge_${out.gorge.length}`, x: r2(x), z: r2(z), y: r2(heightAt(x, z)), yaw: 0 }); break;
      }
    }
  }

  // runaway routes: roads joined end to end by their node names
  const chain = (name, legs) => {
    const pts = [];
    for (const [from, to] of legs) {
      const r = roads.find(q => q.from === from && q.to === to) || roads.find(q => q.from === to && q.to === from);
      if (!r) return;
      let p = r.pts.map(q => [q[0], q[1], q[2]]);
      if (r.from !== from) p = p.reverse();
      if (pts.length) p = p.slice(1);
      pts.push(...p);
    }
    if (pts.length > 4) out.chase[name] = { name, pts: resample(pts, 6) };
  };
  chain('vale', [['marrow_flats_e', 'south_junction'], ['south_junction', 'copperton_w']]);
  chain('mountain', [['junction', 'switchback_foot'], ['switchback_foot', 'switchback_top']]);
  chain('highway', [['port_lindell_e', 'junction'], ['junction', 'gorge_n'], ['gorge_n', 'gorge_s'], ['gorge_s', 'copperton_n']]);
  if (out.chase.vale) out.chase.vale.name = 'the Southmead road';
  if (out.chase.mountain) out.chase.mountain.name = 'the Highgate switchbacks';
  if (out.chase.highway) out.chase.highway.name = 'the gorge highway';

  // parcel stops: on each town's streets, spread out (at least 45 m apart), up to 8 a town
  for (const c of cities) {
    const list = [];
    for (const r of roads.filter(q => q.town === c.id && q.kind === 'street')) for (const t of [0.25, 0.5, 0.75]) {
      if (list.length >= 8) break;
      const a = along(r.pts, t);
      if (!dry(a.x, a.z) || list.some(s => Math.hypot(s.x - a.x, s.z - a.z) < 45)) continue;
      list.push({ id: `${c.id}_stop_${list.length}`, x: r2(a.x), z: r2(a.z), y: r2(a.y), yaw: r2(a.yaw) });
    }
    if (list.length) out.stops[c.id] = list;
  }
  return out;
}
