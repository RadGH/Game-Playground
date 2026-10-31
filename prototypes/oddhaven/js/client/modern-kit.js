// The modern kit: what a building looks like from the street. Everything is coloured triangles in the shared Batch, so a town stays
// one draw call per map square, and a building is a short list of parts picked by its trade: a family house with a porch and a
// garage door, a shop with a glass front and a sign band, an office in strips of glass, flats with balconies, a roller-door yard.
// Nothing here comes from proctown's medieval kit (rule 9: that code is untouched).
//
//   drawBuilding(B, b, colours)     b = a world building, with b.use = its trade
import { FLOOR_H, DOOR_H, FRONT_W } from '../sim/interior.js';
import { GARAGE } from '../sim/parking.js';

const FRAME = '#e9e4d6', GLASS = '#37495a', LIT = '#8fb6cf', DOOR = '#5b3b28', STEP = '#9c978c', ROOF_D = '#5b5e62', PARAPET = '#8a8a84', STEEL = '#aeb4b8', DARK = '#2f3338', PATH = '#c2bcae', LAWN = '#79a556', DRIVE = '#8c8a86', HEDGE = '#4f7c44', SHUT = '#7c8288', SIGN = '#f1ead8';
const AWNINGS = ['#c2493d', '#3f78b5', '#4e9a6a', '#e0b93c'];
const SHOP_COL = { grocery: '#3f8f5a', boutique: '#a2507f', cafe: '#8a5a3a', diner: '#c2493d', bar: '#59406f', gym: '#2f7fa8', fire_station: '#c23a2e', police_station: '#2f5fa8', clinic: '#e9f0f2', garage: '#d08a2c', office: '#3c5a78', school: '#d9a93c', town_hall: '#b49a58', rift_lodge: '#5a3e92', sawmill: '#8a6a3c', lumber_yard: '#7a5a34' };
const hash = (a, b) => { let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export function drawBuilding(B, b, rgb) {
  const s = Math.sin(b.yaw), c = Math.cos(b.yaw), hx = b.w / 2, hz = b.d / 2, Y = b.y, use = b.use ?? b.kind;
  const L = (lx, lz) => [b.x + lx * c + lz * s, b.z - lx * s + lz * c];
  const wall = rgb(b.tint), roofC = rgb(b.roofTint), trim = rgb(FRAME);
  const faces = [{ nx: s, nz: c, w: b.w, at: L(0, hz), front: true }, { nx: -s, nz: -c, w: b.w, at: L(0, -hz) }, { nx: c, nz: -s, w: b.d, at: L(hx, 0) }, { nx: -c, nz: s, w: b.d, at: L(-hx, 0) }];
  const eave = b.roof === 'gable' ? Y + b.floors * 3.1 : Y + b.h;
  const paint = rgb(SHOP_COL[use] ?? '#777');
  const glass = i => rgb(hash(i, Math.round(b.x)) > 0.72 ? LIT : GLASS);
  // the front yard: a path to the door, a lawn or a forecourt either side
  const yard = 3, fx = s, fz = c, fa = L(0, hz + yard / 2), tag = B.tag;
  B.tag = 0;     // the yard stays when the building is cut open
  B.box(fa[0], Y + 0.02, fa[1], hx, 0.01, yard / 2, b.yaw, rgb(use === 'house' ? LAWN : DRIVE));
  { const p = L(b.doorX, hz + yard / 2); B.box(p[0], Y + 0.04, p[1], 0.85, 0.012, yard / 2, b.yaw, rgb(PATH)); }
  if (use === 'house' && !b.garage) { const d = L(b.side * Math.min(3.4, hx - 2.5), hz + yard / 2); B.box(d[0], Y + 0.04, d[1], 2.4, 0.012, yard / 2 - 0.2, b.yaw, rgb(DRIVE)); }
  B.tag = tag;
  for (const f of faces) B.wall(f.at[0], f.at[1], f.nx, f.nz, f.w, Y - 0.4, eave, wall);
  const tx = c, tz = -s;                               // along the front
  const front = faces[0], F = (lx, y, lz = 0, w = 1, h = 1, col = wall) => { const p = L(lx, hz + lz); return [p[0], y, p[1], w, h, col]; };
  /** A rectangle on the front face at local x, from y0 to y1. */
  const onFront = (lx, w, y0, y1, col, out = 0.03) => { const p = L(lx, hz); B.wall(p[0], p[1], front.nx, front.nz, w, Y + y0, Y + y1, col, out); };
  void F; void tx; void tz; void fx; void fz;
  const windows = (f, y0, y1, each, gap, skipDoor = false) => {
    const bays = Math.max(1, Math.floor(f.w / gap)), pitch = f.w / bays, ttx = f.nz, ttz = -f.nx;
    for (let k = 0; k < bays; k++) {
      const off = (k + 0.5) * pitch - f.w / 2;
      if (skipDoor && Math.abs(off - (f.front ? b.doorX : 0)) < 1.5) continue;
      B.wall(f.at[0] + ttx * off, f.at[1] + ttz * off, f.nx, f.nz, each + 0.16, Y + y0 - 0.08, Y + y1 + 0.08, trim, 0.02);
      B.wall(f.at[0] + ttx * off, f.at[1] + ttz * off, f.nx, f.nz, each, Y + y0, Y + y1, glass(k * 7 + y0), 0.04);
    }
  };
  const streetDoor = (col = DOOR, w = FRONT_W) => {
    onFront(b.doorX, w + 0.24, 0, DOOR_H + 0.1, trim, 0.03);
    onFront(b.doorX, w, 0, DOOR_H, rgb(col), 0.05);
    const p = L(b.doorX, hz + 0.45); B.box(p[0], Y - 0.08, p[1], w / 2 + 0.2, 0.06, 0.45, b.yaw, rgb(STEP));
  };

  if (use === 'house') {
    for (const f of faces) for (let fl = 0; fl < b.floors; fl++) windows(f, fl * 3.1 + 1, fl * 3.1 + 2.2, 1.3, 3.2, f.front && fl === 0);
    streetDoor();
    if (b.garage) {
      const gx = b.garage * (hx - 1.75);
      onFront(gx, GARAGE.doorW + 0.25, 0, GARAGE.doorH + 0.15, trim, 0.03); onFront(gx, GARAGE.doorW, 0, GARAGE.doorH, rgb(SHUT), 0.05);
      for (let i = 1; i < 4; i++) onFront(gx, GARAGE.doorW, i * 0.62 - 0.02, i * 0.62 + 0.02, rgb(DARK), 0.06);
      const d = L(gx, hz + yard / 2); B.box(d[0], Y + 0.04, d[1], 1.45, 0.012, yard / 2, b.yaw, rgb(DRIVE));
    }
    // porch roof, and a hedge along the street where the yard is free
    const pr = L(b.doorX, hz + 0.7); B.box(pr[0], Y + 2.62, pr[1], 1.1, 0.07, 0.75, b.yaw, roofC);
    for (const sg of [-1, 1]) { const q = L(b.doorX + sg * 1, hz + 1.3); B.box(q[0], Y, q[1], 0.05, 1.3, 0.05, b.yaw, trim); }
    const ridge = b.h + Y + Math.min(b.d, b.w) * 0.42, over = 0.4, A = L(-hx - over, hz + over), Bb = L(hx + over, hz + over), C = L(hx + over, -hz - over), D = L(-hx - over, -hz - over), R0 = L(-hx - over, 0), R1 = L(hx + over, 0), G0 = L(-hx, 0), G1 = L(hx, 0), a2 = L(-hx, hz), b2 = L(hx, hz), c2 = L(hx, -hz), d2 = L(-hx, -hz);
    const v = (p, y) => [p[0], y, p[1]], low = eave - 0.1;
    B.quad(v(A, low), v(Bb, low), v(R1, ridge), v(R0, ridge), roofC);
    B.quad(v(C, low), v(D, low), v(R0, ridge), v(R1, ridge), roofC);
    B.tri(v(b2, eave), v(c2, eave), v(G1, ridge), wall);
    B.tri(v(d2, eave), v(a2, eave), v(G0, ridge), wall);
    const ch = L(hx * 0.5 * b.side, -1.5); B.box(ch[0], eave, ch[1], 0.35, (ridge - eave + 0.6) / 2, 0.35, b.yaw, rgb('#8a5a48'));
    return;
  }

  if (use === 'apartment') {
    for (const f of faces) for (let fl = 0; fl < b.floors; fl++) windows(f, fl * 3.1 + 1, fl * 3.1 + 2.3, 1.5, 3, f.front && fl === 0);
    streetDoor();
    const can = L(0, hz + 0.9); B.box(can[0], Y + 2.7, can[1], 1.8, 0.08, 0.9, b.yaw, rgb(STEEL));
    for (let fl = 1; fl < b.floors; fl++) for (const sg of [-1, 1]) {
      const bx = sg * b.w * 0.27, p = L(bx, hz + 0.6), y = Y + fl * 3.1;
      B.box(p[0], y, p[1], 1.5, 0.05, 0.6, b.yaw, rgb(PARAPET));
      const r = L(bx, hz + 1.17); B.box(r[0], y, r[1], 1.5, 0.45, 0.03, b.yaw, rgb(DARK));
    }
    B.box(b.x, Y + b.h, b.z, hx, 0.3, hz, b.yaw, rgb(PARAPET), rgb(ROOF_D));
    return;
  }

  // everything else is a flat roof with a parapet and something on it
  B.box(b.x, Y + b.h, b.z, hx, 0.3, hz, b.yaw, rgb(PARAPET), rgb(ROOF_D));
  const ac = L(-hx * 0.4, -hz * 0.3); B.box(ac[0], Y + b.h + 0.6, ac[1], 0.8, 0.45, 0.6, b.yaw, rgb(STEEL));
  const upper = (from = 1) => { for (let fl = from; fl < b.floors; fl++) for (const f of faces) windows(f, fl * 3.1 + 1, fl * 3.1 + 2.3, 1.5, 3.2); };

  if (['grocery', 'boutique', 'cafe', 'diner', 'bar', 'gym'].includes(use)) {
    upper(); for (const f of faces.slice(1)) windows(f, 1, 2.3, 1.3, 4);
    // a whole wall of glass with a sign band over it
    const span = (b.w - FRONT_W - 1) / 2;
    for (const sg of [-1, 1]) { onFront(b.doorX + sg * (FRONT_W / 2 + 0.3 + span / 2), span, 0.45, 2.7, rgb(LIT), 0.04); onFront(b.doorX + sg * (FRONT_W / 2 + 0.3 + span / 2), span + 0.1, 0.3, 0.45, trim, 0.03); }
    onFront(0, b.w - 0.1, 2.75, 3.3, paint, 0.1);
    onFront(0, Math.min(b.w * 0.5, 5.5), 2.86, 3.19, rgb(SIGN), 0.13);
    streetDoor(GLASS);
    const a = rgb(AWNINGS[Math.floor(hash(Math.round(b.x), Math.round(b.z)) * 4)]), p = L(0, hz + 0.6);
    B.box(p[0], Y + 2.62, p[1], hx - 0.2, 0.06, 0.6, b.yaw, use === 'gym' || use === 'bar' ? paint : a);
    return;
  }

  if (['fire_station', 'garage', 'sawmill', 'lumber_yard'].includes(use)) {
    upper(); for (const f of faces.slice(1)) windows(f, 1.4, 2.5, 1.3, 4.5);
    // the big roller door is on the side away from the street door
    const dx = b.doorX > 0 ? -hx + 3.2 : hx - 3.2, lx = Math.max(-hx + 2.2, Math.min(hx - 2.2, dx));
    onFront(lx, 3.7, 0, 3.15, trim, 0.03); onFront(lx, 3.4, 0, 3, rgb(use === 'fire_station' ? '#c23a2e' : SHUT), 0.05);
    for (let i = 1; i < 6; i++) onFront(lx, 3.4, i * 0.5 - 0.02, i * 0.5 + 0.02, rgb(DARK), 0.06);
    onFront(0, b.w - 0.1, 3.2, 3.7, paint, 0.08);
    streetDoor();
    if (use === 'fire_station') { const t = L(-hx + 1.4, -hz + 1.4); B.box(t[0], Y + b.h, t[1], 1.1, 2.2, 1.1, b.yaw, wall, rgb('#c23a2e')); }
    return;
  }

  if (use === 'town_hall' || use === 'school') {
    for (const f of faces) for (let fl = 0; fl < b.floors; fl++) windows(f, fl * 3.1 + 1, fl * 3.1 + 2.5, 1.8, 3.6, f.front && fl === 0);
    for (let k = -2; k <= 2; k++) { const p = L(b.doorX + k * 2, hz + 1.2); B.box(p[0], Y, p[1], 0.3, 3.3, 0.3, b.yaw, rgb('#e4dccd')); }
    const p = L(b.doorX, hz + 1.3); B.box(p[0], Y + 6.6, p[1], 6, 0.3, 1.5, b.yaw, rgb('#d8cfba'));
    onFront(b.doorX, 9, 4.3, 5, paint, 0.1);
    streetDoor(DOOR, 2.4);
    return;
  }

  // office, clinic, police, the Lodge: bands of glass, a porch, a coloured sign
  for (const f of faces) for (let fl = 0; fl < b.floors; fl++) {
    if (fl === 0 && f.front) continue;
    const y = fl * FLOOR_H + 0.9, w = f.w - 1.2, ttx = f.nz, ttz = -f.nx;
    void ttx; void ttz;
    B.wall(f.at[0], f.at[1], f.nx, f.nz, w, Y + y, Y + y + 1.7, rgb(hash(fl, Math.round(b.x)) > 0.5 ? LIT : GLASS), 0.04);
    for (let k = -Math.floor(w / 4); k <= Math.floor(w / 4); k++) B.wall(f.at[0] + f.nz * k * 2, f.at[1] - f.nx * k * 2, f.nx, f.nz, 0.1, Y + y, Y + y + 1.7, trim, 0.05);
  }
  onFront(b.doorX - b.w * 0.27, b.w * 0.34, 0.9, 2.5, rgb(LIT), 0.04); onFront(b.doorX + b.w * 0.27, b.w * 0.34, 0.9, 2.5, rgb(LIT), 0.04);
  onFront(0, b.w * 0.6, 2.78, 3.2, paint, 0.1);
  streetDoor(GLASS);
  const can = L(b.doorX, hz + 0.8); B.box(can[0], Y + 2.62, can[1], 1.6, 0.08, 0.8, b.yaw, paint);
  if (use === 'clinic') { const q = L(0, hz + 0.14); B.box(q[0], Y + 2.84, q[1], 0.42, 0.13, 0.02, b.yaw, rgb('#c23a2e')); B.box(q[0], Y + 2.72, q[1], 0.13, 0.26, 0.02, b.yaw, rgb('#c23a2e')); }
  if (use === 'rift_lodge') { for (const sg of [-1, 1]) { const q = L(b.doorX + sg * 1.5, hz + 0.25); B.box(q[0], Y + 1.9, q[1], 0.12, 0.2, 0.12, b.yaw, rgb('#b48cff')); } }
}
