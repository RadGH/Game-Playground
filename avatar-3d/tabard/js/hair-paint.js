// Tabard hair texture — ONE 1024² picture painted in code, shared by every hairdo on the page (any colour: the picture
// holds only light and shade in red/green/blue-grey plus see-through in alpha; hair.js's material turns the grey into
// the hair colour, dark roots to light highlights). Painted like the 2004 MMO hair: clumps of strands with a highlight
// band, dark gaps between clumps, wispy see-through tips. Same seed, same picture.
//
// Boxes (x, y, w, h in pixels; hair.js reads REGIONS for UVs):
//   cap    strands top→bottom, solid down to 80%, then ragged see-through tips (tiles left↔right): scalp shells, curtains
//   lock   one tapered lock with wispy edges and a pointed tip: fringe, side locks, ponytail fans
//   wave   the same lock, wavy
//   tuft   short wide-based spike: spikes, mohawk, messy tufts
//   braid  a three-strand braid, lobed edges, a tuft at the end
//   loc    a rope-like loc, bumpy edges
//   curl   tight curls, solid (tiles both ways): afro, curly shells
//   buzz   stubble, solid (tiles both ways): buzz cut, shaved sides
//   fin    curl fringe: solid at the bottom, bumpy curly top edge: the fuzzy outline of curly hair
//   tie    a leather hair tie (real colours, not tinted)
export const SIZE = 1024;
export const REGIONS = {
  cap: [0, 0, 512, 512], lock: [512, 0, 128, 512], wave: [640, 0, 128, 512], braid: [768, 0, 128, 512], tuft: [896, 0, 128, 256],
  loc: [896, 256, 64, 256], curl: [0, 512, 256, 256], buzz: [256, 512, 256, 256], fin: [512, 512, 256, 128],
  tie: [768, 512, 128, 64],
};

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const grey = v => { const c = Math.max(0, Math.min(255, Math.round(v * 255))); return `rgb(${c},${c},${c})`; };

let cached = null;
/** The shared hair canvas (painted once). */
export function hairCanvas() {
  if (cached) return cached;
  const cv = document.createElement('canvas'); cv.width = cv.height = SIZE;
  const g = cv.getContext('2d');
  const R = rng(7);
  paintStrands(g, REGIONS.cap, R, { tips: 0.8, clumps: 22, wrap: true });
  paintLock(g, REGIONS.lock, R, { wave: 0 });
  paintLock(g, REGIONS.wave, R, { wave: 1 });
  paintTuft(g, REGIONS.tuft, R);
  paintBraid(g, REGIONS.braid, R);
  paintLoc(g, REGIONS.loc, R);
  paintCurls(g, REGIONS.curl, R);
  paintBuzz(g, REGIONS.buzz, R);
  paintFin(g, REGIONS.fin, R);
  paintTie(g, REGIONS.tie, R);
  speckle(g, REGIONS.curl, R); speckle(g, REGIONS.buzz, R);
  cached = cv; return cv;
}

/** Light along a strand: dark root, a highlight band at ~30%, darker toward the tip (the painted MMO look). */
function band(v) { return 0.5 + 0.32 * Math.exp(-(((v - 0.3) / 0.13) ** 2)) - 0.18 * Math.max(0, 0.08 - v) / 0.08 - 0.1 * v; }

function strand(g, pts, w0, w1, shade) {
  // a tapered stroke along pts (canvas px), shade 0..1 per point via callback
  for (let i = 1; i < pts.length; i++) {
    const t = i / (pts.length - 1), w = w0 + (w1 - w0) * t;
    g.strokeStyle = grey(shade(t)); g.lineWidth = Math.max(0.6, w); g.lineCap = 'round';
    g.beginPath(); g.moveTo(pts[i - 1][0], pts[i - 1][1]); g.lineTo(pts[i][0], pts[i][1]); g.stroke();
  }
}

function paintStrands(g, [X, Y, W, H], R, { tips, clumps, wrap }) {
  g.save(); g.beginPath(); g.rect(X, Y, W, H); g.clip();
  // solid base down to where the tips start, a soft gradient (roots darker)
  const gr = g.createLinearGradient(0, Y, 0, Y + H * tips);
  gr.addColorStop(0, grey(0.3)); gr.addColorStop(0.3, grey(0.55)); gr.addColorStop(1, grey(0.42));
  g.fillStyle = gr; g.fillRect(X, Y, W, H * tips * 0.97);
  // clumps: bundles of strands with their own light; below `tips` each clump's strands gather into a pointed end at
  // its own length (so the ragged edge is clumps, not a comb)
  const cw = W / clumps, dx = wrap ? [-W, 0, W] : [0];
  for (let c = 0; c < clumps; c++) {
    const cx = X + (c + 0.5 + (R() - 0.5) * 0.4) * cw, lift = (R() - 0.5) * 0.22;
    const end = tips * 0.97 + (1 - tips * 0.97) * (0.25 + R() * 0.75), tipX = cx + (R() - 0.5) * cw * 0.5;
    for (let s = 0; s < 16; s++) {
      const x0 = cx + (R() - 0.5) * cw * 1.15, e = end * (0.88 + R() * 0.12), pts = [];
      for (let k = 0; k <= 16; k++) {
        const t = k / 16, y = e * t, gather = smooth01((y - tips * 0.8) / Math.max(0.01, e - tips * 0.8));
        pts.push([x0 + (tipX - x0) * gather * 0.85, Y + H * y]);
      }
      const sh = 0.75 + R() * 0.35;
      for (const d of dx) strand(g, pts.map(([x, y]) => [x + d, y]), 2.8 + R() * 2.4, 0.9, t => (band(t * e) + lift) * sh);
    }
    const gx = cx + cw * 0.55;    // dark gap line on the clump's edge
    for (const d of dx) { g.strokeStyle = 'rgba(30,30,30,0.35)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(gx + d, Y); g.lineTo(gx + d + (R() - 0.5) * 6, Y + H * tips * 0.9); g.stroke(); }
  }
  for (let s = 0; s < 160; s++) {   // fine bright hairs on top
    const x0 = X + R() * W, len = H * (0.2 + R() * 0.5), y0 = Y + R() * H * 0.45;
    g.strokeStyle = `rgba(235,235,235,${0.12 + R() * 0.18})`; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + (R() - 0.5) * 8, y0 + len); g.stroke();
  }
  g.restore();
}
const smooth01 = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);

function paintLock(g, [X, Y, W, H], R, { wave }) {
  g.save(); g.beginPath(); g.rect(X, Y, W, H); g.clip();
  const cx = X + W / 2;
  // the lock's outline: full width near the root, swelling a little, tapering to a point
  const half = t => W * 0.44 * (t < 0.1 ? 0.85 + t * 1.5 : Math.pow(Math.max(0, 1 - (t - 0.1) / 0.9), 0.75));
  const wav = t => wave ? Math.sin(t * Math.PI * 3.2) * W * 0.12 * Math.min(1, t * 3) : 0;
  for (let s = 0; s < 70; s++) {
    const u = (R() * 2 - 1) * 0.95, end = 0.75 + R() * 0.25, pts = [];
    for (let k = 0; k <= 24; k++) { const t = k / 24 * end; pts.push([cx + u * half(t) + wav(t), Y + H * t]); }
    const sh = 0.75 + R() * 0.4, edge = Math.abs(u);
    strand(g, pts, 3.4 - edge * 2, 0.7, t => band(t * end) * sh - edge * 0.12);
  }
  // wisps past the outline (the see-through edge)
  for (let s = 0; s < 18; s++) {
    const sgn = R() < 0.5 ? -1 : 1, t0 = 0.1 + R() * 0.6, len = 0.15 + R() * 0.25, pts = [];
    for (let k = 0; k <= 8; k++) { const t = t0 + len * k / 8; pts.push([cx + sgn * (half(t) * (1 + 0.25 * k / 8)) + wav(t), Y + H * t]); }
    strand(g, pts, 1.4, 0.4, t => 0.55 + R() * 0.1);
  }
  g.restore();
}

function paintTuft(g, [X, Y, W, H], R) {
  g.save(); g.beginPath(); g.rect(X, Y, W, H); g.clip();
  const cx = X + W / 2;
  for (let s = 0; s < 60; s++) {
    const u = R() * 2 - 1, end = 0.7 + R() * 0.3, pts = [];
    for (let k = 0; k <= 12; k++) { const t = k / 12 * end; pts.push([cx + u * W * 0.46 * (1 - t) ** 1.1, Y + H * t]); }
    strand(g, pts, 4.5 - Math.abs(u) * 2, 0.6, t => (0.45 + 0.35 * Math.exp(-(((t - 0.35) / 0.2) ** 2))) * (0.8 + R() * 0.3));
  }
  g.restore();
}

function paintBraid(g, [X, Y, W, H], R) {
  g.save(); g.beginPath(); g.rect(X, Y, W, H); g.clip();
  const cx = X + W / 2, n = 9, body = 0.88, segH = H * body / n;
  for (let i = 0; i < n * 2; i++) {
    const side = i % 2 ? 1 : -1, y = Y + i * segH / 2, taper = 1 - 0.35 * (i / (n * 2));
    const hw = W * 0.42 * taper;
    // one lobe: an S of strands from the middle out to its side and back down across
    for (let s = 0; s < 16; s++) {
      const o = (s / 15 - 0.5) * segH * 0.5, pts = [];
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        pts.push([cx + side * hw * Math.sin(t * Math.PI) * 0.95 - side * hw * 0.25 * t, y + o + t * segH * 0.9]);
      }
      strand(g, pts, 2.6, 2.0, t => (0.42 + 0.38 * Math.sin(t * Math.PI) * (0.85 + R() * 0.3)) - Math.abs(s / 15 - 0.5) * 0.25);
    }
    g.strokeStyle = 'rgba(20,20,20,0.5)'; g.lineWidth = 1.8;   // the crease between lobes
    g.beginPath(); g.moveTo(cx - side * hw * 0.2, y + segH * 0.45); g.quadraticCurveTo(cx + side * hw * 0.5, y + segH * 0.25, cx + side * hw * 0.9, y + segH * 0.05); g.stroke();
  }
  // the loose tuft below the tie
  for (let s = 0; s < 30; s++) {
    const u = R() * 2 - 1, pts = [];
    for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push([cx + u * W * (0.12 + 0.2 * t), Y + H * (body + (1 - body) * 0.95 * t * (0.6 + R() * 0.4))]); }
    strand(g, pts, 2.6, 0.6, t => 0.5 + 0.2 * (1 - t));
  }
  g.restore();
}

function paintLoc(g, [X, Y, W, H], R) {
  g.save(); g.beginPath(); g.rect(X, Y, W, H); g.clip();
  const cx = X + W / 2;
  for (let y = 0; y < H; y += 7) {
    const t = y / H, hw = W * 0.4 * (1 - 0.3 * t) * (0.85 + 0.15 * Math.sin(y * 0.4));
    const gr = g.createLinearGradient(cx - hw, 0, cx + hw, 0);
    gr.addColorStop(0, grey(0.25)); gr.addColorStop(0.45, grey(0.62 + R() * 0.12)); gr.addColorStop(1, grey(0.22));
    g.fillStyle = gr; g.beginPath(); g.ellipse(cx + (R() - 0.5) * 2, Y + y + 4, hw, 6, (R() - 0.5) * 0.5, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

function paintCurls(g, [X, Y, W, H], R) {
  g.save(); g.beginPath(); g.rect(X, Y, W, H); g.clip();
  g.fillStyle = grey(0.3); g.fillRect(X, Y, W, H);
  for (let i = 0; i < 520; i++) {
    const x = X + R() * W, y = Y + R() * H, r = 5 + R() * 7, a0 = R() * 6.28, sh = 0.45 + R() * 0.4;
    for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) {
      g.strokeStyle = grey(sh * 0.55); g.lineWidth = 3.4; g.beginPath(); g.arc(x + dx, y + dy, r, a0, a0 + 4.4); g.stroke();
      g.strokeStyle = grey(sh); g.lineWidth = 1.6; g.beginPath(); g.arc(x + dx, y + dy - 0.8, r, a0 + 0.4, a0 + 3.2); g.stroke();
    }
  }
  g.restore();
}

function paintBuzz(g, [X, Y, W, H], R) {
  g.save(); g.beginPath(); g.rect(X, Y, W, H); g.clip();
  g.fillStyle = grey(0.42); g.fillRect(X, Y, W, H);
  for (let i = 0; i < 4200; i++) {
    const x = X + R() * W, y = Y + R() * H, a = 1.2 + (R() - 0.5) * 0.8, l = 2 + R() * 3;
    g.strokeStyle = grey(R() < 0.7 ? 0.2 + R() * 0.15 : 0.6 + R() * 0.2); g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  g.restore();
}

function paintFin(g, [X, Y, W, H], R) {
  g.save(); g.beginPath(); g.rect(X, Y, W, H); g.clip();
  // solid lower half, curls bubbling up into a ragged top edge (alpha), tiles left↔right
  g.fillStyle = grey(0.32); g.fillRect(X, Y + H * 0.55, W, H * 0.45);
  for (let i = 0; i < 170; i++) {
    const x = X + R() * W, y = Y + H * (0.25 + R() * 0.75), r = 6 + R() * 9, sh = 0.4 + R() * 0.45;
    for (const dx of [-W, 0, W]) {
      g.fillStyle = grey(sh * 0.6); g.beginPath(); g.arc(x + dx, y, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = grey(sh); g.lineWidth = 2; g.beginPath(); g.arc(x + dx, y - 1, r * 0.7, 3.6, 5.9); g.stroke();
    }
  }
  g.restore();
}

/** Solid tiles get a speckled alpha (0.55..1): inside a shell it all shows, but where hair.js fades a shell's
 *  edge with vertex alpha, only the strongest specks pass the cut — a ragged, hair-like hairline. (140..255 left
 *  holes once the picture was shrunk for distance, 2026-11-23.) */
function speckle(g, [X, Y, W, H], R) {
  const im = g.getImageData(X, Y, W, H), d = im.data;
  for (let i = 3; i < d.length; i += 4) d[i] = 200 + Math.floor(R() * 55);   // 0.78..1: solid even when shrunk (mipmaps)
  g.putImageData(im, X, Y);
}

function paintTie(g, [X, Y, W, H], R) {
  g.save(); g.beginPath(); g.rect(X, Y, W, H); g.clip();
  g.fillStyle = '#5a3b22'; g.fillRect(X, Y, W, H);
  g.fillStyle = '#7a5532'; g.fillRect(X, Y + H * 0.2, W, H * 0.25);
  g.fillStyle = '#3a2412'; g.fillRect(X, Y + H * 0.75, W, H * 0.25);
  g.strokeStyle = '#c9a46a'; g.lineWidth = 2; g.setLineDash([6, 5]);
  g.beginPath(); g.moveTo(X, Y + H * 0.6); g.lineTo(X + W, Y + H * 0.6); g.stroke();
  g.restore();
}
