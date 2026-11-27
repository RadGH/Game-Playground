// House Kit — the pure "describe a house" step (no DOM, no three.js, no files). A house record (the same one Oathwild's
// town planner makes: js/world/town.js) plus the style data (data/styles.json) gives a flat list of PARTS: Kenney wall
// pieces, boxes, triangles, cylinders, quads… each with its place in the house's own frame, the look (atlas texture)
// and the tint it is painted with. js/build.js turns parts into three.js geometry. The review page and the game both
// call describeHouse(), so a house tuned on the page is the house in the game (tests/same-house.test.mjs).
//
//   const d = describeHouse(house, styles, { streetY, yard, quality })
//   d.parts   [{ s: shape, m: look, t: tint, p: [x,y,z], r: [rx,ry,rz], tag, …shape sizes }]   house frame: x along the
//             street (w), z away from it (d), front = -z, y = world height; turned by house.facing about the house centre
//   d.look    what was rolled: style, roof kind, colours, trade, every decoration on/off (the page lists it)
//   d.smoke   [[x,y,z]] chimney tops, house frame
//
//   describeFence(f, styles, ctx) / describeProp(p, styles, ctx) / describeTerraceWall(w, styles)  → parts in WORLD frame
//
// A house record: { at:[x,z], w, d, facing, cells:[wc,dc], storeys, floorY, baseY, style, roof, plaster, door:{cell,
// at}, shop, jetty, chimney, seed } + optional { trade, kind (inn|tower|smithy|chapel), ridge, pitch }.

export const VERSION = 1;

/** xorshift (the generator town-draw.js always used), 0..1 */
export function rng(seed) { let a = seed >>> 0 || 1; return () => { a ^= a << 13; a ^= a >>> 17; a ^= a << 5; return ((a >>> 0) % 10000) / 10000; }; }
/** a separate stream per decoration, so adding one never reshuffles the others */
export function rngFor(seed, key) { let h = 2166136261 ^ (seed >>> 0); for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); } return rng(h >>> 0); }
const r3 = v => Math.round(v * 1000) / 1000;

/** Everything rolled for one house (deterministic from the record + styles + quality). */
export function houseLook(h, S, { quality = 'medium', force = null } = {}) {
  const land = h.kind ? S.landmarks[h.kind] : null;
  const styleId = land?.style || h.style || 'timber';
  const st = S.styles[styleId] || S.styles.timber;
  const Q = S.quality[quality] || S.quality.medium;
  const roofId = land?.roof || h.roofKind || st.roofs[((h.roof ?? 0) % st.roofs.length + st.roofs.length) % st.roofs.length];
  const pickC = (list, key) => list[Math.floor(rngFor(h.seed, key)() * list.length)];
  const plaster = st.plasters[((h.plaster ?? 0) % st.plasters.length + st.plasters.length) % st.plasters.length];
  const tradeIds = Object.keys(S.trades).filter(k => !k.startsWith('_'));
  const trade = h.shop || land?.trade ? (h.trade || land?.trade || tradeIds[Math.floor(rngFor(h.seed, 'trade')() * tradeIds.length)]) : null;
  const deco = {};
  for (const [k, odds] of Object.entries(st.deco)) deco[k] = rngFor(h.seed, 'deco:' + k)() < odds * Q.deco;
  if (land?.balcony) deco.balcony = true;
  if (force) for (const [k, v] of Object.entries(force)) if (k in deco) deco[k] = !!v;      // the page's decoration switches
  return {
    style: styleId, family: st.family, roof: roofId, plaster, quality,
    shutter: pickC(st.shutters, 'shutter'), door: pickC(st.doorTints, 'door'), frame: st.frameTint,
    trade, kind: h.kind || null, deco,
  };
}

/**
 * Describe one house. ctx (plain numbers, so a house + its ctx can be saved and opened on the page): streetY = ground
 * height at the door spot (steps), yard = { d, y } when the house has a back yard (rain barrel, woodpile go there;
 * nothing is put behind a house that has none), quality.
 */
export function describeHouse(h, S, ctx = {}) {
  const C = S.cell, quality = ctx.quality || 'medium', Q = S.quality[quality] || S.quality.medium;
  const L = houseLook(h, S, { quality, force: ctx.force });
  const st = S.styles[L.style], fam = S.families[L.family], roofK = S.roofs[L.roof], land = h.kind ? S.landmarks[h.kind] : null;
  const [wc, dc] = h.cells, W = h.w ?? wc * C, D = h.d ?? dc * C, storeys = h.storeys;
  const parts = [], smoke = [];
  const add = (o, tag) => { o.tag = tag; parts.push(o); return o; };
  const wallCells = familyCells(S, L.style, L);
  const rnd = rng(h.seed);
  const swap = id => (Q.swap && S.lowSwap[id]) || id;
  const pick = list => swap(list[Math.floor(rnd() * list.length)]);
  const plainOdds = Q.plainOdds;
  const jd = h.jetty && storeys > 1 ? S.jetty.depth : 0;
  const floorY = h.floorY, top = floorY + storeys * C;
  const DS = S.decoSizes;
  const openFront = land?.openFront || 0;                     // smithy: this many front cells are open (posts, no wall)
  const porch = !land && L.deco.porch && wc >= 2 && storeys >= 2 && !h.shop ? h.door.cell : -1;   // recessed porch at the door
  const pd = DS.porch.depth;

  // -------------------------------------------------------------- walls, storey by storey (Kenney pieces)
  // side: outward normal n, the edge point of cell i, how many cells; the front is -z
  const frontZ = k => -D / 2 - (k >= 1 ? jd : 0);
  const sides = [
    { key: 'front', n: [0, -1], n_: wc, edge: (i, k) => [-W / 2 + C * (i + 0.5), frontZ(k)] },
    { key: 'back', n: [0, 1], n_: wc, edge: i => [-W / 2 + C * (i + 0.5), D / 2] },
    { key: 'left', n: [-1, 0], n_: dc, edge: i => [-W / 2, -D / 2 + C * (i + 0.5)] },
    { key: 'right', n: [1, 0], n_: dc, edge: i => [W / 2, -D / 2 + C * (i + 0.5)] },
  ];
  const out = S.wallOut, xface = out < 0 ? 0.4 : 0.5;
  const wallPiece = (id, e, n, y, tag, extra = {}) => {
    // piece axis (out * x) → n; outer face (piece x = xface) on the edge point
    const vx = out * n[0], vz = out * n[1], yaw = Math.atan2(-vz, vx);
    const ox = e[0] - xface * C * vx, oz = e[1] - xface * C * vz;
    add({ s: 'kit', kit: 'town', id, p: [r3(ox), r3(y), r3(oz)], r: [0, r3(yaw), 0], sc: [C, C, C], cells: wallCells, ...extra }, tag);
    const g = S.windowGlass[id];
    if (g) {                                                  // leaded glass in the opening, just inside the face
      const [hz, y0, y1] = g;
      add({ s: 'quad', m: 'glass', t: S.glassTint, w: r3(hz * 2 * C + 0.08), h: r3((y1 - y0) * C + 0.06), p: [r3(e[0] - n[0] * 0.08), r3(y + (y0 + y1) / 2 * C), r3(e[1] - n[1] * 0.08)], r: [0, r3(Math.atan2(n[0], n[1])), 0] }, 'window glass');
    }
    return g;
  };
  const windowsAt = [];                                       // [{ e, n, y, k, side, i }] front + side windows (window boxes)
  for (let k = 0; k < storeys; k++) {
    const y = floorY + k * C;
    for (const sd of sides) for (let i = 0; i < sd.n_; i++) {
      const front = sd.key === 'front';
      let id;
      if (front && k === 0 && i < openFront) continue;       // open forge front
      if (front && k === 0 && i === h.door.cell) id = land?.doorPiece || fam.door;
      else if (front && k >= 1 && L.deco.balcony && i === balconyCell(h, wc)) id = fam.door;
      else if (!front && rnd() < plainOdds) id = fam.plain;
      else if (!front) id = fam.small;
      else id = pick(k === 0 ? fam.ground : fam.upper);
      if (land && h.kind === 'tower' && id !== fam.door) id = k === 0 ? fam.plain : (i % 2 ? fam.plain : 'wall-window-small');
      let e = sd.edge(i, k);
      if (front && k === 0 && i === porch) e = [e[0], e[1] + pd];       // the porch: the door wall set back
      const g = wallPiece(id, e, sd.n, y, front ? 'front wall' : 'wall');
      if (id === land?.doorPiece && land.doorFill) { const [hz, y0, y1] = land.doorFill; add({ s: 'box', m: 'door', t: L.door, w: r3(hz * 2 * C + 0.1), h: r3((y1 - y0) * C), d: 0.08, p: [r3(e[0]), r3(y + (y0 + y1) / 2 * C), r3(e[1] + 0.12)] }, 'double door'); }
      if (g && (front || sd.key === 'left' || sd.key === 'right')) windowsAt.push({ e, n: sd.n, y, k, side: sd.key, i, half: g[0] * C });
    }
    // a jettied storey stands out past the one below: close its sides over the overhang
    if (k >= 1 && jd) for (const sx of [-1, 1]) add({ s: 'box', m: st.wall, t: L.plaster, w: 0.3, h: C, d: r3(jd), p: [r3(sx * (W / 2 - 0.15)), r3(y + C / 2), r3(-D / 2 - jd / 2)] }, 'jetty side');
  }
  // the jetty: a floor box under the overhang, a beam along its front and corbels under it
  if (jd) for (let k = 1; k < storeys; k++) {
    const y = floorY + k * C;
    add({ s: 'box', m: 'planks', t: '#f0dcc4', w: W, h: 0.16, d: r3(jd + 0.3), p: [0, r3(y - 0.08), r3(-D / 2 - jd / 2 + 0.15)] }, 'jetty floor');
    add({ s: 'box', m: 'timber', t: st.frameTint, w: r3(W + 0.1), h: 0.3, d: 0.3, p: [0, r3(y - 0.05), r3(-D / 2 - jd + 0.1)] }, 'jetty beam');
    if (S.jetty.corbels) for (let i = 0; i <= wc; i++) {
      const x = -W / 2 + C * i + (i === 0 ? 0.2 : i === wc ? -0.2 : 0);
      add({ s: 'box', m: 'timber', t: st.frameTint, w: 0.22, h: 0.55, d: r3(jd + 0.1), p: [r3(x), r3(y - 0.45), r3(-D / 2 - jd / 2)], r: [0.5, 0, 0] }, 'corbel');
    }
  }
  // open front (smithy): posts and a beam where the wall would be
  if (openFront) {
    const x1 = -W / 2 + C * openFront;
    for (const x of [-W / 2 + 0.15, x1 - 0.15, (x1 - W / 2) / 2]) add({ s: 'box', m: 'timber', t: st.frameTint, w: 0.3, h: C, d: 0.3, p: [r3(x), r3(floorY + C / 2), r3(-D / 2 + 0.15)] }, 'post');
    add({ s: 'box', m: 'timber', t: st.frameTint, w: r3(C * openFront), h: 0.32, d: 0.34, p: [r3((x1 - W / 2) / 2), r3(floorY + C - 0.16), r3(-D / 2 + 0.15)] }, 'beam');
    add({ s: 'box', m: 'cobbles', t: '#b0a898', w: r3(C * openFront - 0.2), h: 0.1, d: r3(D - 0.3), p: [r3((x1 - W / 2) / 2), r3(floorY + 0.05), 0] }, 'floor');
    // the back + inner walls of the open bay are already the house's own walls; a plain wall closes it off inside
    add({ s: 'box', m: st.wall, t: L.plaster, w: 0.2, h: C, d: r3(D - 0.3), p: [r3(x1), r3(floorY + C / 2), 0] }, 'wall');
  }
  // the porch: two posts on the front line, a deck, side panels and a ceiling (all inside the house's footprint)
  if (porch >= 0) {
    const [ex] = sides[0].edge(porch, 0), z0 = -D / 2;
    for (const sx of [-1, 1]) {
      add({ s: 'box', m: 'timber', t: st.frameTint, w: 0.24, h: C, d: 0.24, p: [r3(ex + sx * (C / 2 - 0.16)), r3(floorY + C / 2), r3(z0 + 0.12)] }, 'porch post');
      add({ s: 'box', m: st.wall, t: L.plaster, w: 0.12, h: C, d: pd, p: [r3(ex + sx * (C / 2 - 0.06)), r3(floorY + C / 2), r3(z0 + pd / 2)] }, 'porch side');
    }
    add({ s: 'box', m: 'planks', t: '#f0dcc4', w: C, h: 0.12, d: pd, p: [r3(ex), r3(floorY + 0.06), r3(z0 + pd / 2)] }, 'porch deck');
    add({ s: 'box', m: 'planks', t: '#e8d4bc', w: C, h: 0.1, d: pd, p: [r3(ex), r3(floorY + C - 0.08), r3(z0 + pd / 2)] }, 'porch ceiling');
    add({ s: 'box', m: 'timber', t: st.frameTint, w: C, h: 0.26, d: 0.26, p: [r3(ex), r3(floorY + C - 0.2), r3(z0 + 0.12)] }, 'porch beam');
  }

  // -------------------------------------------------------------- timber dressing: corner posts, floor beams
  if (L.deco.corners) for (let k = 0; k < storeys; k++) {
    const y = floorY + k * C, fz = frontZ(k), cs = DS.corner;
    for (const [x, z] of [[-W / 2, fz], [W / 2, fz], [-W / 2, D / 2], [W / 2, D / 2]])
      add({ s: 'box', m: st.quoin, t: st.quoinTint, w: cs, h: C, d: cs, p: [r3(x - Math.sign(x) * (cs / 2 - 0.08)), r3(y + C / 2), r3(z - Math.sign(z) * (cs / 2 - 0.08))] }, 'corner beam');
  }
  if (L.deco.floorBeams) for (let k = 1; k < storeys; k++) {
    const y = floorY + k * C, fz = frontZ(k), b = DS.floorBeam;
    add({ s: 'box', m: 'timber', t: st.frameTint, w: r3(W + 0.12), h: b, d: 0.12, p: [0, r3(y), r3(fz - 0.04)] }, 'floor beam');
    for (const sx of [-1, 1]) add({ s: 'box', m: 'timber', t: st.frameTint, w: 0.12, h: b, d: r3(D + jd), p: [r3(sx * (W / 2 + 0.04)), r3(y), r3(-jd / 2)] }, 'floor beam');
  }
  // a stone base course round the bottom of the walls (gaps at the door and an open front)
  if (st.baseCourse && !openFront) {
    const bh = st.baseCourse, o = DS.baseCourseOut, y = floorY + bh / 2;
    const dx0 = -W / 2 + C * h.door.cell, dx1 = dx0 + C;
    const doorGap = porch >= 0 ? [dx0, dx1] : [dx0 + C / 2 - 0.62, dx0 + C / 2 + 0.62];
    for (const [a, b] of [[-W / 2 - o, doorGap[0]], [doorGap[1], W / 2 + o]]) if (b - a > 0.05) add({ s: 'box', m: st.base, t: st.baseTint, w: r3(b - a), h: bh, d: 0.14, p: [r3((a + b) / 2), r3(y), r3(-D / 2 - o + 0.07 - 0.07)] }, 'base course');
    add({ s: 'box', m: st.base, t: st.baseTint, w: r3(W + 2 * o), h: bh, d: 0.14, p: [0, r3(y), r3(D / 2 + o - 0.07)] }, 'base course');
    for (const sx of [-1, 1]) add({ s: 'box', m: st.base, t: st.baseTint, w: 0.14, h: bh, d: r3(D + 2 * o), p: [r3(sx * (W / 2 + o - 0.07)), r3(y), 0] }, 'base course');
  }

  // -------------------------------------------------------------- the roof
  const roofRect = { x0: -W / 2, x1: W / 2, z0: -D / 2 - jd, z1: D / 2 };
  const ridgeKind = land?.ridge || h.ridge || 'long';
  const pitch = land?.pitch || h.pitch || (roofK.pitch[0] + (roofK.pitch[1] - roofK.pitch[0]) * ((h.seed % 7) / 6));
  const roof = ridgeKind === 'pyramid' ? pyramidRoof(roofRect, top, roofK, st, L, add, land) : gableRoof(roofRect, top, roofK, st, L, add, { front: ridgeKind === 'front' || (ridgeKind === 'long' && W < D), pitch });
  // dormers on a big front slope
  if (L.deco.dormer && roof.kind === 'gable' && roof.slopeFront && roof.span >= 5.5 && roof.len >= 6 && !roofK.noDormers) dormers(roof, h, st, L, roofK, add, DS, S);
  // the chimney through the roof by one gable end: stack, cap, pots
  if ((h.chimney && h.kind !== 'tower') || land?.forge) {
    const g = roof;
    const along = (h.seed % 2 ? 1 : -1) * (g.len / 2 - 1.1), across = g.span * 0.12;
    const [cx, cz] = g.alongX ? [along + g.cx, across + g.cz] : [across + g.cx, along + g.cz];
    const ch = g.rise + 1.4, base = top - 0.8;
    add({ s: 'box', m: 'stone', t: '#b8b0a4', w: 0.95, h: r3(ch + 0.8), d: 0.95, p: [r3(cx), r3(base + (ch + 0.8) / 2), r3(cz)] }, 'chimney');
    add({ s: 'box', m: 'stone', t: '#9a9288', w: 1.15, h: 0.18, d: 1.15, p: [r3(cx), r3(top + ch + 0.09), r3(cz)] }, 'chimney cap');
    let topY = top + ch + 0.18;
    if (L.deco.chimneyPots) {
      const two = h.seed % 3 === 0;
      for (const o of two ? [-0.22, 0.22] : [0]) add({ s: 'cyl', m: 'clay', t: '#c88a6a', rt: 0.13, rb: 0.17, h: 0.5, n: 8, p: [r3(cx + o), r3(topY + 0.25), r3(cz)] }, 'chimney pot');
      topY += 0.5;
    }
    smoke.push([r3(cx), r3(topY), r3(cz)]);
  }

  // -------------------------------------------------------------- plinth + steps (the house on a slope)
  if (floorY - h.baseY > 0.12) add({ s: 'box', m: 'stone', t: '#c0b8aa', w: r3(W + 0.24), h: r3(floorY - h.baseY), d: r3(D + 0.24), p: [0, r3(h.baseY + (floorY - h.baseY) / 2), 0] }, 'plinth');
  const [doorLX] = sides[0].edge(h.door.cell, 0);
  const streetY = ctx.streetY ?? floorY - 0.12;
  const climb = floorY - streetY;
  if (climb > 0.28) {
    const n = Math.min(6, Math.ceil(climb / 0.2));
    for (let i = 0; i < n; i++) add({ s: 'box', m: 'stone', t: '#a8a094', w: 1.5, h: r3(climb * (n - i) / n), d: 0.34, p: [r3(doorLX), r3(streetY + climb * (n - i) / n / 2 - 0.05), r3(-D / 2 - 0.17 - 0.34 * i)] }, 'step');
  } else add({ s: 'box', m: 'stone', t: '#b0a89c', w: 1.5, h: 0.16, d: 0.4, p: [r3(doorLX), r3(floorY - 0.06), r3(-D / 2 - 0.18)] }, 'door step');

  // -------------------------------------------------------------- the door: frame, canopy or shop awning, lantern
  const doorZ = -D / 2 + (porch >= 0 ? pd : 0);
  if (L.deco.doorFrame && !openFront) {
    const fm = L.style === 'timber' || L.style === 'wood' ? 'timber' : 'stone', ft = fm === 'timber' ? st.frameTint : '#c8c0b2';
    for (const sx of [-1, 1]) add({ s: 'box', m: fm, t: ft, w: 0.22, h: 2.3, d: 0.14, p: [r3(doorLX + sx * 0.72), r3(floorY + 1.15), r3(doorZ - 0.05)] }, 'door frame');
    add({ s: 'box', m: fm, t: ft, w: 1.7, h: 0.26, d: 0.18, p: [r3(doorLX), r3(floorY + 2.36), r3(doorZ - 0.06)] }, 'door frame');
  }
  if (h.shop && !land) add({ s: 'kit', kit: 'town', id: 'overhang', p: [r3(doorLX), r3(floorY), r3(-D / 2 + C / 2)], r: [0, Math.PI / 2, 0], sc: [C, C, C], cells: { '9,3': ['timber', st.frameTint], '11,3': ['planks', '#d8bc9c'], '*': ['timber', st.frameTint] } }, 'shop awning');
  else if (L.deco.canopy && porch < 0 && !openFront) canopy(doorLX, doorZ, floorY, roofK, st, add, DS.canopy);
  const lanterns = land?.lanterns || (L.deco.doorLantern ? 1 : 0);
  for (let i = 0; i < lanterns; i++) {
    const sx = lanterns === 2 ? (i ? 1 : -1) : (h.seed % 2 ? 1 : -1);
    wallLantern(doorLX + sx * DS.lantern.side, floorY + DS.lantern.y, doorZ, add, DS.lantern);
  }
  // hanging shop sign beside the door, on an iron arm
  if (L.trade) {
    const sgn = S.trades[L.trade].sign, items = S.signCells.items, [sc0, sc1] = S.signCells.grid;
    const sx = (h.door.cell + 1 < wc ? 1 : -1), x = doorLX + sx * 1.15, sz = DS.sign, y = floorY + sz.y, z = -D / 2;
    add({ s: 'box', m: 'iron', t: '#ffffff', w: 0.06, h: 0.06, d: sz.arm, p: [r3(x), r3(y), r3(z - sz.arm / 2)] }, 'sign arm');
    add({ s: 'box', m: 'iron', t: '#ffffff', w: 0.05, h: 0.5, d: 0.05, p: [r3(x), r3(y - 0.22), r3(z - 0.06)], r: [-0.75, 0, 0] }, 'sign arm');
    const sy = y - 0.06 - sz.h / 2, szz = z - 0.2 - sz.w / 2;
    add({ s: 'box', m: 'planks', t: '#d0b496', w: 0.07, h: r3(sz.h + 0.08), d: r3(sz.w + 0.08), p: [r3(x), r3(sy), r3(szz)] }, 'sign board');
    const cell = items.indexOf(sgn);
    if (cell < 0) throw new Error(`housekit: the sign "${sgn}" is not painted on the atlas (styles.json signCells)`);
    for (const sx2 of [-1, 1]) add({ s: 'quad', m: 'sign', t: '#ffffff', w: sz.w, h: sz.h, fit: [cell % sc0, Math.floor(cell / sc0), sc0, sc1], p: [r3(x + sx2 * 0.045), r3(sy), r3(szz)], r: [0, r3(sx2 * Math.PI / 2), 0] }, 'sign');
    for (const o of [-1, 1]) add({ s: 'box', m: 'iron', t: '#ffffff', w: 0.03, h: 0.08, d: 0.03, p: [r3(x), r3(y - 0.06), r3(szz + o * (sz.w / 2 - 0.08))] }, 'sign ring');
  }
  // a banner beside a shop door (the old shop look, kept)
  if (h.shop && !land && storeys > 1) {
    const bi = h.door.cell + (h.door.cell + 1 < wc ? 1 : -1);
    if (bi >= 0 && bi < wc && !L.trade) { const [bx] = sides[0].edge(bi, 0); add({ s: 'kit', kit: 'town', id: (h.seed % 2) ? 'banner-red' : 'banner-green', p: [r3(bx), r3(floorY + C * 0.55), r3(-D / 2 + C / 2)], r: [0, Math.PI / 2, 0], sc: [C, C, C], cells: S.kitCells.town }, 'banner'); }
  }

  // -------------------------------------------------------------- window boxes with flowers, balconies
  if (L.deco.windowBox) {
    const wb = DS.windowBox, fr = rngFor(h.seed, 'flowers');
    for (const w of windowsAt) {
      if (w.side !== 'front') continue;
      if (w.k === 0 && h.shop) continue;
      if (fr() < 0.35) continue;                              // not every window
      const sill = w.y + 0.31 * C - wb.drop, ww = Math.max(0.7, Math.min(wb.w, w.half * 2 + 0.5));
      const cx = w.e[0], cz = w.e[1] - wb.d / 2 - 0.04;
      add({ s: 'box', m: 'paint', t: L.shutter, w: r3(ww), h: wb.h, d: wb.d, p: [r3(cx), r3(sill - wb.h / 2), r3(cz)] }, 'window box');
      add({ s: 'box', m: 'flowers', t: '#ffffff', w: r3(ww - 0.06), h: 0.1, d: r3(wb.d - 0.06), p: [r3(cx), r3(sill + 0.04), r3(cz)] }, 'flowers');
      const nfl = Q.flowers;
      for (let i = 0; i < nfl; i++) add({ s: 'blob', m: 'flowers', t: ['#ffffff', '#ffd8e0', '#fff0c0'][i % 3], r: 0, rad: r3(0.13 + fr() * 0.05), p: [r3(cx - ww / 2 + ww * (i + 0.5) / nfl), r3(sill + 0.12), r3(cz)] }, 'flowers');
    }
  }
  if (L.deco.balcony && storeys >= 2) {
    const bc = balconyCell(h, wc), [bx] = sides[0].edge(bc, 1), b = DS.balcony, y = floorY + C, z = frontZ(1);
    add({ s: 'box', m: 'planks', t: '#f0dcc4', w: b.w, h: 0.14, d: b.d, p: [r3(bx), r3(y + 0.02), r3(z - b.d / 2)] }, 'balcony');
    for (const o of [-1, 1]) add({ s: 'box', m: 'timber', t: st.frameTint, w: 0.18, h: 0.7, d: 0.18, p: [r3(bx + o * (b.w / 2 - 0.25)), r3(y - 0.3), r3(z - b.d / 2 + 0.05)], r: [0.75, 0, 0] }, 'balcony bracket');
    const posts = 6;
    for (let i = 0; i <= posts; i++) add({ s: 'box', m: 'timber', t: st.frameTint, w: 0.08, h: b.rail, d: 0.08, p: [r3(bx - b.w / 2 + 0.05 + (b.w - 0.1) * i / posts), r3(y + 0.08 + b.rail / 2), r3(z - b.d + 0.05)] }, 'balcony rail');
    for (const sx of [-1, 1]) add({ s: 'box', m: 'timber', t: st.frameTint, w: 0.08, h: b.rail, d: b.d, p: [r3(bx + sx * (b.w / 2 - 0.05)), r3(y + 0.08 + b.rail / 2), r3(z - b.d / 2)] }, 'balcony rail');
    add({ s: 'box', m: 'timber', t: st.frameTint, w: b.w + 0.06, h: 0.1, d: 0.12, p: [r3(bx), r3(y + 0.1 + b.rail), r3(z - b.d + 0.05)] }, 'balcony rail');
  }

  // -------------------------------------------------------------- ivy climbing the stone, yard things against the back
  if (L.deco.ivy) {
    const ir = rngFor(h.seed, 'ivy'), n = 2 + Math.floor(ir() * 3);
    for (let i = 0; i < n; i++) {
      const front = ir() < 0.5, hgt = Math.min(top - floorY - 0.4, 1.6 + ir() * (storeys * C * 0.7));
      // on a cell seam (between windows), climbing from the ground
      const seam = Math.floor(ir() * (wc + 1)), x = -W / 2 + C * seam, z = front ? -D / 2 - 0.04 : D / 2 + 0.04;
      const lean = (ir() - 0.5) * 0.4;
      for (let j = 0; j < 3; j++) {
        const pw = 0.5 + ir() * 0.5 - j * 0.1, ph = hgt * (1 - j * 0.28), px = x + lean * j + (ir() - 0.5) * 0.3;
        add({ s: 'box', m: 'ivy', t: ['#ffffff', '#e0f0d0', '#c8e0b8'][j], w: r3(Math.max(0.3, pw)), h: r3(ph), d: 0.07, p: [r3(Math.max(-W / 2 + 0.2, Math.min(W / 2 - 0.2, px))), r3(floorY + ph / 2 - 0.05), r3(z + (front ? -1 : 1) * j * 0.015)] }, 'ivy');
      }
      add({ s: 'blob', m: 'ivy', t: '#ffffff', rad: 0.3, p: [r3(Math.max(-W / 2 + 0.2, Math.min(W / 2 - 0.2, x))), r3(floorY + hgt - 0.05), r3(z)] }, 'ivy');
    }
  }
  if (ctx.yard && ctx.yard.d >= 2.5) {
    const yz = D / 2, yy = Math.min(floorY, ctx.yard.y ?? floorY);
    if (L.deco.rainBarrel) {
      const sx = (h.seed % 2 ? -1 : 1) * (W / 2 - 0.55);
      add({ s: 'kit', kit: 'survival', id: 'barrel', p: [r3(sx), r3(yy - 0.05), r3(yz + 0.5)], r: [0, 0, 0], sc: [2.6, 2.6, 2.6], cells: S.kitCells.survival }, 'rain barrel');
      add({ s: 'box', m: 'iron', t: '#a0a4a8', w: 0.12, h: r3(top - yy - 1.0), d: 0.12, p: [r3(sx), r3(yy + 0.9 + (top - yy - 1.0) / 2), r3(yz + 0.12)] }, 'down pipe');
      add({ s: 'box', m: 'iron', t: '#a0a4a8', w: r3(Math.min(W, 6)), h: 0.14, d: 0.18, p: [r3(sx * 0.5), r3(top - 0.1), r3(yz + 0.12)] }, 'gutter');
    }
    if (L.deco.woodpile) woodpile((h.seed % 2 ? 1 : -1) * (W / 2 - 1.3), yy, yz, add, h.seed);
  }

  // -------------------------------------------------------------- landmarks: battlements, forge, bell cote, rose window
  if (land?.battlement) {
    const y = top, m = 0.55;
    for (const [x0, z0, x1, z1] of [[-W / 2, -D / 2, W / 2, -D / 2], [-W / 2, D / 2, W / 2, D / 2], [-W / 2, -D / 2, -W / 2, D / 2], [W / 2, -D / 2, W / 2, D / 2]]) {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / 1.1);
      for (let i = 0; i < n; i += 2) { const t = (i + 0.5) / n; add({ s: 'box', m: 'stone', t: '#c0b8ac', w: x0 === x1 ? 0.5 : r3(len / n), h: m, d: x0 === x1 ? r3(len / n) : 0.5, p: [r3(x0 + (x1 - x0) * t), r3(y + m / 2), r3(z0 + (z1 - z0) * t)] }, 'battlement'); }
    }
    add({ s: 'box', m: 'stone', t: '#a8a096', w: r3(W + 0.3), h: 0.25, d: r3(D + 0.3), p: [0, r3(top - 0.12), 0] }, 'battlement ledge');
  }
  if (land?.forge) {
    const fx = -W / 2 + 1.2, fz = D / 2 - 1.1;
    add({ s: 'box', m: 'stone', t: '#a89888', w: 1.8, h: 0.95, d: 1.5, p: [r3(fx), r3(floorY + 0.47), r3(fz)] }, 'forge');
    add({ s: 'box', m: 'iron', t: '#ff9a50', w: 1.2, h: 0.06, d: 0.9, p: [r3(fx), r3(floorY + 0.97), r3(fz)] }, 'forge coals');
    add({ s: 'box', m: 'stone', t: '#988878', w: 1.2, h: 1.6, d: 0.9, p: [r3(fx), r3(floorY + 1.9), r3(fz + 0.2)] }, 'forge hood');
    add({ s: 'box', m: 'iron', t: '#ffffff', w: 0.75, h: 0.3, d: 0.35, p: [r3(fx + 1.9), r3(floorY + 0.75), r3(fz - 0.7)] }, 'anvil');
    add({ s: 'box', m: 'timber', t: '#d0b496', w: 0.45, h: 0.6, d: 0.45, p: [r3(fx + 1.9), r3(floorY + 0.3), r3(fz - 0.7)] }, 'anvil block');
    add({ s: 'box', m: 'planks', t: '#dcc4a8', w: 1.4, h: 0.6, d: 0.6, p: [r3(fx + 3.4), r3(floorY + 0.3), r3(-D / 2 + 1.0)] }, 'water trough');
    add({ s: 'box', m: 'water', t: '#7aa0c0', w: 1.25, h: 0.05, d: 0.45, p: [r3(fx + 3.4), r3(floorY + 0.58), r3(-D / 2 + 1.0)] }, 'water');
  }
  if (land?.bellCote && roof.kind === 'gable') {
    const [bx, bz] = roof.alongX ? [roof.cx - roof.len / 2 + 0.7, roof.cz] : [roof.cx, roof.cz - roof.len / 2 + 0.7];
    const y = top + roof.rise;
    for (const [ox, oz] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) add({ s: 'box', m: 'stone', t: '#c8c0b4', w: 0.18, h: 1.1, d: 0.18, p: [r3(bx + ox), r3(y + 0.4), r3(bz + oz)] }, 'bell cote');
    add({ s: 'cyl', m: 'iron', t: '#d8b060', rt: 0.12, rb: 0.32, h: 0.5, n: 8, p: [r3(bx), r3(y + 0.65), r3(bz)] }, 'bell');
    add({ s: 'cone', m: roofK.look, t: '#ffffff', rb: 0.85, h: 0.9, n: 4, p: [r3(bx), r3(y + 1.4), r3(bz)], r: [0, Math.PI / 4, 0] }, 'bell cote roof');
  }
  if (land?.roseWindow) {
    add({ s: 'cyl', m: 'stone', t: '#c8c0b2', rt: 0.75, rb: 0.75, h: 0.12, n: 12, p: [0, r3(top + 1.1), r3(-D / 2 - 0.06)], r: [Math.PI / 2, 0, 0] }, 'rose window');
    add({ s: 'cyl', m: 'glass', t: '#d8c8ff', rt: 0.6, rb: 0.6, h: 0.14, n: 12, p: [0, r3(top + 1.1), r3(-D / 2 - 0.07)], r: [Math.PI / 2, 0, 0] }, 'rose window');
  }
  return { parts, look: L, smoke, w: W, d: D };
}

/** A style's wall pieces: palette square → [look, tint] for this house's colours (L = houseLook, or the style's first picks). */
export function familyCells(S, styleId, L = null) {
  const st = S.styles[styleId], fam = S.families[st.family];
  const plaster = L?.plaster ?? st.plasters[0], door = L?.door ?? st.doorTints[0], shut = L ? L.deco.shutters : true, shutter = L?.shutter ?? st.shutters[0];
  const roles = {
    wall: [st.wall, plaster], frame: [st.frame, st.frameTint], door: ['door', door], quoin: [st.quoin, st.quoinTint],
    shutter: [shut ? 'paint' : st.frame, shut ? shutter : st.frameTint],
  };
  return Object.fromEntries(Object.entries(fam.cells).map(([k, role]) => [k, roles[role] || roles.wall]));
}

function balconyCell(h, wc) { return h.door.cell + 1 < wc ? h.door.cell + 1 : Math.max(0, h.door.cell - 1); }

/** Gable roof over a rectangle: two slabs, gable triangles (with beams on timber), ridge cap, finials. */
function gableRoof(R, top, roofK, st, L, add, { front, pitch }) {
  const W = R.x1 - R.x0, D = R.z1 - R.z0, cx = (R.x0 + R.x1) / 2, cz = (R.z0 + R.z1) / 2;
  const alongX = !front, len = alongX ? W : D, span = alongX ? D : W;
  const e = roofK.eave, gOver = roofK.gableOver, th = roofK.thick;
  const rise = (span / 2) * pitch, ang = Math.atan2(rise, span / 2), slope = (span / 2 + e) / Math.cos(ang);
  const turn = alongX ? 0 : Math.PI / 2;
  for (const side of [-1, 1]) {
    // a slab: tilted about the ridge, its underside through the wall top at the eave line; in the house frame
    const mid = slope / 2, dy = Math.sin(ang) * mid, dh = Math.cos(ang) * mid;
    // slab centre: from the ridge (y top+rise, across 0) down the slope by `mid`, lifted by th/2 along its normal
    const nY = Math.cos(ang), nA = Math.sin(ang) * side;
    const across = side * dh + nA * th / 2, y = top + rise - dy + nY * th / 2;
    const [px, pz] = alongX ? [cx, cz + across] : [cx + across, cz];
    add({ s: 'box', m: roofK.look, t: roofK.tint, under: roofK.under, edge: roofK.edge, w: r3(len + gOver * 2), h: th, d: r3(slope), p: [r3(px), r3(y), r3(pz)], r: [r3(side * ang), turn, 0] }, 'roof');
  }
  // ridge cap
  const ry = top + rise + th * 0.6;
  if (roofK.ridge === 'roll' || roofK.ridge === 'thick') {
    const rr = roofK.ridge === 'thick' ? 0.34 : 0.17;
    add({ s: 'cyl', m: roofK.ridgeLook, t: roofK.ridgeTint, rt: rr, rb: rr, h: r3(len + gOver * 2 + 0.1), n: roofK.ridge === 'thick' ? 8 : 6, p: [r3(cx), r3(ry), r3(cz)], r: alongX ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0] }, 'ridge');
  } else add({ s: 'box', m: roofK.ridgeLook, t: roofK.ridgeTint, w: alongX ? r3(len + gOver * 2 + 0.1) : 0.36, h: 0.24, d: alongX ? 0.36 : r3(len + gOver * 2 + 0.1), p: [r3(cx), r3(ry - 0.04), r3(cz)] }, 'ridge');
  // gable ends
  for (const end of [-1, 1]) {
    const g = end * (len / 2 - 0.06);
    const P = (a, y, b) => alongX ? [r3(cx + a), r3(y), r3(cz + b)] : [r3(cx + b), r3(y), r3(cz + a)];
    add({ s: 'tri', m: st.gable, t: st.gable === st.wall ? L.plaster : '#ffffff', pts: [P(g, top, -span / 2), P(g, top, span / 2), P(g, top + rise, 0)] }, 'gable');
    // timber gables: a tie beam, a king post and two struts
    if (st.gableBeams && L.deco.gableBraces) {
      const gg = end * (len / 2 + 0.02), b = 0.2, ft = st.frameTint;
      const beamAt = (a, b2, tag) => {
        const [x0, y0, z0] = a, [x1, y1, z1] = b2, l = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
        const pitchA = Math.atan2(y1 - y0, alongX ? (z1 - z0) : (x1 - x0));
        add({ s: 'box', m: 'timber', t: ft, w: alongX ? 0.12 : r3(l), h: b, d: alongX ? r3(l) : 0.12, p: [r3((x0 + x1) / 2), r3((y0 + y1) / 2), r3((z0 + z1) / 2)], r: alongX ? [r3(-pitchA), 0, 0] : [0, 0, r3(pitchA)] }, tag);
      };
      beamAt(P(gg, top + 0.1, -span / 2), P(gg, top + 0.1, span / 2), 'gable beam');
      add({ s: 'box', m: 'timber', t: ft, w: alongX ? 0.12 : 0.2, h: r3(rise - 0.3), d: alongX ? 0.2 : 0.12, p: P(gg, top + (rise - 0.3) / 2 + 0.1, 0) }, 'gable beam');
      beamAt(P(gg, top + 0.15, -span * 0.3), P(gg, top + rise * 0.62, -0.05), 'gable brace');
      beamAt(P(gg, top + 0.15, span * 0.3), P(gg, top + rise * 0.62, 0.05), 'gable brace');
    }
    if (roofK.finial && L.deco.finials) {
      const fp = P(end * (len / 2 + gOver * 0.9), top + rise + th + 0.12, 0);
      add({ s: 'cyl', m: 'iron', t: '#ffffff', rt: 0.03, rb: 0.05, h: 0.6, n: 6, p: [fp[0], r3(fp[1] + 0.3), fp[2]] }, 'finial');
      add({ s: 'blob', m: 'iron', t: '#e8c070', rad: 0.09, p: [fp[0], r3(fp[1] + 0.62), fp[2]] }, 'finial');
    }
  }
  // fascia boards under the eaves (the slab edge reads as a painted trim)
  return { kind: 'gable', alongX, len, span, rise, cx, cz, top, ang, e, th, slopeFront: alongX, gOver };
}

/** Pyramid (tower) roof: four triangles + eave boards, a finial at the point. */
function pyramidRoof(R, top, roofK, st, L, add) {
  const W = R.x1 - R.x0, D = R.z1 - R.z0, cx = (R.x0 + R.x1) / 2, cz = (R.z0 + R.z1) / 2, e = roofK.eave;
  const rise = Math.max(W, D) * 0.9, y0 = top + 0.55;
  add({ s: 'cone', m: roofK.look, t: roofK.tint, rb: r3(Math.hypot(W / 2 + e, D / 2 + e)), h: r3(rise), n: 4, p: [r3(cx), r3(y0 + rise / 2), r3(cz)], r: [0, Math.PI / 4, 0] }, 'roof');
  add({ s: 'cyl', m: 'iron', t: '#ffffff', rt: 0.03, rb: 0.06, h: 1.0, n: 6, p: [r3(cx), r3(y0 + rise + 0.45), r3(cz)] }, 'finial');
  add({ s: 'blob', m: 'iron', t: '#e8c070', rad: 0.12, p: [r3(cx), r3(y0 + rise + 0.95), r3(cz)] }, 'finial');
  return { kind: 'pyramid', alongX: true, len: W, span: D, rise, cx, cz, top: y0 };
}

/** Dormer windows on the front slope of a long gable roof. */
function dormers(g, h, st, L, roofK, add, DS, S) {
  const n = g.len >= 9 ? 2 : 1, dw = DS.dormer.w, dh = DS.dormer.h;
  const tanA = g.rise / (g.span / 2);
  const dFront = g.span / 2 - 0.55;                           // front face this far from the ridge line
  const baseY = g.top + (g.span / 2 - dFront) * tanA;
  const dBack = Math.max(0.2, (g.top + g.rise - baseY - dh) / tanA);
  const depth = dFront - dBack;
  for (let i = 0; i < n; i++) {
    const x = g.cx - g.len / 2 + g.len * (i + 0.5) / n, zf = g.cz - dFront;
    add({ s: 'box', m: st.wall === 'stone' ? 'stone' : st.wall, t: L.plaster, w: dw, h: dh, d: r3(depth), p: [r3(x), r3(baseY + dh / 2), r3(zf + depth / 2)] }, 'dormer');
    add({ s: 'box', m: 'timber', t: st.frameTint, w: r3(dw + 0.08), h: 0.12, d: 0.14, p: [r3(x), r3(baseY + 0.06), r3(zf - 0.03)] }, 'dormer');
    for (const sx of [-1, 1]) add({ s: 'box', m: 'timber', t: st.frameTint, w: 0.12, h: dh, d: 0.14, p: [r3(x + sx * (dw / 2 - 0.02)), r3(baseY + dh / 2), r3(zf - 0.03)] }, 'dormer');
    add({ s: 'quad', m: 'glass', t: S.glassTint, w: r3(dw * 0.62), h: r3(dh * 0.62), p: [r3(x), r3(baseY + dh * 0.5), r3(zf - 0.02)], r: [0, Math.PI, 0] }, 'dormer window');
    add({ s: 'box', m: 'timber', t: st.frameTint, w: 0.08, h: r3(dh * 0.62), d: 0.06, p: [r3(x), r3(baseY + dh * 0.5), r3(zf - 0.05)] }, 'dormer');
    // its own little gable roof, ridge running back into the main roof
    const rr = 0.5, a = Math.atan2(rr, dw / 2 + 0.15), sl = (dw / 2 + 0.2) / Math.cos(a), len = depth + 0.3;
    for (const sx of [-1, 1]) {
      const mid = sl / 2, nY = Math.cos(a), th = 0.14;
      add({ s: 'box', m: roofK.look, t: roofK.tint, under: roofK.under, w: r3(sl), h: th, d: r3(len), p: [r3(x + sx * Math.cos(a) * mid - sx * Math.sin(a) * th / 2 * 0), r3(baseY + dh + rr - Math.sin(a) * mid + nY * th / 2), r3(zf + len / 2 - 0.2)], r: [0, 0, r3(-sx * a)] }, 'dormer roof');
    }
    add({ s: 'tri', m: st.gable, t: st.gable === st.wall ? L.plaster : '#ffffff', pts: [[r3(x - dw / 2), r3(baseY + dh), r3(zf + 0.01)], [r3(x + dw / 2), r3(baseY + dh), r3(zf + 0.01)], [r3(x), r3(baseY + dh + rr), r3(zf + 0.01)]] }, 'dormer');
  }
}

/** A little pitched canopy over a door on two brackets. */
function canopy(x, z, floorY, roofK, st, add, c) {
  const y = floorY + c.y, a = Math.atan2(c.rise, c.d), sl = c.d / Math.cos(a) + 0.1;
  add({ s: 'box', m: roofK.look === 'thatch' ? 'shingles' : roofK.look, t: '#ffffff', under: 'planks', w: c.w, h: 0.1, d: r3(sl), p: [r3(x), r3(y + c.rise / 2), r3(z - c.d / 2)], r: [r3(-a), 0, 0] }, 'door canopy');
  for (const sx of [-1, 1]) {
    add({ s: 'box', m: 'timber', t: st.frameTint, w: 0.1, h: 0.1, d: r3(c.d), p: [r3(x + sx * (c.w / 2 - 0.15)), r3(y - 0.05), r3(z - c.d / 2)] }, 'canopy bracket');
    add({ s: 'box', m: 'timber', t: st.frameTint, w: 0.1, h: 0.1, d: r3(c.d * 0.9), p: [r3(x + sx * (c.w / 2 - 0.15)), r3(y - 0.3), r3(z - c.d * 0.35)], r: [0.75, 0, 0] }, 'canopy bracket');
  }
}

/** A wall lantern on an iron bracket. */
function wallLantern(x, y, z, add, c) {
  const o = c.out;
  add({ s: 'box', m: 'iron', t: '#ffffff', w: 0.05, h: 0.05, d: o, p: [r3(x), r3(y + 0.32), r3(z - o / 2)] }, 'lantern bracket');
  add({ s: 'box', m: 'iron', t: '#ffffff', w: 0.16, h: 0.06, d: 0.16, p: [r3(x), r3(y - 0.02), r3(z - o)] }, 'lantern');
  add({ s: 'box', m: 'glass', t: '#ffe2a0', w: 0.13, h: 0.24, d: 0.13, p: [r3(x), r3(y + 0.13), r3(z - o)] }, 'lantern glass');
  add({ s: 'cone', m: 'iron', t: '#ffffff', rb: 0.14, h: 0.14, n: 4, p: [r3(x), r3(y + 0.32), r3(z - o)], r: [0, Math.PI / 4, 0] }, 'lantern');
}

/** Firewood stacked against the back wall under a small lean-to. */
function woodpile(x, floorY, z, add, seed) {
  const r = rngFor(seed, 'woodpile'), logs = [];
  for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - (row === 2 ? 1 : 0); i++) logs.push([x - 0.6 + i * 0.36 + (row % 2) * 0.18, floorY + 0.16 + row * 0.3]);
  for (const [lx, ly] of logs) add({ s: 'cyl', m: 'timber', t: ['#ecd4b4', '#e0c8a8', '#f8e4c8'][Math.floor(r() * 3)], rt: 0.15, rb: 0.15, h: 0.95, n: 6, p: [r3(lx), r3(ly), r3(z + 0.55)], r: [Math.PI / 2, 0, 0] }, 'woodpile');
  add({ s: 'box', m: 'shingles', t: '#ffffff', w: 1.7, h: 0.08, d: 1.25, p: [r3(x), r3(floorY + 1.35), r3(z + 0.55)], r: [0.35, 0, 0] }, 'woodpile roof');
  for (const sx of [-1, 1]) add({ s: 'box', m: 'timber', t: '#dcc4a8', w: 0.1, h: 1.2, d: 0.1, p: [r3(x + sx * 0.78), r3(floorY + 0.6), r3(z + 1.08)] }, 'woodpile post');
}

// ---------------------------------------------------------------- yards and streets (WORLD frame parts)

/** One yard edge: wood fence, hedge or low stone wall, cut into ~2.6 m bays that follow the ground. */
export function describeFence(f, S, ctx) {
  const parts = [], dx = f.b[0] - f.a[0], dz = f.b[1] - f.a[1], L = Math.hypot(dx, dz); if (L < 0.4) return parts;
  const yaw = Math.atan2(dx, dz), n = Math.max(1, Math.round(L / 2.6)), seg = L / n, F = S.fences;
  for (let i = 0; i < n; i++) {
    const mx = f.a[0] + dx * (i + 0.5) / n, mz = f.a[1] + dz * (i + 0.5) / n, y = (ctx.groundAt ? ctx.groundAt(mx, mz) : (f.y ?? 0)) - 0.05;
    if (f.kind === 'stone') {
      parts.push({ s: 'box', m: F.stone.look, t: F.stone.tint, w: F.stone.w, h: F.stone.h, d: r3(seg + 0.05), p: [r3(mx), r3(y + F.stone.h / 2), r3(mz)], r: [0, r3(yaw), 0], tag: 'stone wall' });
      parts.push({ s: 'box', m: F.stone.cap, t: F.stone.capTint, w: r3(F.stone.w + 0.12), h: 0.12, d: r3(seg + 0.08), p: [r3(mx), r3(y + F.stone.h + 0.05), r3(mz)], r: [0, r3(yaw), 0], tag: 'stone wall' });
    } else if (f.kind === 'hedge') {
      parts.push({ s: 'box', m: 'ivy', t: F.hedge.tint, w: F.hedge.w, h: F.hedge.h, d: r3(seg + 0.1), p: [r3(mx), r3(y + F.hedge.h / 2), r3(mz)], r: [0, r3(yaw), 0], tag: 'hedge' });
      parts.push({ s: 'blob', m: 'ivy', t: F.hedge.tint, rad: r3(F.hedge.w * 0.62), p: [r3(mx), r3(y + F.hedge.h), r3(mz)], tag: 'hedge' });
    } else {
      const W_ = F.wood, ny = Math.max(1, Math.round(seg / 1.3));
      for (let j = 0; j <= ny; j++) { const t = -0.5 + j / ny; parts.push({ s: 'box', m: 'timber', t: '#e8d4bc', w: W_.post, h: W_.h, d: W_.post, p: [r3(mx + Math.sin(yaw) * t * seg), r3(y + W_.h / 2), r3(mz + Math.cos(yaw) * t * seg)], r: [0, r3(yaw), 0], tag: 'fence' }); }
      for (let k = 0; k < W_.rails; k++) parts.push({ s: 'box', m: 'timber', t: '#f0dcc4', w: 0.06, h: 0.13, d: r3(seg + 0.05), p: [r3(mx), r3(y + W_.h * (0.4 + 0.42 * k)), r3(mz)], r: [0, r3(yaw), 0], tag: 'fence' });
    }
  }
  return parts;
}

/** A yard / street prop. Returns parts, or null when the kit does not draw this kind (the game places it). */
export function describeProp(p, S, ctx = {}) {
  const [x, z] = p.at, y = p.y ?? (ctx.groundAt ? ctx.groundAt(x, z) : 0), f = p.facing || 0, out = [];
  if (p.kind === 'garden') {
    out.push({ s: 'box', m: 'soil', t: '#7a5a40', w: 2.2, h: 0.25, d: 1.4, p: [r3(x), r3(y + 0.08), r3(z)], r: [0, r3(f), 0], tag: 'garden' });
    for (const o of [-0.7, 0, 0.7]) out.push({ s: 'blob', m: 'flowers', t: o === 0 ? '#c8e0a0' : '#ffffff', rad: 0.32, p: [r3(x + Math.cos(f) * o), r3(y + 0.36), r3(z - Math.sin(f) * o)], tag: 'garden' });
    return out;
  }
  if (p.kind === 'woodpile') { woodpile(0, 0, -0.55, (o, tag) => { o.tag = tag; out.push(o); }, Math.round(x * 31 + z * 17)); return out.map(o => moveTo(o, x, y, z, f)); }
  if (p.kind === 'washing') {
    for (const sx of [-1, 1]) out.push(moveTo({ s: 'box', m: 'timber', t: '#dcc4a8', w: 0.1, h: 1.9, d: 0.1, p: [sx * 1.4, 0.95, 0], tag: 'washing line' }, x, y, z, f));
    out.push(moveTo({ s: 'box', m: 'iron', t: '#d0d0d0', w: 2.8, h: 0.02, d: 0.02, p: [0, 1.8, 0], tag: 'washing line' }, x, y, z, f));
    ['#e8e0d0', '#9ab0d0', '#d09a8a'].forEach((t, i) => out.push(moveTo({ s: 'box', m: 'cloth', t, w: 0.6, h: 0.7, d: 0.03, p: [-0.8 + i * 0.8, 1.42, 0], tag: 'washing' }, x, y, z, f)));
    return out;
  }
  if (p.kind === 'coop') {
    out.push(moveTo({ s: 'box', m: 'planks', t: '#f0dcc4', w: 1.2, h: 0.8, d: 0.9, p: [0, 0.6, 0], tag: 'coop' }, x, y, z, f));
    out.push(moveTo({ s: 'box', m: 'shingles', t: '#ffffff', w: 1.4, h: 0.08, d: 1.1, p: [0, 1.08, 0], r: [0.2, 0, 0], tag: 'coop' }, x, y, z, f));
    for (const [ox, oz] of [[-0.5, -0.35], [0.5, -0.35], [-0.5, 0.35], [0.5, 0.35]]) out.push(moveTo({ s: 'box', m: 'timber', t: '#dcc4a8', w: 0.08, h: 0.3, d: 0.08, p: [ox, 0.15, oz], tag: 'coop' }, x, y, z, f));
    return out;
  }
  if (p.kind === 'fountain') {
    const pp = S.props.fountain;
    out.push({ s: 'kit', kit: pp[0], id: pp[1], p: [r3(x), r3(y), r3(z)], r: [0, 0, 0], sc: [pp[2], pp[2], pp[2]], cells: S.kitCells.town, tag: 'fountain' });
    out.push({ s: 'cyl', m: 'water', t: '#8ab8d8', rt: r3(pp[2] * 0.86), rb: r3(pp[2] * 0.86), h: 0.1, n: 24, p: [r3(x), r3(y + pp[2] * 0.33), r3(z)], tag: 'fountain water' });
    return out;
  }
  const pp = p.kind === 'stall' && p.colour === 'green' ? S.props['stall-green'] : S.props[p.kind];
  if (!pp) return null;
  const cells = p.kind === 'lantern' ? S.lanternLook.town : S.kitCells[pp[0]];
  out.push({ s: 'kit', kit: pp[0], id: pp[1], p: [r3(x), r3(y), r3(z)], r: [0, r3(f), 0], sc: [pp[2], pp[2], pp[2]], cells, tag: p.kind });
  return out;
}
function moveTo(o, x, y, z, f) {
  const c = Math.cos(f), s = Math.sin(f), [lx, ly, lz] = o.p;
  o.p = [r3(x + lx * c + lz * s), r3(y + ly), r3(z - lx * s + lz * c)];
  o.r = [o.r?.[0] || 0, r3((o.r?.[1] || 0) + f), o.r?.[2] || 0];
  return o;
}

/** A terrace (retaining) wall under a level pad, with a cap. */
export function describeTerraceWall(w, S) {
  const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1], L = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz), hh = w.y1 - w.y0 + 0.5;
  const mx = (w.a[0] + w.b[0]) / 2, mz = (w.a[1] + w.b[1]) / 2;
  return [
    { s: 'box', m: 'fieldstone', t: '#d0c8bc', w: 0.6, h: r3(hh), d: r3(L + 0.4), p: [r3(mx), r3(w.y0 - 0.5 + hh / 2), r3(mz)], r: [0, r3(yaw), 0], tag: 'terrace wall' },
    { s: 'box', m: 'stone', t: '#a8a096', w: 0.75, h: 0.14, d: r3(L + 0.5), p: [r3(mx), r3(w.y1 + 0.07), r3(mz)], r: [0, r3(yaw), 0], tag: 'terrace wall' },
  ];
}

/** A house record from the page's knobs (the same fields the town planner fills in). */
export function houseFromKnobs(k, S) {
  const C = S.cell, land = k.kind ? S.landmarks[k.kind] : null;
  const [wc, dc] = land ? land.cells : [k.wc, k.dc], storeys = land ? land.storeys : k.storeys;
  const W = wc * C, D = dc * C, at = k.at || [0, 0], facing = k.facing || 0;
  const doorCell = Math.min(wc - 1, k.doorCell ?? (wc <= 2 ? 0 : 1)), slope = k.slope || 0;
  const groundAt = (x, z) => { const c = Math.cos(facing), s = Math.sin(facing), lz = (x - at[0]) * s + (z - at[1]) * c; return lz * slope + (k.groundY || 0); };   // the ground climbs away from the street (+z)
  // the floor sits on the highest ground under the house, the plinth goes down to the lowest
  let lo = Infinity, hi = -Infinity;
  for (const [lx, lz] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) { const c = Math.cos(facing), s = Math.sin(facing); const y = groundAt(at[0] + lx * c + lz * s, at[1] - lx * s + lz * c); lo = Math.min(lo, y); hi = Math.max(hi, y); }
  const dl = [-W / 2 + C * (doorCell + 0.5), -D / 2 - 1.1], c = Math.cos(facing), s = Math.sin(facing);
  return {
    id: k.id || 'page', at, w: W, d: D, facing, cells: [wc, dc], storeys, floorY: r3(hi + 0.12), baseY: r3(lo - 0.25),
    style: land ? land.style : k.style, roof: k.roof ?? 0, roofKind: k.roofKind || undefined, plaster: k.plaster ?? 0,
    door: { cell: doorCell, at: [r3(at[0] + dl[0] * c + dl[1] * s), r3(at[1] - dl[0] * s + dl[1] * c)] },
    shop: !!k.shop || !!k.trade, trade: k.trade || undefined, jetty: !!k.jetty, chimney: k.chimney !== false, seed: k.seed >>> 0,
    kind: k.kind || undefined, _ground: groundAt,
  };
}
/** The page's knobs that reproduce a plan house exactly (the same-house test round-trips every Larkford house). */
export function knobsFromHouse(h) {
  return { wc: h.cells[0], dc: h.cells[1], storeys: h.storeys, style: h.style, roof: h.roof, plaster: h.plaster, doorCell: h.door.cell, shop: h.shop, trade: h.trade, jetty: h.jetty, chimney: h.chimney, seed: h.seed, kind: h.kind, at: h.at, facing: h.facing };
}

/**
 * What the game hands the kit for one planned house: the house record and its context as plain numbers (door-spot
 * ground height, its back yard). Saved as JSON this is a "house snapshot" — the review page opens one and draws
 * exactly the game's house (tests/same-house.test.mjs; tools/snap-town.mjs writes data/larkford.json).
 */
export function houseInput(h, { yards = [], heightAt = null, quality = 'medium' } = {}) {
  const y = yards.find(v => v.house === h.id);
  const house = { ...h }; delete house._ground;
  return {
    house,
    ctx: { quality, streetY: heightAt && h.door?.at ? r3(heightAt(h.door.at[0], h.door.at[1])) : r3(h.floorY - 0.12), yard: y ? { d: y.d, y: y.y } : null },
  };
}
