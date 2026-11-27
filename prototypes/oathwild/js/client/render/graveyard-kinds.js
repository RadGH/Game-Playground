// The Old Graveyard's stone kinds as House Kit parts (brainstorm 2026-11-27 §2): every kind in graves.js STONE_KINDS,
// built once in its own frame and drawn instanced by graveyard-draw.js (one draw per kind and variant). Frame: x across
// the stone, y up (0 = the ground at the stone's centre), z through it — the inscription faces +z, where the grave lies.
// Every piece reaches 0.3-0.45 m below 0 so a stone on a slope or sunk into the ground never floats.
//
// Shapes are low-poly bevelled outlines (three.js ExtrudeGeometry / LatheGeometry) registered as House Kit pieces
// ('gy:<id>'), so they take the painted atlas the same way the kit's boxes do: plaster for weathered monolith faces,
// ashlar stone for tombs, slate roofs, iron railings and doors, timber crosses (lessons rule 77: nothing untextured).
// No two faces share a plane (rule 83): plinths, caps, panels and pilasters stand 1-6 cm proud of what they frame.
//
//   const kinds = buildKinds(kit, { curve, bevel })     → { [variant]: parts[] }   variants: '<kind>', '<kind>-broken',
//                                                         'headstone-tall-cross' (a ringed stone cross), 'grave-mound'
//   regPiece(kit, id, geometry)                         a three.js geometry as a kit piece; cells 'face' | 'top' | 'edge'
import * as THREE from 'three';

const GREY = '#a4b7d8', EDGE = '#93a4c2', DARK = '#7e8ea9', IRON = '#5b5f62', WOOD = '#8a7d6c', SLATE = '#7d8790', TURF = '#7f8b5c';

/** A three.js geometry as a House Kit piece 'gy:<id>' (cells per triangle: front/back 'face', up 'top', the rest 'edge'). */
export function regPiece(kit, id, geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.attributes.normal) g.computeVertexNormals();
  const P = g.attributes.position, N = g.attributes.normal, cell = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < P.count; i += 3) {
    a.fromBufferAttribute(P, i); b.fromBufferAttribute(P, i + 1); c.fromBufferAttribute(P, i + 2);
    const n = c.sub(b).cross(a.sub(b)).normalize();
    cell.push(Math.abs(n.z) > 0.8 ? 'face' : n.y > 0.6 ? 'top' : 'edge');
  }
  kit.pieces['gy:' + id] = { pos: new Float32Array(P.array), nrm: new Float32Array(N.array), cell, trim: new Array(cell.length).fill(false), tris: cell.length };
  return id;
}

// ---------------------------------------------------------------- outlines (x across, y up)
const shapeOf = pts => { const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) s.lineTo(p[0], p[1]); s.closePath(); return s; };
function roundTop(w, h, bottom, n) {
  const r = w / 2, pts = [[-r, bottom], [r, bottom]];
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI; pts.push([Math.cos(a) * r, h - r + Math.sin(a) * r]); }
  return pts;
}
function shoulderTop(w, h, bottom) {
  const r = w / 2;
  return [[-r, bottom], [r, bottom], [r, h - 0.32], [r * 0.82, h - 0.2], [r * 0.5, h - 0.17], [r * 0.3, h - 0.09], [0, h], [-r * 0.3, h - 0.09], [-r * 0.5, h - 0.17], [-r * 0.82, h - 0.2], [-r, h - 0.32]];
}
function slabTop(w, h, bottom) { const r = w / 2, k = 0.07; return [[-r, bottom], [r, bottom], [r, h - k], [r - k * 0.4, h - k * 0.4], [r - k, h], [-r + k, h], [-r + k * 0.4, h - k * 0.4], [-r, h - k]]; }
/** The same stone snapped off at `at` of its height: a jagged top (seeded per kind, the same on every stone of it). */
function broken(w, at, bottom, seed) {
  const r = w / 2, pts = [[-r, bottom], [r, bottom]];
  const k = [0.9, 0.55, 0.78, 0.4, 0.66, 1.0, 0.5];
  for (let i = 0; i <= 6; i++) pts.push([r - (i / 6) * w, at + (k[(i + seed) % k.length] - 0.6) * 0.18]);
  return pts;
}
const mirror = pts => pts.map(([x, y]) => [-x, y]).reverse();
function extrude(pts, depth, bev, q) {
  const g = new THREE.ExtrudeGeometry(shapeOf(pts), { depth, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: q.bevel, curveSegments: q.curve, steps: 1 });
  g.translate(0, 0, -depth / 2);
  return g;
}

// ---------------------------------------------------------------- parts
const box = (w, h, d, p, m = 'plaster', t = GREY, r = [0, 0, 0]) => ({ s: 'box', w, h, d, p, r, m, t });
const cyl = (rt, rb, h, n, p, m = 'plaster', t = GREY, r = [0, 0, 0]) => ({ s: 'cyl', rt, rb, h, n, p, r, m, t });
const kp = (id, p = [0, 0, 0], r = [0, 0, 0], cells = { face: ['plaster', GREY], edge: ['plaster', EDGE], top: ['plaster', EDGE] }, sc = [1, 1, 1]) => ({ s: 'kit', kit: 'gy', id, p, r, sc, cells });
const stoneCells = (t = GREY, e = EDGE, m = 'plaster') => ({ face: [m, t], edge: [m, e], top: [m, e] });

export function buildKinds(kit, q = { curve: 6, bevel: 1 }) {
  const K = {}, reg = (id, g) => regPiece(kit, id, g);
  const n = Math.max(4, q.curve);

  // ---------------- a plinth under a headstone (its top 12 cm above the ground; the stone stands in it)
  const plinth = (w, d, top = 0.12) => box(w, top + 0.42, d, [0, (top - 0.42) / 2, 0], 'plaster', DARK);
  // a raised inscription panel on the front face (front = z0); 1.2 cm proud, its back buried in the stone
  const panel = (w, h, y, z0) => box(w, h, 0.016, [0, y, z0 + 0.004], 'plaster', '#b5c6e7');

  // ---------------- headstone-round: hw .4, h 1.0
  reg('round', extrude(roundTop(0.7, 0.98, -0.45, n), 0.17, 0.025, q));
  reg('round-b', extrude(broken(0.7, 0.55, -0.45, 1), 0.17, 0.025, q));
  K['headstone-round'] = [plinth(0.86, 0.38), kp('round'), panel(0.42, 0.26, 0.55, 0.11)];
  K['headstone-round-broken'] = [plinth(0.86, 0.38), kp('round-b'), box(0.3, 0.12, 0.2, [0.12, 0.05, 0.42], 'plaster', EDGE, [0.2, 0.7, 0.35])];

  // ---------------- headstone-tall: hw .45, h 1.5 — shouldered top with a cross in relief; or a ringed stone cross
  reg('tall', extrude(shoulderTop(0.78, 1.48, -0.45), 0.2, 0.03, q));
  reg('tall-b', extrude(broken(0.78, 0.8, -0.45, 3), 0.2, 0.03, q));
  K['headstone-tall'] = [plinth(0.98, 0.44, 0.15), box(0.88, 0.1, 0.36, [0, 0.2, 0], 'plaster', EDGE), kp('tall'),
    box(0.07, 0.34, 0.03, [0, 1.06, 0.13]), box(0.22, 0.07, 0.03, [0, 1.12, 0.13]), panel(0.5, 0.3, 0.62, 0.13)];
  K['headstone-tall-broken'] = [plinth(0.98, 0.44, 0.15), box(0.88, 0.1, 0.36, [0, 0.2, 0], 'plaster', EDGE), kp('tall-b'), panel(0.5, 0.26, 0.5, 0.13),
    box(0.42, 0.14, 0.24, [-0.18, 0.06, 0.5], 'plaster', EDGE, [0.15, -0.5, 0.25])];
  {
    // the ringed cross: a stepped base, a tapering shaft, arms and a ring through them (a low torus)
    const ring = new THREE.TorusGeometry(0.23, 0.045, Math.max(3, q.bevel + 2), n * 2);
    reg('ring', ring);
    K['headstone-tall-cross'] = [plinth(0.78, 0.5, 0.1), box(0.6, 0.22, 0.4, [0, 0.2, 0], 'plaster', EDGE),
      box(0.22, 1.32, 0.16, [0, 0.62, 0], 'plaster', GREY), box(0.68, 0.17, 0.13, [0, 1.12, 0], 'plaster', GREY),
      box(0.2, 0.26, 0.13, [0, 1.38, 0], 'plaster', GREY), kp('ring', [0, 1.12, 0], [0, 0, 0], stoneCells()), panel(0.14, 0.4, 0.62, 0.08)];
  }

  // ---------------- slab: hw .36, h .8 — plain, chamfered corners, set straight in the ground
  reg('slab', extrude(slabTop(0.66, 0.78, -0.42), 0.15, 0.02, q));
  reg('slab-b', extrude(broken(0.66, 0.42, -0.42, 5), 0.15, 0.02, q));
  K.slab = [kp('slab', [0, 0, 0], [0, 0, 0], stoneCells('#a0b1d1', '#8c9cb9'))];
  K['slab-broken'] = [kp('slab-b', [0, 0, 0], [0, 0, 0], stoneCells('#a0b1d1', '#8c9cb9')), box(0.26, 0.1, 0.18, [0.18, 0.03, 0.34], 'plaster', EDGE, [0.1, 0.9, 0.2])];

  // ---------------- cross-wood: hw .32, h 1.15 — two weathered beams pegged together, a little roof on top
  const beam = (w, h, d, p, r) => box(w, h, d, p, 'timber', WOOD, r);
  K['cross-wood'] = [beam(0.1, 1.55, 0.08, [0, 0.38, 0]), beam(0.6, 0.085, 0.07, [0, 0.86, 0.01]), box(0.06, 0.06, 0.03, [0, 0.86, 0.055], 'iron', IRON)];
  K['cross-wood-broken'] = [beam(0.1, 1.2, 0.08, [0, 0.2, 0]), beam(0.32, 0.085, 0.07, [0.13, 0.7, 0.01], [0, 0, -0.5]), beam(0.34, 0.08, 0.07, [-0.25, 0.04, 0.32], [0, 0.6, 1.45])];

  // ---------------- a low turf mound over a grave (Paupers' Field), drawn in front of the marker
  {
    const g = new THREE.SphereGeometry(1, 7, 2, 0, Math.PI * 2, 0, Math.PI / 2);   // low and soft: a few faces is enough
    g.scale(0.42, 0.16, 0.9); g.translate(0, -0.04, 0);
    reg('mound', g);
    K['grave-mound'] = [kp('mound', [0, 0, 0], [0, 0, 0], { face: ['thatch', TURF], top: ['thatch', TURF], edge: ['thatch', TURF] })];
  }

  // ---------------- obelisk: hw .45, h 3.4 — two steps, a die with a panel, a tapering shaft, a pyramid cap
  {
    const sq = (w, h, y, t = GREY, m = 'plaster') => box(w, h, w, [0, y, 0], m, t);
    const R2 = Math.SQRT2;
    const base = [sq(0.96, 0.62, -0.13, DARK), sq(0.78, 0.34, 0.33, EDGE), sq(0.6, 0.66, 0.83, GREY, 'plaster')];
    for (const [px, pz, ry] of [[0, 0.3, 0], [0, -0.3, Math.PI], [0.3, 0, Math.PI / 2], [-0.3, 0, -Math.PI / 2]]) base.push(box(0.4, 0.4, 0.016, [px, 0.85, pz], 'plaster', '#b5c6e7', [0, ry, 0]));
    K.obelisk = [...base, cyl(0.17 * R2, 0.25 * R2, 1.86, 4, [0, 2.09, 0], 'plaster', GREY, [0, Math.PI / 4, 0]),
      { s: 'cone', rb: 0.17 * R2, h: 0.3, n: 4, p: [0, 3.17, 0], r: [0, Math.PI / 4, 0], m: 'plaster', t: EDGE }];
    K['obelisk-broken'] = [...base, cyl(0.21 * R2, 0.25 * R2, 0.92, 4, [0, 1.62, 0], 'plaster', GREY, [0, Math.PI / 4, 0]),
      cyl(0.17 * R2, 0.21 * R2, 0.9, 4, [0.15, 0.17, 0.72], 'plaster', GREY, [Math.PI / 2, 0.4, Math.PI / 4])];
  }

  // ---------------- angel: hw .65, h 2.6 — a mourning figure on a plinth, head bowed, hands together, wings half open
  {
    const robe = new THREE.LatheGeometry([[0.001, 0], [0.34, 0], [0.31, 0.22], [0.235, 0.62], [0.19, 0.9], [0.205, 1.1], [0.15, 1.22], [0.06, 1.27], [0.001, 1.28]].map(([x, y]) => new THREE.Vector2(x, y)), n + 4);
    robe.scale(1, 1, 0.78);
    reg('robe', robe);
    reg('head', new THREE.SphereGeometry(0.115, n + 2, Math.max(5, n)));
    const wing = [[0, 0], [0.12, -0.28], [0.24, -0.18], [0.3, 0.12], [0.38, 0.34], [0.44, 0.62], [0.47, 0.98], [0.42, 1.28], [0.3, 1.06], [0.16, 0.7], [0.04, 0.36]];
    reg('wing-r', extrude(wing, 0.04, 0.012, q));
    reg('wing-l', extrude(mirror(wing), 0.04, 0.012, q));
    const W0 = 0.72, sc = stoneCells('#b2c3e3', '#9eafcd');
    const fig = [box(0.9, 1.02, 0.9, [0, 0.11, 0], 'plaster', DARK), box(1.02, 0.1, 1.02, [0, 0.67, 0], 'plaster', EDGE),
      box(0.92, 0.04, 0.016, [0, 0.38, 0.454], 'plaster', '#b5c6e7'),
      kp('robe', [0, W0, 0], [0, 0, 0], sc),
      kp('head', [0, W0 + 1.39, 0.06], [0, 0, 0], sc),
      cyl(0.07, 0.05, 0.36, 6, [0.11, W0 + 1.02, 0.12], 'plaster', '#b2c3e3', [0.9, 0, 0.35]),
      cyl(0.07, 0.05, 0.36, 6, [-0.11, W0 + 1.02, 0.12], 'plaster', '#b2c3e3', [0.9, 0, -0.35]),
      { s: 'blob', rad: 0.07, p: [0, W0 + 1.1, 0.25], r: [0, 0, 0], m: 'plaster', t: '#b2c3e3' }];
    K.angel = [...fig, kp('wing-r', [0.1, W0 + 0.98, -0.13], [-0.28, 0.55, -0.12], sc), kp('wing-l', [-0.1, W0 + 0.98, -0.13], [-0.28, -0.55, 0.12], sc)];
    // broken: the head and a wing lie at its feet
    K['angel-broken'] = [...fig.filter(p => p.id !== 'head'), kp('wing-r', [0.1, W0 + 0.98, -0.13], [-0.28, 0.55, -0.12], sc),
      kp('head', [0.32, 0.79, 0.3], [0.3, 0, 0], sc), kp('wing-l', [-0.55, 0.06, 0.25], [-Math.PI / 2 + 0.08, 0.4, 0], sc)];
  }

  // ---------------- table-tomb: hw .85, hd 1.35, h 1.0 — a stone chest with corner pilasters and an overhanging lid
  {
    reg('lid', extrude(slabTop(1.62, 0.12, -0.0), 2.56, 0.03, { curve: 1, bevel: 1 }));
    const chest = [box(1.7, 0.5, 2.7, [0, -0.13, 0], 'plaster', DARK), box(1.36, 0.66, 2.36, [0, 0.45, 0], 'plaster', GREY)];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) chest.push(box(0.18, 0.66, 0.18, [sx * 0.66, 0.45, sz * 1.16], 'plaster', EDGE));
    for (const sx of [-1, 1]) chest.push(box(0.016, 0.38, 1.6, [sx * 0.686, 0.46, 0], 'plaster', '#b5c6e7'));
    for (const sz of [-1, 1]) chest.push(box(0.8, 0.38, 0.016, [0, 0.46, sz * 1.186], 'plaster', '#b5c6e7'));
    K['table-tomb'] = [...chest, kp('lid', [0, 0.79, 0], [0, 0, 0], stoneCells('#a1b2d2', EDGE)), box(1.3, 0.08, 2.3, [0, 0.96, 0], 'plaster', GREY)];
    // broken: the lid split and slid half off to one side
    K['table-tomb-broken'] = [...chest, kp('lid', [0.28, 0.86, 0.5], [0.05, 0.12, -0.2], stoneCells('#a1b2d2', EDGE), [1, 1, 0.5]),
      kp('lid', [-0.85, 0.42, -0.55], [-0.1, -0.2, 0.75], stoneCells('#a1b2d2', EDGE), [1, 1, 0.48])];
  }

  // ---------------- family-plot: hw 2.5, hd 1.9, h .9 — a stone kerb, four posts with finials, an iron railing
  {
    const W = 4.9, D = 3.7, parts = [];
    // kerb: the long sides run the full length, the short ones fit between them (no overlap, no shared face)
    for (const sz of [-1, 1]) parts.push(box(W, 0.42, 0.26, [0, -0.1, sz * (D / 2 - 0.13)], 'plaster', DARK));
    for (const sx of [-1, 1]) parts.push(box(0.26, 0.4, D - 0.52, [sx * (W / 2 - 0.13), -0.11, 0], 'plaster', DARK));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      parts.push(box(0.3, 1.0, 0.3, [sx * (W / 2 - 0.13), 0.4, sz * (D / 2 - 0.13)], 'plaster', GREY));
      parts.push(box(0.36, 0.08, 0.36, [sx * (W / 2 - 0.13), 0.94, sz * (D / 2 - 0.13)], 'plaster', EDGE));
      parts.push({ s: 'blob', rad: 0.11, p: [sx * (W / 2 - 0.13), 1.08, sz * (D / 2 - 0.13)], r: [0, 0, 0], m: 'plaster', t: EDGE });
    }
    // the railing between the posts: rails + bars with spear tips
    const side = (len, cx, cz, ry) => {
      const c = Math.cos(ry), s = Math.sin(ry), at = (u, y) => [cx + u * c, y, cz - u * s];
      parts.push(box(len, 0.035, 0.035, at(0, 0.82), 'iron', IRON, [0, ry, 0]), box(len, 0.035, 0.035, at(0, 0.2), 'iron', IRON, [0, ry, 0]));
      const nb = Math.round(len / 0.16);
      for (let i = 1; i < nb; i++) {
        const u = -len / 2 + (i / nb) * len;
        parts.push(box(0.022, 0.78, 0.022, at(u, 0.5), 'iron', IRON, [0, ry, 0]));
        parts.push({ s: 'cone', rb: 0.035, h: 0.09, n: 4, p: at(u, 0.93), r: [0, ry + Math.PI / 4, 0], m: 'iron', t: IRON });
      }
    };
    side(W - 0.56, 0, -(D / 2 - 0.13), 0); side(W - 0.56, 0, D / 2 - 0.13, 0);
    side(D - 0.56, -(W / 2 - 0.13), 0, Math.PI / 2); side(D - 0.56, W / 2 - 0.13, 0, Math.PI / 2);
    K['family-plot'] = parts;
  }

  // ---------------- mausoleums: a stepped plinth, ashlar walls, corner pilasters, an iron door in a frame, a pediment,
  // a slate roof and a stone cross; the big one has a columned porch. Door faces +z.
  const pediment = (w, h, d, p, t = EDGE) => { const id = `ped-${w}-${h}-${d}`; if (!kit.pieces['gy:' + id]) reg(id, extrude([[-w / 2, 0], [w / 2, 0], [0, h]], d, 0, { curve: 1, bevel: 1 })); return kp(id, p, [0, 0, 0], stoneCells(t, t, 'plaster')); };
  const roof = (w, h, len, p) => { const id = `roof-${w}-${h}-${len}`; if (!kit.pieces['gy:' + id]) reg(id, extrude([[-w / 2, 0], [w / 2, 0], [0, h]], len, 0, { curve: 1, bevel: 1 })); return kp(id, p, [0, 0, 0], { face: ['plaster', EDGE], top: ['slate', SLATE], edge: ['slate', SLATE] }); };
  function mausoleum({ W, D, H, porch = 0, steps = 2, shift = 0 }) {
    const parts = [], zf = D / 2;                       // body front face
    const plW = W + 0.6, plD = D + 0.6 + porch;
    parts.push(box(plW, 0.75, plD, [0, -0.08, porch / 2], 'plaster', DARK));                       // plinth: top at 0.3
    // steps down from the plinth's front edge, each lower and wider than the one above it
    for (let k = 1; k <= steps; k++) { const top = 0.3 * (1 - k / (steps + 1)); parts.push(box(2.0 + k * 0.24, top + 0.32, 0.34, [0, (top - 0.32) / 2, plD / 2 + porch / 2 + (k - 0.5) * 0.34], 'plaster', k % 2 ? EDGE : DARK)); }
    parts.push(box(W, H, D, [0, 0.3 + H / 2, 0], 'plaster', GREY));                               // body
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(0.42, H + 0.02, 0.42, [sx * (W / 2 - 0.15), 0.3 + H / 2, sz * (D / 2 - 0.15)], 'plaster', EDGE));
    // the door: frame jambs and lintel stand proud, the iron door sits 6 cm proud of the wall between them
    parts.push(box(1.24, 2.2, 0.08, [0, 0.3 + 1.1, zf + 0.04], 'door', '#5e6a66'));
    for (const sx of [-1, 1]) parts.push(box(0.26, 2.5, 0.2, [sx * 0.75, 0.3 + 1.25, zf + 0.06], 'plaster', EDGE));
    parts.push(box(1.9, 0.34, 0.24, [0, 0.3 + 2.62, zf + 0.08], 'plaster', EDGE));
    if (H > 3.3) parts.push(box(1.1, 0.26, 0.03, [0, 0.3 + 3.08, zf + 0.012], 'plaster', '#b5c6e7'));   // the family's name plate
    // cornice round the top, then the roof and the pediment over the front
    const top = 0.3 + H;
    parts.push(box(W + 0.36, 0.26, D + 0.36 + porch, [0, top + 0.13, porch / 2], 'plaster', EDGE));
    const rh = Math.min(1.5, W * 0.28);
    parts.push(roof(W + 0.5, rh, D + 0.5 + porch, [0, top + 0.27, porch / 2]));
    parts.push(pediment(W + 0.2, rh - 0.12, 0.18, [0, top + 0.27, zf + porch + 0.35]));
    parts.push(box(0.12, 0.62, 0.1, [0, top + 0.26 + rh + 0.27, zf + porch + 0.3], 'plaster', GREY), box(0.42, 0.11, 0.1, [0, top + 0.26 + rh + 0.38, zf + porch + 0.3], 'plaster', GREY));
    if (porch) {
      // the porch: four columns on bases under the roof, the floor = the plinth top
      for (const x of [-(W / 2 - 0.35), -1.3, 1.3, W / 2 - 0.35]) {
        parts.push(box(0.5, 0.18, 0.5, [x, 0.39, zf + porch - 0.2], 'plaster', EDGE));
        parts.push(cyl(0.17, 0.2, H - 0.3, 10, [x, 0.48 + (H - 0.3) / 2, zf + porch - 0.2], 'plaster', GREY));
        parts.push(box(0.46, 0.14, 0.46, [x, 0.48 + H - 0.3 + 0.07, zf + porch - 0.2], 'plaster', EDGE));
      }
      parts.push(box(W + 0.1, 0.36, 0.5, [0, top - 0.12, zf + porch - 0.2], 'plaster', EDGE));
      for (const sx of [-1, 1]) { parts.push(box(0.32, 0.3, 0.32, [sx * (W / 2), top + 0.4, zf + porch + 0.25], 'plaster', EDGE)); parts.push({ s: 'blob', rad: 0.2, p: [sx * (W / 2), top + 0.68, zf + porch + 0.25], r: [0, 0, 0], m: 'plaster', t: EDGE }); }
    }
    // the whole tomb moves back so its steps stay inside its footprint's walking room
    for (const p of parts) p.p = [p.p[0], p.p[1], p.p[2] + shift];
    return parts;
  }
  K['mausoleum-small'] = mausoleum({ W: 3.9, D: 4.7, H: 2.9, steps: 2, shift: -0.35 });
  K.mausoleum = mausoleum({ W: 5.6, D: 5.0, H: 3.7, porch: 1.4, steps: 3, shift: -0.7 });
  return K;
}
