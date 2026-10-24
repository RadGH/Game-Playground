// A tiny SVG path rasterizer, pure JavaScript (no DOM, no canvas), so a node test can SEE a picture the way a phone
// draws it. Round 12 (2026-10-24): Odd One Out offered a mirrored bee among bees — the Font Awesome bee is drawn from
// the front and is the same picture mirrored, so the "odd one" was invisible. tests/odd-one-out-looks.test.js draws
// every generated grid's odd picture and its normal one with this and asserts they really differ.
//
//   flatten(d)                       -> [[x, y], …] polygons (curves and arcs cut into short lines)
//   raster(d, w, h, { size, fit, turn, scale, flipX }) -> Uint8Array(size*size), 1 = ink (nonzero fill rule)
//     fit = share of the box the picture fills (0.88 = Odd One Out's 8.8 of a 10 box); turn in degrees; scale about the
//     centre — the same transforms Odd One Out's view puts on the <svg> (CSS transform-origin is the centre).
//   diffShare(a, b) -> pixels that differ / ink of a (0 = the same picture)

const NUM = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;

function tokens(d) {
  const out = []; let i = 0;
  while (i < d.length) {
    const c = d[i];
    if (/[a-zA-Z]/.test(c)) { out.push(c); i++; continue; }
    if (/[\s,]/.test(c)) { i++; continue; }
    NUM.lastIndex = i; const m = NUM.exec(d);
    if (!m) throw new Error('bad path at ' + i + ': ' + d.slice(i, i + 12));
    out.push(+m[0]); i = NUM.lastIndex;
  }
  return out;
}

/** Arc flags may be written squashed ("a8 8 0 01 16 0"): read the raw string for them. */
function tokensWithFlags(d) {
  // split the path into commands first, then parse arc arguments by hand so "011" reads as 0, 1, 1
  const out = []; const re = /([a-zA-Z])([^a-zA-Z]*)/g; let m;
  while ((m = re.exec(d))) {
    out.push(m[1]);
    const body = m[2];
    if (m[1] !== 'a' && m[1] !== 'A') { out.push(...tokens(body)); continue; }
    let i = 0, arg = 0;
    while (i < body.length) {
      const c = body[i];
      if (/[\s,]/.test(c)) { i++; continue; }
      if (arg % 7 === 3 || arg % 7 === 4) { out.push(+c); i++; arg++; continue; }
      NUM.lastIndex = i; const n = NUM.exec(body);
      if (!n) throw new Error('bad arc at ' + i + ': ' + body.slice(i, i + 12));
      out.push(+n[0]); i = NUM.lastIndex; arg++;
    }
  }
  return out;
}

function arcPoints(x1, y1, rx, ry, phi, fa, fs, x2, y2, pts) {
  if (rx === 0 || ry === 0) { pts.push([x2, y2]); return; }
  rx = Math.abs(rx); ry = Math.abs(ry);
  const cp = Math.cos(phi), sp = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let co = Math.sqrt(Math.max(0, num / den)); if (fa === fs) co = -co;
  const cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
  const cx = cp * cxp - sp * cyp + (x1 + x2) / 2, cy = sp * cxp + cp * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(4, Math.ceil(Math.abs(dt) / (Math.PI / 16)));
  for (let k = 1; k <= n; k++) {
    const t = t1 + dt * k / n, ex = rx * Math.cos(t), ey = ry * Math.sin(t);
    pts.push([cp * ex - sp * ey + cx, sp * ex + cp * ey + cy]);
  }
}

/** Path data -> polygons. */
export function flatten(d) {
  const tk = tokensWithFlags(d), polys = [];
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, cx2 = 0, cy2 = 0, qx = 0, qy = 0, poly = null, prev = '';
  const num = () => tk[i++];
  const start = (nx, ny) => { if (poly && poly.length > 1) polys.push(poly); poly = [[nx, ny]]; sx = nx; sy = ny; };
  const line = (nx, ny) => { (poly ||= [[x, y]]).push([nx, ny]); };
  const cubic = (x1, y1, x2, y2, ex, ey) => {
    for (let k = 1; k <= 12; k++) {
      const t = k / 12, u = 1 - t;
      line(u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * ex, u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * ey);
    }
  };
  const quad = (x1, y1, ex, ey) => {
    for (let k = 1; k <= 10; k++) { const t = k / 10, u = 1 - t; line(u * u * x + 2 * u * t * x1 + t * t * ex, u * u * y + 2 * u * t * y1 + t * t * ey); }
  };
  while (i < tk.length) {
    if (typeof tk[i] === 'string') cmd = tk[i++];
    else if (!cmd) throw new Error('path starts with a number');
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === 'Z') { if (poly) { poly.push([sx, sy]); polys.push(poly); poly = null; } x = sx; y = sy; prev = 'Z'; continue; }
    if (C === 'M') { const nx = num() + ox, ny = num() + oy; start(nx, ny); x = nx; y = ny; cmd = rel ? 'l' : 'L'; prev = 'M'; continue; }
    if (C === 'L') { const nx = num() + ox, ny = num() + oy; line(nx, ny); x = nx; y = ny; }
    else if (C === 'H') { const nx = num() + ox; line(nx, y); x = nx; }
    else if (C === 'V') { const ny = num() + oy; line(x, ny); y = ny; }
    else if (C === 'C') {
      const a = num() + ox, b = num() + oy, c = num() + ox, e = num() + oy, f = num() + ox, g = num() + oy;
      cubic(a, b, c, e, f, g); cx2 = c; cy2 = e; x = f; y = g;
    } else if (C === 'S') {
      const r1x = prev === 'C' || prev === 'S' ? 2 * x - cx2 : x, r1y = prev === 'C' || prev === 'S' ? 2 * y - cy2 : y;
      const c = num() + ox, e = num() + oy, f = num() + ox, g = num() + oy;
      cubic(r1x, r1y, c, e, f, g); cx2 = c; cy2 = e; x = f; y = g;
    } else if (C === 'Q') {
      const a = num() + ox, b = num() + oy, f = num() + ox, g = num() + oy;
      quad(a, b, f, g); qx = a; qy = b; x = f; y = g;
    } else if (C === 'T') {
      const a = prev === 'Q' || prev === 'T' ? 2 * x - qx : x, b = prev === 'Q' || prev === 'T' ? 2 * y - qy : y;
      const f = num() + ox, g = num() + oy; quad(a, b, f, g); qx = a; qy = b; x = f; y = g;
    } else if (C === 'A') {
      const rx = num(), ry = num(), rot = num() * Math.PI / 180, fa = num(), fs = num(), nx = num() + ox, ny = num() + oy;
      const pts = []; arcPoints(x, y, rx, ry, rot, fa, fs, nx, ny, pts); for (const p of pts) line(p[0], p[1]);
      x = nx; y = ny;
    } else throw new Error('unknown path command ' + cmd);
    prev = C;
  }
  if (poly && poly.length > 1) polys.push(poly);
  return polys;
}

const cache = new Map();
/** Rasterize path d (viewBox 0 0 w h) into a size x size square, picture centred and fitted to `fit` of the box. */
export function raster(d, w, h, { size = 48, fit = 0.88, turn = 0, scale = 1, flipX = false } = {}) {
  if (!cache.has(d)) cache.set(d, flatten(d));
  const polys = cache.get(d), s = fit * size / Math.max(w, h) * scale, c = size / 2;
  const a = turn * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  const map = ([px, py]) => {
    let X = (px - w / 2) * s, Y = (py - h / 2) * s;
    if (flipX) X = -X;
    return [ca * X - sa * Y + c, sa * X + ca * Y + c];
  };
  const edges = [];
  for (const p of polys) {
    const q = p.map(map);
    for (let k = 0; k < q.length; k++) {
      const [x0, y0] = q[k], [x1, y1] = q[(k + 1) % q.length];
      if (y0 !== y1) edges.push([x0, y0, x1, y1]);
    }
  }
  const out = new Uint8Array(size * size), SS = 3;   // 3 sample rows per pixel row, 3 columns: a pixel is ink if half its samples are
  const hits = new Uint8Array(size * size);
  for (let row = 0; row < size * SS; row++) {
    const yy = (row + 0.5) / SS, xs = [];
    for (const [x0, y0, x1, y1] of edges) {
      if ((yy >= y0) !== (yy >= y1)) xs.push([x0 + (yy - y0) / (y1 - y0) * (x1 - x0), y1 > y0 ? 1 : -1]);
    }
    xs.sort((p, q) => p[0] - q[0]);
    let wind = 0;
    for (let k = 0; k < xs.length - 1; k++) {
      wind += xs[k][1];
      if (!wind) continue;
      const from = xs[k][0], to = xs[k + 1][0], py = Math.floor(yy);
      for (let col = Math.max(0, Math.ceil(from * SS - 0.5)); col < size * SS && (col + 0.5) / SS < to; col++) hits[py * size + Math.floor(col / SS)]++;
    }
  }
  for (let k = 0; k < out.length; k++) out[k] = hits[k] * 2 >= SS * SS ? 1 : 0;
  return out;
}

/** Pixels that differ between two rasters, as a share of a's ink. */
export function diffShare(a, b) {
  let ink = 0, diff = 0;
  for (let k = 0; k < a.length; k++) { ink += a[k]; diff += a[k] !== b[k] ? 1 : 0; }
  return ink ? diff / ink : (diff ? 1 : 0);
}
